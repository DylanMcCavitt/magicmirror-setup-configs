/**
 * ESPN sports scoreboard provider.
 *
 * Fetches public ESPN scoreboard JSON for configured leagues and filters the
 * result down to configured teams. Fails closed: missing config ->
 * unconfigured, unknown selectors or total fetch failure -> sanitized error.
 */

const DATA_SOURCE_ID = "sportsScoreboard";
const REFRESH_INTERVAL_SECONDS = 300;
const SOURCE_LABEL = "espn";
const DEFAULT_SOURCE_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports";
const FETCH_TIMEOUT_MS = 15000;
const MAX_GAMES = 8;
const MAX_TEXT_LENGTH = 80;

const LEAGUE_SELECTORS = {
  nfl: { sport: "football", league: "nfl", label: "NFL" },
  mlb: { sport: "baseball", league: "mlb", label: "MLB" },
  nba: { sport: "basketball", league: "nba", label: "NBA" }
};

const VALID_LEAGUE_SELECTORS = Object.keys(LEAGUE_SELECTORS);

function cleanText(value) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const stripped = text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029]/g, "").trim();
  if (!stripped) return null;
  return stripped.length > MAX_TEXT_LENGTH ? stripped.slice(0, MAX_TEXT_LENGTH - 1) + "…" : stripped;
}

function parseCsv(value) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((entry) => cleanText(entry))
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values));
}

function normalizeKey(value) {
  const text = cleanText(value);
  return text ? text.toLowerCase() : null;
}

function readConfig(env) {
  const leagueSelectors = unique(parseCsv(env && env.MIRROR_SPORTS_LEAGUES).map((entry) => entry.toLowerCase()));
  const teams = unique(parseCsv(env && env.MIRROR_SPORTS_TEAMS));

  if (leagueSelectors.length === 0 || teams.length === 0) return null;

  const unknownLeagues = leagueSelectors.filter((selector) => !LEAGUE_SELECTORS[selector]);
  if (unknownLeagues.length > 0) {
    return {
      error: "Unknown sports league selector: " + unknownLeagues.join(", ") + ". Valid selectors: " + VALID_LEAGUE_SELECTORS.join(", ")
    };
  }

  const sourceBaseUrl = cleanText(env && env.MIRROR_SPORTS_SOURCE_URL) || DEFAULT_SOURCE_BASE_URL;
  return {
    leagueSelectors,
    teamSelectors: new Set(teams.map(normalizeKey).filter(Boolean)),
    sourceBaseUrl: sourceBaseUrl.replace(/\/+$/, ""),
    timezone: cleanText(env && env.MIRROR_SPORTS_TIMEZONE)
  };
}

function fetchOptions() {
  const options = { headers: { accept: "application/json" } };
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    options.signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  }
  return options;
}

function buildScoreboardUrl(sourceBaseUrl, leagueSelector) {
  const league = LEAGUE_SELECTORS[leagueSelector];
  return sourceBaseUrl.replace(/\/+$/, "") + "/" + league.sport + "/" + league.league + "/scoreboard";
}

function toIsoTimestamp(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function formatStartTime(startsAt, timezone) {
  const parsed = Date.parse(startsAt);
  if (!Number.isFinite(parsed)) return "Upcoming";

  const options = { hour: "numeric", minute: "2-digit" };
  if (timezone) options.timeZone = timezone;
  try {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(parsed));
  } catch (error) {
    delete options.timeZone;
    return new Intl.DateTimeFormat(undefined, options).format(new Date(parsed));
  }
}

function normalizeStatus(status, startsAt, timezone) {
  const statusObject = status && typeof status === "object" ? status : {};
  const type = statusObject.type && typeof statusObject.type === "object" ? statusObject.type : {};
  const name = (cleanText(type.name) || "").toUpperCase();
  const state = (cleanText(type.state) || "").toLowerCase();
  const description = cleanText(type.shortDetail) || cleanText(type.detail) || cleanText(type.description);

  if (type.completed === true || state === "post" || name.indexOf("FINAL") !== -1) {
    return { status: "final", statusDetail: description || "Final" };
  }

  if (state === "in" || name.indexOf("IN_PROGRESS") !== -1) {
    const period = Number(statusObject.period);
    const displayClock = cleanText(statusObject.displayClock);
    if (Number.isFinite(period) && period > 0 && displayClock) {
      return { status: "live", statusDetail: "Q" + period + " " + displayClock };
    }
    return { status: "live", statusDetail: description || "Live" };
  }

  return { status: "upcoming", statusDetail: formatStartTime(startsAt, timezone) };
}

