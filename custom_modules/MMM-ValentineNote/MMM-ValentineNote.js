Module.register("MMM-ValentineNote", {
  defaults: {
    title: "For My Valentine",
    notes: [
      "Happy Valentine's Day.",
      "You are my favorite part of every day."
    ],
    rotateInterval: 12000,
    heartCount: 7,
    animationDurationMs: 600
  },

  start() {
    this.noteIndex = 0;
    this.currentNote = this.config.notes[0] || "";
    this.rotationTimer = setInterval(() => {
      if (!Array.isArray(this.config.notes) || this.config.notes.length === 0) {
        return;
      }
      this.noteIndex = (this.noteIndex + 1) % this.config.notes.length;
      this.currentNote = this.config.notes[this.noteIndex];
      this.updateDom(this.config.animationDurationMs);
    }, this.config.rotateInterval);
  },

  getStyles() {
    return [this.file("MMM-ValentineNote.css")];
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-valentine-note";

    const title = document.createElement("div");
    title.className = "mmm-valentine-note__title";
    title.textContent = this.config.title;

    const body = document.createElement("div");
    body.className = "mmm-valentine-note__body";
    body.textContent = this.currentNote;

    const hearts = document.createElement("div");
    hearts.className = "mmm-valentine-note__hearts";

    const heartCount = Number(this.config.heartCount) || 0;
    for (let i = 0; i < heartCount; i += 1) {
      const heart = document.createElement("span");
      heart.className = "mmm-valentine-note__heart";
      heart.style.left = `${6 + i * (88 / Math.max(1, heartCount - 1))}%`;
      heart.style.animationDelay = `${(i % 5) * 0.8}s`;
      heart.style.animationDuration = `${4.5 + (i % 3) * 0.7}s`;
      heart.textContent = "\u2665";
      hearts.appendChild(heart);
    }

    wrapper.appendChild(title);
    wrapper.appendChild(body);
    wrapper.appendChild(hearts);

    return wrapper;
  }
});
