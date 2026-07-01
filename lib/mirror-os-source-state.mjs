import {
  DATA_SOURCE_CONTRACTS,
  EINK_MONOGRID_TOKENS,
  MIRROR_OS_PAGE_REGISTRY,
  unconfiguredDataSourceState
} from "./mirror-os-contract.mjs";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const AGENT_SNAPSHOT_SOURCE_ID = "agentSnapshot";
const FUTURE_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;


function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value) {
  if (!isNonEmptyString(value) || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return false;
  const canonical = new Date(parsed).toISOString();
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return canonical === normalized;
}

function resolveDottedPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function envValue(env, key) {
  return env && typeof env === "object" ? env[key] : undefined;
}

function contractFor(dataSourceId) {
  const contract = DATA_SOURCE_CONTRACTS[dataSourceId];
  if (!contract) throw new Error(`Unknown data source: ${dataSourceId}`);
  return contract;
}

function errorDataSourceState(message) {
  return {
    state: "error",
    source: null,
    updatedAt: null,
    stale: false,
    unconfigured: false,
    message
  };
}

function metadataErrorMessage(dataSourceId, missingFields, invalidFields) {
  const messages = [
    ...missingFields.map((field) => `${dataSourceId} payload is missing ${field}`),
    ...invalidFields.map((field) => `${field} is invalid`)
  ];
  return messages.join("; ");
}

function normalizeNow(now) {
  const nowMs = now instanceof Date ? now.getTime() : now;
  return typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : Date.now();
}

function relativeAge(updatedAt, now) {
  const ageSeconds = Math.max(0, Math.floor((normalizeNow(now) - Date.parse(updatedAt)) / 1000));
  if (ageSeconds < 10) return "just now";
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `${ageHours}h ago`;
  return `${Math.floor(ageHours / 24)}d ago`;
}

const SENSITIVE_PAIR_PATTERN = /\b(?:key|token|secret|password|apikey|api_key)\s*=\s*[^\s&;,]+/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const HOSTISH_PATTERN = /^[^\s]+$/;

export function sanitizeSourceLabel(label) {
  try {
    if (typeof label !== "string") return null;
    const trimmed = label.trim();
    if (trimmed.length === 0) return null;

    if (trimmed.includes("://")) {
      try {
        return new URL(trimmed).hostname || null;
      } catch {
        return null;
      }
    }

    if (HOSTISH_PATTERN.test(trimmed) && /[/?#@]/.test(trimmed)) {
      // Schemeless URL-ish label: drop userinfo, keep only the host part.
      const withoutUserinfo = trimmed.slice(trimmed.lastIndexOf("@") + 1);
      const host = withoutUserinfo.split(/[/?#]/, 1)[0].trim();
      return host.length > 0 ? host : null;
    }

    // Display-name label: redact sensitive key=value pairs and emails, keep the rest.
    const redacted = trimmed
      .replace(SENSITIVE_PAIR_PATTERN, "[redacted]")
      .replace(EMAIL_PATTERN, "[email]")
      .replace(/\s+/g, " ")
      .trim();
    return redacted.length > 0 ? redacted : null;
  } catch {
    return null;
  }
}

export function formatProvenance(state, { now } = {}) {
  try {
    if (!state || (state.state !== "ready" && state.state !== "stale")) return null;
    const label = sanitizeSourceLabel(state.source?.label);
    if (!label || !isIsoTimestamp(state.updatedAt)) return null;
    const age = relativeAge(state.updatedAt, now);
    return state.state === "stale"
      ? `△ stale · ${label} · ${age}`
      : `${label} · ${age}`;
  } catch {
    return null;
  }
}

export function resolveSourceReadiness(dataSourceId, { env = {}, payload } = {}) {
  const contract = contractFor(dataSourceId);
  const missingKeys = contract.requiredConfigKeys.filter((key) => {
    const value = dataSourceId === AGENT_SNAPSHOT_SOURCE_ID
      ? resolveDottedPath({ snapshot: payload }, key)
      : envValue(env, key);
    return !isNonEmptyString(value);
  });

  return {
    configured: missingKeys.length === 0,
    missingKeys
  };
}

export function resolveDataSourceState(dataSourceId, { env = {}, payload, now } = {}) {
  const contract = contractFor(dataSourceId);
  const nowMs = normalizeNow(now);
  const readiness = resolveSourceReadiness(dataSourceId, { env, payload });
  if (!readiness.configured) return unconfiguredDataSourceState(dataSourceId);

  if (payload === undefined || payload === null) {
    return errorDataSourceState(`${contract.label} source is configured but no data has been received yet.`);
  }

  if (!isPlainObject(payload)) {
    return errorDataSourceState(`${dataSourceId} payload must be a plain object`);
  }

  const source = isPlainObject(payload.source) ? payload.source : null;
  const updatedAt = dataSourceId === AGENT_SNAPSHOT_SOURCE_ID
    ? payload.generatedAt ?? payload.updatedAt
    : payload.updatedAt;
  const missingFields = [];
  const invalidFields = [];

  if (!isNonEmptyString(source?.kind)) missingFields.push("source.kind");
  if (!isNonEmptyString(source?.label)) missingFields.push("source.label");
  if (updatedAt === undefined || updatedAt === null || updatedAt === "") {
    missingFields.push("updatedAt");
  } else if (!isIsoTimestamp(updatedAt)) {
    invalidFields.push("updatedAt");
  }

  if (missingFields.length > 0 || invalidFields.length > 0) {
    return errorDataSourceState(metadataErrorMessage(dataSourceId, missingFields, invalidFields));
  }

  const updatedAtMs = Date.parse(updatedAt);
  const ageMs = nowMs - updatedAtMs;
  if (ageMs < -FUTURE_TIMESTAMP_SKEW_MS) {
    return errorDataSourceState(`updatedAt is invalid: future timestamp ${updatedAt} is not trustworthy provenance.`);
  }

  const sourceState = {
    state: ageMs > contract.staleAfterSeconds * 1000 ? "stale" : "ready",
    source: {
      kind: source.kind,
      label: source.label
    },
    updatedAt,
    stale: ageMs > contract.staleAfterSeconds * 1000,
    unconfigured: false
  };

  if (sourceState.stale) {
    sourceState.message = `Data is stale: last update ${updatedAt} exceeds ${contract.staleAfterSeconds}s threshold.`;
  }

  return sourceState;
}

export function resolvePageViewModels({ env = {}, payloads = {}, now } = {}) {
  const payloadMap = payloads && typeof payloads === "object" ? payloads : {};
  const sourceStates = Object.fromEntries(Object.keys(DATA_SOURCE_CONTRACTS).map((dataSourceId) => [
    dataSourceId,
    resolveDataSourceState(dataSourceId, { env, payload: payloadMap[dataSourceId], now })
  ]));
  const sourceReadiness = Object.fromEntries(Object.keys(DATA_SOURCE_CONTRACTS).map((dataSourceId) => [
    dataSourceId,
    resolveSourceReadiness(dataSourceId, { env, payload: payloadMap[dataSourceId] })
  ]));
  const sortedPages = [...MIRROR_OS_PAGE_REGISTRY].sort((left, right) => left.order - right.order);
  const readyCount = Object.values(sourceStates).filter((state) => state.state === "ready").length;
  const staleLabels = Object.entries(sourceStates)
    .filter(([, state]) => state.state === "stale")
    .map(([dataSourceId]) => DATA_SOURCE_CONTRACTS[dataSourceId].label);
  const unconfiguredLabels = Object.entries(sourceStates)
    .filter(([, state]) => state.state === "unconfigured")
    .map(([dataSourceId]) => DATA_SOURCE_CONTRACTS[dataSourceId].label);
  const sourceStateNames = Object.fromEntries(Object.entries(sourceStates).map(([dataSourceId, state]) => [
    dataSourceId,
    state.state
  ]));
  const homeMessage = `${readyCount} of ${Object.keys(DATA_SOURCE_CONTRACTS).length} sources ready${staleLabels.length > 0 ? `, stale: ${staleLabels.join(", ")}` : ""}${unconfiguredLabels.length > 0 ? `, unconfigured: ${unconfiguredLabels.join(", ")}` : ""}`;

  return sortedPages.map((page) => {
    if (!page.dataSourceId) {
      return {
        pageId: page.id,
        label: page.label,
        dataSourceId: null,
        state: "summary",
        glyph: EINK_MONOGRID_TOKENS.statusTreatment.glyphs.idle,
        message: homeMessage,
        missingConfigKeys: [],
        source: null,
        updatedAt: null,
        sourceStates: sourceStateNames
      };
    }

    const state = sourceStates[page.dataSourceId];
    const source = state.source
      ? { kind: state.source.kind, label: sanitizeSourceLabel(state.source.label) }
      : state.source;
    return {
      pageId: page.id,
      label: page.label,
      dataSourceId: page.dataSourceId,
      state: state.state,
      glyph: state.state === "unconfigured"
        ? EINK_MONOGRID_TOKENS.statusTreatment.glyphs.unconfigured
        : state.state === "error"
          ? EINK_MONOGRID_TOKENS.statusTreatment.glyphs.failed
          : state.state === "stale"
            ? EINK_MONOGRID_TOKENS.statusTreatment.glyphs.stale
            : EINK_MONOGRID_TOKENS.statusTreatment.glyphs.idle,
      message: state.message ?? null,
      missingConfigKeys: sourceReadiness[page.dataSourceId].missingKeys,
      source,
      updatedAt: state.updatedAt,
      freshness: state.state === "ready" ? "fresh" : state.state === "stale" ? "stale" : null,
      provenance: formatProvenance(state, { now })
    };
  });
}
