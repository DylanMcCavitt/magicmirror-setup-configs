#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import {
  DATA_SOURCE_CONTRACTS,
  EINK_MONOGRID_TOKENS,
  MIRROR_OS_PAGE_REGISTRY
} from "../lib/mirror-os-contract.mjs";

const require = createRequire(import.meta.url);
const shellApi = require("../custom_modules/MMM-AgentSurface/mirror-os-shell.js");
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const configPath = path.join(repoRoot, "mirror-config/config.js");
const registryOrder = [...MIRROR_OS_PAGE_REGISTRY].sort((left, right) => left.order - right.order);
const registryPageIds = registryOrder.map((page) => page.id);
let scenarios = 0;

function scenario(_name, run) {
  scenarios += 1;
  run();
}

function loadMagicMirrorConfig() {
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    console,
    process: { env: process.env }
  };
  const source = readFileSync(configPath, "utf8");
  vm.runInNewContext(source, sandbox, { filename: configPath });
  return sandbox.module.exports;
}

function agentSurfaceMirrorOsConfig() {
  const config = loadMagicMirrorConfig();
  const agentSurface = config.modules?.find((entry) => entry?.module === "MMM-AgentSurface");
  assert.ok(agentSurface?.config?.mirrorOs, "MMM-AgentSurface config.mirrorOs is required");
  return agentSurface.config.mirrorOs;
}

function sourceIdForPage(pageId) {
  return registryOrder.find((page) => page.id === pageId)?.dataSourceId ?? null;
}

scenario("shell maps match registry", () => {
  assert.deepEqual(shellApi.FALLBACK_ROTATION_ORDER, registryPageIds);
  assert.deepEqual(Object.fromEntries(registryOrder.map((page) => [page.id, shellApi.PAGE_LABELS[page.id]])), Object.fromEntries(registryOrder.map((page) => [page.id, page.label])));
  assert.deepEqual(shellApi.PAGE_TO_SOURCE, Object.fromEntries(registryOrder.filter((page) => page.dataSourceId).map((page) => [page.id, page.dataSourceId])));
  assert.deepEqual(shellApi.createMirrorOsShell(undefined).rotationOrder(), registryPageIds);
});

scenario("glyphs match E-INK token contract", () => {
  const glyphs = EINK_MONOGRID_TOKENS.statusTreatment.glyphs;
  assert.deepEqual(shellApi.GLYPHS, {
    ready: glyphs.idle,
    stale: glyphs.stale,
    error: glyphs.failed,
    unconfigured: glyphs.unconfigured,
    summary: glyphs.idle
  });
});

scenario("navigation follows configured registry cycle", () => {
  const shell = shellApi.createMirrorOsShell(agentSurfaceMirrorOsConfig());
  assert.deepEqual(shell.rotationOrder(), registryPageIds);
  assert.equal(shell.currentPage(), "home");

  const nextSequence = [];
  for (let index = 0; index < 7; index += 1) nextSequence.push(shell.next("rotation"));
  assert.deepEqual(nextSequence, ["agents", "calendar", "weather", "path", "sports", "home", "agents"]);

  assert.equal(shell.jump("home", "command"), "home");
  assert.equal(shell.prev("command"), "sports");
  assert.equal(shell.jump("weather", "command"), "weather");
  assert.equal(shell.jump("nope", "command"), "weather");

  shell.jump("home", "command");
  shell.pause("command");
  assert.equal(shell.next("rotation"), "home");
  assert.equal(shell.jump("weather", "command"), "weather");
  assert.equal(shell.state().rotationPaused, true);
  assert.equal(shell.state().lastCommandSource, "command");
});

scenario("dwell seconds honor default override and clamp", () => {
  const config = agentSurfaceMirrorOsConfig();
  const shell = shellApi.createMirrorOsShell(config);
  assert.equal(shell.dwellSeconds("home"), 25);

  const overridden = shellApi.createMirrorOsShell({
    ...config,
    rotation: {
      ...config.rotation,
      pageDwellSeconds: {
        weather: 12,
        path: 2
      }
    }
  });
  assert.equal(overridden.dwellSeconds("weather"), 12);
  assert.equal(overridden.dwellSeconds("path"), 5);
});

