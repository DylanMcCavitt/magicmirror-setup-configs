Module.register("MMM-SpaceLaunch", {
  defaults: {
    title: "Space",
    refreshInterval: 20 * 60 * 1000,
    limit: 3,
    animationSpeed: 500
  },

  start() {
    this.launches = [];
    this.statusMessage = "Loading launch schedule...";
    this.lastUpdated = null;
    this.sendSocketNotification("MMM_SPACE_LAUNCH_CONFIG", this.config);
  },

  getStyles() {
    return [this.file("MMM-SpaceLaunch.css")];
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "MMM_SPACE_LAUNCH_DATA") {
      return;
    }

    this.launches = Array.isArray(payload.launches) ? payload.launches : [];
    this.statusMessage = payload.statusMessage || "";
    this.lastUpdated = payload.lastUpdated || null;
    this.updateDom(this.config.animationSpeed);
  },

  truncate(text, maxLength) {
    const value = String(text || "").trim();
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength - 1)}...`;
  },

  formatCountdown(netIso) {
    if (!netIso) {
      return "TBD";
    }

    const now = Date.now();
    const net = new Date(netIso).getTime();
    if (Number.isNaN(net)) {
      return "TBD";
    }

    const deltaMs = net - now;
    if (deltaMs <= 0) {
      return "Live";
    }

    const totalMinutes = Math.floor(deltaMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const mins = totalMinutes % 60;

    if (days > 0) {
      return `T-${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `T-${hours}h ${mins}m`;
    }
    return `T-${mins}m`;
  },

  formatLastUpdated() {
    if (!this.lastUpdated) {
      return "";
    }

    const date = new Date(this.lastUpdated);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-space-launch";

    const title = document.createElement("div");
    title.className = "mmm-space-launch__title";
    title.textContent = this.config.title;
    wrapper.appendChild(title);

    if (!this.launches.length) {
      const status = document.createElement("div");
      status.className = "mmm-space-launch__status";
      status.textContent = this.statusMessage || "No upcoming launches.";
      wrapper.appendChild(status);
      return wrapper;
    }

    const list = document.createElement("div");
    list.className = "mmm-space-launch__list";

    this.launches.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "mmm-space-launch__row";

      const top = document.createElement("div");
      top.className = "mmm-space-launch__top";

      const mission = document.createElement("span");
      mission.className = "mmm-space-launch__mission";
      mission.textContent = this.truncate(entry.name, 46);

      const countdown = document.createElement("span");
      countdown.className = "mmm-space-launch__countdown";
      countdown.textContent = this.formatCountdown(entry.net);

      top.appendChild(mission);
      top.appendChild(countdown);

      const meta = document.createElement("div");
      meta.className = "mmm-space-launch__meta";
      meta.textContent = this.truncate(entry.provider || "Unknown provider", 48);

      row.appendChild(top);
      row.appendChild(meta);
      list.appendChild(row);
    });

    wrapper.appendChild(list);

    const footer = document.createElement("div");
    footer.className = "mmm-space-launch__footer";
    footer.textContent = this.lastUpdated
      ? `Updated ${this.formatLastUpdated()}`
      : (this.statusMessage || "");
    wrapper.appendChild(footer);

    return wrapper;
  }
});
