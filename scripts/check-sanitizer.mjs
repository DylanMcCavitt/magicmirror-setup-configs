#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  sanitizeDisplayText,
  sanitizeSnapshotForDisplay,
  sanitizeThreadForDisplay
} = require("../custom_modules/MMM-AgentSurface/display-sanitizer.js");

let scenarios = 0;

function scenario(_name, run) {
  run();
  scenarios += 1;
}

function keysDeep(value, keys = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => keysDeep(item, keys));
    return keys;
  }
  if (value && Object.prototype.toString.call(value) === "[object Object]") {
    Object.keys(value).forEach((key) => {
      keys.push(key);
      keysDeep(value[key], keys);
    });
  }
  return keys;
}

scenario("safe snapshot passes through", () => {
  const input = {
    generatedAt: "2026-07-01T20:00:00.000Z",
    source: { kind: "agentSnapshot", label: "local status" },
    summary: { activeCount: 2, blockedCount: 1, completedCount: 3 },
    threads: [
      {
        id: "thread-1",
        title: "Deploy mirror",
        status: "running",
        project: "Mirror",
        issueId: "AGE-793",
        updatedAt: "2026-07-01T20:01:00.000Z"
      }
    ]
  };
  const output = sanitizeSnapshotForDisplay(input);
  assert.equal(output.threads[0].title, "Deploy mirror");
  assert.equal(output.threads[0].project, "Mirror");
  assert.deepEqual(output.summary, { activeCount: 2, blockedCount: 1, completedCount: 3 });
  assert.equal(output.threads.length, 1);
});

scenario("paths collapse to basenames", () => {
  const output = sanitizeSnapshotForDisplay({
    source: { kind: "agentSnapshot", label: "local" },
    summary: {},
    threads: [
      {
        title: "Repo /Users/dylan/dev/magicmirror-setup-configs",
        lastMessage: "Windows C:\\Users\\x\\proj"
      }
    ]
  });
  const serialized = JSON.stringify(output);
  assert.match(serialized, /magicmirror-setup-configs/);
  assert.match(serialized, /proj/);
  assert.doesNotMatch(serialized, /\/Users\//);
  assert.doesNotMatch(serialized, /C:\\/);
});

scenario("html and script are stripped", () => {
  const output = sanitizeThreadForDisplay({
    title: "<script>alert(1)</script>Deploy <b>mirror</b>",
    lastMessage: "status <img src=x onerror=alert(2)> ready"
  });
  assert.equal(output.title, "Deploy mirror");
  assert.doesNotMatch(output.title, /[<>]/);
  assert.doesNotMatch(output.title, /script|alert\(1\)/i);
  assert.doesNotMatch(output.lastMessage, /[<>]/);
});

scenario("ansi escapes are stripped", () => {
  assert.equal(sanitizeDisplayText("\u001b[31mFAILED\u001b[0m build"), "FAILED build");
});

scenario("secrets are redacted", () => {
  const raw = "sk-abcdefghijklmnopqrstuvwxyz ghp_abcdefghijklmnop Bearer xyz token=abcd1234efgh5678 eyJhbGciOiJIUzI1NiJ9.payload.sig";
  const output = sanitizeThreadForDisplay({ title: raw, lastMessage: raw });
  const serialized = JSON.stringify(output);
  assert.match(serialized, /\[redacted\]/);
  [
    "sk-abcdefghijklmnopqrstuvwxyz",
    "ghp_abcdefghijklmnop",
    "Bearer xyz",
    "abcd1234efgh5678",
    "eyJhbGciOiJIUzI1NiJ9.payload.sig"
  ].forEach((secret) => assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

scenario("disallowed fields are dropped", () => {
  const output = sanitizeThreadForDisplay({
    title: "safe prompt mention",
    prompt: "raw prompt",
    transcript: "raw transcript",
    logs: "raw logs",
    stdout: "raw stdout",
    env: { TOKEN: "secret" },
    apiKey: "secret"
  });
  const keys = keysDeep(output);
  ["prompt", "transcript", "logs", "stdout", "env", "apiKey"].forEach((key) => {
    assert.equal(keys.includes(key), false, `${key} should not be copied`);
  });
});

scenario("fallbacks are safe", () => {
  const withProject = sanitizeThreadForDisplay({ title: "\u001b", project: "Mirror", issueId: "AGE-1" });
  const untitled = sanitizeThreadForDisplay({ title: "   " });
  const emptyBlocker = sanitizeThreadForDisplay({ title: "Work", blocker: "  " });
  assert.equal(withProject.title, "Mirror · AGE-1");
  assert.equal(untitled.title, "Untitled work item");
  assert.equal(Object.hasOwn(emptyBlocker, "blocker"), false);
});

scenario("adversarial containers are rejected or capped", () => {
  assert.equal(sanitizeSnapshotForDisplay([]), null);
  assert.equal(sanitizeSnapshotForDisplay(function noop() {}), null);
  assert.equal(sanitizeSnapshotForDisplay("snapshot"), null);

  const output = sanitizeSnapshotForDisplay({
    source: {},
    summary: {},
    threads: [null, 42, [], function noop() {}, { title: "long title ".repeat(1000) }]
  });
  assert.equal(output.threads.length, 1);
  assert.equal(output.threads[0].title.length, 120);
  assert.equal(output.threads[0].title.endsWith("…"), true);
});

scenario("source url credentials are removed", () => {
  const output = sanitizeSnapshotForDisplay({
    source: { kind: "agentSnapshot", label: "https://user:tok3n@host.example/feed?key=9" },
    summary: {},
    threads: []
  });
  assert.ok(output.source.label === "https://host.example" || output.source.label === "host.example");
  assert.doesNotMatch(output.source.label, /tok3n|key=9/);
});

scenario("emails are redacted", () => {
  assert.equal(sanitizeDisplayText("ping dylan@example.com"), "ping [email]");
});

scenario("encoded local paths inside URLs do not survive", () => {
  const out = sanitizeDisplayText("see https://host.example/%2FUsers%2Fdylan%2Fsecret-project for details");
  assert.ok(out.includes("https://host.example"), out);
  assert.doesNotMatch(out, /%2F|Users|secret-project/i);
});

scenario("bare home roots never leak account names", () => {
  assert.equal(sanitizeDisplayText("cwd /Users/dylan"), "cwd [home]");
  assert.equal(sanitizeDisplayText("cwd /home/pi"), "cwd [home]");
  const win = sanitizeDisplayText("cwd C:\\Users\\dylan");
  assert.ok(win.includes("[home]") && !win.includes("dylan"), win);
});

scenario("secret-shaped path basenames are redacted", () => {
  const out = sanitizeDisplayText("/tmp/abcdefghijklmnopqrstuvwxyz123456");
  assert.equal(out, "[redacted]");
  const readable = sanitizeDisplayText("/Users/dylan/dev/magicmirror-setup-configs");
  assert.equal(readable, "magicmirror-setup-configs");
});

scenario("unparseable URL-ish text never passes through raw", () => {
  const out = sanitizeDisplayText("fetch failed for https://%zz-not-a-host/secret-path");
  assert.doesNotMatch(out, /secret-path|%zz/);
  assert.ok(out.includes("[link]"), out);
  assert.equal(sanitizeDisplayText("see https:// now"), "see [link] now");
});

console.log(JSON.stringify({ ok: true, scenarios }));
