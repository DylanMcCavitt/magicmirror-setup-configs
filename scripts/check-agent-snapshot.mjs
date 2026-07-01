#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
import { normalizeAgentSnapshot, summarizeSnapshot } from "../lib/agent-snapshot.mjs";

function usage() {
  console.error("Usage: node scripts/check-agent-snapshot.mjs --file <snapshot.json>");
}

const fileIndex = process.argv.indexOf("--file");
if (fileIndex === -1 || !process.argv[fileIndex + 1]) {
  usage();
  process.exit(2);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(process.argv[fileIndex + 1], "utf8"));
} catch (error) {
  console.error(`Invalid JSON: ${error.message}`);
  process.exit(1);
}

const result = normalizeAgentSnapshot(parsed);
if (!result.ok) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, digest: result.snapshot.digest, summary: summarizeSnapshot(result.snapshot) }, null, 2));
