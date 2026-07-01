#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import {
  DATA_SOURCE_CONTRACTS,
  EINK_MONOGRID_TOKENS,
  validateMirrorOsContract
} from "../lib/mirror-os-contract.mjs";
import {
  formatProvenance,
  resolveDataSourceState,
  resolvePageViewModels,
  sanitizeSourceLabel
} from "../lib/mirror-os-source-state.mjs";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const configPath = path.join(repoRoot, "mirror-config/config.js");
const dataSourceIds = Object.keys(DATA_SOURCE_CONTRACTS);
const envDataSourceIds = dataSourceIds.filter((dataSourceId) => dataSourceId !== "agentSnapshot");
const fixedNow = Date.parse("2026-07-01T12:00:00.000Z");
const sentinelEnv = Object.fromEntries(envDataSourceIds.flatMap((dataSourceId) => (
  DATA_SOURCE_CONTRACTS[dataSourceId].requiredConfigKeys.map((key) => [key, `SECRET-VALUE-${dataSourceId}-${key}`])
)));

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function loadMirrorOsConfig() {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    console,
    process: { env: process.env }
  };
  const source = readFileSync(configPath, "utf8");
  vm.runInNewContext(source, sandbox, { filename: configPath });
  const mirrorOs = sandbox.module.exports.modules?.find((entry) => entry?.module === "MMM-AgentSurface")?.config?.mirrorOs;
  if (!mirrorOs) fail("MMM-AgentSurface config.mirrorOs is required");
  return mirrorOs;
}

function payloadFor(dataSourceId, updatedAt, label = `${DATA_SOURCE_CONTRACTS[dataSourceId].label} fixture`) {
  const payload = {
    source: {
      kind: `${dataSourceId}-fixture`,
      label
    },
    updatedAt
  };
  if (dataSourceId === "agentSnapshot") {
    payload.generatedAt = updatedAt;
    delete payload.updatedAt;
  }
  return payload;
}

function envFor(dataSourceId) {
  return dataSourceId === "agentSnapshot" ? {} : sentinelEnv;
}

function stateFor(dataSourceId, payload, now = fixedNow) {
  return resolveDataSourceState(dataSourceId, { env: envFor(dataSourceId), payload, now });
}

function payloadMapWith(dataSourceId, payload, updatedAt = iso(fixedNow - 1000)) {
  return Object.fromEntries(dataSourceIds.map((entryDataSourceId) => [
    entryDataSourceId,
    entryDataSourceId === dataSourceId ? payload : payloadFor(entryDataSourceId, updatedAt)
  ]));
}

function viewModelFor(dataSourceId, payload, now = fixedNow) {
  const viewModels = resolvePageViewModels({
    env: sentinelEnv,
    payloads: payloadMapWith(dataSourceId, payload),
    now
  });
  return viewModels.find((viewModel) => viewModel.dataSourceId === dataSourceId);
}

function runtimeDataWith(dataSourceId, state, now = fixedNow) {
  return Object.fromEntries(dataSourceIds.map((entryDataSourceId) => [
    entryDataSourceId,
    entryDataSourceId === dataSourceId
      ? state
      : stateFor(entryDataSourceId, payloadFor(entryDataSourceId, iso(now - 1000)), now)
  ]));
}

function assertSafeProvenance(text, context) {
  assert(typeof text === "string" && text.length > 0, `${context} provenance should be present`);
  assert(!text.includes("://"), `${context} provenance must not include a URL scheme`);
  assert(!text.includes("@"), `${context} provenance must not include credentials`);
}

function scenarioCurrentPayloads() {
  for (const dataSourceId of dataSourceIds) {
    const contract = DATA_SOURCE_CONTRACTS[dataSourceId];
    const updatedAt = iso(fixedNow - (contract.refreshIntervalSeconds * 1000 / 2));
    const payload = payloadFor(dataSourceId, updatedAt);
    const state = stateFor(dataSourceId, payload);
    assert(state.state === "ready", `${dataSourceId} current payload should be ready`);

    const viewModel = viewModelFor(dataSourceId, payload);
    const label = sanitizeSourceLabel(payload.source.label);
    assert(viewModel.freshness === "fresh", `${dataSourceId} view model should report fresh freshness`);
    assert(viewModel.provenance.includes(label), `${dataSourceId} provenance should include sanitized label`);
    assert(/(just now|\d+[smhd] ago)$/.test(viewModel.provenance), `${dataSourceId} provenance should include relative age`);
    assertSafeProvenance(viewModel.provenance, dataSourceId);
  }
}

