const fs = require("node:fs");
const { execFile } = require("node:child_process");
const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
  start() {
    this.config = {};
    this.pollTimer = null;
    this.lastMotion = null;
    this.lastStatus = "";
    this.reader = null;
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "MMM_MOTION_WAKE_START") {
      return;
    }

    this.config = payload || {};
    this.startPolling();
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  startPolling() {
    this.stopPolling();
    this.lastMotion = null;

    const pin = Number(this.config.gpioPin);
    if (Number.isNaN(pin)) {
      this.reportStatus("Invalid gpioPin for MMM-MotionWake.");
      return;
    }

    this.reader = this.resolveReader();
    if (!this.reader) {
      this.reportStatus("No GPIO reader found. Install/use pinctrl or raspi-gpio on Pi.");
      return;
    }

    this.configurePin(pin);
    this.reportStatus(`Watching GPIO${pin} via ${this.reader.name}.`);

    const intervalMs = Math.max(250, Number(this.config.pollIntervalMs) || 700);
    this.readMotion();
    this.pollTimer = setInterval(() => this.readMotion(), intervalMs);
  },

  resolveReader() {
    const candidates = [
      {
        name: "pinctrl",
        cmd: "/usr/bin/pinctrl",
        readArgs: (pin) => ["get", String(pin)],
        setupArgs: (pin) => ["set", String(pin), "ip"]
      },
      {
        name: "raspi-gpio",
        cmd: "/usr/bin/raspi-gpio",
        readArgs: (pin) => ["get", String(pin)],
        setupArgs: (pin) => ["set", String(pin), "ip"]
      }
    ];

    return candidates.find((candidate) => fs.existsSync(candidate.cmd)) || null;
  },

  configurePin(pin) {
    if (!this.reader || typeof this.reader.setupArgs !== "function") {
      return;
    }

    execFile(this.reader.cmd, this.reader.setupArgs(pin), { timeout: 2000 }, () => {
      // Best effort setup only.
    });
  },

  readMotion() {
    if (!this.reader) {
      return;
    }

    const pin = Number(this.config.gpioPin);
    execFile(this.reader.cmd, this.reader.readArgs(pin), { timeout: 2500 }, (error, stdout, stderr) => {
      if (error) {
        this.reportStatus(`GPIO read error: ${error.message}`);
        return;
      }

      const output = `${stdout || ""}\n${stderr || ""}`.trim().toLowerCase();
      const level = this.parseLevel(output);
      if (level === null) {
        this.reportStatus(`Could not parse GPIO${pin} level from ${this.reader.name}.`);
        return;
      }

      const motion = level === 1;
      if (this.lastMotion === motion) {
        return;
      }

      this.lastMotion = motion;
      this.sendSocketNotification("MMM_MOTION_WAKE_MOTION", {
        motion,
        pin,
        at: Date.now()
      });

      if (this.config.debug) {
        this.reportStatus(`GPIO${pin}: ${motion ? "motion" : "idle"}`);
      }
    });
  },

  parseLevel(output) {
    if (!output) {
      return null;
    }

    if (/level\s*=\s*1\b/.test(output) || /\bhi\b/.test(output) || /\bhigh\b/.test(output)) {
      return 1;
    }

    if (/level\s*=\s*0\b/.test(output) || /\blo\b/.test(output) || /\blow\b/.test(output)) {
      return 0;
    }

    if (/^\s*[01]\s*$/.test(output)) {
      return Number(output.trim());
    }

    return null;
  },

  reportStatus(message) {
    if (!message || message === this.lastStatus) {
      return;
    }

    this.lastStatus = message;
    this.sendSocketNotification("MMM_MOTION_WAKE_STATUS", { message });
  }
});
