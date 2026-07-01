#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function extractJson(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("omp stats did not return JSON");
  }
  return JSON.parse(output.slice(start, end + 1));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanLabel(value) {
  return String(value || "")
    .replace(/^[-]+/, "")
    .replace(/-/g, "/")
    .replace(/\s+/g, " ")
    .trim() || "agent session";
}

function latestTimestamp(stats) {
  return number(stats?.overall?.lastTimestamp) || Date.now();
}

function totalTokens(overall) {
  return number(overall.totalInputTokens) + number(overall.totalOutputTokens) + number(overall.totalCacheReadTokens) + number(overall.totalCacheWriteTokens);
}

function listRecentSessions(limit = 8) {
  const baseDir = process.env.OMP_SESSIONS_DIR || path.join(process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".omp", "agent"), "sessions");
  const sessions = [];

  if (!fs.existsSync(baseDir)) return sessions;

  for (const folder of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    const folderPath = path.join(baseDir, folder.name);
    let entries = [];
    try {
      entries = fs.readdirSync(folderPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const filePath = path.join(folderPath, entry.name);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      const id = entry.name.replace(/\.jsonl$/, "");
      const minutesOld = (Date.now() - stat.mtimeMs) / 60000;
      sessions.push({
        id,
        title: cleanLabel(folder.name),
        status: minutesOld <= 10 ? "running" : "idle",
        updatedAt: stat.mtime.toISOString(),
        phase: minutesOld <= 10 ? "recent activity" : "last seen",
        lastMessage: `${Math.round(minutesOld)}m since session update`
      });
    }
  }

  return sessions
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, limit);
}

try {
  const { stdout } = await execFileAsync("omp", ["stats", "--json"], {
    maxBuffer: 8 * 1024 * 1024
  });
  const stats = extractJson(stdout);
  const overall = stats.overall || {};
  const tokenTotal = totalTokens(overall);
  const failedRequests = number(overall.failedRequests);
  const threads = listRecentSessions(Number(process.env.MIRROR_MAX_SESSIONS || 8));
  const runningCount = threads.filter((thread) => thread.status === "running").length;

  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date(Math.max(latestTimestamp(stats), ...threads.map((thread) => Date.parse(thread.updatedAt)))).toISOString(),
    source: {
      kind: "omp-stats",
      label: "OMP stats dashboard"
    },
    threads,
    summary: {
      activeCount: runningCount,
      blockedCount: failedRequests > 0 ? 1 : 0,
      completedCount: number(overall.successfulRequests),
      totalTokens: tokenTotal
    },
    stats: {
      tokenTotal,
      sessionCount: number(overall.totalRequests),
      costUsd: number(overall.totalCost)
    }
  };

  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} catch (error) {
  console.error(`Unable to collect OMP stats: ${error.message}`);
  process.exit(1);
}
