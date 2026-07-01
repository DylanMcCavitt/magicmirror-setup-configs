const crypto = require("crypto");
const NodeHelper = require("node_helper");
const shellApi = require("./mirror-os-shell.js");

const CONTROL_ROUTE_BASE = "/MMM-AgentSurface/api/control";
const CONTROL_COMMANDS = new Set(["next", "previous", "show", "pause", "resume"]);
const PAGE_IDS = new Set(shellApi.FALLBACK_ROTATION_ORDER);
const SAFE_STATE = {
  currentPageId: "home",
  rotationPaused: false,
  lastCommandSource: "system"
};

function controlToken() {
  return process.env.MIRROR_CONTROL_TOKEN || "";
}

function readControlCommand(body, configuredPages) {
  const command = body && typeof body.command === "string" ? body.command.trim().toLowerCase() : "";
  if (!CONTROL_COMMANDS.has(command)) return { ok: false, statusCode: 400, error: "command must be one of: next, previous, show, pause, resume" };
  if (command === "show") {
    if (!configuredPages || configuredPages.size === 0) {
      return { ok: false, statusCode: 503, error: "page registry not reported by display module yet" };
    }
    const pageId = body && typeof body.pageId === "string" ? body.pageId.trim().toLowerCase() : "";
    if (!configuredPages.has(pageId)) return { ok: false, statusCode: 400, error: "pageId must be one of: " + Array.from(configuredPages).join(", ") };
    return { ok: true, command, pageId };
  }
  return { ok: true, command };
}

function safeConfiguredPages(value) {
  if (!Array.isArray(value)) return null;
  const pages = new Set();
  for (const pageId of value) {
    if (typeof pageId === "string" && PAGE_IDS.has(pageId)) pages.add(pageId);
  }
  return pages.size ? pages : null;
}

function safePageState(value) {
  const state = value && typeof value === "object" ? value : {};
  const currentPageId = PAGE_IDS.has(state.currentPageId) ? state.currentPageId : SAFE_STATE.currentPageId;
  return {
    currentPageId,
    rotationPaused: state.rotationPaused === true,
    lastCommandSource: typeof state.lastCommandSource === "string" && state.lastCommandSource ? state.lastCommandSource : SAFE_STATE.lastCommandSource
  };
}

function requestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


const ROUTE_BASE = "/MMM-AgentSurface/api/snapshot";
const MAX_BODY_BYTES = 1024 * 1024;

