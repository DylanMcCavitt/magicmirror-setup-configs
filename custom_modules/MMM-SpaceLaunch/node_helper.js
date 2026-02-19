const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.timer = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "MMM_SPACE_LAUNCH_CONFIG") {
      return;
    }

    this.config = payload || {};
    this.clearTimer();
    this.fetchAndSend();

    const interval = Math.max(2 * 60 * 1000, Number(this.config.refreshInterval) || 20 * 60 * 1000);
    this.timer = setInterval(() => this.fetchAndSend(), interval);
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  buildUrl() {
    const limit = Math.max(1, Math.min(6, Number(this.config.limit) || 3));
    const url = new URL("https://ll.thespacedevs.com/2.2.0/launch/upcoming/");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("hide_recent_previous", "true");
    return url.toString();
  },

  normalizeLaunch(entry) {
    return {
      id: entry.id || "",
      name: entry.name || "Untitled Launch",
      net: entry.net || null,
      provider:
        (entry.launch_service_provider && entry.launch_service_provider.name) ||
        ""
    };
  },

  async fetchAndSend() {
    try {
      const response = await fetch(this.buildUrl(), {
        headers: { "User-Agent": "MagicMirror-MMM-SpaceLaunch" }
      });
      if (!response.ok) {
        throw new Error(`Space API ${response.status}`);
      }

      const data = await response.json();
      const launches = Array.isArray(data.results)
        ? data.results.map((entry) => this.normalizeLaunch(entry))
        : [];

      this.sendSocketNotification("MMM_SPACE_LAUNCH_DATA", {
        launches,
        statusMessage: "Live space schedule",
        lastUpdated: Date.now()
      });
    } catch (error) {
      this.sendSocketNotification("MMM_SPACE_LAUNCH_DATA", {
        launches: [],
        statusMessage: `Launch data unavailable: ${error.message}`,
        lastUpdated: Date.now()
      });
    }
  }
});
