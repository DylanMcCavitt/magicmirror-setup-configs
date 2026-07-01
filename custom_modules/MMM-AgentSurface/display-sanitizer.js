(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.MMMAgentSurfaceDisplaySanitizer = api;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null, function () {
  "use strict";

  var ALLOWED_THREAD_FIELDS = [
    "id",
    "title",
    "status",
    "project",
    "issueId",
    "prId",
    "workstreamId",
    "agent",
    "repo",
    "branch",
    "phase",
    "updatedAt",
    "blocker",
    "lastMessage"
  ];

  function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isValidDateString(value) {
    return typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value));
  }

  function nonNegativeInteger(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number < 0) return 0;
    return Math.floor(number);
  }

  function stripTerminalEscapes(value) {
    return value
      .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, " ")
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, " ")
      .replace(/\u009b[0-?]*[ -/]*[@-~]/g, " ")
      .replace(/[\x1b\u009b]/g, " ")
      .replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
  }

  function stripHtml(value) {
    return value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ");
  }

  function looksLikePathFragment(value) {
    return /(^|\/)(Users|home|private|tmp|var)\//i.test(value) || /^[A-Za-z]:[\\/]/.test(value);
  }

  function redactSecrets(value) {
    return value
      .replace(/\bBearer\s+[^\s<>&"']+/gi, "Bearer [redacted]")
      .replace(/\b(?:sk-[A-Za-z0-9_-]{10,}|gh[po]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,}|xox[a-z]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){0,2})\b/g, "[redacted]")
      .replace(/\b(key|token|secret|password)=([^\s&;]+)/gi, function (_match, key) {
        return key + "=[redacted]";
      })
      .replace(/\b[A-Za-z0-9+/_-]{24,}\b/g, function (match) {
        if (looksLikePathFragment(match)) return match;
        return "[redacted]";
      });
  }

  function redactEmails(value) {
    return value.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, function (match, offset, fullText) {
      var tokenStart = fullText.lastIndexOf(" ", offset) + 1;
      var prefix = fullText.slice(tokenStart, offset);
      if (/https?:\/\/[^\s]*$/i.test(prefix)) return match;
      return "[email]";
    });
  }

  var SECRET_RUN_PATTERN = /^[A-Za-z0-9+/]{24,}$/;

  function safeBasename(path) {
    var normalized = String(path).replace(/[\\/]+$/g, "");
    var parts = normalized.split(/[\\/]+/).filter(function (part) {
      return part.length > 0;
    });
    var last = parts[parts.length - 1] || "";
    if (!last) return "[path]";
    // A bare home root (/Users/dylan, /home/pi, C:\Users\x) would leak the account name.
    if (parts.length <= 2 && /^(?:Users|home)$/i.test(parts[0] || "")) return "[home]";
    if (parts.length <= 3 && /^[A-Za-z]:$/.test(parts[0] || "") && /^(?:Users|home)$/i.test(parts[1] || "")) return "[home]";
    // A basename that is itself a secret-shaped token must not survive path reduction.
    if (SECRET_RUN_PATTERN.test(last)) return "[redacted]";
    return last;
  }

  function redactPaths(value) {
    return value
      .replace(/\b[A-Za-z]:\\(?:[^\\\s<>:"|?*]+\\)*[^\\\s<>:"|?*]*/g, function (match) {
        return safeBasename(match);
      })
      .replace(/\/(?:Users|home|private|tmp|var)\/[^\s<>'")]+/g, function (match) {
        return safeBasename(match);
      });
  }

  function sanitizeUrl(match) {
    try {
      var parsed = new URL(match);
      // Origin only: URL paths can smuggle encoded local paths or identifiers.
      return parsed.protocol + "//" + parsed.host;
    } catch (_error) {
      return "[link]";
    }
  }

  function stripUrlCredentials(value) {
    return value.replace(/\bhttps?:\/\/[^\s<>'"]*/gi, sanitizeUrl);
  }

  function truncate(value, maxLength) {
    var limit = Number(maxLength);
    if (!Number.isFinite(limit) || limit < 1) return value;
    if (value.length <= limit) return value;
    if (limit === 1) return "…";
    return value.slice(0, limit - 1).trimEnd() + "…";
  }

  function sanitizeDisplayText(value, options) {
    var settings = options || {};
    var maxLength = settings.maxLength === undefined ? 160 : settings.maxLength;
    var fallback = settings.fallback === undefined ? null : settings.fallback;

    if (typeof value !== "string" || !value.trim()) return fallback;

    var sanitized = stripTerminalEscapes(value);
    sanitized = stripHtml(sanitized);
    sanitized = redactSecrets(sanitized);
    sanitized = redactEmails(sanitized);
    sanitized = redactPaths(sanitized);
    sanitized = stripUrlCredentials(sanitized);
    sanitized = sanitized.replace(/\s+/g, " ").trim();
    sanitized = truncate(sanitized, maxLength);

    return sanitized ? sanitized : fallback;
  }

  function addSanitizedField(target, source, key, maxLength) {
    var value = sanitizeDisplayText(source[key], { maxLength: maxLength, fallback: null });
    if (value !== null) target[key] = value;
  }

  function sanitizeThreadForDisplay(thread) {
    if (!isPlainObject(thread)) return null;

    var output = {};
    var project = sanitizeDisplayText(thread.project, { maxLength: 80, fallback: null });
    var issueId = sanitizeDisplayText(thread.issueId, { maxLength: 80, fallback: null });
    var titleFallback = project ? (issueId ? project + " · " + issueId : project) : "Untitled work item";
    var title = sanitizeDisplayText(thread.title, { maxLength: 120, fallback: titleFallback });

    ALLOWED_THREAD_FIELDS.forEach(function (key) {
      if (key === "title" || key === "updatedAt" || key === "blocker" || key === "lastMessage" || key === "project" || key === "issueId") return;
      addSanitizedField(output, thread, key, 80);
    });

    if (project !== null) output.project = project;
    if (issueId !== null) output.issueId = issueId;
    output.title = title;

    if (isValidDateString(thread.updatedAt)) output.updatedAt = thread.updatedAt;
    addSanitizedField(output, thread, "blocker", 200);
    addSanitizedField(output, thread, "lastMessage", 200);

    return output;
  }

  function sanitizeSnapshotForDisplay(snapshot) {
    if (!isPlainObject(snapshot)) return null;

    var generatedAt = isValidDateString(snapshot.generatedAt) ? snapshot.generatedAt : null;
    var source = isPlainObject(snapshot.source) ? snapshot.source : {};
    var summary = isPlainObject(snapshot.summary) ? snapshot.summary : {};
    var threads = Array.isArray(snapshot.threads) ? snapshot.threads : [];

    return {
      generatedAt: generatedAt,
      source: {
        kind: sanitizeDisplayText(source.kind, { maxLength: 60, fallback: null }),
        label: sanitizeDisplayText(source.label, { maxLength: 60, fallback: "unknown source" })
      },
      summary: {
        activeCount: nonNegativeInteger(summary.activeCount),
        blockedCount: nonNegativeInteger(summary.blockedCount),
        completedCount: nonNegativeInteger(summary.completedCount)
      },
      threads: threads.map(sanitizeThreadForDisplay).filter(Boolean).slice(0, 32)
    };
  }

  return {
    sanitizeSnapshotForDisplay: sanitizeSnapshotForDisplay,
    sanitizeThreadForDisplay: sanitizeThreadForDisplay,
    sanitizeDisplayText: sanitizeDisplayText
  };
});
