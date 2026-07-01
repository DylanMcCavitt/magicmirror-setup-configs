/**
 * Calendar ICS provider.
 *
 * Fetches a configured ICS feed (Apple/Google shared or private ICS URLs) and
 * normalizes upcoming events for the Mirror OS calendar page. Fails closed:
 * missing config -> unconfigured, fetch/parse failures -> error with a
 * sanitized message that never echoes the feed URL (private ICS URLs embed
 * secrets in the path).
 */

const DATA_SOURCE_ID = "calendarIcs";
const REFRESH_INTERVAL_SECONDS = 300;
const SOURCE_LABEL = "calendar-ics";
const FETCH_TIMEOUT_MS = 15000;
const LOOKAHEAD_DAYS = 45;
const MAX_EVENTS = 12;
const MAX_TEXT_LENGTH = 80;

function cleanText(value) {
  const text = typeof value === "string" ? value : value && typeof value.val === "string" ? value.val : "";
  const stripped = text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029]/g, "").trim();
  if (!stripped) return null;
  return stripped.length > MAX_TEXT_LENGTH ? stripped.slice(0, MAX_TEXT_LENGTH - 1) + "…" : stripped;
}

function readConfig(env) {
  const url = env && typeof env.MIRROR_CALENDAR_ICS_URL === "string" ? env.MIRROR_CALENDAR_ICS_URL.trim() : "";
  if (!url) return null;
  return {
    url,
    name: cleanText(env.MIRROR_CALENDAR_NAME) || null,
    timezone: cleanText(env.MIRROR_CALENDAR_TIMEZONE) || null
  };
}

function toValidDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  return null;
}

function exdateKeys(exdate) {
  const keys = new Set();
  if (!exdate || typeof exdate !== "object") return keys;
  for (const entry of Object.values(exdate)) {
    const date = toValidDate(entry);
    if (date) keys.add(date.toISOString().slice(0, 10));
  }
  return keys;
}

function occurrencesFor(item, windowStart, windowEnd) {
  const start = toValidDate(item.start);
  if (!start) return [];
  const end = toValidDate(item.end);
  const durationMs = end ? Math.max(0, end.getTime() - start.getTime()) : 0;

  if (item.rrule && typeof item.rrule.between === "function") {
    const skipped = exdateKeys(item.exdate);
    return item.rrule
      .between(windowStart, windowEnd, true)
      .filter((occurrence) => !skipped.has(occurrence.toISOString().slice(0, 10)))
      .map((occurrence) => ({
        start: occurrence,
        end: durationMs ? new Date(occurrence.getTime() + durationMs) : null
      }));
  }

  const effectiveEnd = end || start;
  if (effectiveEnd.getTime() < windowStart.getTime() || start.getTime() > windowEnd.getTime()) return [];
  return [{ start, end }];
}

function normalizeEvents(parsed, options = {}) {
  const now = toValidDate(options.now) || new Date();
  const windowEnd = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const events = [];

  const items = parsed && typeof parsed === "object" ? Object.values(parsed) : [];
  for (const item of items) {
    if (!item || item.type !== "VEVENT") continue;
    const title = cleanText(item.summary) || "Untitled event";
    const location = cleanText(item.location);
    const allDay = !!(item.start && item.start.dateOnly);

    for (const occurrence of occurrencesFor(item, now, windowEnd)) {
      const occurrenceEnd = occurrence.end || occurrence.start;
      if (occurrenceEnd.getTime() < now.getTime()) continue;
      events.push({
        title,
        location,
        allDay,
        startsAt: occurrence.start.toISOString(),
        endsAt: occurrence.end ? occurrence.end.toISOString() : null
      });
    }
  }

  events.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  return events.slice(0, MAX_EVENTS);
}

function defaultParseIcs(text) {
  // node-ical is installed into the module directory by scripts/sync.sh and
  // is also available from the MagicMirror runtime's own node_modules.
  return require("node-ical").async.parseICS(text);
}

function fetchFailureMessage(kind, detail) {
  // Never include the configured URL: private ICS URLs carry secrets.
  if (kind === "status") return "Calendar fetch failed (status " + detail + ")";
  if (kind === "parse") return "Calendar feed could not be parsed";
  return "Calendar feed unreachable";
}

async function collect(env, deps = {}) {
  const config = readConfig(env || {});
  if (!config) return { dataSourceId: DATA_SOURCE_ID, state: "unconfigured" };

  const fetchImpl = deps.fetch || fetch;
  const parseIcs = deps.parseIcs || defaultParseIcs;
  const now = deps.now ? new Date(deps.now) : new Date();

  let text;
  try {
    const response = await fetchImpl(config.url, {
      headers: { accept: "text/calendar" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) {
      return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("status", response.status) };
    }
    text = await response.text();
  } catch (error) {
    return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("network") };
  }

  let events;
  try {
    const parsed = await parseIcs(text);
    events = normalizeEvents(parsed, { now });
  } catch (error) {
    return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("parse") };
  }

  return {
    dataSourceId: DATA_SOURCE_ID,
    state: "ready",
    source: config.name || SOURCE_LABEL,
    updatedAt: now.toISOString(),
    data: {
      events,
      timezone: config.timezone,
      calendarName: config.name
    }
  };
}

module.exports = {
  dataSourceId: DATA_SOURCE_ID,
  refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
  collect,
  readConfig,
  normalizeEvents
};