module.exports = NodeHelper.create({
  start: function () {
    this.currentSnapshot = null;
    this.currentSummary = null;
    this.validatorPromise = null;
    this.currentPageState = { ...SAFE_STATE };
    this.configuredPages = null;
    this.registerRoutes();
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "MMM_AGENT_SURFACE_GET_CURRENT") {
      this.sendCurrentSnapshot();
      this.sendPageState();
      return;
    }

    if (notification === "MMM_AGENT_SURFACE_PAGE_STATE") {
      this.currentPageState = safePageState(payload);
      const pages = safeConfiguredPages(payload && payload.pages);
      if (pages) this.configuredPages = pages;
    }
  },

  registerRoutes: function () {
    this.expressApp.post(ROUTE_BASE, this.handleSnapshotPost.bind(this));
    this.expressApp.get(ROUTE_BASE + "/current", this.handleSnapshotCurrent.bind(this));
    this.expressApp.post(CONTROL_ROUTE_BASE, this.handleControlPost.bind(this));
    this.expressApp.get(CONTROL_ROUTE_BASE + "/state", this.handleControlState.bind(this));
  },

  handleSnapshotCurrent: function (req, res) {
    res.json({
      ok: true,
      snapshot: this.currentSnapshot,
      summary: this.currentSummary
    });
  },

  handleSnapshotPost: async function (req, res) {
    const configuredToken = process.env.MIRROR_LOCAL_UPLOAD_TOKEN || "";

    if (configuredToken) {
      const validator = await this.loadValidator();
      const suppliedToken = validator.readBearerToken(req.headers || {});
      if (!validator.timingSafeEqualString(suppliedToken, configuredToken)) {
        res.status(401).json({ ok: false, errors: ["unauthorized"] });
        return;
      }
    }

    let body;
    try {
      body = await this.readJsonBody(req);
    } catch (error) {
      res.status(error.statusCode || 400).json({ ok: false, errors: [error.message] });
      return;
    }

    let validator;
    try {
      validator = await this.loadValidator();
    } catch (error) {
      res.status(500).json({ ok: false, errors: ["snapshot validator unavailable"] });
      this.sendSocketNotification("MMM_AGENT_SURFACE_ERROR", { message: "Snapshot validator unavailable" });
      return;
    }

    const result = validator.normalizeAgentSnapshot(body, { receivedAt: new Date().toISOString() });
    if (!result.ok) {
      res.status(400).json({ ok: false, errors: result.errors });
      this.sendSocketNotification("MMM_AGENT_SURFACE_ERROR", { message: result.errors.join("; ") });
      return;
    }

    this.currentSnapshot = result.snapshot;
    this.currentSummary = validator.summarizeSnapshot(result.snapshot);
    const payload = {
      snapshot: this.currentSnapshot,
      summary: this.currentSummary
    };

    this.sendSocketNotification("MMM_AGENT_SURFACE_SNAPSHOT", payload);
    res.json({ ok: true, summary: this.currentSummary, digest: this.currentSnapshot.digest });
  },

  handleControlState: function (req, res) {
    if (!this.hasControlAccess(req, res)) return;
    res.json({ ok: true, state: this.currentPageState });
  },

  handleControlPost: async function (req, res) {
    if (!this.hasControlAccess(req, res)) return;

    let body;
    try {
      body = await this.readJsonBody(req);
    } catch (error) {
      res.status(error.statusCode || 400).json({ ok: false, errors: [error.message] });
      return;
    }

    const parsed = readControlCommand(body, this.configuredPages);
    if (!parsed.ok) {
      res.status(parsed.statusCode).json({ ok: false, errors: [parsed.error], state: this.currentPageState });
      return;
    }

    const payload = {
      command: parsed.command,
      pageId: parsed.pageId || null,
      requestId: requestId()
    };
    this.sendSocketNotification("MMM_AGENT_SURFACE_CONTROL", payload);
    res.json({ ok: true, accepted: payload, state: this.currentPageState });
  },

  hasControlAccess: function (req, res) {
    const configuredToken = controlToken();
    if (!configuredToken) {
      res.status(503).json({ ok: false, errors: ["MIRROR_CONTROL_TOKEN is required for page control"] });
      return false;
    }

    const suppliedToken = this.readBearerToken((req && req.headers) || {});
    if (!this.timingSafeEqualString(suppliedToken, configuredToken)) {
      res.status(401).json({ ok: false, errors: ["unauthorized"] });
      return false;
    }

    return true;
  },

  readBearerToken: function (headers) {
    const authorization = headers.authorization || headers.Authorization || "";
    if (typeof authorization === "string" && authorization.toLowerCase().startsWith("bearer ")) {
      return authorization.slice(7).trim();
    }
    const directToken = headers["x-mirror-control-token"] || headers["x-mirror-ingest-token"] || "";
    return directToken ? String(directToken) : "";
  },

  timingSafeEqualString: function (left, right) {
    if (typeof left !== "string" || typeof right !== "string" || !left || !right) return false;
    // Hash both inputs to fixed-length digests so comparison work is
    // independent of the supplied token's length and content.
    const leftDigest = crypto.createHash("sha256").update(left, "utf8").digest();
    const rightDigest = crypto.createHash("sha256").update(right, "utf8").digest();
    return crypto.timingSafeEqual(leftDigest, rightDigest);
  },

  loadValidator: async function () {
    if (!this.validatorPromise) {
      this.validatorPromise = import("./agent-snapshot.mjs");
    }
    return this.validatorPromise;
  },

  readJsonBody: function (req) {
    if (req.body !== undefined) {
      return Promise.resolve(req.body);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let size = 0;
      let raw = "";

      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        if (settled) return;
        size += Buffer.byteLength(chunk);
        if (size > MAX_BODY_BYTES) {
          settled = true;
          const error = new Error("snapshot payload too large");
          error.statusCode = 413;
          reject(error);
          req.destroy();
          return;
        }
        raw += chunk;
      });

      req.on("end", () => {
        if (settled) return;
        settled = true;
        if (!raw.trim()) {
          const error = new Error("snapshot body is required");
          error.statusCode = 400;
          reject(error);
          return;
        }

        try {
          resolve(JSON.parse(raw));
        } catch (parseError) {
          const error = new Error("snapshot body must be valid JSON");
          error.statusCode = 400;
          reject(error);
        }
      });

      req.on("error", (streamError) => {
        if (settled) return;
        settled = true;
        const error = new Error(streamError.message || "unable to read snapshot body");
        error.statusCode = 400;
        reject(error);
      });
    });
  },

  sendCurrentSnapshot: function () {
    this.sendSocketNotification("MMM_AGENT_SURFACE_SNAPSHOT", {
      snapshot: this.currentSnapshot,
      summary: this.currentSummary
    });
  },

  sendPageState: function () {
    this.sendSocketNotification("MMM_AGENT_SURFACE_PAGE_STATE", this.currentPageState);
  }
});
