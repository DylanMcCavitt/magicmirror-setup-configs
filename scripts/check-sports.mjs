#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const provider = require(path.join(repoRoot, "custom_modules/MMM-AgentSurface/providers/sports-espn.js"));
const providerIndex = require(path.join(repoRoot, "custom_modules/MMM-AgentSurface/providers/index.js"));

let scenarios = 0;
function scenario(_name, run) {
  scenarios += 1;
  return run();
}

const NOW = new Date("2026-07-01T12:00:00.000Z");

const LIVE_STATUS = {
  period: 3,
  displayClock: "4:12",
  type: { name: "STATUS_IN_PROGRESS", state: "in", description: "In Progress" }
};
const FINAL_STATUS = {
  type: { name: "STATUS_FINAL", state: "post", completed: true, description: "Final", shortDetail: "Final" }
};
const UPCOMING_STATUS = {
  type: { name: "STATUS_SCHEDULED", state: "pre", description: "Scheduled" }
};

function competitor(homeAway, abbreviation, displayName, score = "0") {
  return {
    homeAway,
    score,
    team: {
      abbreviation,
      displayName,
      shortDisplayName: displayName.split(" ").slice(-1)[0],
      name: displayName.split(" ").slice(-1)[0]
    }
  };
}

function eventFixture(overrides = {}) {
  const home = overrides.home || competitor("home", "CLE", "Cleveland Browns", "21");
  const away = overrides.away || competitor("away", "PIT", "Pittsburgh Steelers", "17");
  return {
    id: overrides.id || "fixture-game",
    date: overrides.date || "2026-07-01T23:05:00Z",
    status: overrides.status || UPCOMING_STATUS,
    competitions: [{ competitors: [home, away] }]
  };
}

