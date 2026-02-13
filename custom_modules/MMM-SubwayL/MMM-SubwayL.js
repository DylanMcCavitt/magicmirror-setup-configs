Module.register("MMM-SubwayL", {
  defaults: {
    title: "L Train",
    mtaApiKey: "",
    refreshInterval: 30000,
    maxResults: 5,
    feedUrl: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
    stops: [
      { id: "L06N", label: "Toward 8 Av" },
      { id: "L06S", label: "Toward Canarsie" }
    ],
    fallbackTimes: [],
    animationSpeed: 500,
    showLastUpdated: true,
    enableRowClick: false,
    clickUrl: ""
  },

  start() {
    this.arrivals = [];
    this.statusMessage = "Loading arrivals...";
    this.lastUpdated = null;

    this.sendSocketNotification("MMM_SUBWAY_L_CONFIG", this.config);

    this.refreshTimer = setInterval(() => {
      this.sendSocketNotification("MMM_SUBWAY_L_FETCH");
    }, this.config.refreshInterval);
  },

  suspend() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  },

  resume() {
    if (!this.refreshTimer) {
      this.refreshTimer = setInterval(() => {
        this.sendSocketNotification("MMM_SUBWAY_L_FETCH");
      }, this.config.refreshInterval);
    }
    this.sendSocketNotification("MMM_SUBWAY_L_FETCH");
  },

  getStyles() {
    return [this.file("MMM-SubwayL.css")];
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "MMM_SUBWAY_L_DATA") {
      return;
    }

    this.arrivals = Array.isArray(payload.arrivals) ? payload.arrivals : [];
    this.statusMessage = payload.statusMessage || "";
    this.lastUpdated = payload.lastUpdated || null;
    this.updateDom(this.config.animationSpeed);
  },

  formatLastUpdated() {
    if (!this.lastUpdated) {
      return "";
    }

    const date = new Date(this.lastUpdated);
    const hh = date.getHours().toString().padStart(2, "0");
    const mm = date.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-subway-l";

    const title = document.createElement("div");
    title.className = "mmm-subway-l__title";
    title.textContent = this.config.title;
    wrapper.appendChild(title);

    if (this.arrivals.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "mmm-subway-l__status";
      emptyState.textContent = this.statusMessage || "No arrival data yet.";
      wrapper.appendChild(emptyState);
      return wrapper;
    }

    const list = document.createElement("div");
    list.className = "mmm-subway-l__list";

    this.arrivals.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "mmm-subway-l__row";
      const hasClickAction = Boolean(this.config.enableRowClick && this.config.clickUrl);
      const openLink = () => window.open(this.config.clickUrl, "_blank", "noopener,noreferrer");

      if (hasClickAction) {
        row.classList.add("mmm-subway-l__row--clickable");
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.addEventListener("click", openLink);
        row.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openLink();
          }
        });
      }

      const direction = document.createElement("div");
      direction.className = "mmm-subway-l__direction";
      direction.textContent = entry.label || entry.stopId || "L";

      const mins = document.createElement("div");
      mins.className = "mmm-subway-l__minutes";
      mins.textContent = entry.minutes <= 0 ? "Now" : `${entry.minutes} min`;

      row.appendChild(direction);
      row.appendChild(mins);
      list.appendChild(row);
    });

    wrapper.appendChild(list);

    if (this.config.showLastUpdated) {
      const updated = document.createElement("div");
      updated.className = "mmm-subway-l__updated";
      updated.textContent = this.lastUpdated
        ? `Updated ${this.formatLastUpdated()}`
        : "";
      wrapper.appendChild(updated);
    }

    if (this.statusMessage) {
      const status = document.createElement("div");
      status.className = "mmm-subway-l__status mmm-subway-l__status--small";
      status.textContent = this.statusMessage;
      wrapper.appendChild(status);
    }

    return wrapper;
  }
});
