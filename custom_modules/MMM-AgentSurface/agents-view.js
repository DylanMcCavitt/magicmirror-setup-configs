(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MMMAgentSurfaceAgentsView = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null, function () {
  "use strict";

  function isPlainObject(value) {
    return !!value && Object.prototype.toString.call(value) === "[object Object]";
  }

  function cleanText(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029]/g, "").trim();
  }

  function validIsoOrEmpty(value) {
    var text = cleanText(value);
    if (!text) return "";
    return Number.isFinite(Date.parse(text)) ? text : null;
  }

  function threadView(thread) {
    if (!isPlainObject(thread)) return null;

    var project = cleanText(thread.project);
    var title = cleanText(thread.title);
    if (!project && !title) return null;

    var updatedAt = validIsoOrEmpty(thread.updatedAt);
    if (updatedAt === null) return null;

    return {
      project: project || title,
      thread: {
        title: title || project,
        identifiers: [cleanText(thread.issueId), cleanText(thread.prId), cleanText(thread.workstreamId)].filter(Boolean).join(" / "),
        brief: cleanText(thread.lastMessage),
        status: cleanText(thread.status) || "unknown",
        updatedAt: updatedAt
      }
    };
  }

  function maxThreadCount(value) {
    if (value === undefined || value === null) return Infinity;
    var count = Math.floor(Number(value));
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  function deriveAgentsView(snapshot, options) {
    var threads = snapshot && Array.isArray(snapshot.threads) ? snapshot.threads : [];
    if (threads.length === 0) return { groups: [] };

    var maxThreads = maxThreadCount(options && options.maxThreads);
    if (maxThreads === 0) return { groups: [] };

    var groups = [];
    var groupByProject = Object.create(null);
    var accepted = 0;

    for (var index = 0; index < threads.length && accepted < maxThreads; index += 1) {
      var view = threadView(threads[index]);
      if (!view) continue;

      var group = groupByProject[view.project];
      if (!group) {
        group = { project: view.project, threads: [] };
        groupByProject[view.project] = group;
        groups.push(group);
      }

      group.threads.push(view.thread);
      accepted += 1;
    }

    return { groups: groups };
  }

  return {
    deriveAgentsView: deriveAgentsView
  };
});
