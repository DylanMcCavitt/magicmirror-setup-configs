const NodeHelper = require("node_helper");

let gtfsRealtime = null;
try {
  gtfsRealtime = require("gtfs-realtime-bindings");
} catch (error) {
  gtfsRealtime = null;
}

module.exports = NodeHelper.create({
  start() {
    this.config = null;
    this.isFetching = false;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "MMM_SUBWAY_L_CONFIG") {
      this.config = payload || {};
      this.fetchAndSend();
      return;
    }

    if (notification === "MMM_SUBWAY_L_FETCH") {
      this.fetchAndSend();
    }
  },

  buildFallbackArrivals() {
    const fallback = Array.isArray(this.config.fallbackTimes) ? this.config.fallbackTimes : [];
    return fallback
      .map((entry) => {
        const minutes = Number(entry.minutes);
        if (Number.isNaN(minutes)) {
          return null;
        }

        return {
          label: entry.label || "L Train",
          stopId: entry.stopId || "",
          minutes,
          arrivalEpochMs: Date.now() + minutes * 60 * 1000
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.minutes - b.minutes);
  },

  getStopLabelMap() {
    const stops = Array.isArray(this.config.stops) ? this.config.stops : [];
    const map = new Map();

    stops.forEach((stop) => {
      if (!stop.id) {
        return;
      }
      map.set(stop.id, stop.label || stop.id);
    });

    return map;
  },

  async fetchAndSend() {
    if (!this.config || this.isFetching) {
      return;
    }

    this.isFetching = true;

    try {
      const data = await this.fetchArrivals();
      this.sendSocketNotification("MMM_SUBWAY_L_DATA", data);
    } catch (error) {
      this.sendSocketNotification("MMM_SUBWAY_L_DATA", {
        arrivals: this.buildFallbackArrivals().slice(0, Number(this.config.maxResults) || 5),
        statusMessage: `Live feed unavailable: ${error.message}`,
        lastUpdated: Date.now()
      });
    } finally {
      this.isFetching = false;
    }
  },

  async fetchArrivals() {
    if (!gtfsRealtime) {
      return {
        arrivals: this.buildFallbackArrivals().slice(0, Number(this.config.maxResults) || 5),
        statusMessage: "Missing gtfs-realtime-bindings dependency.",
        lastUpdated: Date.now()
      };
    }

    const configuredKey = typeof this.config.mtaApiKey === "string" ? this.config.mtaApiKey.trim() : "";
    const hasApiKey = Boolean(configuredKey && configuredKey !== "REPLACE_WITH_MTA_API_KEY");

    const stopLabelMap = this.getStopLabelMap();
    const stopIds = new Set(stopLabelMap.keys());
    if (stopIds.size === 0) {
      return {
        arrivals: [],
        statusMessage: "No stop IDs configured.",
        lastUpdated: Date.now()
      };
    }

    const headers = {
      "User-Agent": "MagicMirror-MMM-SubwayL"
    };
    if (hasApiKey) {
      headers["x-api-key"] = configuredKey;
    }

    const response = await fetch(this.config.feedUrl || "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l", { headers });

    if (!response.ok) {
      if ((response.status === 401 || response.status === 403) && !hasApiKey) {
        throw new Error("MTA feed rejected unauthenticated request. Add mtaApiKey.");
      }
      if ((response.status === 401 || response.status === 403) && hasApiKey) {
        throw new Error("MTA feed rejected API key.");
      }
      throw new Error(`MTA feed returned ${response.status}`);
    }

    const raw = Buffer.from(await response.arrayBuffer());
    const feed = gtfsRealtime.transit_realtime.FeedMessage.decode(raw);

    const now = Date.now();
    const entries = [];

    (feed.entity || []).forEach((entity) => {
      const tripUpdate = entity.tripUpdate;
      if (!tripUpdate || !tripUpdate.stopTimeUpdate) {
        return;
      }

      const routeId = String((tripUpdate.trip && tripUpdate.trip.routeId) || "L");
      if (routeId !== "L") {
        return;
      }

      (tripUpdate.stopTimeUpdate || []).forEach((update) => {
        const stopId = String(update.stopId || "");
        if (!stopIds.has(stopId)) {
          return;
        }

        const arrivalTime = Number((update.arrival && update.arrival.time) || (update.departure && update.departure.time) || 0);
        if (!arrivalTime) {
          return;
        }

        const arrivalEpochMs = arrivalTime * 1000;
        if (arrivalEpochMs < now - 15000) {
          return;
        }

        entries.push({
          stopId,
          label: stopLabelMap.get(stopId) || stopId,
          minutes: Math.max(0, Math.round((arrivalEpochMs - now) / 60000)),
          arrivalEpochMs
        });
      });
    });

    entries.sort((a, b) => a.arrivalEpochMs - b.arrivalEpochMs);

    const maxResults = Number(this.config.maxResults) || 5;
    const deduped = [];
    const seen = new Set();

    entries.forEach((entry) => {
      const key = `${entry.stopId}-${entry.arrivalEpochMs}`;
      if (seen.has(key) || deduped.length >= maxResults) {
        return;
      }
      seen.add(key);
      deduped.push(entry);
    });

    if (deduped.length === 0) {
      return {
        arrivals: this.buildFallbackArrivals().slice(0, maxResults),
        statusMessage: "No live arrivals right now. Showing fallback.",
        lastUpdated: Date.now()
      };
    }

    return {
      arrivals: deduped,
      statusMessage: hasApiKey ? "Live MTA data (key)" : "Live MTA data",
      lastUpdated: Date.now()
    };
  }
});
