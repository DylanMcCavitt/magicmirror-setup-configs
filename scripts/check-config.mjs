#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import { validateMirrorOsContract } from "../lib/mirror-os-contract.mjs";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const configPath = path.join(repoRoot, "mirror-config/config.js");

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

const config = loadMagicMirrorConfig();

if (!config || !Array.isArray(config.modules)) {
  console.error("mirror-config/config.js must export a config object with modules[]");
  process.exit(1);
}

const missing = [];
for (const entry of config.modules) {
  if (!entry || typeof entry.module !== "string") continue;
  if (entry.module.startsWith("MMM-")) {
    const modulePath = path.join(repoRoot, "custom_modules", entry.module, `${entry.module}.js`);
    if (!existsSync(modulePath)) missing.push(`${entry.module} (${modulePath})`);
  }
}

const agentSurface = config.modules.find((entry) => entry?.module === "MMM-AgentSurface");
if (!agentSurface?.config?.mirrorOs) {
  missing.push("MMM-AgentSurface config.mirrorOs");
} else {
  const contract = validateMirrorOsContract(agentSurface.config.mirrorOs);
  if (!contract.ok) {
    console.error(`Mirror OS contract is invalid:\n${contract.errors.join("\n")}`);
    process.exit(1);
  }
}

if (missing.length) {
  console.error(`Configured custom modules are missing:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, moduleCount: config.modules.length, mirrorOsContract: true }, null, 2));
