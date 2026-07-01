#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { validateMirrorOsContract } from "../lib/mirror-os-contract.mjs";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const configPath = path.join(repoRoot, "mirror-config/config.js");

function usage() {
  console.error("Usage: node scripts/check-mirror-os-contract.mjs [--runtime-file <runtime.json>]");
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    usage();
    process.exit(2);
  }
  return value;
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

function readRuntimeData(file) {
  if (!file) return undefined;
  const runtimePath = path.resolve(file);
  if (!existsSync(runtimePath)) {
    console.error(`Runtime file not found: ${runtimePath}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(runtimePath, "utf8"));
  } catch (error) {
    console.error(`Invalid runtime JSON: ${error.message}`);
    process.exit(1);
  }
}

const config = loadMagicMirrorConfig();
const runtimeData = readRuntimeData(readArg("--runtime-file"));
const agentSurface = config.modules?.find((entry) => entry?.module === "MMM-AgentSurface");

if (!agentSurface?.config?.mirrorOs) {
  console.error("MMM-AgentSurface config.mirrorOs is required");
  process.exit(1);
}

const result = validateMirrorOsContract(agentSurface.config.mirrorOs, { runtimeData });
if (!result.ok) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  pageCount: agentSurface.config.mirrorOs.pages.length,
  dataSourceCount: Object.keys(agentSurface.config.mirrorOs.dataSources).length
}, null, 2));
