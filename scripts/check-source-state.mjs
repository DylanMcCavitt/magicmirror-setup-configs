#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import {
  DATA_SOURCE_CONTRACTS,
  MIRROR_OS_PAGE_REGISTRY,
  validateMirrorOsContract
} from "../lib/mirror-os-contract.mjs";
import {
  resolveDataSourceState,
  resolvePageViewModels,
  resolveSourceReadiness
} from "../lib/mirror-os-source-state.mjs";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const configPath = path.join(repoRoot, "mirror-config/config.js");
const dataSourceIds = Object.keys(DATA_SOURCE_CONTRACTS);
const envDataSourceIds = dataSourceIds.filter((dataSourceId) => dataSourceId !== "agentSnapshot");
const sentinelEnv = Object.fromEntries(envDataSourceIds.flatMap((dataSourceId) => (
  DATA_SOURCE_CONTRACTS[dataSourceId].requiredConfigKeys.map((key) => [
    key,
    `SECRET-VALUE-${dataSourceId}-${key}-7f3a`
  ])
)));

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
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
  const agentSurface = sandbox.module.exports.modules?.find((entry) => entry?.module === "MMM-AgentSurface");
  if (!agentSurface?.config?.mirrorOs) fail("MMM-AgentSurface config.mirrorOs is required");
  return agentSurface.config.mirrorOs;
}

function consumeRotationFields(viewModels) {
  for (let pass = 0; pass < 2; pass += 1) {
    for (const viewModel of viewModels) {
      void viewModel.pageId;
      void viewModel.label;
      void viewModel.dataSourceId;
      void viewModel.state;
      void viewModel.glyph;
      void viewModel.message;
      void viewModel.missingConfigKeys.join(",");
      void viewModel.source?.kind;
      void viewModel.source?.label;
      void viewModel.updatedAt;
      if (viewModel.sourceStates) {
        for (const dataSourceId of dataSourceIds) void viewModel.sourceStates[dataSourceId];
      }
    }
  }
}

function validPayload(dataSourceId, index) {
  const timestamp = `2026-07-01T12:0${index}:00.000Z`;
  const payload = {
    source: {
      kind: `${dataSourceId}-fixture`,
      label: `${DATA_SOURCE_CONTRACTS[dataSourceId].label} fixture`
    },
    updatedAt: timestamp
  };
  if (dataSourceId === "agentSnapshot") {
    payload.generatedAt = timestamp;
    delete payload.updatedAt;
  }
  return payload;
}

function scenarioEmptyEnv() {
  const states = Object.fromEntries(dataSourceIds.map((dataSourceId) => [
    dataSourceId,
    resolveDataSourceState(dataSourceId)
  ]));
  for (const dataSourceId of dataSourceIds) {
    assert(states[dataSourceId].state === "unconfigured", `${dataSourceId} should be unconfigured`);
    assert(states[dataSourceId].message === DATA_SOURCE_CONTRACTS[dataSourceId].unconfiguredCopy, `${dataSourceId} unconfigured copy changed`);
  }

  const viewModels = resolvePageViewModels();
  assert(viewModels.length === MIRROR_OS_PAGE_REGISTRY.length, "all page view models should resolve");
  assert(viewModels[0].message.startsWith("0 of 5 sources ready"), "home summary should report 0 of 5 ready");
  consumeRotationFields(viewModels);

  for (const dataSourceId of envDataSourceIds) {
    for (const key of DATA_SOURCE_CONTRACTS[dataSourceId].requiredConfigKeys) {
      assert(JSON.stringify(viewModels).includes(key), `${key} should be visible as a setup name`);
    }
  }
}

function scenarioSentinelEnvNoPayloads() {
  const states = Object.fromEntries(dataSourceIds.map((dataSourceId) => [
    dataSourceId,
    resolveDataSourceState(dataSourceId, { env: sentinelEnv })
  ]));
  for (const dataSourceId of envDataSourceIds) {
    assert(states[dataSourceId].state === "error", `${dataSourceId} should fail closed without payload`);
    assert(!states[dataSourceId].unconfigured, `${dataSourceId} should be configured`);
  }
  assert(states.agentSnapshot.state === "unconfigured", "agentSnapshot should need payload provenance config");

  const serialized = JSON.stringify({ states, viewModels: resolvePageViewModels({ env: sentinelEnv }) });
  assert(!serialized.includes("SECRET-VALUE"), "secret values must not be serialized");
}

