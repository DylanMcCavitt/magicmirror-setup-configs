const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.timer = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "MMM_SPACE_WATCH_CONFIG") {
      return;
    }

    this.config = payload || {};
    this.clearTimer();
    this.fetchAndSend();

    const interval = Number(this.config.refreshInterval) || 10 * 60 * 1000;
    this.timer = setInterval(() => this.fetchAndSend(), interval);
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  async fetchISS() {
    const response = await fetch("http://api.open-notify.org/iss-now.json");
    if (!response.ok) {
      throw new Error(`ISS API ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.iss_position) {
      return null;
    }

    return {
      latitude: Number(data.iss_position.latitude),
      longitude: Number(data.iss_position.longitude)
    };
  },

  async fetchApod() {
    const apiKey = this.config.nasaApiKey || "DEMO_KEY";
    const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) {
      throw new Error(`APOD API ${response.status}`);
    }

    const data = await response.json();
    return {
      title: data.title || "",
      date: data.date || "",
      mediaType: data.media_type || ""
    };
  },

  async fetchAndSend() {
    try {
      const requests = [];
      if (this.config.showISS) {
        requests.push(this.fetchISS().catch(() => null));
      } else {
        requests.push(Promise.resolve(null));
      }

      if (this.config.showApod) {
        requests.push(this.fetchApod().catch(() => null));
      } else {
        requests.push(Promise.resolve(null));
      }

      const [iss, apod] = await Promise.all(requests);

      this.sendSocketNotification("MMM_SPACE_WATCH_DATA", {
        iss,
        apod,
        statusMessage: `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      });
    } catch (error) {
      this.sendSocketNotification("MMM_SPACE_WATCH_DATA", {
        iss: null,
        apod: null,
        statusMessage: `Space data unavailable: ${error.message}`
      });
    }
  }
});
