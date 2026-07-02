#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const provider = require(path.join(repoRoot, "custom_modules/MMM-AgentSurface/providers/path-gtfs-rt.js"));
const providerIndex = require(path.join(repoRoot, "custom_modules/MMM-AgentSurface/providers/index.js"));
const moduleRequire = createRequire(path.join(repoRoot, "custom_modules/MMM-AgentSurface/package.json"));
const GtfsRealtimeBindings = moduleRequire("gtfs-realtime-bindings");
const FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;

let scenarios = 0;
function scenario(_name, run) {
  scenarios += 1;
  return run();
}

const NOW = new Date("2026-07-01T12:00:00.000Z");
const BASE_ENV = {
  MIRROR_PATH_GTFS_RT_URL: "https://path.example/secret-token/gtfsrt",
  MIRROR_PATH_STATION_ID: "26728"
};

function seconds(isoString) {
  return Math.floor(new Date(isoString).getTime() / 1000);
}

function tripUpdate(overrides = {}) {
  const stopId = overrides.stopId || "26728";
  const time = overrides.time || seconds("2026-07-01T12:03:00.000Z");
  return {
    id: overrides.id || "entity-" + stopId + "-" + time,
    tripUpdate: {
      trip: {
        tripId: overrides.tripId || "trip-" + time,
        routeId: overrides.routeId || "862",
        directionId: overrides.directionId ?? 1
      },
      stopTimeUpdate: [
        {
          stopSequence: 1,
          stopId,
          arrival: overrides.arrival === false ? undefined : { time },
          departure: overrides.departureTime ? { time: overrides.departureTime } : undefined
        }
      ],
      timestamp: seconds("2026-07-01T11:59:30.000Z")
    }
  };
}

function feedBuffer(entities) {
  return FeedMessage.encode(
    FeedMessage.create({
      header: {
        gtfsRealtimeVersion: "2.0",
        incrementality: 0,
        timestamp: seconds("2026-07-01T11:59:30.000Z")
      },
      entity: entities
    })
  ).finish();
}

