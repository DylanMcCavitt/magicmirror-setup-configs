Module.register("MMM-PageDeck", {
  defaults: {
    pages: [
      { id: "main", label: "Main" },
      { id: "secondary", label: "Secondary" }
    ],
    pageDurationMs: 10000,
    initialDelayMs: 3500,
    transitionMs: 600,
    showPageLabel: true,
    pauseOnSleep: true
  },

  start() {
    this.currentPageIndex = 0;
    this.rotationTimer = null;
    this.initialized = false;
    this.isPaused = false;
    this.updateDom(0);
  },

  getStyles() {
    return [this.file("MMM-PageDeck.css")];
  },

  notificationReceived(notification, payload) {
    if (notification === "DOM_OBJECTS_CREATED") {
      setTimeout(() => {
        this.initialized = true;
        this.applyCurrentPage(true);
        this.startRotation();
      }, Math.max(0, Number(this.config.initialDelayMs) || 0));
      return;
    }

    if (notification === "MMM_MOTION_WAKE_STATE" && this.config.pauseOnSleep) {
      const state = payload && payload.state;
      this.isPaused = state === "sleep" || state === "greeting";
      this.updateDom(0);
      return;
    }

    if (notification === "MMM_PAGE_NEXT") {
      this.nextPage();
      return;
    }

    if (notification === "MMM_PAGE_PREVIOUS") {
      const total = this.config.pages.length || 1;
      this.currentPageIndex = (this.currentPageIndex - 1 + total) % total;
      this.applyCurrentPage();
    }
  },

  suspend() {
    this.stopRotation();
  },

  resume() {
    this.startRotation();
    this.applyCurrentPage(true);
  },

  startRotation() {
    this.stopRotation();
    const duration = Math.max(3000, Number(this.config.pageDurationMs) || 10000);
    this.rotationTimer = setInterval(() => {
      if (!this.initialized || this.isPaused) {
        return;
      }
      this.nextPage();
    }, duration);
  },

  stopRotation() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  },

  nextPage() {
    const total = this.config.pages.length || 1;
    this.currentPageIndex = (this.currentPageIndex + 1) % total;
    this.applyCurrentPage();
  },

  getCurrentPage() {
    if (!this.config.pages.length) {
      return { id: "main", label: "Main" };
    }
    return this.config.pages[this.currentPageIndex];
  },

  modulePageClasses(module) {
    const rawClasses = String((module && module.data && module.data.classes) || "");
    return rawClasses
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => /^page-[a-z0-9_-]+$/i.test(entry));
  },

  applyCurrentPage(isInstant) {
    if (!this.initialized || !this.config.pages.length) {
      return;
    }

    const page = this.getCurrentPage();
    const targetClass = `page-${page.id}`;
    const speed = isInstant ? 0 : Math.max(0, Number(this.config.transitionMs) || 0);

    MM.getModules().exceptModule(this).enumerate((module) => {
      const pageClasses = this.modulePageClasses(module);
      if (pageClasses.length === 0) {
        return;
      }

      if (pageClasses.includes(targetClass)) {
        module.show(speed, { lockString: this.identifier });
      } else {
        module.hide(speed, { lockString: this.identifier });
      }
    });

    this.updateDom(speed);
    this.sendNotification("MMM_PAGE_DECK_PAGE_CHANGED", { id: page.id, label: page.label });
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-page-deck";
    if (this.isPaused) {
      wrapper.classList.add("mmm-page-deck--paused");
    }

    const page = this.getCurrentPage();

    if (this.config.showPageLabel) {
      const label = document.createElement("div");
      label.className = "mmm-page-deck__label";
      label.textContent = page.label || page.id;
      wrapper.appendChild(label);
    }

    const dots = document.createElement("div");
    dots.className = "mmm-page-deck__dots";

    this.config.pages.forEach((entry, index) => {
      const dot = document.createElement("span");
      dot.className = "mmm-page-deck__dot";
      if (index === this.currentPageIndex) {
        dot.classList.add("mmm-page-deck__dot--active");
      }
      dots.appendChild(dot);
    });

    wrapper.appendChild(dots);
    return wrapper;
  }
});
