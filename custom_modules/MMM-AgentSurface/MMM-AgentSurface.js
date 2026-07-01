/* global Module */

Module.register("MMM-AgentSurface", {
  defaults: {
    title: "Agent Surface",
    staleAfterMs: 5 * 60 * 1000,
    maxThreads: 8,
    showSummary: true
  },

  start: function () {
    this.snapshot = null;
    this.summary = null;
    this.error = null;
    this.staleTimer = setInterval(function () {
      if (this.snapshot) this.updateDom(0);
    }.bind(this), 60 * 1000);
    this.sendSocketNotification("MMM_AGENT_SURFACE_GET_CURRENT");
  },

  suspend: function () {
    clearInterval(this.staleTimer);
    this.staleTimer = null;
  },

  resume: function () {
    if (!this.staleTimer) {
      this.staleTimer = setInterval(function () {
        if (this.snapshot) this.updateDom(0);
      }.bind(this), 60 * 1000);
    }
    this.updateDom(0);
  },

  getStyles: function () {
    return ["MMM-AgentSurface.css"];
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "MMM_AGENT_SURFACE_SNAPSHOT") {
      this.error = null;
      this.snapshot = payload && payload.snapshot ? payload.snapshot : null;
      this.summary = payload && payload.summary ? payload.summary : null;
      this.updateDom(300);
      return;
    }

    if (notification === "MMM_AGENT_SURFACE_ERROR") {
      this.error = payload && payload.message ? String(payload.message) : "Snapshot unavailable";
      this.updateDom(300);
    }
  },

  getDom: function () {
    var wrapper = document.createElement("section");
    wrapper.className = "mmm-agent-surface";

    var header = document.createElement("header");
    header.className = "mmm-agent-surface__header";

    var title = document.createElement("div");
    title.className = "mmm-agent-surface__title";
    title.textContent = this.config.title;
    header.appendChild(title);

    var status = document.createElement("div");
    status.className = "mmm-agent-surface__status";
    status.textContent = this.getStateLabel();
    header.appendChild(status);
    wrapper.appendChild(header);

    if (this.error) {
      wrapper.appendChild(this.renderMessage("error", this.error));
      return wrapper;
    }

    if (!this.snapshot) {
      wrapper.appendChild(this.renderMessage("waiting", "Waiting for the first agent snapshot."));
      return wrapper;
    }

    if (this.isSnapshotStale()) {
      wrapper.appendChild(this.renderMessage("stale", "Snapshot is stale. Waiting for an updated upload."));
    }

    if (this.config.showSummary) {
      wrapper.appendChild(this.renderSummary());
    }

    var threads = Array.isArray(this.snapshot.threads) ? this.snapshot.threads : [];
    if (threads.length === 0) {
      wrapper.appendChild(this.renderMessage("waiting", "No active agent threads in the latest snapshot."));
      return wrapper;
    }

    var list = document.createElement("div");
    list.className = "mmm-agent-surface__cards";

    threads.slice(0, this.config.maxThreads).forEach(function (thread) {
      list.appendChild(this.renderThreadCard(thread));
    }, this);

    wrapper.appendChild(list);
    return wrapper;
  },

  getStateLabel: function () {
    if (this.error) return "Error";
    if (!this.snapshot) return "Waiting";
    if (this.isSnapshotStale()) return "Stale";
    return "Live";
  },

  isSnapshotStale: function () {
    if (!this.snapshot || !this.snapshot.generatedAt) return false;
    var generatedAt = Date.parse(this.snapshot.generatedAt);
    if (!Number.isFinite(generatedAt)) return false;
    return Date.now() - generatedAt > this.config.staleAfterMs;
  },

  renderMessage: function (kind, message) {
    var node = document.createElement("div");
    node.className = "mmm-agent-surface__message mmm-agent-surface__message--" + kind;
    node.textContent = message;
    return node;
  },

  renderSummary: function () {
    var summary = this.summary || this.snapshot.summary || {};
    var source = this.snapshot.source || {};
    var grid = document.createElement("div");
    grid.className = "mmm-agent-surface__summary";

    this.appendMetric(grid, "Active", summary.activeCount);
    this.appendMetric(grid, "Blocked", summary.blockedCount);
    this.appendMetric(grid, "Done", summary.completedCount);
    this.appendMetric(grid, "Threads", Array.isArray(this.snapshot.threads) ? this.snapshot.threads.length : 0);

    var meta = document.createElement("div");
    meta.className = "mmm-agent-surface__meta";
    meta.textContent = [source.label, this.formatTime(this.snapshot.generatedAt)].filter(Boolean).join(" • ");
    grid.appendChild(meta);

    return grid;
  },

  appendMetric: function (parent, label, value) {
    var metric = document.createElement("div");
    metric.className = "mmm-agent-surface__metric";

    var number = document.createElement("div");
    number.className = "mmm-agent-surface__metric-value";
    number.textContent = value === undefined || value === null ? "0" : String(value);
    metric.appendChild(number);

    var caption = document.createElement("div");
    caption.className = "mmm-agent-surface__metric-label";
    caption.textContent = label;
    metric.appendChild(caption);

    parent.appendChild(metric);
  },

  renderThreadCard: function (thread) {
    var card = document.createElement("article");
    card.className = "mmm-agent-surface__card mmm-agent-surface__card--" + this.safeClassPart(thread.status);

    var row = document.createElement("div");
    row.className = "mmm-agent-surface__card-header";

    var title = document.createElement("div");
    title.className = "mmm-agent-surface__card-title";
    title.textContent = thread.title || thread.id || "Untitled thread";
    row.appendChild(title);

    var state = document.createElement("div");
    state.className = "mmm-agent-surface__state";
    state.textContent = this.statusGlyph(thread.status) + " " + (thread.status || "unknown");
    row.appendChild(state);
    card.appendChild(row);

    var details = [thread.project, thread.issueId, thread.prId, thread.workstreamId, thread.agent, thread.repo, thread.phase, this.formatTime(thread.updatedAt)].filter(Boolean);
    if (details.length) {
      var detail = document.createElement("div");
      detail.className = "mmm-agent-surface__details";
      detail.textContent = details.join(" • ");
      card.appendChild(detail);
    }

    if (thread.blocker) {
      var blocker = document.createElement("div");
      blocker.className = "mmm-agent-surface__blocker";
      blocker.textContent = thread.blocker;
      card.appendChild(blocker);
    }

    if (thread.lastMessage) {
      var message = document.createElement("div");
      message.className = "mmm-agent-surface__last-message";
      message.textContent = thread.lastMessage;
      card.appendChild(message);
    }

    return card;
  },

  statusGlyph: function (status) {
    var glyphs = {
      running: "▶",
      blocked: "×",
      done: "✓",
      failed: "!",
      idle: "·",
      waiting: "…",
      unknown: "?"
    };
    return glyphs[this.safeClassPart(status)] || glyphs.unknown;
  },

  formatTime: function (value) {
    if (!value) return "";
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  },

  safeClassPart: function (value) {
    return String(value || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }
});
