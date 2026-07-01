const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function freezeDeep(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freezeDeep);
  }
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function sameStringList(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

export const PAGE_IDS = freezeDeep([
  "agents",
  "calendar",
  "weather",
  "path",
  "sports",
  "home"
]);

export const DATA_SOURCE_CONTRACTS = freezeDeep({
  agentSnapshot: {
    pageId: "agents",
    label: "Agent work",
    requiredConfigKeys: ["snapshot.source.kind", "snapshot.source.label"],
    optionalConfigKeys: ["MIRROR_LOCAL_UPLOAD_TOKEN", "MIRROR_INGEST_TOKEN", "OMP_SESSIONS_DIR", "MIRROR_MAX_SESSIONS"],
    refreshIntervalSeconds: 60,
    staleAfterSeconds: 300,
    unconfiguredCopy: "Upload an agent snapshot with source.kind and source.label before showing agent work.",
    provenanceFields: ["source", "updatedAt", "stale", "unconfigured"],
    workItemNaming: {
      order: ["project", "issueId", "prId", "workstreamId", "title"],
      requiredFirstField: "project",
      supportedIdentifiers: ["issueId", "prId", "workstreamId"]
    }
  },
  calendarIcs: {
    pageId: "calendar",
    label: "Calendar",
    requiredConfigKeys: ["MIRROR_CALENDAR_ICS_URL"],
    optionalConfigKeys: ["MIRROR_CALENDAR_NAME", "MIRROR_CALENDAR_TIMEZONE"],
    refreshIntervalSeconds: 300,
    staleAfterSeconds: 900,
    unconfiguredCopy: "Set MIRROR_CALENDAR_ICS_URL to an ICS feed before showing calendar events.",
    provenanceFields: ["source", "updatedAt", "stale", "unconfigured"]
  },
  openMeteo: {
    pageId: "weather",
    label: "Weather",
    requiredConfigKeys: ["MIRROR_WEATHER_LATITUDE", "MIRROR_WEATHER_LONGITUDE"],
    optionalConfigKeys: ["MIRROR_WEATHER_TIMEZONE", "MIRROR_WEATHER_LOCATION_LABEL"],
    refreshIntervalSeconds: 900,
    staleAfterSeconds: 2700,
    unconfiguredCopy: "Set MIRROR_WEATHER_LATITUDE and MIRROR_WEATHER_LONGITUDE before showing weather.",
    provenanceFields: ["source", "updatedAt", "stale", "unconfigured"]
  },
  pathGtfsRealtime: {
    pageId: "path",
    label: "PATH",
    requiredConfigKeys: ["MIRROR_PATH_GTFS_RT_URL", "MIRROR_PATH_STATION_ID"],
    optionalConfigKeys: ["MIRROR_PATH_DIRECTION", "MIRROR_PATH_ROUTE_ID"],
    refreshIntervalSeconds: 30,
    staleAfterSeconds: 120,
    unconfiguredCopy: "Set MIRROR_PATH_GTFS_RT_URL and MIRROR_PATH_STATION_ID before showing PATH train status.",
    provenanceFields: ["source", "updatedAt", "stale", "unconfigured"]
  },
  sportsScoreboard: {
    pageId: "sports",
    label: "Sports",
    requiredConfigKeys: ["MIRROR_SPORTS_LEAGUES", "MIRROR_SPORTS_TEAMS"],
    optionalConfigKeys: ["MIRROR_SPORTS_SOURCE_URL", "MIRROR_SPORTS_TIMEZONE"],
    refreshIntervalSeconds: 300,
    staleAfterSeconds: 900,
    unconfiguredCopy: "Set MIRROR_SPORTS_LEAGUES and MIRROR_SPORTS_TEAMS before showing sports scores.",
    provenanceFields: ["source", "updatedAt", "stale", "unconfigured"]
  }
});

export const MIRROR_OS_PAGE_REGISTRY = freezeDeep([
  {
    id: "home",
    label: "Home",
    route: "/home",
    order: 0,
    component: "MirrorHomePage",
    dataSourceId: null,
    statusTreatment: "glyph-text"
  },
  {
    id: "agents",
    label: "Agents",
    route: "/agents",
    order: 10,
    component: "AgentWorkPage",
    dataSourceId: "agentSnapshot",
    statusTreatment: "glyph-text"
  },
  {
    id: "calendar",
    label: "Calendar",
    route: "/calendar",
    order: 20,
    component: "CalendarPage",
    dataSourceId: "calendarIcs",
    statusTreatment: "glyph-text"
  },
  {
    id: "weather",
    label: "Weather",
    route: "/weather",
    order: 30,
    component: "WeatherPage",
    dataSourceId: "openMeteo",
    statusTreatment: "glyph-text"
  },
  {
    id: "path",
    label: "PATH",
    route: "/path",
    order: 40,
    component: "PathTrainPage",
    dataSourceId: "pathGtfsRealtime",
    statusTreatment: "glyph-text"
  },
  {
    id: "sports",
    label: "Sports",
    route: "/sports",
    order: 50,
    component: "SportsPage",
    dataSourceId: "sportsScoreboard",
    statusTreatment: "glyph-text"
  }
]);

export const PAGE_STATE_CONTRACT = freezeDeep({
  currentPageId: "home",
  rotation: {
    paused: false,
    intervalSeconds: 45
  },
  lastCommandSource: "system",
  dataSourceStates: Object.fromEntries(Object.entries(DATA_SOURCE_CONTRACTS).map(([id, contract]) => [
    id,
    {
      state: "unconfigured",
      source: null,
      updatedAt: null,
      stale: false,
      unconfigured: true,
      message: contract.unconfiguredCopy
    }
  ]))
});

export const EINK_MONOGRID_TOKENS = freezeDeep({
  typography: {
    fontFamily: "Inter, Roboto Condensed, system-ui, sans-serif",
    titleWeight: 700,
    bodyWeight: 400,
    metaTracking: "0.08em"
  },
  rules: {
    hairlinePx: 1,
    strongRulePx: 2,
    cornerRadiusPx: 0
  },
  colorHints: {
    ink: "#f7f7f2",
    dimInk: "#9aa3ad",
    cyan: "#54c6eb",
    amber: "#e0ac4a",
    red: "#e05757",
    green: "#65d18a"
  },
  statusTreatment: {
    pattern: "glyph-text",
    pillWidgets: false,
    glyphs: {
      running: "▶",
      blocked: "×",
      done: "✓",
      failed: "!",
      idle: "·",
      waiting: "…",
      stale: "△",
      unconfigured: "□",
      unknown: "?"
    }
  }
});

export function sourceContractForPage(pageId) {
  const page = MIRROR_OS_PAGE_REGISTRY.find((entry) => entry.id === pageId);
  return page?.dataSourceId ? DATA_SOURCE_CONTRACTS[page.dataSourceId] : null;
}

export function unconfiguredDataSourceState(dataSourceId) {
  const contract = DATA_SOURCE_CONTRACTS[dataSourceId];
  if (!contract) throw new Error(`Unknown data source: ${dataSourceId}`);
  return {
    state: "unconfigured",
    source: null,
    updatedAt: null,
    stale: false,
    unconfigured: true,
    message: contract.unconfiguredCopy
  };
}

export function validateMirrorOsContract(config = {}, options = {}) {
  const errors = [];
  validatePageRegistry(errors);
  validateDataSourceContracts(errors);
  validateDesignTokens(errors);
  validateRuntimeConfig(config, errors);
  validateRuntimeData(options.runtimeData || config.runtimeData, errors);
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

function validatePageRegistry(errors) {
  const ids = new Set();
  const routes = new Set();
  const orders = new Set();

  for (const page of MIRROR_OS_PAGE_REGISTRY) {
    if (!PAGE_IDS.includes(page.id)) errors.push(`Unknown page id in registry: ${page.id}`);
    if (ids.has(page.id)) errors.push(`Duplicate page id in registry: ${page.id}`);
    ids.add(page.id);

    if (!isNonEmptyString(page.route) || !page.route.startsWith("/")) errors.push(`${page.id}.route must be an absolute route`);
    if (routes.has(page.route)) errors.push(`Duplicate page route in registry: ${page.route}`);
    routes.add(page.route);

    if (!Number.isInteger(page.order)) errors.push(`${page.id}.order must be an integer`);
    if (orders.has(page.order)) errors.push(`Duplicate page order in registry: ${page.order}`);
    orders.add(page.order);

    if (page.statusTreatment !== "glyph-text") errors.push(`${page.id}.statusTreatment must be glyph-text`);
    if (page.dataSourceId && !DATA_SOURCE_CONTRACTS[page.dataSourceId]) errors.push(`${page.id}.dataSourceId is unknown: ${page.dataSourceId}`);
  }

  for (const pageId of PAGE_IDS) {
    if (!ids.has(pageId)) errors.push(`Missing page registry entry: ${pageId}`);
  }
}

function validateDataSourceContracts(errors) {
  const dataBackedPageIds = new Set();

  for (const [id, contract] of Object.entries(DATA_SOURCE_CONTRACTS)) {
    if (!PAGE_IDS.includes(contract.pageId)) errors.push(`${id}.pageId is unknown: ${contract.pageId}`);
    if (dataBackedPageIds.has(contract.pageId)) errors.push(`Multiple data sources assigned to ${contract.pageId}`);
    dataBackedPageIds.add(contract.pageId);

    if (!Array.isArray(contract.requiredConfigKeys) || contract.requiredConfigKeys.length === 0) errors.push(`${id}.requiredConfigKeys must name real source requirements`);
    if (!Number.isInteger(contract.refreshIntervalSeconds) || contract.refreshIntervalSeconds <= 0) errors.push(`${id}.refreshIntervalSeconds must be positive`);
    if (!Number.isInteger(contract.staleAfterSeconds) || contract.staleAfterSeconds < contract.refreshIntervalSeconds) errors.push(`${id}.staleAfterSeconds must be >= refreshIntervalSeconds`);
    if (!isNonEmptyString(contract.unconfiguredCopy)) errors.push(`${id}.unconfiguredCopy is required`);

    for (const field of ["source", "updatedAt"]) {
      if (!contract.provenanceFields?.includes(field)) errors.push(`${id}.provenanceFields must include ${field}`);
    }
  }
}

function validateDesignTokens(errors) {
  if (EINK_MONOGRID_TOKENS.statusTreatment.pattern !== "glyph-text") errors.push("statusTreatment.pattern must be glyph-text");
  if (EINK_MONOGRID_TOKENS.statusTreatment.pillWidgets !== false) errors.push("statusTreatment.pillWidgets must be false");
}

function validateRuntimeConfig(config, errors) {
  const mirrorOs = config?.mirrorOs || config;
  if (!isPlainObject(mirrorOs)) {
    errors.push("mirrorOs config must be an object");
    return;
  }

  if (mirrorOs.initialPage && !PAGE_IDS.includes(mirrorOs.initialPage)) errors.push(`mirrorOs.initialPage is unknown: ${mirrorOs.initialPage}`);

  if (mirrorOs.pageState) {
    const state = mirrorOs.pageState;
    if (!PAGE_IDS.includes(state.currentPageId)) errors.push(`pageState.currentPageId is unknown: ${state.currentPageId}`);
    if (typeof state.rotationPaused !== "boolean") errors.push("pageState.rotationPaused must be boolean");
    if (!isNonEmptyString(state.lastCommandSource)) errors.push("pageState.lastCommandSource is required");
  }

  if (!Array.isArray(mirrorOs.pages)) {
    errors.push("mirrorOs.pages must list the page registry order");
  } else {
    const registryOrder = MIRROR_OS_PAGE_REGISTRY
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((page) => page.id);
    if (!sameStringList(mirrorOs.pages, registryOrder)) errors.push(`mirrorOs.pages must exactly match registry order: ${registryOrder.join(", ")}`);
  }

  if (!isPlainObject(mirrorOs.dataSources)) {
    errors.push("mirrorOs.dataSources must define each data-source contract");
  } else {
    for (const [dataSourceId, contract] of Object.entries(DATA_SOURCE_CONTRACTS)) {
      const configured = mirrorOs.dataSources[dataSourceId];
      if (!isPlainObject(configured)) {
        errors.push(`mirrorOs.dataSources.${dataSourceId} is required`);
        continue;
      }
      if (!sameStringList(configured.requiredConfigKeys, contract.requiredConfigKeys)) errors.push(`mirrorOs.dataSources.${dataSourceId}.requiredConfigKeys must match the contract`);
      if (configured.refreshIntervalSeconds !== contract.refreshIntervalSeconds) errors.push(`mirrorOs.dataSources.${dataSourceId}.refreshIntervalSeconds must match the contract`);
      if (configured.staleAfterSeconds !== contract.staleAfterSeconds) errors.push(`mirrorOs.dataSources.${dataSourceId}.staleAfterSeconds must match the contract`);
      if (configured.unconfiguredCopy !== contract.unconfiguredCopy) errors.push(`mirrorOs.dataSources.${dataSourceId}.unconfiguredCopy must match the contract`);
    }
  }
}

function validateRuntimeData(runtimeData, errors) {
  if (runtimeData === undefined || runtimeData === null) return;
  if (!isPlainObject(runtimeData)) {
    errors.push("runtimeData must be an object when present");
    return;
  }

  for (const dataSourceId of Object.keys(DATA_SOURCE_CONTRACTS)) {
    const contract = DATA_SOURCE_CONTRACTS[dataSourceId];
    if (!Object.hasOwn(runtimeData, dataSourceId)) {
      errors.push(`runtimeData.${dataSourceId} must declare ready, stale, unconfigured, or error state`);
      continue;
    }
    validateDataSourceState(dataSourceId, runtimeData[dataSourceId], errors, contract);
  }

  for (const dataSourceId of Object.keys(runtimeData)) {
    if (!DATA_SOURCE_CONTRACTS[dataSourceId]) errors.push(`runtimeData.${dataSourceId} has no data-source contract`);
  }
}

function validateDataSourceState(dataSourceId, value, errors, contract) {
  if (!isPlainObject(value)) {
    errors.push(`runtimeData.${dataSourceId} must be an object`);
    return;
  }

  const state = value.state;
  if (!["ready", "stale", "unconfigured", "error"].includes(state)) errors.push(`runtimeData.${dataSourceId}.state is invalid: ${state}`);

  if (state === "unconfigured") {
    if (value.unconfigured !== true) errors.push(`runtimeData.${dataSourceId}.unconfigured must be true when state is unconfigured`);
    if (value.source !== null && value.source !== undefined) errors.push(`runtimeData.${dataSourceId}.source must be empty when state is unconfigured`);
    if (value.updatedAt !== null && value.updatedAt !== undefined) errors.push(`runtimeData.${dataSourceId}.updatedAt must be empty when state is unconfigured`);
    if (value.stale === true) errors.push(`runtimeData.${dataSourceId}.stale cannot be true when state is unconfigured`);
    if (!isNonEmptyString(value.message)) errors.push(`runtimeData.${dataSourceId}.message must explain the missing config`);
    if (value.message !== contract.unconfiguredCopy) errors.push(`runtimeData.${dataSourceId}.message must match the contract unconfigured copy`);
  }

  if (state === "ready" || state === "stale") {
    if (!isPlainObject(value.source)) {
      errors.push(`runtimeData.${dataSourceId}.source is required when state is ${state}`);
    } else {
      if (!isNonEmptyString(value.source.kind)) errors.push(`runtimeData.${dataSourceId}.source.kind is required`);
      if (!isNonEmptyString(value.source.label)) errors.push(`runtimeData.${dataSourceId}.source.label is required`);
    }
    if (!isIsoTimestamp(value.updatedAt)) errors.push(`runtimeData.${dataSourceId}.updatedAt must be an ISO timestamp when state is ${state}`);
    if (value.unconfigured === true) errors.push(`runtimeData.${dataSourceId}.unconfigured cannot be true when state is ${state}`);
    if (state === "ready" && value.stale === true) errors.push(`runtimeData.${dataSourceId}.stale cannot be true when state is ready`);
    if (state === "stale" && value.stale !== true) errors.push(`runtimeData.${dataSourceId}.stale must be true when state is stale`);
  }

  if (state === "error" && !isNonEmptyString(value.message)) errors.push(`runtimeData.${dataSourceId}.message is required when state is error`);
}
