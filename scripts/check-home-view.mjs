#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { deriveHomeView } = require("../custom_modules/MMM-AgentSurface/home-view.js");

let scenarios = 0;
function scenario(_name, run) {
  scenarios += 1;
  run();
}

const LOCAL_NOW = new Date(2026, 6, 1, 9, 30, 0);
const DATE_FORMAT_OPTIONS = { weekday: "long", month: "long", day: "numeric" };

function expectedDateLine(date) {
  return new Intl.DateTimeFormat(undefined, DATE_FORMAT_OPTIONS).format(date);
}

function view(overrides = {}) {
  return deriveHomeView({ now: LOCAL_NOW, ...overrides });
}

try {
  scenario("date line formats the injected local now", () => {
    assert.equal(view().dateLine, expectedDateLine(LOCAL_NOW));
    assert.equal(view({ now: new Date(2026, 11, 25, 7, 15, 0) }).dateLine, expectedDateLine(new Date(2026, 11, 25, 7, 15, 0)));
  });

  scenario("empty home label stays blank", () => {
    assert.equal(view({ homeConfig: {} }).label, "");
    assert.equal(view({ homeConfig: { label: "   " } }).label, "");
  });

  scenario("configured home label is trimmed", () => {
    assert.equal(view({ homeConfig: { label: "  Kitchen Mirror  " } }).label, "Kitchen Mirror");
  });

  scenario("next page derives the following configured page", () => {
    assert.deepEqual(view({ rotationOrder: ["home", "agents", "weather"], currentPageId: "home", dwellSeconds: 30 }).nextPage, {
      id: "agents",
      label: "Agents",
      dwellSeconds: 30
    });
  });

  scenario("next page wraps from the last configured page", () => {
    assert.deepEqual(view({ rotationOrder: ["home", "agents", "sports"], currentPageId: "sports", dwellSeconds: 12 }).nextPage, {
      id: "home",
      label: "Home",
      dwellSeconds: 12
    });
  });

  scenario("dwell seconds fall back to the home default", () => {
    assert.equal(view({ rotationOrder: ["home", "agents"], currentPageId: "home", dwellSeconds: 0 }).nextPage.dwellSeconds, 45);
    assert.equal(view({ rotationOrder: ["home", "agents"], currentPageId: "home", dwellSeconds: "not-a-number" }).nextPage.dwellSeconds, 45);
  });

  scenario("readiness summarizes mixed source states", () => {
    const home = view({
      sourceStates: [
        { pageId: "agents", state: "ready" },
        { id: "calendar", label: "Calendar feed", state: "stale" },
        { dataSourceId: "weather", label: "Weather", state: "error", glyph: "x" },
        { pageId: "path", state: "mystery" }
      ]
    });

    assert.deepEqual(Object.keys(home), ["dateLine", "label", "nextPage", "readiness"]);
    assert.deepEqual(Object.keys(home.readiness), ["readyCount", "totalCount", "rows"]);
    assert.equal(home.readiness.readyCount, 1);
    assert.equal(home.readiness.totalCount, 4);
    assert.deepEqual(home.readiness.rows, [
      { id: "agents", label: "Agents", state: "ready", glyph: "·" },
      { id: "calendar", label: "Calendar feed", state: "stale", glyph: "△" },
      { id: "weather", label: "Weather", state: "error", glyph: "x" },
      { id: "path", label: "PATH", state: "unconfigured", glyph: "□" }
    ]);
  });

  scenario("malformed source states never throw and return empty readiness", () => {
    const malformedInputs = [
      undefined,
      null,
      "ready",
      42,
      { state: "ready", label: "Agents" },
      [null, undefined, "ready", 42, [], () => {}, { state: "ready", label: "   " }, { state: "ready", pageId: "   " }]
    ];

    for (const sourceStates of malformedInputs) {
      let home;
      assert.doesNotThrow(() => {
        home = view({ sourceStates });
      }, `sourceStates should not throw for ${String(sourceStates)}`);
      assert.deepEqual(home.readiness, { readyCount: 0, totalCount: 0, rows: [] });
    }
  });

  console.log(JSON.stringify({ ok: true, scenarios }));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