function normalizeTeam(competitor) {
  const team = competitor && competitor.team && typeof competitor.team === "object" ? competitor.team : {};
  return {
    abbr: cleanText(team.abbreviation) || cleanText(team.shortDisplayName) || cleanText(team.name) || "--",
    name: cleanText(team.displayName) || cleanText(team.shortDisplayName) || cleanText(team.name) || "Unknown team",
    score: cleanText(competitor && competitor.score) || "0"
  };
}

function teamMatches(competitor, teamSelectors) {
  const team = competitor && competitor.team && typeof competitor.team === "object" ? competitor.team : {};
  const candidates = [team.abbreviation, team.displayName, team.shortDisplayName, team.name].map(normalizeKey).filter(Boolean);
  return candidates.some((candidate) => teamSelectors.has(candidate));
}

function normalizeScoreboard(scoreboard, options) {
  const selector = options.leagueSelector;
  const league = LEAGUE_SELECTORS[selector];
  const teamSelectors = options.teamSelectors;
  const timezone = options.timezone || null;
  const events = scoreboard && Array.isArray(scoreboard.events) ? scoreboard.events : [];
  const games = [];

  for (const event of events) {
    const competitions = event && Array.isArray(event.competitions) ? event.competitions : [];
    const competition = competitions[0];
    const competitors = competition && Array.isArray(competition.competitors) ? competition.competitors : [];
    const home = competitors.find((competitor) => competitor && competitor.homeAway === "home");
    const away = competitors.find((competitor) => competitor && competitor.homeAway === "away");
    if (!home || !away) continue;
    if (!teamMatches(home, teamSelectors) && !teamMatches(away, teamSelectors)) continue;

    const startsAt = toIsoTimestamp(event.date || competition.date);
    if (!startsAt) continue;

    const statusFields = normalizeStatus(event.status || competition.status, startsAt, timezone);
    games.push({
      league: league.label,
      homeTeam: normalizeTeam(home),
      awayTeam: normalizeTeam(away),
      status: statusFields.status,
      statusDetail: statusFields.statusDetail,
      startsAt
    });
  }

  return games;
}

function compareGames(left, right) {
  const statusOrder = { live: 0, upcoming: 1, final: 2 };
  const leftOrder = statusOrder[left.status] ?? 99;
  const rightOrder = statusOrder[right.status] ?? 99;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  if (left.status === "final" && right.status === "final") return right.startsAt.localeCompare(left.startsAt);
  return left.startsAt.localeCompare(right.startsAt);
}

async function collectLeague(config, leagueSelector, fetchImpl) {
  const response = await fetchImpl(buildScoreboardUrl(config.sourceBaseUrl, leagueSelector), fetchOptions());
  if (!response || !response.ok) {
    const status = response && response.status ? String(response.status) : "unknown";
    throw new Error("status " + status);
  }

  const scoreboard = await response.json();
  return normalizeScoreboard(scoreboard, {
    leagueSelector,
    teamSelectors: config.teamSelectors,
    timezone: config.timezone
  });
}

async function collect(env, deps = {}) {
  const config = readConfig(env || {});
  if (!config) return { dataSourceId: DATA_SOURCE_ID, state: "unconfigured" };
  if (config.error) return { dataSourceId: DATA_SOURCE_ID, state: "error", message: config.error };

  const fetchImpl = deps.fetch || fetch;
  const now = deps.now ? new Date(deps.now) : new Date();
  const games = [];
  const warnings = [];
  let fetchedLeagues = 0;

  for (const leagueSelector of config.leagueSelectors) {
    try {
      games.push(...await collectLeague(config, leagueSelector, fetchImpl));
      fetchedLeagues += 1;
    } catch (error) {
      warnings.push(leagueSelector);
    }
  }

  if (fetchedLeagues === 0) {
    return {
      dataSourceId: DATA_SOURCE_ID,
      state: "error",
      message: "Sports scoreboard fetch failed for: " + config.leagueSelectors.join(", ")
    };
  }

  const data = { games: games.sort(compareGames).slice(0, MAX_GAMES) };
  if (warnings.length > 0) data.warnings = warnings;
  if (config.timezone) data.timezone = config.timezone;

  return {
    dataSourceId: DATA_SOURCE_ID,
    state: "ready",
    source: SOURCE_LABEL,
    updatedAt: now.toISOString(),
    data
  };
}

module.exports = {
  dataSourceId: DATA_SOURCE_ID,
  refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS,
  collect,
  readConfig,
  normalizeScoreboard,
  normalizeStatus,
  buildScoreboardUrl,
  LEAGUE_SELECTORS
};
