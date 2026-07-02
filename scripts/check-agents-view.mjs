#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

let scenarios = 0;
let currentScenario = "load helper";
let deriveAgentsView;

function scenario(name, run) {
  currentScenario = name;
  run();
  scenarios += 1;
  currentScenario = "";
}

function snapshot(threads) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-01T12:00:00.000Z",
    source: { kind: "fixture", label: "Agent fixture" },
    summary: { activeCount: 0, blockedCount: 0, completedCount: 0 },
    threads
  };
}

function thread(overrides = {}) {
  return {
    id: "thread-1",
    title: "Implement agents view",
    project: "Mirror OS",
    status: "running",
    updatedAt: "2026-07-01T12:01:00.000Z",
    lastMessage: "Group project threads.",
    ...overrides
  };
}

function totalThreads(view) {
  return view.groups.reduce((sum, group) => sum + group.threads.length, 0);
}

function titles(view) {
  return view.groups.flatMap((group) => group.threads.map((item) => item.title));
}

try {
  ({ deriveAgentsView } = require(path.join(repoRoot, "custom_modules/MMM-AgentSurface/agents-view.js")));
  assert.equal(typeof deriveAgentsView, "function", "agents-view.js must export deriveAgentsView");

  scenario("groups threads by project", () => {
    const view = deriveAgentsView(snapshot([
      thread({ id: "agents-1", title: "Implement agents view", project: "Agents", status: "running" }),
      thread({ id: "weather-1", title: "Refresh weather page", project: "Weather", status: "blocked", updatedAt: "2026-07-01T12:02:00.000Z", lastMessage: "Waiting on station data." }),
      thread({ id: "agents-2", title: "Review agents view", project: "Agents", status: "done", updatedAt: "2026-07-01T12:03:00.000Z", lastMessage: "Review complete." })
    ]));

    assert.deepEqual(view.groups.map((group) => group.project), ["Agents", "Weather"]);
    assert.deepEqual(view.groups[0].threads.map((item) => item.title), ["Implement agents view", "Review agents view"]);
    assert.deepEqual(view.groups[1].threads.map((item) => item.title), ["Refresh weather page"]);
    assert.deepEqual(view.groups[0].threads[0], {
      title: "Implement agents view",
      identifiers: "",
      brief: "Group project threads.",
      status: "running",
      updatedAt: "2026-07-01T12:01:00.000Z"
    });
  });

  scenario("falls back when project is missing", () => {
    const view = deriveAgentsView(snapshot([
      thread({ id: "unassigned-1", title: "Triage orphan thread", project: undefined, status: "waiting", lastMessage: "Needs an owner." })
    ]));

    assert.deepEqual(view.groups, [
      {
        project: "Triage orphan thread",
        threads: [
          {
            title: "Triage orphan thread",
            identifiers: "",
            brief: "Needs an owner.",
            status: "waiting",
            updatedAt: "2026-07-01T12:01:00.000Z"
          }
        ]
      }
    ]);
  });

  scenario("joins identifiers without empty separators", () => {
    const view = deriveAgentsView(snapshot([
      thread({
        id: "identifier-1",
        title: "Wire agents helper",
        project: "Agents",
        issueId: "AGE-787",
        prId: "PR-42",
        workstreamId: "Agents787",
        agent: "",
        lastMessage: "Identifiers are visible without the project repeated."
      })
    ]));

    assert.equal(view.groups[0].threads[0].identifiers, "AGE-787 / PR-42 / Agents787");
    assert.doesNotMatch(view.groups[0].threads[0].identifiers, /(^|\/)\s*(\/|$)/);
  });

  scenario("caps maxThreads across groups", () => {
    const view = deriveAgentsView(snapshot([
      thread({ id: "a-1", title: "Agents first", project: "Agents", updatedAt: "2026-07-01T12:01:00.000Z" }),
      thread({ id: "w-1", title: "Weather first", project: "Weather", updatedAt: "2026-07-01T12:02:00.000Z" }),
      thread({ id: "a-2", title: "Agents second", project: "Agents", updatedAt: "2026-07-01T12:03:00.000Z" }),
      thread({ id: "c-1", title: "Calendar should be capped", project: "Calendar", updatedAt: "2026-07-01T12:04:00.000Z" })
    ]), { maxThreads: 3 });

    assert.equal(totalThreads(view), 3);
    assert.deepEqual(view.groups.map((group) => group.project), ["Agents", "Weather"]);
    assert.deepEqual(titles(view), ["Agents first", "Agents second", "Weather first"]);
    assert.equal(titles(view).includes("Calendar should be capped"), false);
  });

  scenario("missing or empty snapshots produce no groups", () => {
    [undefined, null, {}, { threads: [] }, snapshot([])].forEach((input) => {
      assert.deepEqual(deriveAgentsView(input), { groups: [] });
    });
  });

  scenario("skips malformed thread entries without throwing", () => {
    let view;
    assert.doesNotThrow(() => {
      view = deriveAgentsView(snapshot([
        null,
        42,
        [],
        thread({ id: "bad-date", title: "Bad date", project: "Broken", updatedAt: "not-a-date" }),
        thread({ id: "valid", title: "Only valid item", project: "Valid", status: "idle", updatedAt: "2026-07-01T12:05:00.000Z", lastMessage: "Malformed rows are ignored." })
      ]));
    });

    assert.deepEqual(view.groups, [
      {
        project: "Valid",
        threads: [
          {
            title: "Only valid item",
            identifiers: "",
            brief: "Malformed rows are ignored.",
            status: "idle",
            updatedAt: "2026-07-01T12:05:00.000Z"
          }
        ]
      }
    ]);
  });

  console.log(JSON.stringify({ ok: true, scenarios }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    scenarios,
    scenario: currentScenario || undefined,
    error: error && error.message ? error.message : String(error)
  }));
  process.exit(1);
}
