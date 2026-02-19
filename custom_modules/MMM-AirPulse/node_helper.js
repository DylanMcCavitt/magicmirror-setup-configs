const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.timer = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "MMM_AIR_PULSE_CONFIG") {
      return;
    }

    this.config = payload || {};
    this.resetTimer();
    this.fetchAndSend();

    const interval = Math.max(60 * 1000, Number(this.config.refreshInterval) || 15 * 60 * 1000);
    this.timer = setInterval(() => this.fetchAndSend(), interval);
  },

  resetTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  buildUrl() {
    const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
    url.searchParams.set("latitude", String(this.config.lat || 40.7081));
    url.searchParams.set("longitude", String(this.config.lon || -73.9571));
    url.searchParams.set("current", "us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone");
    url.searchParams.set("timezone", "auto");
    return url.toString();
  },

  async fetchAndSend() {
    try {
      const response = await fetch(this.buildUrl(), {
        headers: { "User-Agent": "MagicMirror-MMM-AirPulse" }
      });
      if (!response.ok) {
        throw new Error(`Air quality API ${response.status}`);
      }

      const data = await response.json();
      const current = data && data.current ? data.current : null;
      if (!current) {
        throw new Error("No current air quality data.");
      }

      this.sendSocketNotification("MMM_AIR_PULSE_DATA", {
        current,
        statusMessage: "Live open-meteo AQ",
        lastUpdated: Date.now()
      });
    } catch (error) {
      this.sendSocketNotification("MMM_AIR_PULSE_DATA", {
        current: null,
        statusMessage: `Air quality unavailable: ${error.message}`,
        lastUpdated: Date.now()
      });
    }
  }
});
