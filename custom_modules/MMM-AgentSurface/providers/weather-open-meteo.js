/**
 * Open-Meteo weather provider.
 *
 * Fetches current conditions and a 5-day forecast for the configured
 * coordinates. Coordinates are private configuration values: validation and
 * fetch errors intentionally never echo them back to logs or the UI.
 */

const DATA_SOURCE_ID = "openMeteo";
const REFRESH_INTERVAL_SECONDS = 900;
const SOURCE_LABEL = "open-meteo";
const API_URL = "https://api.open-meteo.com/v1/forecast";
const FETCH_TIMEOUT_MS = 15000;
const FORECAST_DAYS = 5;
const MAX_TEXT_LENGTH = 80;

const CURRENT_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "weather_code",
  "wind_speed_10m",
  "relative_humidity_2m"
];
const DAILY_FIELDS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_probability_max"
];

const WMO_WEATHER_CODES = Object.freeze({
  0: Object.freeze({ label: "Clear", glyph: "☼" }),
  1: Object.freeze({ label: "Mainly clear", glyph: "☼" }),
  2: Object.freeze({ label: "Partly cloudy", glyph: "◐" }),
  3: Object.freeze({ label: "Cloudy", glyph: "☁" }),
  45: Object.freeze({ label: "Fog", glyph: "≋" }),
  48: Object.freeze({ label: "Fog", glyph: "≋" }),
  51: Object.freeze({ label: "Drizzle", glyph: "⋮" }),
  53: Object.freeze({ label: "Drizzle", glyph: "⋮" }),
  55: Object.freeze({ label: "Drizzle", glyph: "⋮" }),
  56: Object.freeze({ label: "Freezing drizzle", glyph: "⋮" }),
  57: Object.freeze({ label: "Freezing drizzle", glyph: "⋮" }),
  61: Object.freeze({ label: "Rain", glyph: "╱" }),
  63: Object.freeze({ label: "Rain", glyph: "╱" }),
  65: Object.freeze({ label: "Rain", glyph: "╱" }),
  66: Object.freeze({ label: "Freezing rain", glyph: "╱" }),
  67: Object.freeze({ label: "Freezing rain", glyph: "╱" }),
  71: Object.freeze({ label: "Snow", glyph: "✶" }),
  73: Object.freeze({ label: "Snow", glyph: "✶" }),
  75: Object.freeze({ label: "Snow", glyph: "✶" }),
  77: Object.freeze({ label: "Snow", glyph: "✶" }),
  80: Object.freeze({ label: "Showers", glyph: "↧" }),
  81: Object.freeze({ label: "Showers", glyph: "↧" }),
  82: Object.freeze({ label: "Showers", glyph: "↧" }),
  85: Object.freeze({ label: "Snow showers", glyph: "↧" }),
  86: Object.freeze({ label: "Snow showers", glyph: "↧" }),
  95: Object.freeze({ label: "Thunderstorm", glyph: "↯" }),
  96: Object.freeze({ label: "Thunderstorm", glyph: "↯" }),
  99: Object.freeze({ label: "Thunderstorm", glyph: "↯" })
});

function textValue(env, key) {
  const value = env && env[key];
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function cleanText(value) {
  const text = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
  const stripped = text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029]/g, "").trim();
  if (!stripped) return null;
  return stripped.length > MAX_TEXT_LENGTH ? stripped.slice(0, MAX_TEXT_LENGTH - 1) + "…" : stripped;
}

function isLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function readConfig(env) {
  const latitudeText = textValue(env, "MIRROR_WEATHER_LATITUDE");
  const longitudeText = textValue(env, "MIRROR_WEATHER_LONGITUDE");
  if (!latitudeText || !longitudeText) return null;

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  return {
    latitude,
    longitude,
    valid: isLatitude(latitude) && isLongitude(longitude),
    timezone: cleanText(textValue(env, "MIRROR_WEATHER_TIMEZONE")) || "auto",
    locationLabel: cleanText(textValue(env, "MIRROR_WEATHER_LOCATION_LABEL")) || null
  };
}

