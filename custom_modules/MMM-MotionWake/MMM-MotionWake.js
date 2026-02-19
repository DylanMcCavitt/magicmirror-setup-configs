Module.register("MMM-MotionWake", {
  defaults: {
    gpioPin: 17,
    pollIntervalMs: 700,
    sleepStartHour: 1,
    wakeHour: 6,
    greetingText: "Good Morning, Bella :)",
    greetingDurationMs: 5200,
    transitionMs: 700,
    testMode: false,
    debug: false
  },

  start() {
    this.motionActive = false;
    this.awaitingMotion = false;
    this.modulesHidden = false;
    this.overlayState = "none";
    this.reconcileTimer = null;
    this.greetingTimer = null;
    this.lastSleepWindowState = null;
    this.debugStatus = "";
    this.testModePending = Boolean(this.config.testMode);

    this.sendSocketNotification("MMM_MOTION_WAKE_START", {
      gpioPin: this.config.gpioPin,
      pollIntervalMs: this.config.pollIntervalMs,
      debug: this.config.debug
    });

    this.reconcileState();
    this.reconcileTimer = setInterval(() => this.reconcileState(), 1000);
  },

  suspend() {
    this.clearTimers();
    this.setModulesHidden(false);
  },

  resume() {
    if (!this.reconcileTimer) {
      this.reconcileTimer = setInterval(() => this.reconcileState(), 1000);
    }
    this.reconcileState();
  },

  clearTimers() {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }

    if (this.greetingTimer) {
      clearTimeout(this.greetingTimer);
      this.greetingTimer = null;
    }
  },

  getStyles() {
    return [this.file("MMM-MotionWake.css")];
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "MMM_MOTION_WAKE_MOTION") {
      this.motionActive = Boolean(payload && payload.motion);

      if (this.config.debug) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const ss = String(now.getSeconds()).padStart(2, "0");
        this.debugStatus = `GPIO${this.config.gpioPin}: ${this.motionActive ? "motion" : "idle"} at ${hh}:${mm}:${ss}`;
      }

      this.reconcileState();
      return;
    }

    if (notification === "MMM_MOTION_WAKE_STATUS" && payload && payload.message) {
      this.debugStatus = payload.message;
      if (this.config.debug && this.overlayState !== "none") {
        this.updateDom(0);
      }
    }
  },

  isInSleepWindow(date) {
    const start = Number(this.config.sleepStartHour);
    const end = Number(this.config.wakeHour);
    const hour = date.getHours() + (date.getMinutes() / 60);

    if (Number.isNaN(start) || Number.isNaN(end) || start === end) {
      return false;
    }

    if (start < end) {
      return hour >= start && hour < end;
    }

    return hour >= start || hour < end;
  },

  setModulesHidden(hidden) {
    if (this.modulesHidden === hidden) {
      return;
    }

    this.modulesHidden = hidden;
    MM.getModules().exceptModule(this).enumerate((module) => {
      if (hidden) {
        module.hide(this.config.transitionMs, { lockString: this.identifier });
      } else {
        module.show(this.config.transitionMs, { lockString: this.identifier });
      }
    });
  },

  setSleepState(reasonText) {
    const changed = this.overlayState !== "sleep" || !this.modulesHidden || !this.awaitingMotion;

    this.awaitingMotion = true;
    this.overlayState = "sleep";
    this.setModulesHidden(true);

    if (this.config.debug) {
      this.debugStatus = reasonText;
    }

    if (changed) {
      this.updateDom(this.config.transitionMs);
    }
  },

  startWakeSequence() {
    if (this.greetingTimer) {
      return;
    }

    this.awaitingMotion = false;
    this.overlayState = "greeting";
    this.setModulesHidden(true);
    this.updateDom(0);

    const greetingDuration = Math.max(1800, Number(this.config.greetingDurationMs) || 5200);

    this.greetingTimer = setTimeout(() => {
      this.greetingTimer = null;
      this.overlayState = "none";
      this.setModulesHidden(false);
      this.updateDom(this.config.transitionMs);
    }, greetingDuration);
  },

  reconcileState() {
    const now = new Date();
    const inSleepWindow = this.isInSleepWindow(now);

    // One-shot test so you can validate motion wake immediately.
    if (this.testModePending && !inSleepWindow) {
      this.setSleepState("Test mode: waiting for motion");
      if (this.motionActive) {
        this.testModePending = false;
        this.startWakeSequence();
      }
      this.lastSleepWindowState = false;
      return;
    }

    if (inSleepWindow) {
      this.setSleepState("Night mode: sleeping");
      this.lastSleepWindowState = true;
      return;
    }

    if (this.lastSleepWindowState === true) {
      this.awaitingMotion = true;
      this.overlayState = "sleep";
      this.setModulesHidden(true);
      this.lastSleepWindowState = false;
      this.updateDom(this.config.transitionMs);
    } else if (this.lastSleepWindowState === null) {
      this.lastSleepWindowState = false;
    }

    if (this.awaitingMotion) {
      if (this.motionActive) {
        this.startWakeSequence();
      } else {
        this.setSleepState("Waiting for morning motion");
      }
      return;
    }

    if (!this.greetingTimer && this.overlayState !== "none") {
      this.overlayState = "none";
      this.updateDom(this.config.transitionMs);
    }

    if (!this.greetingTimer) {
      this.setModulesHidden(false);
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-motion-wake";

    if (this.overlayState === "none" && !this.config.debug) {
      wrapper.style.display = "none";
      return wrapper;
    }

    if (this.overlayState === "sleep") {
      wrapper.classList.add("mmm-motion-wake--sleep");
    }

    if (this.overlayState === "greeting") {
      wrapper.classList.add("mmm-motion-wake--greeting");
      wrapper.style.setProperty("--greeting-duration", `${Math.max(1800, Number(this.config.greetingDurationMs) || 5200)}ms`);

      const message = document.createElement("div");
      message.className = "mmm-motion-wake__message";
      message.textContent = this.config.greetingText;
      wrapper.appendChild(message);
    }

    if (this.config.debug) {
      const debug = document.createElement("div");
      debug.className = "mmm-motion-wake__debug";
      debug.textContent = this.debugStatus || `GPIO${this.config.gpioPin}: ${this.motionActive ? "motion" : "idle"}`;
      wrapper.appendChild(debug);
    }

    return wrapper;
  }
});