function scenarioValidPayloads() {
  const payloads = Object.fromEntries(dataSourceIds.map((dataSourceId, index) => [
    dataSourceId,
    validPayload(dataSourceId, index)
  ]));
  const now = Date.parse(payloads.sportsScoreboard.updatedAt) + 1000;
  const states = Object.fromEntries(dataSourceIds.map((dataSourceId) => [
    dataSourceId,
    resolveDataSourceState(dataSourceId, { env: sentinelEnv, payload: payloads[dataSourceId], now })
  ]));
  for (const dataSourceId of dataSourceIds) {
    assert(states[dataSourceId].state === "ready", `${dataSourceId} should be ready with full metadata`);
  }

  const result = validateMirrorOsContract(loadMirrorOsConfig(), { runtimeData: states });
  assert(result.ok, result.errors.join("\n"));
}

function scenarioBrokenPayloads() {
  const brokenPayloads = [
    { source: { kind: "fixture" }, updatedAt: "2026-07-01T12:00:00.000Z" },
    { source: { kind: "fixture", label: "Fixture" } },
    { source: { kind: "fixture", label: "Fixture" }, updatedAt: "not-a-date" },
    { source: { kind: "fixture", label: "Fixture" }, updatedAt: "2026-13-99T99:99:99Z" },
    { source: null, updatedAt: "2026-07-01T12:00:00.000Z" }
  ];

  for (const payload of brokenPayloads) {
    for (const dataSourceId of envDataSourceIds) {
      const state = resolveDataSourceState(dataSourceId, { env: sentinelEnv, payload });
      assert(state.state === "error", `${dataSourceId} broken payload should fail closed: ${JSON.stringify(payload)}`);
    }
  }

  const agentState = resolveDataSourceState("agentSnapshot", {
    payload: { source: { kind: "fixture", label: "Fixture" }, generatedAt: "not-a-date" }
  });
  assert(agentState.state === "error", "agentSnapshot invalid generatedAt should fail closed");

  const metadataProps = {
    source: { kind: "fixture", label: "Fixture" },
    updatedAt: "2026-07-01T12:00:00.000Z",
    generatedAt: "2026-07-01T12:00:00.000Z"
  };
  const adversarialPayloads = [
    Object.assign([], metadataProps),
    Object.assign(() => {}, metadataProps),
    "ready",
    42,
    { ...metadataProps, source: Object.assign(["fixture"], metadataProps.source) },
    { ...metadataProps, source: Object.assign(() => {}, metadataProps.source) }
  ];

  for (const payload of adversarialPayloads) {
    for (const dataSourceId of dataSourceIds) {
      const state = resolveDataSourceState(dataSourceId, { env: sentinelEnv, payload });
      assert(state.state === "error" || state.state === "unconfigured", `${dataSourceId} adversarial payload should fail closed, got ${state.state}`);
    }
    const viewModels = resolvePageViewModels({
      env: sentinelEnv,
      payloads: Object.fromEntries(dataSourceIds.map((dataSourceId) => [dataSourceId, payload]))
    });
    assert(viewModels.length === 6, "view models should resolve for adversarial payloads");
    assert(viewModels.every((model) => model.state !== "ready"), "no page may report ready from an adversarial payload");
  }

  const nullPrototypePayload = Object.assign(Object.create(null), {
    source: Object.assign(Object.create(null), { kind: "fixture", label: "Fixture" }),
    updatedAt: "2026-07-01T12:00:00.000Z"
  });
  const nullProtoState = resolveDataSourceState("calendarIcs", { env: sentinelEnv, payload: nullPrototypePayload, now: Date.parse(nullPrototypePayload.updatedAt) + 1000 });
  assert(nullProtoState.state === "ready", "null-prototype plain object payload should still resolve ready");
}

function scenarioUnknownDataSource() {
  let readinessThrew = false;
  let stateThrew = false;
  try {
    resolveSourceReadiness("missingSource");
  } catch {
    readinessThrew = true;
  }
  try {
    resolveDataSourceState("missingSource");
  } catch {
    stateThrew = true;
  }
  assert(readinessThrew, "resolveSourceReadiness should throw for unknown data source");
  assert(stateThrew, "resolveDataSourceState should throw for unknown data source");
}

try {
  scenarioEmptyEnv();
  scenarioSentinelEnvNoPayloads();
  scenarioValidPayloads();
  scenarioBrokenPayloads();
  scenarioUnknownDataSource();
  console.log(JSON.stringify({ ok: true, scenarios: 5, pages: 6, dataSources: 5 }));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
