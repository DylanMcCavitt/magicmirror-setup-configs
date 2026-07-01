/* global Module, window */

Module.register("MMM-AgentSurface", {
  defaults: {
    title: "Agent Surface",
    staleAfterMs: 5 * 60 * 1000,
    maxThreads: 8,
    showSummary: true,
    mirrorOs: {}
  },

  start: function () {
    this.snapshot = null;
    this.summary = null;
    this.error = null;
    this.payloadStates = {};
    this.rotationTimer = null;
    this.shell = window.MMMAgentSurfaceMirrorOsShell
      ? window.MMMAgentSurfaceMirrorOsShell.createMirrorOsShell(this.config.mirrorOs || {})
      : null;
    this.staleTimer = setInterval(function () {
      if (this.snapshot) {
        this.refreshAgentSnapshotState();
        this.updateDom(0);
      }
    }.bind(this), 60 * 1000);
    this.scheduleRotation();
    this.sendSocketNotification("MMM_AGENT_SURFACE_GET_CURRENT");
  },

  suspend: function () {
    clearInterval(this.staleTimer);
    this.staleTimer = null;
    this.clearRotationTimer();
  },

  resume: function () {
    if (!this.staleTimer) {
      this.staleTimer = setInterval(function () {
        if (this.snapshot) {
          this.refreshAgentSnapshotState();
          this.updateDom(0);
        }
      }.bind(this), 60 * 1000);
    }
    this.scheduleRotation();
    this.updateDom(0);
  },

  getStyles: function () {
    return ["MMM-AgentSurface.css"];
  },

  getScripts: function () {
    return [this.file("display-sanitizer.js"), this.file("mirror-os-shell.js")];
  },

  clearRotationTimer: function () {
    clearTimeout(this.rotationTimer);
    this.rotationTimer = null;
  },

  scheduleRotation: function () {
    this.clearRotationTimer();
    if (!this.shell || this.shell.state().rotationPaused) return;

    var dwellMs = this.shell.dwellSeconds(this.shell.currentPage()) * 1000;
    this.rotationTimer = setTimeout(function () {
      if (!this.shell) return;
      this.shell.next("rotation");
      this.updateDom(300);
      this.scheduleRotation();
    }.bind(this), dwellMs);
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "MMM_AGENT_SURFACE_SNAPSHOT") {
      if (!window.MMMAgentSurfaceDisplaySanitizer) {
        this.snapshot = null;
        this.summary = null;
        this.error = "Display sanitizer unavailable";
        this.payloadStates.agentSnapshot = { state: "error", message: this.error };
        this.updateDom(300);
        return;
      }

      this.error = null;
      this.snapshot = window.MMMAgentSurfaceDisplaySanitizer.sanitizeSnapshotForDisplay(payload && payload.snapshot);
      this.summary = this.snapshot && this.snapshot.summary ? this.snapshot.summary : (payload && payload.summary ? payload.summary : null);
      this.refreshAgentSnapshotState();
      this.updateDom(300);
      return;
    }

    if (notification === "MMM_AGENT_SURFACE_ERROR") {
      this.error = payload && payload.message ? String(payload.message) : "Snapshot unavailable";
      this.payloadStates.agentSnapshot = { state: "error", message: this.error };
      this.updateDom(300);
    }
  },

  notificationReceived: function (notification, payload) {
    if (!this.shell) return;

    if (notification === "MIRROR_OS_PAGE_NEXT") {
      this.shell.next("command");
      this.updateDom(0);
      this.scheduleRotation();
      return;
    }

    if (notification === "MIRROR_OS_PAGE_PREV") {
      this.shell.prev("command");
      this.updateDom(0);
      this.scheduleRotation();
      return;
    }

    if (notification === "MIRROR_OS_PAGE_JUMP") {
      this.shell.jump(payload && payload.pageId, "command");
      this.updateDom(0);
      this.scheduleRotation();
      return;
    }

    if (notification === "MIRROR_OS_ROTATION_PAUSE") {
      this.shell.pause("command");
      this.updateDom(0);
      this.scheduleRotation();
      return;
    }

    if (notification === "MIRROR_OS_ROTATION_RESUME") {
      this.shell.resume("command");
      this.updateDom(0);
      this.scheduleRotation();
    }
  },

  refreshAgentSnapshotState: function () {
    if (this.error) {
      this.payloadStates.agentSnapshot = { state: "error", message: this.error };
      return;
    }

    if (!this.snapshot) {
      delete this.payloadStates.agentSnapshot;
      return;
    }

    var stale = this.isSnapshotStale();
    var source = this.snapshot.source || {};
    var provenance = [source.label, this.formatRelativeAge(this.snapshot.generatedAt)].filter(Boolean).join(" · ");
    this.payloadStates.agentSnapshot = {
      state: stale ? "stale" : "ready",
      stale: stale,
      provenance: provenance || null,
      message: null
    };
  },

  getDom: function () {
    var wrapper = document.createElement("section");
    wrapper.className = "mmm-mirror-os mmm-agent-surface";

    if (!this.shell) {
      wrapper.appendChild(this.renderMessage("error", "Mirror OS shell unavailable."));
      return wrapper;
    }

    this.refreshAgentSnapshotState();
    var viewModel = this.shell.pageViewModel(this.shell.currentPage(), { payloadStates: this.payloadStates, now: Date.now() });
    if (!viewModel) viewModel = this.shell.pageViewModel("home", { payloadStates: this.payloadStates, now: Date.now() });

    wrapper.appendChild(this.renderShellHeader(viewModel));
    wrapper.appendChild(this.renderPageBody(viewModel));
    return wrapper;
  },

  renderShellHeader: function (viewModel) {
    var header = document.createElement("div");
    header.className = "mmm-mirror-os__header";

    var titleBlock = document.createElement("div");
    titleBlock.className = "mmm-mirror-os__title-block";

    var title = document.createElement("div");
    title.className = "mmm-mirror-os__title mmm-agent-surface__title";
    title.textContent = this.config.title;
    titleBlock.appendChild(title);

    var page = document.createElement("div");
    page.className = "mmm-mirror-os__page-label";
    page.textContent = viewModel.label;
    titleBlock.appendChild(page);
    header.appendChild(titleBlock);

    var statusBlock = document.createElement("div");
    statusBlock.className = "mmm-mirror-os__status-block";

    var status = document.createElement("div");
    status.className = "mmm-mirror-os__status mmm-mirror-os__status--" + this.safeClassPart(viewModel.state) + " mmm-agent-surface__status";
    status.textContent = viewModel.glyph + " " + viewModel.state;
    statusBlock.appendChild(status);

    statusBlock.appendChild(this.renderPageIndicator(viewModel.pageId));
    header.appendChild(statusBlock);

    if (viewModel.provenance) {
      header.appendChild(this.renderProvenance(viewModel));
    }

    return header;
  },

  renderPageIndicator: function (currentPageId) {
    var indicator = document.createElement("div");
    indicator.className = "mmm-mirror-os__indicator";

    this.shell.rotationOrder().forEach(function (pageId) {
      var dot = document.createElement("span");
      dot.className = "mmm-mirror-os__indicator-dot" + (pageId === currentPageId ? " mmm-mirror-os__indicator-dot--current" : "");
      dot.textContent = pageId === currentPageId ? "●" : "·";
      indicator.appendChild(dot);
    });

    return indicator;
  },

  renderProvenance: function (viewModel) {
    var node = document.createElement("div");
    node.className = "mmm-mirror-os__provenance mmm-mirror-os__provenance--" + this.safeClassPart(viewModel.state);
    node.textContent = viewModel.state === "stale" ? viewModel.glyph + " stale · " + viewModel.provenance : viewModel.provenance;
    return node;
  },

  renderPageBody: function (viewModel) {
    var body = document.createElement("div");
    body.className = "mmm-mirror-os__body mmm-mirror-os__body--" + this.safeClassPart(viewModel.pageId);

    if (viewModel.state === "summary") {
      body.appendChild(this.renderHomeSummary(viewModel));
      return body;
    }

    if (viewModel.state === "unconfigured") {
      body.appendChild(this.renderUnconfigured(viewModel));
      return body;
    }

    if (viewModel.state === "error") {
      body.appendChild(this.renderMessage("error", viewModel.message || "Source error."));
      return body;
    }

    if (viewModel.pageId === "agents") {
      if (this.isSnapshotStale()) {
        body.appendChild(this.renderMessage("stale", "Snapshot is stale. Waiting for an updated upload."));
      }
      if (this.config.showSummary && this.snapshot) body.appendChild(this.renderSummary());
      body.appendChild(this.renderAgentThreads());
      return body;
    }

    if (viewModel.state === "ready") {
      body.appendChild(this.renderEmptyRow("No renderer for this page yet"));
      return body;
    }

    body.appendChild(this.renderMessage("stale", viewModel.message || "Data is stale."));
    return body;
  },

  renderHomeSummary: function (viewModel) {
    var panel = document.createElement("div");
    panel.className = "mmm-mirror-os__summary-panel";

    var message = document.createElement("div");
    message.className = "mmm-mirror-os__summary-message";
    message.textContent = viewModel.message;
    panel.appendChild(message);

    var list = document.createElement("div");
    list.className = "mmm-mirror-os__source-list";

    this.shell.rotationOrder().forEach(function (pageId) {
      if (pageId === "home") return;
      var sourceView = this.shell.pageViewModel(pageId, { payloadStates: this.payloadStates, now: Date.now() });
      if (!sourceView) return;

      var row = document.createElement("div");
      row.className = "mmm-mirror-os__source-row mmm-mirror-os__source-row--" + this.safeClassPart(sourceView.state);

      var label = document.createElement("span");
      label.className = "mmm-mirror-os__source-label";
      label.textContent = sourceView.label;
      row.appendChild(label);

      var state = document.createElement("span");
      state.className = "mmm-mirror-os__source-state";
      state.textContent = sourceView.glyph + " " + sourceView.state;
      row.appendChild(state);

      list.appendChild(row);
    }, this);

    panel.appendChild(list);
    return panel;
  },

  renderUnconfigured: function (viewModel) {
    var node = document.createElement("div");
    node.className = "mmm-mirror-os__empty mmm-agent-surface__message mmm-agent-surface__message--waiting";

    var message = document.createElement("div");
    message.className = "mmm-mirror-os__empty-message";
    message.textContent = viewModel.message || viewModel.unconfiguredCopy || "Not configured.";
    node.appendChild(message);

    if (viewModel.missingConfigKeys && viewModel.missingConfigKeys.length) {
      var setup = document.createElement("div");
      setup.className = "mmm-mirror-os__setup";
      setup.textContent = "Setup: " + viewModel.missingConfigKeys.join(", ");
      node.appendChild(setup);
    }

    return node;
  },

  renderEmptyRow: function (message) {
    var row = document.createElement("div");
    row.className = "mmm-mirror-os__source-row mmm-mirror-os__source-row--empty";
    row.textContent = message;
    return row;
  },

  renderAgentThreads: function () {
    if (!this.snapshot) return this.renderUnconfigured(this.shell.pageViewModel("agents", { payloadStates: {}, now: Date.now() }));

    var threads = Array.isArray(this.snapshot.threads) ? this.snapshot.threads : [];
    if (threads.length === 0) return this.renderMessage("waiting", "No active agent threads in the latest snapshot.");

    var list = document.createElement("div");
    list.className = "mmm-mirror-os__cards mmm-agent-surface__cards";

    threads.slice(0, this.config.maxThreads).forEach(function (thread) {
      list.appendChild(this.renderThreadCard(thread));
    }, this);

    return list;
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
      stale: "△",
      unconfigured: "□",
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

  formatRelativeAge: function (value) {
    if (!value) return "";
    var date = Date.parse(value);
    if (!Number.isFinite(date)) return "";
    var ageSeconds = Math.max(0, Math.floor((Date.now() - date) / 1000));
    if (ageSeconds < 10) return "just now";
    if (ageSeconds < 60) return ageSeconds + "s ago";
    var minutes = Math.floor(ageSeconds / 60);
    if (minutes < 60) return minutes + "m ago";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + "h ago";
    return Math.floor(hours / 24) + "d ago";
  },

  safeClassPart: function (value) {
    return String(value || "unknown").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }
});
