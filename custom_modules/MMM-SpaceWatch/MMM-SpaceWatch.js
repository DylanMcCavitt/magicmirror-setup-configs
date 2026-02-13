Module.register("MMM-SpaceWatch", {
  defaults: {
    title: "Space View",
    refreshInterval: 10 * 60 * 1000,
    showISS: true,
    showNextPhases: true,
    showApod: false,
    nasaApiKey: "DEMO_KEY",
    animationSpeed: 500
  },

  start() {
    this.spaceData = null;
    this.status = "Loading space data...";
    this.sendSocketNotification("MMM_SPACE_WATCH_CONFIG", this.config);
  },

  getStyles() {
    return [this.file("MMM-SpaceWatch.css")];
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "MMM_SPACE_WATCH_DATA") {
      return;
    }

    this.spaceData = payload || null;
    this.status = (payload && payload.statusMessage) || "";
    this.updateDom(this.config.animationSpeed);
  },

  getMoonPhaseFraction(date) {
    const synodicMonth = 29.530588853;
    const referenceNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
    const elapsedDays = (date.getTime() - referenceNewMoon) / 86400000;
    const cycleDays = ((elapsedDays % synodicMonth) + synodicMonth) % synodicMonth;
    return cycleDays / synodicMonth;
  },

  getMoonDescriptor(fraction) {
    if (fraction < 0.03 || fraction >= 0.97) return { name: "New Moon", icon: "New" };
    if (fraction < 0.22) return { name: "Waxing Crescent", icon: "Waxing" };
    if (fraction < 0.28) return { name: "First Quarter", icon: "Quarter" };
    if (fraction < 0.47) return { name: "Waxing Gibbous", icon: "Waxing" };
    if (fraction < 0.53) return { name: "Full Moon", icon: "Full" };
    if (fraction < 0.72) return { name: "Waning Gibbous", icon: "Waning" };
    if (fraction < 0.78) return { name: "Last Quarter", icon: "Quarter" };
    return { name: "Waning Crescent", icon: "Waning" };
  },

  getNextPhaseDates(date, phaseFraction) {
    const synodicMonth = 29.530588853;
    const daysUntilNew = ((1 - phaseFraction) % 1) * synodicMonth;
    const daysUntilFull = (phaseFraction < 0.5 ? (0.5 - phaseFraction) : (1.5 - phaseFraction)) * synodicMonth;

    const nextNew = new Date(date.getTime() + daysUntilNew * 86400000);
    const nextFull = new Date(date.getTime() + daysUntilFull * 86400000);

    return { nextNew, nextFull };
  },

  formatDate(date) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  },

  renderRow(labelText, valueText) {
    const row = document.createElement("div");
    row.className = "mmm-space-watch__row";

    const label = document.createElement("span");
    label.className = "mmm-space-watch__label";
    label.textContent = labelText;

    const value = document.createElement("span");
    value.className = "mmm-space-watch__value";
    value.textContent = valueText;

    row.appendChild(label);
    row.appendChild(value);
    return row;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-space-watch";

    const title = document.createElement("div");
    title.className = "mmm-space-watch__title";
    title.textContent = this.config.title;
    wrapper.appendChild(title);

    const now = new Date();
    const phaseFraction = this.getMoonPhaseFraction(now);
    const moon = this.getMoonDescriptor(phaseFraction);

    const moonCard = document.createElement("div");
    moonCard.className = "mmm-space-watch__moon";

    const moonName = document.createElement("div");
    moonName.className = "mmm-space-watch__moon-name";
    moonName.textContent = moon.name;

    const moonMeta = document.createElement("div");
    moonMeta.className = "mmm-space-watch__moon-meta";
    moonMeta.textContent = `Cycle ${(phaseFraction * 100).toFixed(0)}%`;

    moonCard.appendChild(moonName);
    moonCard.appendChild(moonMeta);
    wrapper.appendChild(moonCard);

    if (this.config.showNextPhases) {
      const nextDates = this.getNextPhaseDates(now, phaseFraction);
      wrapper.appendChild(this.renderRow("Next Full", this.formatDate(nextDates.nextFull)));
      wrapper.appendChild(this.renderRow("Next New", this.formatDate(nextDates.nextNew)));
    }

    if (this.config.showISS) {
      if (this.spaceData && this.spaceData.iss) {
        wrapper.appendChild(
          this.renderRow(
            "ISS",
            `${this.spaceData.iss.latitude.toFixed(2)}, ${this.spaceData.iss.longitude.toFixed(2)}`
          )
        );
      } else {
        wrapper.appendChild(this.renderRow("ISS", "Unavailable"));
      }
    }

    if (this.config.showApod) {
      if (this.spaceData && this.spaceData.apod && this.spaceData.apod.title) {
        const apod = document.createElement("div");
        apod.className = "mmm-space-watch__apod";
        apod.textContent = `APOD: ${this.spaceData.apod.title}`;
        wrapper.appendChild(apod);
      } else {
        const apodStatus = document.createElement("div");
        apodStatus.className = "mmm-space-watch__apod";
        apodStatus.textContent = "APOD unavailable";
        wrapper.appendChild(apodStatus);
      }
    }

    const footer = document.createElement("div");
    footer.className = "mmm-space-watch__footer";
    footer.textContent = this.status || "";
    wrapper.appendChild(footer);

    return wrapper;
  }
});
