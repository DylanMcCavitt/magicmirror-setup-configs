import {
  DATA_SOURCE_CONTRACTS,
  EINK_MONOGRID_TOKENS,
  MIRROR_OS_PAGE_REGISTRY,
  unconfiguredDataSourceState
} from "./mirror-os-contract.mjs";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const AGENT_SNAPSHOT_SOURCE_ID = "agentSnapshot";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
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
    ...invalidFields.map((field) => `${field} must be an ISO timestamp`)
  ];
  return messages.join("; ");
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

export function resolveDataSourceState(dataSourceId, { env = {}, payload } = {}) {
  const contract = contractFor(dataSourceId);
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

  return {
    state: "ready",
    source: {
      kind: source.kind,
      label: source.label
    },
    updatedAt,
    stale: false,
    unconfigured: false
  };
}

export function resolvePageViewModels({ env = {}, payloads = {} } = {}) {
  const payloadMap = payloads && typeof payloads === "object" ? payloads : {};
  const sourceStates = Object.fromEntries(Object.keys(DATA_SOURCE_CONTRACTS).map((dataSourceId) => [
    dataSourceId,
    resolveDataSourceState(dataSourceId, { env, payload: payloadMap[dataSourceId] })
  ]));
  const sourceReadiness = Object.fromEntries(Object.keys(DATA_SOURCE_CONTRACTS).map((dataSourceId) => [
    dataSourceId,
    resolveSourceReadiness(dataSourceId, { env, payload: payloadMap[dataSourceId] })
  ]));
  const sortedPages = [...MIRROR_OS_PAGE_REGISTRY].sort((left, right) => left.order - right.order);
  const readyCount = Object.values(sourceStates).filter((state) => state.state === "ready").length;
  const unconfiguredLabels = Object.entries(sourceStates)
    .filter(([, state]) => state.state === "unconfigured")
    .map(([dataSourceId]) => DATA_SOURCE_CONTRACTS[dataSourceId].label);
  const sourceStateNames = Object.fromEntries(Object.entries(sourceStates).map(([dataSourceId, state]) => [
    dataSourceId,
    state.state
  ]));
  const homeMessage = `${readyCount} of ${Object.keys(DATA_SOURCE_CONTRACTS).length} sources ready${unconfiguredLabels.length > 0 ? `, unconfigured: ${unconfiguredLabels.join(", ")}` : ""}`;

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
    return {
      pageId: page.id,
      label: page.label,
      dataSourceId: page.dataSourceId,
      state: state.state,
      glyph: state.state === "unconfigured"
        ? EINK_MONOGRID_TOKENS.statusTreatment.glyphs.unconfigured
        : state.state === "error"
          ? EINK_MONOGRID_TOKENS.statusTreatment.glyphs.failed
          : EINK_MONOGRID_TOKENS.statusTreatment.glyphs.idle,
      message: state.message ?? null,
      missingConfigKeys: sourceReadiness[page.dataSourceId].missingKeys,
      source: state.source,
      updatedAt: state.updatedAt
    };
  });
}
