#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { normalizeAgentSnapshot, summarizeSnapshot } from "../lib/agent-snapshot.mjs";

function usage() {
  console.error("Usage: node scripts/upload-agent-snapshot.mjs [--file <snapshot.json>] [--cloud-url <url>] [--mirror-url <url>]");
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function parseArgs(argv) {
  const options = {
    file: undefined,
    cloudUrl: process.env.MIRROR_CONTROL_URL || undefined,
    mirrorUrl: "http://127.0.0.1:8080"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    if (arg !== "--file" && arg !== "--cloud-url" && arg !== "--mirror-url") {
      usage();
      fail(`Unknown option: ${arg}`, 2);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      usage();
      fail(`Missing value for ${arg}`, 2);
    }

    if (arg === "--file") options.file = value;
    if (arg === "--cloud-url") options.cloudUrl = value;
    if (arg === "--mirror-url") options.mirrorUrl = value;
    index += 1;
  }

  return options;
}

function readInput(file) {
  try {
    return file ? fs.readFileSync(file, "utf8") : fs.readFileSync(0, "utf8");
  } catch (error) {
    fail(`Unable to read snapshot JSON: ${error.message}`);
  }
}

function parseJson(input) {
  try {
    return JSON.parse(input);
  } catch (error) {
    fail(`Invalid JSON: ${error.message}`);
  }
}

function endpoint(baseUrl, path, name) {
  try {
    return new URL(`${String(baseUrl).replace(/\/+$/, "")}${path}`);
  } catch {
    fail(`Invalid ${name} URL`);
  }
}

function safeStatus(response) {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText
  };
}

async function postSnapshot(name, url, token, snapshot, requireToken) {
  if (requireToken && !token) {
    return { name, ok: false, status: "missing-token" };
  }

  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (token) headers["x-mirror-ingest-token"] = token;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(snapshot)
    });
    return { name, ...safeStatus(response) };
  } catch (error) {
    return { name, ok: false, status: "network-error" };
  }
}

const options = parseArgs(process.argv.slice(2));
const parsed = parseJson(readInput(options.file));
const result = normalizeAgentSnapshot(parsed);

if (!result.ok) {
  fail(result.errors.join("\n"));
}

const uploads = [];
uploads.push(await postSnapshot(
  "mirror",
  endpoint(options.mirrorUrl, "/MMM-AgentSurface/api/snapshot", "mirror"),
  process.env.MIRROR_LOCAL_UPLOAD_TOKEN,
  result.snapshot,
  false
));

if (options.cloudUrl) {
  uploads.push(await postSnapshot(
    "cloud",
    endpoint(options.cloudUrl, "/api/agent-snapshot", "cloud"),
    process.env.MIRROR_INGEST_TOKEN,
    result.snapshot,
    true
  ));
}

const output = {
  ok: uploads.every((upload) => upload.ok),
  digest: result.snapshot.digest,
  summary: summarizeSnapshot(result.snapshot),
  uploads
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exit(1);
}
