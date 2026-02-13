Module.register("MMM-OurShow", {
  defaults: {
    title: "We Watched This",
    dataUrl: null,
    maxCast: 4,
    animationSpeed: 600,
    showData: {
      showTitle: "",
      watchedOn: "",
      summary: "",
      poster: "",
      cast: []
    }
  },

  start() {
    this.dataError = null;
    this.show = this.config.showData;
    this.loadShowData();
  },

  getStyles() {
    return [this.file("MMM-OurShow.css")];
  },

  async loadShowData() {
    if (!this.config.dataUrl) {
      this.updateDom(this.config.animationSpeed);
      return;
    }

    try {
      const response = await fetch(this.config.dataUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load show data (${response.status})`);
      }
      const payload = await response.json();
      this.show = payload;
      this.dataError = null;
    } catch (error) {
      this.dataError = error.message;
    }

    this.updateDom(this.config.animationSpeed);
  },

  renderCastMember(member) {
    const card = document.createElement("div");
    card.className = "mmm-our-show__cast-card";

    const photo = document.createElement("div");
    photo.className = "mmm-our-show__photo";

    if (member.image) {
      photo.style.backgroundImage = `url("${member.image}")`;
      photo.classList.add("mmm-our-show__photo--image");
    } else {
      photo.textContent = (member.name || "?").slice(0, 1).toUpperCase();
      photo.classList.add("mmm-our-show__photo--fallback");
    }

    const name = document.createElement("div");
    name.className = "mmm-our-show__name";
    name.textContent = member.name || "Unknown";

    const role = document.createElement("div");
    role.className = "mmm-our-show__role";
    role.textContent = member.character || "";

    card.appendChild(photo);
    card.appendChild(name);
    card.appendChild(role);
    return card;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-our-show";

    const title = document.createElement("div");
    title.className = "mmm-our-show__title";
    title.textContent = this.config.title;

    wrapper.appendChild(title);

    if (this.dataError) {
      const error = document.createElement("div");
      error.className = "mmm-our-show__error";
      error.textContent = this.dataError;
      wrapper.appendChild(error);
      return wrapper;
    }

    const showTitle = document.createElement("div");
    showTitle.className = "mmm-our-show__show-title";
    showTitle.textContent = this.show.showTitle || "Add your show title";

    const meta = document.createElement("div");
    meta.className = "mmm-our-show__meta";
    meta.textContent = this.show.watchedOn ? `Watched: ${this.show.watchedOn}` : "Watched together";

    const summary = document.createElement("div");
    summary.className = "mmm-our-show__summary";
    summary.textContent = this.show.summary || "Add your own summary in default-show.json";

    wrapper.appendChild(showTitle);
    wrapper.appendChild(meta);
    wrapper.appendChild(summary);

    if (this.show.poster) {
      const poster = document.createElement("div");
      poster.className = "mmm-our-show__poster";
      poster.style.backgroundImage = `url("${this.show.poster}")`;
      wrapper.appendChild(poster);
    }

    const castGrid = document.createElement("div");
    castGrid.className = "mmm-our-show__cast";

    const castEntries = Array.isArray(this.show.cast) ? this.show.cast.slice(0, this.config.maxCast) : [];
    castEntries.forEach((member) => castGrid.appendChild(this.renderCastMember(member)));

    wrapper.appendChild(castGrid);

    return wrapper;
  }
});
