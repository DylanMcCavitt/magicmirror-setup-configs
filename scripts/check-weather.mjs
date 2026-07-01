#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const provider = require(path.join(repoRoot, "custom_modules/MMM-AgentSurface/providers/weather-open-meteo.js"));
const providerIndex = require(path.join(repoRoot, "custom_modules/MMM-AgentSurface/providers/index.js"));

let scenarios = 0;
function scenario(_name, run) {
  scenarios += 1;
  return run();
}

const NOW = new Date("2026-07-01T12:00:00.000Z");
const GOOD_ENV = {
  MIRROR_WEATHER_LATITUDE: "40.7178",
  MIRROR_WEATHER_LONGITUDE: "-74.0431",
  MIRROR_WEATHER_TIMEZONE: "America/New_York",
  MIRROR_WEATHER_LOCATION_LABEL: "Jersey City"
};

const fixture = {
  latitude: 40.710335,
  longitude: -74.04254,
  timezone: "America/New_York",
  current: {
    time: "2026-07-01T08:00",
    temperature_2m: 72.4,
    apparent_temperature: 75.1,
    weather_code: 61,
    wind_speed_10m: 8.2,
    relative_humidity_2m: 66
  },
  daily: {
    time: ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"],
    weather_code: [0, 2, 45, 80, 95],
    temperature_2m_max: [80.2, 83.5, 78.1, 76.6, 81.4],
    temperature_2m_min: [64.4, 67.2, 65.9, 62.5, 66.1],
    precipitation_probability_max: [10, 25, 5, 70, 90]
  }
};

function fixtureResponse() {
  return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(fixture)) };
}

try {
  await scenario("provider is registered", () => {
    assert.ok(providerIndex.some((entry) => entry.dataSourceId === "openMeteo"));
    assert.equal(provider.dataSourceId, "openMeteo");
    assert.equal(provider.refreshIntervalSeconds, 900);
  });

  await scenario("missing config resolves unconfigured", async () => {
    const result = await provider.collect({});
    assert.deepEqual(result, { dataSourceId: "openMeteo", state: "unconfigured" });
    assert.equal(provider.readConfig({ MIRROR_WEATHER_LATITUDE: " ", MIRROR_WEATHER_LONGITUDE: "-74" }), null);
  });

  await scenario("invalid lat/lon resolves error without echoing values", async () => {
    const result = await provider.collect({ MIRROR_WEATHER_LATITUDE: "91.987", MIRROR_WEATHER_LONGITUDE: "-181.654" });
    assert.equal(result.state, "error");
    assert.equal(result.message, "Weather coordinates are invalid");
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes("91.987"));
    assert.ok(!serialized.includes("-181.654"));
  });

  await scenario("fetch failure resolves sanitized error", async () => {
    const result = await provider.collect(
      { MIRROR_WEATHER_LATITUDE: "12.3456", MIRROR_WEATHER_LONGITUDE: "-65.4321" },
      {
        fetch: async () => {
          throw new Error("boom");
        }
      }
    );
    assert.equal(result.state, "error");
    assert.equal(result.message, "Weather forecast unreachable");
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes("12.3456"));
    assert.ok(!serialized.includes("-65.4321"));
  });

  await scenario("HTTP non-200 resolves error with status", async () => {
    const result = await provider.collect(GOOD_ENV, { fetch: async () => ({ ok: false, status: 503 }) });
    assert.equal(result.state, "error");
    assert.equal(result.message, "Weather fetch failed (status 503)");
  });

  await scenario("WMO code mapping spot checks", () => {
    assert.deepEqual(provider.weatherCodeInfo(0), { code: 0, label: "Clear", glyph: "☼" });
    assert.equal(provider.weatherCodeInfo(2).label, "Partly cloudy");
    assert.equal(provider.weatherCodeInfo(45).label, "Fog");
    assert.equal(provider.weatherCodeInfo(61).label, "Rain");
    assert.equal(provider.weatherCodeInfo(80).label, "Showers");
    assert.equal(provider.weatherCodeInfo(95).label, "Thunderstorm");
    assert.deepEqual(provider.weatherCodeInfo(999), { code: 999, label: "Unknown", glyph: "?" });
  });

  await scenario("successful collect emits contract fields", async () => {
    let requestedUrl;
    const result = await provider.collect(GOOD_ENV, {
      fetch: async (url) => {
        requestedUrl = new URL(url);
        return fixtureResponse();
      },
      now: NOW
    });

    assert.equal(requestedUrl.origin + requestedUrl.pathname, "https://api.open-meteo.com/v1/forecast");
    assert.equal(requestedUrl.searchParams.get("latitude"), GOOD_ENV.MIRROR_WEATHER_LATITUDE);
    assert.equal(requestedUrl.searchParams.get("longitude"), GOOD_ENV.MIRROR_WEATHER_LONGITUDE);
    assert.equal(
      requestedUrl.searchParams.get("current"),
      "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m"
    );
    assert.equal(
      requestedUrl.searchParams.get("daily"),
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    );
    assert.equal(requestedUrl.searchParams.get("forecast_days"), "5");
    assert.equal(requestedUrl.searchParams.get("temperature_unit"), "fahrenheit");
    assert.equal(requestedUrl.searchParams.get("wind_speed_unit"), "mph");
    assert.equal(requestedUrl.searchParams.get("timezone"), "America/New_York");

    assert.equal(result.dataSourceId, "openMeteo");
    assert.equal(result.state, "ready");
    assert.equal(result.source, "Jersey City");
    assert.equal(result.updatedAt, NOW.toISOString());
    assert.deepEqual(result.data.current.condition, { code: 61, label: "Rain", glyph: "╱" });
    assert.equal(result.data.current.temperatureF, 72);
    assert.equal(result.data.current.apparentF, 75);
    assert.equal(result.data.current.windMph, 8);
    assert.equal(result.data.current.humidityPct, 66);
    assert.equal(result.data.locationLabel, "Jersey City");
    assert.equal(result.data.daily.length, 5);
    assert.deepEqual(result.data.daily[0], {
      date: "2026-07-01",
      condition: { code: 0, label: "Clear", glyph: "☼" },
      highF: 80,
      lowF: 64,
      precipChancePct: 10
    });
  });

  await scenario("successful collect defaults source label", async () => {
    const result = await provider.collect(
      { MIRROR_WEATHER_LATITUDE: "40.7178", MIRROR_WEATHER_LONGITUDE: "-74.0431" },
      { fetch: async () => fixtureResponse(), now: NOW }
    );
    assert.equal(result.state, "ready");
    assert.equal(result.source, "open-meteo");
    assert.equal(result.data.locationLabel, "open-meteo");
  });

  console.log(JSON.stringify({ ok: true, scenarios }));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