function fetchResponse(buffer) {
  return { ok: true, arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
}

async function collectWithFeed(env, entities) {
  const buffer = feedBuffer(entities);
  return provider.collect(env, { fetch: async () => fetchResponse(buffer), now: NOW });
}

try {
  await scenario("provider is registered", () => {
    assert.ok(providerIndex.some((entry) => entry.dataSourceId === "pathGtfsRealtime"));
    assert.equal(provider.dataSourceId, "pathGtfsRealtime");
    assert.equal(provider.refreshIntervalSeconds, 30);
  });

  await scenario("missing config resolves unconfigured", async () => {
    assert.deepEqual(await provider.collect({}), { dataSourceId: "pathGtfsRealtime", state: "unconfigured" });
    assert.deepEqual(await provider.collect({ MIRROR_PATH_GTFS_RT_URL: "https://path.example/gtfsrt" }), { dataSourceId: "pathGtfsRealtime", state: "unconfigured" });
    assert.equal(provider.readConfig({ MIRROR_PATH_GTFS_RT_URL: "   ", MIRROR_PATH_STATION_ID: "26728" }), null);
  });

  await scenario("fetch failure resolves error without echoing the URL", async () => {
    const networkFail = await provider.collect(BASE_ENV, {
      fetch: async () => {
        throw new Error("network fail for https://path.example/secret-token/gtfsrt");
      },
      now: NOW
    });
    assert.equal(networkFail.state, "error");
    assert.equal(networkFail.message, "PATH feed unreachable");
    assert.ok(!JSON.stringify(networkFail).includes("secret-token"));

    const statusFail = await provider.collect(BASE_ENV, { fetch: async () => ({ ok: false, status: 503 }), now: NOW });
    assert.equal(statusFail.state, "error");
    assert.match(statusFail.message, /status 503/);
    assert.ok(!JSON.stringify(statusFail).includes("secret-token"));
  });

  await scenario("non-protobuf response resolves parse error", async () => {
    const html = Buffer.from("<html><title>not protobuf</title></html>", "utf8");
    const result = await provider.collect(BASE_ENV, { fetch: async () => fetchResponse(html), now: NOW });
    assert.equal(result.state, "error");
    assert.equal(result.message, "PATH feed could not be parsed");
    assert.ok(!JSON.stringify(result).includes("secret-token"));
  });

  await scenario("filtering by station, route, and direction works", async () => {
    const result = await collectWithFeed(
      {
        ...BASE_ENV,
        MIRROR_PATH_ROUTE_ID: "862",
        MIRROR_PATH_DIRECTION: "TO_NY"
      },
      [
        tripUpdate({ id: "match", stopId: "26728-platform-a", routeId: "862", directionId: 1, time: seconds("2026-07-01T12:04:00.000Z") }),
        tripUpdate({ id: "wrong-station", stopId: "26734", routeId: "862", directionId: 1, time: seconds("2026-07-01T12:05:00.000Z") }),
        tripUpdate({ id: "wrong-route", stopId: "26728", routeId: "860", directionId: 1, time: seconds("2026-07-01T12:06:00.000Z") }),
        tripUpdate({ id: "wrong-direction", stopId: "26728", routeId: "862", directionId: 0, time: seconds("2026-07-01T12:07:00.000Z") })
      ]
    );
    assert.equal(result.state, "ready");
    assert.deepEqual(result.data.departures.map((departure) => departure.departsAt), ["2026-07-01T12:04:00.000Z"]);
    assert.equal(result.data.departures[0].destination, "World Trade Center");
    assert.equal(result.data.departures[0].routeLabel, "NWK-WTC");
  });

  await scenario("minutes computation uses injected now and departure before arrival", async () => {
    const result = await collectWithFeed(BASE_ENV, [
      tripUpdate({
        stopId: "26728",
        routeId: "862",
        directionId: 1,
        time: seconds("2026-07-01T12:07:30.000Z"),
        departureTime: seconds("2026-07-01T12:02:01.000Z")
      }),
      tripUpdate({
        stopId: "26728",
        routeId: "862",
        directionId: 1,
        time: seconds("2026-07-01T11:59:30.000Z")
      })
    ]);
    assert.deepEqual(result.data.departures.map((departure) => departure.minutes), [0, 3]);
    assert.equal(result.data.departures[1].departsAt, "2026-07-01T12:02:01.000Z");
  });

  await scenario("departures sort ascending and cap at eight", async () => {
    const entities = [];
    for (let index = 0; index < 10; index += 1) {
      const minute = 20 - index;
      entities.push(tripUpdate({ id: "cap-" + index, stopId: "26728", routeId: "862", directionId: 1, time: seconds("2026-07-01T12:" + String(minute).padStart(2, "0") + ":00.000Z") }));
    }
    const result = await collectWithFeed(BASE_ENV, entities);
    assert.equal(result.data.departures.length, 8);
    assert.deepEqual(result.data.departures.map((departure) => departure.minutes), [11, 12, 13, 14, 15, 16, 17, 18]);
  });

  await scenario("successful collect emits contract fields", async () => {
    const result = await collectWithFeed(BASE_ENV, [
      tripUpdate({ stopId: "26728", routeId: "862", directionId: 1, time: seconds("2026-07-01T12:05:00.000Z") })
    ]);
    assert.equal(result.dataSourceId, "pathGtfsRealtime");
    assert.equal(result.state, "ready");
    assert.equal(result.source, "path-gtfs-rt");
    assert.equal(result.updatedAt, NOW.toISOString());
    assert.equal(result.data.stationId, "26728");
    assert.equal(result.data.departures.length, 1);
    assert.equal(result.data.departures[0].routeId, "862");
  });

  console.log(JSON.stringify({ ok: true, scenarios }));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