function weatherCodeInfo(code) {
  const numericCode = Number(code);
  const normalizedCode = Number.isFinite(numericCode) ? numericCode : null;
  const mapped = normalizedCode === null ? null : WMO_WEATHER_CODES[normalizedCode];
  return {
    code: normalizedCode,
    label: mapped ? mapped.label : "Unknown",
    glyph: mapped ? mapped.glyph : "?"
  };
}

function roundedNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = Math.pow(10, digits);
  return Math.round(number * factor) / factor;
}

function buildForecastUrl(config) {
  const url = new URL(API_URL);
  url.searchParams.set("latitude", String(config.latitude));
  url.searchParams.set("longitude", String(config.longitude));
  url.searchParams.set("current", CURRENT_FIELDS.join(","));
  url.searchParams.set("daily", DAILY_FIELDS.join(","));
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", config.timezone || "auto");
  return url;
}

function dailyValue(daily, key, index) {
  return daily && Array.isArray(daily[key]) ? daily[key][index] : null;
}

function normalizeForecast(payload, locationLabel) {
  if (!payload || typeof payload !== "object" || !payload.current || !payload.daily) {
    throw new Error("Open-Meteo response missing current or daily weather data");
  }

  const current = payload.current;
  const daily = payload.daily;
  const dates = Array.isArray(daily.time) ? daily.time : [];
  const days = [];

  for (let index = 0; index < Math.min(FORECAST_DAYS, dates.length); index += 1) {
    const date = cleanText(String(dates[index]));
    if (!date) continue;
    days.push({
      date,
      condition: weatherCodeInfo(dailyValue(daily, "weather_code", index)),
      highF: roundedNumber(dailyValue(daily, "temperature_2m_max", index)),
      lowF: roundedNumber(dailyValue(daily, "temperature_2m_min", index)),
      precipChancePct: roundedNumber(dailyValue(daily, "precipitation_probability_max", index))
    });
  }

  return {
    current: {
      temperatureF: roundedNumber(current.temperature_2m),
      apparentF: roundedNumber(current.apparent_temperature),
      condition: weatherCodeInfo(current.weather_code),
      windMph: roundedNumber(current.wind_speed_10m),
      humidityPct: roundedNumber(current.relative_humidity_2m)
    },
    daily: days,
    locationLabel
  };
}

function fetchFailureMessage(kind, detail) {
  if (kind === "coordinates") return "Weather coordinates are invalid";
  if (kind === "status") return "Weather fetch failed (status " + detail + ")";
  if (kind === "parse") return "Weather forecast could not be parsed";
  return "Weather forecast unreachable";
}

async function collect(env, deps = {}) {
  const config = readConfig(env || {});
  if (!config) return { dataSourceId: DATA_SOURCE_ID, state: "unconfigured" };
  if (!config.valid) return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("coordinates") };

  const fetchImpl = deps.fetch || fetch;
  const now = deps.now ? new Date(deps.now) : new Date();
  const source = config.locationLabel || SOURCE_LABEL;
  const url = buildForecastUrl(config);

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
  } catch (error) {
    return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("network") };
  }

  if (!response.ok) {
    return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("status", response.status) };
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("parse") };
  }

  let data;
  try {
    data = normalizeForecast(payload, source);
  } catch (error) {
    return { dataSourceId: DATA_SOURCE_ID, state: "error", message: fetchFailureMessage("parse") };
  }

  return {
    dataSourceId: DATA_SOURCE_ID,
    state: "ready",
    source,
    updatedAt: now.toISOString(),
    data
  };
}

module.exports = {
  dataSourceId: DATA_SOURCE_ID,
  refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
  collect,
  readConfig,
  weatherCodeInfo,
  normalizeForecast,
  buildForecastUrl,
  WMO_WEATHER_CODES
};
