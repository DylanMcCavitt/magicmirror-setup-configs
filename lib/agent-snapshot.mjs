import crypto from "node:crypto";

export const SNAPSHOT_SCHEMA_VERSION = 1;

export const ALLOWED_STATUSES = new Set([
  "running",
  "blocked",
  "done",
  "failed",
  "idle",
  "waiting",
  "unknown"
]);

const STRING_LIMIT = 160;
const MESSAGE_LIMIT = 220;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidDate(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

function cleanString(value, limit = STRING_LIMIT) {
  if (value === undefined || value === null) return undefined;
  const cleaned = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1)}…` : cleaned;
}

function cleanNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function optionalObject(value) {
  return isPlainObject(value) ? value : {};
}

export function validateAgentSnapshot(input) {
  const errors = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: ["snapshot must be an object"] };
  }

  if (input.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SNAPSHOT_SCHEMA_VERSION}`);
  }

  if (!isValidDate(input.generatedAt)) {
    errors.push("generatedAt must be an ISO timestamp");
  }

  if (!isPlainObject(input.source)) {
    errors.push("source must be an object");
  } else {
    if (!cleanString(input.source.kind)) errors.push("source.kind is required");
    if (!cleanString(input.source.label)) errors.push("source.label is required");
  }

  if (!Array.isArray(input.threads)) {
    errors.push("threads must be an array");
  } else {
    input.threads.forEach((thread, index) => {
      if (!isPlainObject(thread)) {
        errors.push(`threads[${index}] must be an object`);
        return;
      }
      if (!cleanString(thread.id)) errors.push(`threads[${index}].id is required`);
      if (!cleanString(thread.title)) errors.push(`threads[${index}].title is required`);
      if (!cleanString(thread.status)) errors.push(`threads[${index}].status is required`);
      if (!isValidDate(thread.updatedAt)) errors.push(`threads[${index}].updatedAt must be an ISO timestamp`);
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

export function normalizeAgentSnapshot(input, options = {}) {
  const validation = validateAgentSnapshot(input);
  if (!validation.ok) {
    return validation;
  }

  const maxThreads = Number(options.maxThreads || 50);
  const summary = optionalObject(input.summary);
  const stats = optionalObject(input.stats);
  const now = new Date().toISOString();

  const threads = input.threads.slice(0, maxThreads).map((thread) => {
    const status = cleanString(thread.status)?.toLowerCase();
    const normalizedStatus = ALLOWED_STATUSES.has(status) ? status : "unknown";
    const normalized = {
      id: cleanString(thread.id),
      title: cleanString(thread.title),
      status: normalizedStatus,
      updatedAt: new Date(thread.updatedAt).toISOString()
    };

    const optionalStrings = ["agent", "repo", "branch", "phase", "blocker"];
    optionalStrings.forEach((key) => {
      const value = cleanString(thread[key]);
      if (value) normalized[key] = value;
    });

    const lastMessage = cleanString(thread.lastMessage, MESSAGE_LIMIT);
    if (lastMessage) normalized.lastMessage = lastMessage;

    const optionalNumbers = ["tokens", "inputTokens", "outputTokens", "costUsd"];
    optionalNumbers.forEach((key) => {
      const value = cleanNumber(thread[key]);
      if (value !== undefined) normalized[key] = value;
    });

    return normalized;
  });

  const normalized = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    generatedAt: new Date(input.generatedAt).toISOString(),
    receivedAt: options.receivedAt || now,
    source: {
      kind: cleanString(input.source.kind),
      label: cleanString(input.source.label)
    },
    threads,
    summary: {
      activeCount: cleanNumber(summary.activeCount) ?? threads.filter((thread) => thread.status === "running").length,
      blockedCount: cleanNumber(summary.blockedCount) ?? threads.filter((thread) => thread.status === "blocked").length,
      completedCount: cleanNumber(summary.completedCount) ?? threads.filter((thread) => thread.status === "done").length
    },
    stats: {}
  };

  const totalTokens = cleanNumber(summary.totalTokens) ?? cleanNumber(stats.tokenTotal) ?? threads.reduce((sum, thread) => sum + (thread.tokens || 0), 0);
  if (totalTokens !== undefined) {
    normalized.summary.totalTokens = totalTokens;
    normalized.stats.tokenTotal = totalTokens;
  }

  const sessionCount = cleanNumber(stats.sessionCount);
  if (sessionCount !== undefined) normalized.stats.sessionCount = sessionCount;

  const costUsd = cleanNumber(stats.costUsd);
  if (costUsd !== undefined) normalized.stats.costUsd = costUsd;

  normalized.digest = digestSnapshot(normalized);
  return { ok: true, snapshot: normalized };
}

export function summarizeSnapshot(snapshot) {
  return {
    threadCount: snapshot.threads.length,
    activeCount: snapshot.summary.activeCount || 0,
    blockedCount: snapshot.summary.blockedCount || 0,
    completedCount: snapshot.summary.completedCount || 0,
    tokenTotal: snapshot.stats.tokenTotal || 0,
    generatedAt: snapshot.generatedAt,
    source: snapshot.source
  };
}

export function digestSnapshot(snapshot) {
  const copy = JSON.parse(JSON.stringify(snapshot));
  delete copy.digest;
  return crypto.createHash("sha256").update(JSON.stringify(copy)).digest("hex");
}

export function readBearerToken(headers = {}) {
  const directToken = headers["x-mirror-ingest-token"] || headers["X-Mirror-Ingest-Token"] || "";
  if (directToken) return String(directToken);

  const header = headers.authorization || headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : "";
}

export function timingSafeEqualString(actual, expected) {
  if (!expected || !actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
