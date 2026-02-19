Module.register("MMM-AirPulse", {
  defaults: {
    title: "Air",
    lat: 40.7081,
    lon: -73.9571,
    refreshInterval: 15 * 60 * 1000,
    animationSpeed: 500
  },

  start() {
    this.airData = null;
    this.statusMessage = "Loading air quality...";
    this.lastUpdated = null;
    this.sendSocketNotification("MMM_AIR_PULSE_CONFIG", this.config);
  },

  getStyles() {
    return [this.file("MMM-AirPulse.css")];
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "MMM_AIR_PULSE_DATA") {
      return;
    }

    this.airData = payload && payload.current ? payload.current : null;
    this.statusMessage = (payload && payload.statusMessage) || "";
    this.lastUpdated = payload && payload.lastUpdated ? payload.lastUpdated : null;
    this.updateDom(this.config.animationSpeed);
  },

  getAqiLabel(aqi) {
    const value = Number(aqi);
    if (Number.isNaN(value)) return "Unknown";
    if (value <= 50) return "Good";
    if (value <= 100) return "Moderate";
    if (value <= 150) return "USG";
    if (value <= 200) return "Unhealthy";
    if (value <= 300) return "Very Unhealthy";
    return "Hazardous";
  },

  formatValue(value, digits) {
    const number = Number(value);
    if (Number.isNaN(number)) {
      return "--";
    }
    return number.toFixed(digits);
  },

  formatUpdated() {
    if (!this.lastUpdated) {
      return "";
    }

    const date = new Date(this.lastUpdated);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  },

  renderMetric(labelText, valueText) {
    const row = document.createElement("div");
    row.className = "mmm-air-pulse__metric";

    const label = document.createElement("span");
    label.className = "mmm-air-pulse__metric-label";
    label.textContent = labelText;

    const value = document.createElement("span");
    value.className = "mmm-air-pulse__metric-value";
    value.textContent = valueText;

    row.appendChild(label);
    row.appendChild(value);
    return row;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-air-pulse";

    const title = document.createElement("div");
    title.className = "mmm-air-pulse__title";
    title.textContent = this.config.title;
    wrapper.appendChild(title);

    if (!this.airData) {
      const status = document.createElement("div");
      status.className = "mmm-air-pulse__status";
      status.textContent = this.statusMessage || "No air quality data yet.";
      wrapper.appendChild(status);
      return wrapper;
    }

    const aqi = Number(this.airData.us_aqi);
    const aqiBlock = document.createElement("div");
    aqiBlock.className = "mmm-air-pulse__aqi";

    const aqiValue = document.createElement("span");
    aqiValue.className = "mmm-air-pulse__aqi-value";
    aqiValue.textContent = Number.isNaN(aqi) ? "--" : String(Math.round(aqi));

    const aqiLabel = document.createElement("span");
    aqiLabel.className = "mmm-air-pulse__aqi-label";
    aqiLabel.textContent = this.getAqiLabel(aqi);

    aqiBlock.appendChild(aqiValue);
    aqiBlock.appendChild(aqiLabel);
    wrapper.appendChild(aqiBlock);

    wrapper.appendChild(this.renderMetric("PM2.5", `${this.formatValue(this.airData.pm2_5, 1)} ug/m3`));
    wrapper.appendChild(this.renderMetric("PM10", `${this.formatValue(this.airData.pm10, 1)} ug/m3`));
    wrapper.appendChild(this.renderMetric("NO2", `${this.formatValue(this.airData.nitrogen_dioxide, 1)} ug/m3`));
    wrapper.appendChild(this.renderMetric("Ozone", `${this.formatValue(this.airData.ozone, 1)} ug/m3`));

    const footer = document.createElement("div");
    footer.className = "mmm-air-pulse__footer";
    footer.textContent = this.lastUpdated ? `Updated ${this.formatUpdated()}` : (this.statusMessage || "");
    wrapper.appendChild(footer);

    return wrapper;
  }
});
