const NodeHelper = require("node_helper");

const ROUTE_BASE = "/MMM-AgentSurface/api/snapshot";
const MAX_BODY_BYTES = 1024 * 1024;

module.exports = NodeHelper.create({
  start: function () {
    this.currentSnapshot = null;
    this.currentSummary = null;
    this.validatorPromise = null;
    this.registerRoutes();
  },

  socketNotificationReceived: function (notification) {
    if (notification === "MMM_AGENT_SURFACE_GET_CURRENT") {
      this.sendCurrentSnapshot();
    }
  },

  registerRoutes: function () {
    this.expressApp.post(ROUTE_BASE, this.handleSnapshotPost.bind(this));
    this.expressApp.get(ROUTE_BASE + "/current", this.handleSnapshotCurrent.bind(this));
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
  }
});