function scoreboard(events) {
  return { events };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

try {
  await scenario("provider is registered", () => {
    assert.ok(providerIndex.some((entry) => entry.dataSourceId === "sportsScoreboard"));
    assert.equal(provider.dataSourceId, "sportsScoreboard");
    assert.equal(provider.refreshIntervalSeconds, 300);
  });

  await scenario("missing config resolves unconfigured", async () => {
    assert.deepEqual(await provider.collect({}), { dataSourceId: "sportsScoreboard", state: "unconfigured" });
    assert.deepEqual(await provider.collect({ MIRROR_SPORTS_LEAGUES: "nfl", MIRROR_SPORTS_TEAMS: " " }), { dataSourceId: "sportsScoreboard", state: "unconfigured" });
    assert.equal(provider.readConfig({ MIRROR_SPORTS_LEAGUES: " ", MIRROR_SPORTS_TEAMS: "CLE" }), null);
  });

  await scenario("unknown league selector errors with valid selectors", async () => {
    let fetchCalled = false;
    const result = await provider.collect(
      { MIRROR_SPORTS_LEAGUES: "nfl, nhl", MIRROR_SPORTS_TEAMS: "CLE" },
      { fetch: async () => { fetchCalled = true; } }
    );
    assert.equal(fetchCalled, false, "invalid league config must fail before network");
    assert.equal(result.state, "error");
    assert.match(result.message, /nhl/);
    assert.match(result.message, /Valid selectors: nfl, mlb, nba/);
  });

  await scenario("all-fetch failure is sanitized", async () => {
    const secretBase = "https://example.test/private-token/apis";
    const result = await provider.collect(
      {
        MIRROR_SPORTS_LEAGUES: "nfl, nba",
        MIRROR_SPORTS_TEAMS: "CLE",
        MIRROR_SPORTS_SOURCE_URL: secretBase
      },
      {
        fetch: async () => {
          throw new Error("network failed for " + secretBase);
        },
        now: NOW
      }
    );
    assert.equal(result.state, "error");
    assert.match(result.message, /nfl, nba/);
    assert.ok(!JSON.stringify(result).includes("private-token"), "error payload must not leak configured URL values");
  });

  await scenario("team filtering stays inside configured leagues", async () => {
    const requests = [];
    const fetchByLeague = async (url) => {
      requests.push(url);
      if (url.includes("/football/nfl/scoreboard")) {
        return response(scoreboard([
          eventFixture({ id: "browns", home: competitor("home", "CLE", "Cleveland Browns", "24"), away: competitor("away", "PIT", "Pittsburgh Steelers", "14") }),
          eventFixture({ id: "non-cle-nfl", home: competitor("home", "DAL", "Dallas Cowboys"), away: competitor("away", "NYG", "New York Giants") })
        ]));
      }
      if (url.includes("/basketball/nba/scoreboard")) {
        return response(scoreboard([
          eventFixture({ id: "cavs", home: competitor("home", "CLE", "Cleveland Cavaliers", "101"), away: competitor("away", "NYK", "New York Knicks", "98") }),
          eventFixture({ id: "non-cle-nba", home: competitor("home", "LAL", "Los Angeles Lakers"), away: competitor("away", "BOS", "Boston Celtics") })
        ]));
      }
      throw new Error("unexpected URL " + url);
    };

    const both = await provider.collect({ MIRROR_SPORTS_LEAGUES: "nfl,nba", MIRROR_SPORTS_TEAMS: "CLE" }, { fetch: fetchByLeague, now: NOW });
    assert.equal(both.state, "ready");
    assert.deepEqual(both.data.games.map((game) => game.league).sort(), ["NBA", "NFL"]);

    requests.length = 0;
    const nflOnly = await provider.collect({ MIRROR_SPORTS_LEAGUES: "nfl", MIRROR_SPORTS_TEAMS: "CLE" }, { fetch: fetchByLeague, now: NOW });
    assert.equal(nflOnly.state, "ready");
    assert.deepEqual(nflOnly.data.games.map((game) => game.league), ["NFL"]);
    assert.equal(requests.length, 1);
    assert.match(requests[0], /\/football\/nfl\/scoreboard$/);
  });

  await scenario("status normalization handles live final and upcoming", () => {
    assert.deepEqual(provider.normalizeStatus(LIVE_STATUS, "2026-07-01T23:05:00.000Z", "America/New_York"), { status: "live", statusDetail: "Q3 4:12" });
    assert.deepEqual(provider.normalizeStatus(FINAL_STATUS, "2026-06-30T23:05:00.000Z", "America/New_York"), { status: "final", statusDetail: "Final" });
    const upcoming = provider.normalizeStatus(UPCOMING_STATUS, "2026-07-01T23:05:00.000Z", "America/New_York");
    assert.equal(upcoming.status, "upcoming");
    assert.match(upcoming.statusDetail, /7:05/);
  });

  await scenario("partial league failure returns ready warnings", async () => {
    const result = await provider.collect(
      { MIRROR_SPORTS_LEAGUES: "nfl, nba", MIRROR_SPORTS_TEAMS: "CLE" },
      {
        fetch: async (url) => {
          if (url.includes("/football/nfl/scoreboard")) {
            return response(scoreboard([eventFixture({ status: LIVE_STATUS })]));
          }
          throw new Error("nba backend failed at https://secret.example/nba");
        },
        now: NOW
      }
    );
    assert.equal(result.state, "ready");
    assert.deepEqual(result.data.warnings, ["nba"]);
    assert.equal(result.data.games.length, 1);
    assert.ok(!JSON.stringify(result).includes("secret.example"));
  });

  await scenario("successful collect emits contract fields and sorted capped games", async () => {
    const events = [
      eventFixture({ id: "old-final", date: "2026-06-30T23:05:00Z", status: FINAL_STATUS, home: competitor("home", "NYY", "New York Yankees", "5"), away: competitor("away", "BOS", "Boston Red Sox", "3") }),
      eventFixture({ id: "upcoming-later", date: "2026-07-03T23:05:00Z", status: UPCOMING_STATUS, home: competitor("home", "NYY", "New York Yankees", "0"), away: competitor("away", "TOR", "Toronto Blue Jays", "0") }),
      eventFixture({ id: "live", date: "2026-07-01T23:05:00Z", status: LIVE_STATUS, home: competitor("home", "NYY", "New York Yankees", "4"), away: competitor("away", "BAL", "Baltimore Orioles", "2") }),
      eventFixture({ id: "upcoming-sooner", date: "2026-07-02T23:05:00Z", status: UPCOMING_STATUS, home: competitor("home", "NYY", "New York Yankees", "0"), away: competitor("away", "TB", "Tampa Bay Rays", "0") })
    ];

    const result = await provider.collect(
      {
        MIRROR_SPORTS_LEAGUES: "mlb",
        MIRROR_SPORTS_TEAMS: "NYY",
        MIRROR_SPORTS_TIMEZONE: "America/New_York"
      },
      {
        fetch: async (url) => {
          assert.match(url, /\/baseball\/mlb\/scoreboard$/);
          return response(scoreboard(events));
        },
        now: NOW
      }
    );

    assert.equal(result.dataSourceId, "sportsScoreboard");
    assert.equal(result.state, "ready");
    assert.equal(result.source, "espn");
    assert.equal(result.updatedAt, NOW.toISOString());
    assert.equal(result.data.timezone, "America/New_York");
    assert.equal(result.data.games.length, 4);
    assert.deepEqual(result.data.games.map((game) => game.status), ["live", "upcoming", "upcoming", "final"]);
    assert.deepEqual(result.data.games[0].homeTeam, { abbr: "NYY", name: "New York Yankees", score: "4" });
    assert.equal(result.data.games[0].startsAt, "2026-07-01T23:05:00.000Z");
  });

  console.log(JSON.stringify({ ok: true, scenarios }));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