scenario("empty payload states render contract unconfigured pages", () => {
  const config = agentSurfaceMirrorOsConfig();
  const shell = shellApi.createMirrorOsShell(config);
  const seenFields = new Set();

  for (let cycle = 0; cycle < 2; cycle += 1) {
    for (const pageId of shell.rotationOrder()) {
      const viewModel = shell.pageViewModel(pageId, { payloadStates: {}, now: new Date("2026-07-01T00:00:00.000Z") });
      assert.ok(viewModel, `${pageId} view model exists`);
      Object.keys(viewModel).forEach((key) => seenFields.add(key));
      assert.equal(viewModel.pageId, pageId);
      assert.equal(viewModel.label, shellApi.PAGE_LABELS[pageId]);

      if (pageId === "home") {
        assert.equal(viewModel.state, "summary");
        assert.equal(viewModel.glyph, shellApi.GLYPHS.summary);
        assert.equal(viewModel.message, `0 of ${Object.keys(DATA_SOURCE_CONTRACTS).length} sources ready`);
        continue;
      }

      const dataSourceId = sourceIdForPage(pageId);
      assert.equal(viewModel.dataSourceId, dataSourceId);
      assert.equal(viewModel.state, "unconfigured");
      assert.equal(viewModel.glyph, shellApi.GLYPHS.unconfigured);
      assert.equal(viewModel.message, DATA_SOURCE_CONTRACTS[dataSourceId].unconfiguredCopy);
      assert.equal(viewModel.unconfiguredCopy, DATA_SOURCE_CONTRACTS[dataSourceId].unconfiguredCopy);
      assert.deepEqual(viewModel.missingConfigKeys, DATA_SOURCE_CONTRACTS[dataSourceId].requiredConfigKeys);
    }
  }

  for (const field of ["pageId", "label", "dataSourceId", "state", "glyph", "message", "missingConfigKeys", "provenance", "unconfiguredCopy"]) {
    assert.equal(seenFields.has(field), true, `field consumed: ${field}`);
  }
});

scenario("agent snapshot states pass through readiness and provenance", () => {
  const shell = shellApi.createMirrorOsShell(agentSurfaceMirrorOsConfig());
  const ready = shell.pageViewModel("agents", {
    payloadStates: { agentSnapshot: { state: "ready", provenance: "omp · just now" } },
    now: Date.now()
  });
  assert.equal(ready.state, "ready");
  assert.equal(ready.glyph, shellApi.GLYPHS.ready);
  assert.equal(ready.provenance, "omp · just now");

  const stale = shell.pageViewModel("agents", {
    payloadStates: { agentSnapshot: { state: "stale", provenance: "omp · 7m ago" } },
    now: Date.now()
  });
  assert.equal(stale.state, "stale");
  assert.equal(stale.glyph, shellApi.GLYPHS.stale);
  assert.equal(stale.provenance, "omp · 7m ago");
});

scenario("malformed inputs never throw and return sane fallbacks", () => {
  assert.deepEqual(shellApi.createMirrorOsShell(undefined).rotationOrder(), registryPageIds);
  assert.deepEqual(shellApi.createMirrorOsShell({}).rotationOrder(), registryPageIds);

  const shell = shellApi.createMirrorOsShell({});
  assert.equal(shell.pageViewModel("nope", { payloadStates: {}, now: Date.now() }), null);
  assert.equal(shell.pageViewModel("agents", { payloadStates: { agentSnapshot: [] }, now: Date.now() }).state, "unconfigured");
  assert.equal(shell.pageViewModel("agents", { payloadStates: { agentSnapshot: function bad() {} }, now: Date.now() }).state, "unconfigured");
  assert.equal(shell.pageViewModel("agents", { payloadStates: null, now: Date.now() }).message, "Not configured.");
});

console.log(JSON.stringify({ ok: true, scenarios }));