function scenarioStalePayloads(config) {
  for (const dataSourceId of dataSourceIds) {
    const contract = DATA_SOURCE_CONTRACTS[dataSourceId];
    const freshPayload = payloadFor(dataSourceId, iso(fixedNow - 1000));
    const freshProvenance = formatProvenance(stateFor(dataSourceId, freshPayload), { now: fixedNow });
    const stalePayload = payloadFor(dataSourceId, iso(fixedNow - ((contract.staleAfterSeconds + 60) * 1000)));
    const state = stateFor(dataSourceId, stalePayload);
    assert(state.state === "stale", `${dataSourceId} stale payload should be stale`);
    assert(state.stale === true, `${dataSourceId} stale payload should set stale:true`);

    const viewModel = viewModelFor(dataSourceId, stalePayload);
    assert(viewModel.glyph === EINK_MONOGRID_TOKENS.statusTreatment.glyphs.stale, `${dataSourceId} stale view model should use stale glyph`);
    assert(viewModel.freshness === "stale", `${dataSourceId} view model should report stale freshness`);
    assert(viewModel.provenance.startsWith("△ stale"), `${dataSourceId} stale provenance should be visibly stale`);
    assert(viewModel.provenance !== freshProvenance, `${dataSourceId} stale provenance must differ from fresh provenance`);

    const result = validateMirrorOsContract(config, { runtimeData: runtimeDataWith(dataSourceId, state) });
    assert(result.ok, `${dataSourceId} stale state should pass runtime validation: ${result.errors.join("; ")}`);
  }
}

function scenarioMissingTimestamp() {
  for (const dataSourceId of dataSourceIds) {
    const payload = payloadFor(dataSourceId, iso(fixedNow));
    delete payload.updatedAt;
    delete payload.generatedAt;
    const state = stateFor(dataSourceId, payload);
    assert(state.state === "error", `${dataSourceId} missing timestamp should fail closed`);
    assert(state.state !== "ready" && state.state !== "stale", `${dataSourceId} missing timestamp must not be ready or stale`);
  }
}

function scenarioInvalidTimestamp() {
  for (const dataSourceId of dataSourceIds) {
    for (const updatedAt of ["not-a-date", "2026-13-99T99:99:99Z"]) {
      const state = stateFor(dataSourceId, payloadFor(dataSourceId, updatedAt));
      assert(state.state === "error", `${dataSourceId} invalid timestamp ${updatedAt} should fail closed`);
    }
  }
}

function scenarioFutureTimestamp() {
  for (const dataSourceId of dataSourceIds) {
    const beyondSkew = stateFor(dataSourceId, payloadFor(dataSourceId, iso(fixedNow + 10 * 60 * 1000)));
    assert(beyondSkew.state === "error", `${dataSourceId} future timestamp beyond skew should fail closed`);
    assert(beyondSkew.message.includes("updatedAt") && beyondSkew.message.includes("invalid"), `${dataSourceId} future error should name updatedAt invalid`);

    const withinSkew = stateFor(dataSourceId, payloadFor(dataSourceId, iso(fixedNow + 60 * 1000)));
    assert(withinSkew.state === "ready", `${dataSourceId} future timestamp within skew should be ready`);
  }
}

function scenarioProviderErrorPayloadPath() {
  for (const dataSourceId of envDataSourceIds) {
    const readyState = stateFor(dataSourceId, payloadFor(dataSourceId, iso(fixedNow - 1000)));
    assert(readyState.state === "ready", `${dataSourceId} configured valid source should be ready`);

    const errorState = stateFor(dataSourceId, { error: "boom" });
    assert(errorState.state === "error", `${dataSourceId} provider error payload should fail closed`);
    assert(errorState.message.includes("source.kind"), `${dataSourceId} provider error should name missing source.kind`);
    assert(errorState.message.includes("source.label"), `${dataSourceId} provider error should name missing source.label`);
    assert(errorState.message.includes("updatedAt"), `${dataSourceId} provider error should name missing updatedAt`);
  }
}

