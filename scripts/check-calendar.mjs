#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const provider = require(path.join(repoRoot, "custom_modules/MMM-AgentSurface/providers/calendar-ics.js"));
const providerIndex = require(path.join(repoRoot, "custom_modules/MMM-AgentSurface/providers/index.js"));

let scenarios = 0;
function scenario(_name, run) {
  scenarios += 1;
  return run();
}

const NOW = new Date("2026-07-01T12:00:00.000Z");

function vevent(overrides = {}) {
  return {
    type: "VEVENT",
    summary: "Standup",
    start: new Date("2026-07-02T14:00:00.000Z"),
    end: new Date("2026-07-02T14:30:00.000Z"),
    ...overrides
  };
}

try {
  await scenario("provider is registered", () => {
    assert.ok(providerIndex.some((entry) => entry.dataSourceId === "calendarIcs"));
    assert.equal(provider.dataSourceId, "calendarIcs");
    assert.equal(provider.refreshIntervalSeconds, 300);
  });

  await scenario("missing config resolves unconfigured", async () => {
    const result = await provider.collect({});
    assert.deepEqual(result, { dataSourceId: "calendarIcs", state: "unconfigured" });
    assert.equal(provider.readConfig({ MIRROR_CALENDAR_ICS_URL: "   " }), null);
  });

  await scenario("fetch failure resolves error without echoing the URL", async () => {
    const secretUrl = "https://calendar.example/private-abc123/basic.ics";
    const env = { MIRROR_CALENDAR_ICS_URL: secretUrl };

    const networkFail = await provider.collect(env, {
      fetch: async () => {
        throw new Error("boom");
      }
    });
    assert.equal(networkFail.state, "error");
    assert.ok(!JSON.stringify(networkFail).includes("private-abc123"), "error payload must not leak the feed URL");

    const statusFail = await provider.collect(env, { fetch: async () => ({ ok: false, status: 403 }) });
    assert.equal(statusFail.state, "error");
    assert.match(statusFail.message, /status 403/);
    assert.ok(!JSON.stringify(statusFail).includes("private-abc123"));
  });

  await scenario("parse failure resolves error", async () => {
    const result = await provider.collect(
      { MIRROR_CALENDAR_ICS_URL: "https://calendar.example/basic.ics" },
      {
        fetch: async () => ({ ok: true, text: async () => "not ics" }),
        parseIcs: async () => {
          throw new Error("bad feed");
        }
      }
    );
    assert.equal(result.state, "error");
    assert.equal(result.message, "Calendar feed could not be parsed");
  });

  await scenario("events normalize sorted, windowed, and capped", () => {
    const parsed = {
      a: vevent({ summary: "Later", start: new Date("2026-07-03T14:00:00.000Z"), end: new Date("2026-07-03T15:00:00.000Z") }),
      b: vevent({ summary: "Sooner" }),
      past: vevent({ summary: "Past", start: new Date("2026-06-01T14:00:00.000Z"), end: new Date("2026-06-01T15:00:00.000Z") }),
      far: vevent({ summary: "Beyond window", start: new Date("2026-12-01T14:00:00.000Z"), end: new Date("2026-12-01T15:00:00.000Z") }),
      notEvent: { type: "VTIMEZONE" }
    };
    const events = provider.normalizeEvents(parsed, { now: NOW });
    assert.deepEqual(events.map((event) => event.title), ["Sooner", "Later"]);
    assert.equal(events[0].startsAt, "2026-07-02T14:00:00.000Z");
    assert.equal(events[0].endsAt, "2026-07-02T14:30:00.000Z");
  });

  await scenario("recurring events expand via rrule and honor exdate", () => {
    const occurrences = [new Date("2026-07-02T09:00:00.000Z"), new Date("2026-07-03T09:00:00.000Z"), new Date("2026-07-04T09:00:00.000Z")];
    const parsed = {
      weekly: vevent({
        summary: "Recurring",
        start: new Date("2026-06-01T09:00:00.000Z"),
        end: new Date("2026-06-01T09:30:00.000Z"),
        rrule: { between: () => occurrences },
        exdate: { "2026-07-03": new Date("2026-07-03T09:00:00.000Z") }
      })
    };
    const events = provider.normalizeEvents(parsed, { now: NOW });
    assert.deepEqual(events.map((event) => event.startsAt), ["2026-07-02T09:00:00.000Z", "2026-07-04T09:00:00.000Z"]);
    assert.equal(events[0].endsAt, "2026-07-02T09:30:00.000Z");
  });

  await scenario("titles are sanitized and capped; all-day flag survives", () => {
    const parsed = {
      hostile: vevent({ summary: "Team\u0000 sync\u200b " + "x".repeat(200) }),
      allday: vevent({ summary: "Holiday", start: Object.assign(new Date("2026-07-04T00:00:00.000Z"), { dateOnly: true }), end: null })
    };
    const events = provider.normalizeEvents(parsed, { now: NOW });
    const hostile = events.find((event) => event.title.startsWith("Team sync"));
    assert.ok(hostile, "control chars must be stripped, not kept");
    assert.ok(hostile.title.length <= 80);
    const allday = events.find((event) => event.title === "Holiday");
    assert.equal(allday.allDay, true);
  });

  await scenario("successful collect emits contract fields", async () => {
    const ics = "BEGIN:VCALENDAR..."; // opaque to the injected parser
    const result = await provider.collect(
      {
        MIRROR_CALENDAR_ICS_URL: "https://calendar.example/basic.ics",
        MIRROR_CALENDAR_NAME: "Family",
        MIRROR_CALENDAR_TIMEZONE: "America/New_York"
      },
      {
        fetch: async () => ({ ok: true, text: async () => ics }),
        parseIcs: async (text) => {
          assert.equal(text, ics);
          return { a: vevent() };
        },
        now: NOW
      }
    );
    assert.equal(result.state, "ready");
    assert.equal(result.source, "Family");
    assert.equal(result.updatedAt, NOW.toISOString());
    assert.equal(result.data.timezone, "America/New_York");
    assert.equal(result.data.events.length, 1);
  });

  console.log(JSON.stringify({ ok: true, scenarios }));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
