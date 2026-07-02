(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MMMAgentSurfaceHomeView = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null, function () {
  "use strict";

  var DEFAULT_DWELL_SECONDS = 45;

  var PAGE_LABELS = {
    home: "Home",
    agents: "Agents",
    calendar: "Calendar",
    weather: "Weather",
    path: "PATH",
    sports: "Sports"
  };

  var STATUS_GLYPHS = {
    ready: "·",
    stale: "△",
    error: "!",
    unconfigured: "□",
    summary: "·"
  };

  var KNOWN_STATES = {
    ready: true,
    stale: true,
    error: true,
    unconfigured: true,
    summary: true
  };

  function isPlainObject(value) {
    return !!value && Object.prototype.toString.call(value) === "[object Object]";
  }

  function cleanString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function dateFrom(value) {
    var date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function formatDateLine(value) {
    var date = dateFrom(value);
    if (!date) return "";

    var options = { weekday: "long", month: "long", day: "numeric" };
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      try {
        return new Intl.DateTimeFormat(undefined, options).format(date);
      } catch (error) {
        // Fall through to the platform locale formatter below.
      }
    }

    return date.toLocaleDateString(undefined, options);
  }

  function pageLabel(pageId) {
    var id = cleanString(pageId);
    return PAGE_LABELS[id] || id;
  }

  function normalizeRotationOrder(rotationOrder) {
    if (!Array.isArray(rotationOrder)) return [];

    return rotationOrder.reduce(function (pages, pageId) {
      var cleanId = cleanString(pageId);
      if (cleanId) pages.push(cleanId);
      return pages;
    }, []);
  }

  function normalizeDwellSeconds(value) {
    var seconds = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_DWELL_SECONDS;
    return Math.max(5, Math.round(seconds));
  }

  function deriveNextPage(rotationOrder, currentPageId) {
    var pages = normalizeRotationOrder(rotationOrder);
    if (pages.length === 0) return { id: "", label: "" };

    var index = pages.indexOf(cleanString(currentPageId));
    var nextId = pages[(index + 1 + pages.length) % pages.length];
    return {
      id: nextId,
      label: pageLabel(nextId)
    };
  }

  function normalizeSourceRows(sourceStates) {
    if (!Array.isArray(sourceStates)) return [];

    return sourceStates.reduce(function (rows, sourceState) {
      if (!isPlainObject(sourceState)) return rows;

      var rawState = cleanString(sourceState.state);
      var state = KNOWN_STATES[rawState] ? rawState : "unconfigured";
      var id = cleanString(sourceState.pageId) || cleanString(sourceState.id) || cleanString(sourceState.dataSourceId);
      var label = cleanString(sourceState.label) || pageLabel(id);
      if (!label) return rows;

      rows.push({
        id: id || label,
        label: label,
        state: state,
        glyph: cleanString(sourceState.glyph) || STATUS_GLYPHS[state] || "?"
      });
      return rows;
    }, []);
  }

  function deriveHomeView(input) {
    var options = isPlainObject(input) ? input : {};
    var rows = normalizeSourceRows(options.sourceStates);
    var readyCount = rows.reduce(function (count, row) {
      return count + (row.state === "ready" ? 1 : 0);
    }, 0);
    var nextPage = deriveNextPage(options.rotationOrder, options.currentPageId);

    return {
      dateLine: formatDateLine(Object.prototype.hasOwnProperty.call(options, "now") ? options.now : new Date()),
      label: cleanString(isPlainObject(options.homeConfig) ? options.homeConfig.label : ""),
      nextPage: {
        id: nextPage.id,
        label: nextPage.label,
        dwellSeconds: normalizeDwellSeconds(options.dwellSeconds)
      },
      readiness: {
        readyCount: readyCount,
        totalCount: rows.length,
        rows: rows
      }
    };
  }

  return {
    deriveHomeView: deriveHomeView,
    PAGE_LABELS: PAGE_LABELS,
    STATUS_GLYPHS: STATUS_GLYPHS
  };
});
