/**
 * PATH GTFS-realtime provider.
 *
 * Fetches a configured GTFS-realtime TripUpdates feed, filters arrivals for one
 * PATH station, and normalizes a small departure board. Fails closed: missing
 * config -> unconfigured, fetch/parse failures -> sanitized error without
 * echoing the configured feed URL.
 */

const DATA_SOURCE_ID = "pathGtfsRealtime";
const REFRESH_INTERVAL_SECONDS = 30;
const SOURCE_LABEL = "path-gtfs-rt";
const FETCH_TIMEOUT_MS = 15000;
const MAX_DEPARTURES = 8;
const MAX_TEXT_LENGTH = 80;
const ROUTES = {
  "859": { label: "HOB-33", destinations: { TO_NY: "33rd Street", TO_NJ: "Hoboken" } },
  "860": { label: "HOB-WTC", destinations: { TO_NY: "World Trade Center", TO_NJ: "Hoboken" } },
  "861": { label: "JSQ-33", destinations: { TO_NY: "33rd Street", TO_NJ: "Journal Square" } },
  "862": { label: "NWK-WTC", destinations: { TO_NY: "World Trade Center", TO_NJ: "Newark" } },
  "1024": { label: "JSQ-33 via HOB", destinations: { TO_NY: "33rd Street via Hoboken", TO_NJ: "Journal Square via Hoboken" } }
};

function cleanText(value) {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  const stripped = text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029]/g, "").trim();
  if (!stripped) return null;
  return stripped.length > MAX_TEXT_LENGTH ? stripped.slice(0, MAX_TEXT_LENGTH - 1) + "…" : stripped;
}

function readConfig(env) {
  const url = env && typeof env.MIRROR_PATH_GTFS_RT_URL === "string" ? env.MIRROR_PATH_GTFS_RT_URL.trim() : "";
  const stationId = cleanText(env && env.MIRROR_PATH_STATION_ID);
  if (!url || !stationId) return null;
  return {
    url,
    stationId,
    routeId: cleanText(env.MIRROR_PATH_ROUTE_ID),
    direction: normalizeDirectionFilter(env.MIRROR_PATH_DIRECTION)
  };
}

function toValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  if (value && typeof value.toNumber === "function") {
    const number = value.toNumber();
    return Number.isFinite(number) ? number : null;
  }
  if (value && typeof value.low === "number" && typeof value.high === "number") {
    const number = value.low + value.high * 4294967296;
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function directionCode(value) {
  const number = numericValue(value);
  if (number === 1) return "TO_NY";
  if (number === 0) return "TO_NJ";

  const text = cleanText(value);
  if (!text) return null;
  const upper = text.toUpperCase().replace(/[\s-]+/g, "_");
  if (upper === "TO_NY" || upper === "NY" || upper === "TONY") return "TO_NY";
  if (upper === "TO_NJ" || upper === "NJ" || upper === "TONJ") return "TO_NJ";
  return upper;
}

function normalizeDirectionFilter(value) {
  const direction = directionCode(value);
  return direction || null;
}

function stopIdMatches(stopId, stationId) {
  const stop = cleanText(stopId);
  if (!stop || !stationId) return false;
  return stop === stationId || stop.startsWith(stationId + "-") || stop.startsWith(stationId + "_") || stop.startsWith(stationId + ":");
}

function routeLabelFor(routeId) {
  const route = ROUTES[routeId];
  return route ? route.label : routeId || "PATH";
}

function destinationFor(routeId, direction) {
  const route = ROUTES[routeId];
  return route && route.destinations[direction] ? route.destinations[direction] : null;
}

function eventSeconds(stopTimeUpdate) {
  const event = stopTimeUpdate && (stopTimeUpdate.departure || stopTimeUpdate.arrival);
  return event ? numericValue(event.time) : null;
}

function normalizeDepartures(feed, options = {}) {
  const stationId = cleanText(options.stationId);
  if (!stationId) return [];

  const now = toValidDate(options.now) || new Date();
  const routeFilter = cleanText(options.routeId);
  const directionFilter = normalizeDirectionFilter(options.direction);
  const departures = [];
  const entities = feed && Array.isArray(feed.entity) ? feed.entity : [];

  for (const entity of entities) {
    const tripUpdate = entity && entity.tripUpdate;
    if (!tripUpdate || !Array.isArray(tripUpdate.stopTimeUpdate)) continue;

    const trip = tripUpdate.trip || {};
    const routeId = cleanText(trip.routeId);
    if (routeFilter && routeId !== routeFilter) continue;

    const direction = directionCode(trip.directionId);
    if (directionFilter && direction !== directionFilter) continue;

    for (const stopTimeUpdate of tripUpdate.stopTimeUpdate) {
      if (!stopIdMatches(stopTimeUpdate && stopTimeUpdate.stopId, stationId)) continue;
      const seconds = eventSeconds(stopTimeUpdate);
      if (seconds === null) continue;

      const departsAtMs = seconds * 1000;
      const minutes = Math.min(99, Math.max(0, Math.ceil((departsAtMs - now.getTime()) / 60000)));
      const destination = destinationFor(routeId, direction);
      departures.push({
        routeId,
        routeLabel: routeLabelFor(routeId),
        headsign: destination,
        destination,
        direction,
        minutes,
        departsAt: new Date(departsAtMs).toISOString()
      });
    }
  }

  departures.sort((left, right) => left.departsAt.localeCompare(right.departsAt));
  return departures.slice(0, MAX_DEPARTURES);
}

function defaultParseGtfsRealtime(bytes) {
  const GtfsRealtimeBindings = require("gtfs-realtime-bindings");
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
}

function fetchFailureMessage(kind, detail) {
  // Never include the configured URL: PATH feeds may be private or proxied.
  if (kind === "status") return "PATH feed fetch failed (status " + detail + ")";
  if (kind === "parse") return "PATH feed could not be parsed";
  return "PATH feed unreachable";
}

async function collect(env, deps = {}) {
  const config = readConfig(env || {});
  if (!config) return { dataSourceId: DATA_SOURCE_ID, state: "unconfigured" };

  const fetchImpl = deps.fetch || fetch;
  const parseGtfsRealtime = deps.parseGtfsRealtime || defaultParseGtfsRealtime;
  const now = toValidDate(deps.now) || new Date();

  let bytes;
  try {
    const response = await fetchImpl(config.url, {
      headers: { accept: "application/x-protobuf, application/octet-stream" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) {
      return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("status", response.status) };
    }
    const buffer = await response.arrayBuffer();
    bytes = new Uint8Array(buffer);
  } catch (error) {
    return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("network") };
  }

  let departures;
  try {
    const feed = parseGtfsRealtime(bytes);
    departures = normalizeDepartures(feed, {
      now,
      stationId: config.stationId,
      routeId: config.routeId,
      direction: config.direction
    });
  } catch (error) {
    return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("parse") };
  }

  return {
    dataSourceId: DATA_SOURCE_ID,
    state: "ready",
    source: SOURCE_LABEL,
    updatedAt: now.toISOString(),
    data: {
      departures,
      stationId: config.stationId
    }
  };
}

module.exports = {
  dataSourceId: DATA_SOURCE_ID,
  refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
  collect,
  readConfig,
  normalizeDepartures,
  stopIdMatches,
  directionCode
};
