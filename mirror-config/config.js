let config = {
  address: "0.0.0.0",
  port: 8080,
  basePath: "/",
  ipWhitelist: [],
  useHttps: false,
  language: "en",
  locale: "en-US",
  units: "imperial",
  timeFormat: 12,

  modules: [
    {
      module: "alert"
    },
    {
      module: "updatenotification",
      position: "top_bar"
    },
    {
      module: "clock",
      position: "top_left"
    },
    {
      module: "MMM-AgentSurface",
      position: "top_right",
      config: {
        title: "Agent Surface",
        maxThreads: 6,
        staleAfterMs: 300 * 1000,
        mirrorOs: {
          pages: ["home", "agents", "calendar", "weather", "path", "sports"],
          initialPage: "home",
          pageState: {
            currentPageId: "home",
            rotationPaused: false,
            lastCommandSource: "system"
          },
          rotation: {
            intervalSeconds: 45
          },
          dataSources: {
            agentSnapshot: {
              requiredConfigKeys: ["snapshot.source.kind", "snapshot.source.label"],
              refreshIntervalSeconds: 60,
              staleAfterSeconds: 300,
              unconfiguredCopy: "Upload an agent snapshot with source.kind and source.label before showing agent work."
            },
            calendarIcs: {
              requiredConfigKeys: ["MIRROR_CALENDAR_ICS_URL"],
              refreshIntervalSeconds: 300,
              staleAfterSeconds: 900,
              unconfiguredCopy: "Set MIRROR_CALENDAR_ICS_URL to an ICS feed before showing calendar events."
            },
            openMeteo: {
              requiredConfigKeys: ["MIRROR_WEATHER_LATITUDE", "MIRROR_WEATHER_LONGITUDE"],
              refreshIntervalSeconds: 900,
              staleAfterSeconds: 2700,
              unconfiguredCopy: "Set MIRROR_WEATHER_LATITUDE and MIRROR_WEATHER_LONGITUDE before showing weather."
            },
            pathGtfsRealtime: {
              requiredConfigKeys: ["MIRROR_PATH_GTFS_RT_URL", "MIRROR_PATH_STATION_ID"],
              refreshIntervalSeconds: 30,
              staleAfterSeconds: 120,
              unconfiguredCopy: "Set MIRROR_PATH_GTFS_RT_URL and MIRROR_PATH_STATION_ID before showing PATH train status."
            },
            sportsScoreboard: {
              requiredConfigKeys: ["MIRROR_SPORTS_LEAGUES", "MIRROR_SPORTS_TEAMS"],
              refreshIntervalSeconds: 300,
              staleAfterSeconds: 900,
              unconfiguredCopy: "Set MIRROR_SPORTS_LEAGUES and MIRROR_SPORTS_TEAMS before showing sports scores."
            }
          }
        }
      }
    }
  ]
};

if (typeof module !== "undefined") {
  module.exports = config;
}
