(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MMMAgentSurfaceMirrorOsShell = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null, function () {
  "use strict";

  var FALLBACK_ROTATION_ORDER = ["home", "agents", "calendar", "weather", "path", "sports"];
  var DATA_SOURCE_IDS = ["agentSnapshot", "calendarIcs", "openMeteo", "pathGtfsRealtime", "sportsScoreboard"];

  var PAGE_LABELS = {
    home: "Home",
    agents: "Agents",
    calendar: "Calendar",
    weather: "Weather",
    path: "PATH",
    sports: "Sports"
  };

  var PAGE_TO_SOURCE = {
    agents: "agentSnapshot",
    calendar: "calendarIcs",
    weather: "openMeteo",
    path: "pathGtfsRealtime",
    sports: "sportsScoreboard"
  };

  var GLYPHS = {
    ready: "·",
    stale: "△",
    error: "!",
    unconfigured: "□",
    summary: "·"
  };

  function isPlainObject(value) {
    return !!value && Object.prototype.toString.call(value) === "[object Object]";
  }

  function configuredPages(config) {
    var pages = isPlainObject(config) && Array.isArray(config.pages) ? config.pages : null;
    if (!pages) return FALLBACK_ROTATION_ORDER.slice();

    var filtered = [];
    pages.forEach(function (pageId) {
      if (typeof pageId === "string" && Object.prototype.hasOwnProperty.call(PAGE_LABELS, pageId)) filtered.push(pageId);
    });
    return filtered.length ? filtered : FALLBACK_ROTATION_ORDER.slice();
  }

  function positiveFinite(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function dataSourceConfig(config, dataSourceId) {
    if (!isPlainObject(config) || !isPlainObject(config.dataSources)) return {};
    return isPlainObject(config.dataSources[dataSourceId]) ? config.dataSources[dataSourceId] : {};
  }

  function sourceState(payloadStates, dataSourceId) {
    if (!isPlainObject(payloadStates)) return null;
    var entry = payloadStates[dataSourceId];
    return isPlainObject(entry) ? entry : null;
  }

  function knownRuntimeState(value) {
    return value === "ready" || value === "stale" || value === "error" || value === "unconfigured";
  }

  function createMirrorOsShell(mirrorOsConfig) {
    var config = isPlainObject(mirrorOsConfig) ? mirrorOsConfig : {};
    var pages = configuredPages(config);
    var initialPage = typeof config.initialPage === "string" && pages.indexOf(config.initialPage) !== -1 ? config.initialPage : pages[0];
    var configuredState = isPlainObject(config.pageState) ? config.pageState : {};
    var currentPageId = typeof configuredState.currentPageId === "string" && pages.indexOf(configuredState.currentPageId) !== -1
      ? configuredState.currentPageId
      : initialPage;
    var rotationPaused = configuredState.rotationPaused === true;
    var lastCommandSource = typeof configuredState.lastCommandSource === "string" && configuredState.lastCommandSource ? configuredState.lastCommandSource : "system";

    function setSource(source) {
      lastCommandSource = typeof source === "string" && source ? source : "rotation";
    }

    function move(delta, source) {
      setSource(source);
      if (rotationPaused && lastCommandSource === "rotation") return currentPageId;
      var index = pages.indexOf(currentPageId);
      if (index === -1) index = 0;
      currentPageId = pages[(index + delta + pages.length) % pages.length];
      return currentPageId;
    }

    return {
      state: function () {
        return {
          currentPageId: currentPageId,
          rotationPaused: rotationPaused,
          lastCommandSource: lastCommandSource
        };
      },

      currentPage: function () {
        return currentPageId;
      },

      next: function (source) {
        return move(1, source || "rotation");
      },

      prev: function (source) {
        return move(-1, source || "command");
      },

      jump: function (pageId, source) {
        setSource(source || "command");
        if (typeof pageId === "string" && pages.indexOf(pageId) !== -1) currentPageId = pageId;
        return currentPageId;
      },

      pause: function (source) {
        setSource(source || "command");
        rotationPaused = true;
        return currentPageId;
      },

      resume: function (source) {
        setSource(source || "command");
        rotationPaused = false;
        return currentPageId;
      },

      dwellSeconds: function (pageId) {
        var dwell = null;
        if (isPlainObject(config.rotation) && isPlainObject(config.rotation.pageDwellSeconds)) {
          dwell = positiveFinite(config.rotation.pageDwellSeconds[pageId]);
        }
        if (dwell === null && isPlainObject(config.rotation)) dwell = positiveFinite(config.rotation.intervalSeconds);
        if (dwell === null) dwell = 45;
        return Math.max(5, dwell);
      },

      pageViewModel: function (pageId, options) {
        var targetPageId = typeof pageId === "string" && pages.indexOf(pageId) !== -1 ? pageId : null;
        if (!targetPageId) return null;

        var label = PAGE_LABELS[targetPageId] || targetPageId;
        var payloadStates = isPlainObject(options) ? options.payloadStates : null;

        if (targetPageId === "home") {
          var readyCount = DATA_SOURCE_IDS.reduce(function (count, dataSourceId) {
            var entry = sourceState(payloadStates, dataSourceId);
            return count + (entry && entry.state === "ready" ? 1 : 0);
          }, 0);
          return {
            pageId: targetPageId,
            label: label,
            dataSourceId: null,
            state: "summary",
            glyph: GLYPHS.summary,
            message: readyCount + " of " + DATA_SOURCE_IDS.length + " sources ready",
            missingConfigKeys: [],
            provenance: null,
            unconfiguredCopy: null
          };
        }

        var dataSourceId = PAGE_TO_SOURCE[targetPageId];
        var contractConfig = dataSourceConfig(config, dataSourceId);
        var entry = sourceState(payloadStates, dataSourceId);
        var runtimeState = entry && knownRuntimeState(entry.state) ? entry.state : "unconfigured";
        var missingConfigKeys = [];
        if (Array.isArray(contractConfig.requiredConfigKeys)) {
          contractConfig.requiredConfigKeys.forEach(function (key) {
            missingConfigKeys.push(key);
          });
        }
        var unconfiguredCopy = typeof contractConfig.unconfiguredCopy === "string" && contractConfig.unconfiguredCopy ? contractConfig.unconfiguredCopy : "Not configured.";
        var message = null;
        var provenance = null;

        if (runtimeState === "unconfigured") {
          message = unconfiguredCopy;
        } else if (runtimeState === "error") {
          message = typeof entry.message === "string" && entry.message ? entry.message : "Source error.";
        } else if (runtimeState === "stale" || runtimeState === "ready") {
          provenance = typeof entry.provenance === "string" && entry.provenance ? entry.provenance : null;
          message = typeof entry.message === "string" && entry.message ? entry.message : null;
        }

        return {
          pageId: targetPageId,
          label: label,
          dataSourceId: dataSourceId,
          state: runtimeState,
          glyph: GLYPHS[runtimeState] || GLYPHS.unconfigured,
          message: message,
          missingConfigKeys: missingConfigKeys,
          provenance: provenance,
          unconfiguredCopy: unconfiguredCopy
        };
      },

      rotationOrder: function () {
        return pages.slice();
      }
    };
  }

  return {
    createMirrorOsShell: createMirrorOsShell,
    PAGE_LABELS: PAGE_LABELS,
    PAGE_TO_SOURCE: PAGE_TO_SOURCE,
    GLYPHS: GLYPHS,
    FALLBACK_ROTATION_ORDER: FALLBACK_ROTATION_ORDER.slice()
  };
});