function scenarioSecretSafety() {
  const secretLabel = "https://user:sekret-token-9x@internal.example.com/feed?key=abc";
  for (const dataSourceId of dataSourceIds) {
    const payload = payloadFor(dataSourceId, iso(fixedNow - 1000), secretLabel);
    const state = stateFor(dataSourceId, payload);
    const provenance = formatProvenance(state, { now: fixedNow });
    const serializedViewModels = JSON.stringify(resolvePageViewModels({
      env: sentinelEnv,
      payloads: payloadMapWith(dataSourceId, payload),
      now: fixedNow
    }));

    for (const text of [provenance, serializedViewModels]) {
      assert(text.includes("internal.example.com"), `${dataSourceId} should expose sanitized hostname`);
      assert(!text.includes("sekret-token-9x"), `${dataSourceId} must not expose password/token`);
      assert(!text.includes("user:"), `${dataSourceId} must not expose username`);
      assert(!text.includes("key=abc"), `${dataSourceId} must not expose query string`);
      assert(!text.includes("://"), `${dataSourceId} must not expose full URL`);
    }
  }
}

function scenarioStaleBoundary() {
  for (const dataSourceId of dataSourceIds) {
    const contract = DATA_SOURCE_CONTRACTS[dataSourceId];
    const state = stateFor(dataSourceId, payloadFor(dataSourceId, iso(fixedNow - (contract.staleAfterSeconds * 1000))));
    assert(state.state === "ready", `${dataSourceId} timestamp exactly at stale threshold should stay fresh`);
    assert(state.stale !== true, `${dataSourceId} threshold boundary must not set stale:true`);
  }
}

function scenarioSchemelessAndDisplayLabels() {
  const cases = [
    { label: "internal.example.com/feed?key=abc", mustInclude: ["internal.example.com"], mustExclude: ["key=abc", "/feed"] },
    { label: "user:pass@internal.example.com/feed", mustInclude: ["internal.example.com"], mustExclude: ["user:", "pass", "/feed"] },
    { label: "calendar feed key=abc123", mustInclude: ["calendar feed", "[redacted]"], mustExclude: ["abc123"] },
    { label: "updates from dylan@example.com", mustInclude: ["[email]"], mustExclude: ["dylan@example.com"] }
  ];
  for (const { label, mustInclude, mustExclude } of cases) {
    const sanitized = sanitizeSourceLabel(label);
    assert(typeof sanitized === "string" && sanitized.length > 0, `label should sanitize to text: ${label}`);
    for (const needle of mustInclude) {
      assert(sanitized.includes(needle), `sanitized label for "${label}" should include "${needle}", got "${sanitized}"`);
    }
    for (const needle of mustExclude) {
      assert(!sanitized.includes(needle), `sanitized label for "${label}" must not include "${needle}", got "${sanitized}"`);
    }
  }
  assert(sanitizeSourceLabel("Open-Meteo") === "Open-Meteo", "plain display label should pass through unchanged");
}

function scenarioOverflowTimestamp() {
  for (const dataSourceId of dataSourceIds) {
    const state = stateFor(dataSourceId, payloadFor(dataSourceId, "2026-02-31T12:00:00.000Z"));
    assert(state.state === "error", `${dataSourceId} calendar-overflow timestamp should fail closed, got ${state.state}`);
  }
}

try {
  const config = loadMirrorOsConfig();
  scenarioCurrentPayloads();
  scenarioStalePayloads(config);
  scenarioMissingTimestamp();
  scenarioInvalidTimestamp();
  scenarioFutureTimestamp();
  scenarioProviderErrorPayloadPath();
  scenarioSecretSafety();
  scenarioStaleBoundary();
  scenarioSchemelessAndDisplayLabels();
  scenarioOverflowTimestamp();
  console.log(JSON.stringify({ ok: true, scenarios: 10 }));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
