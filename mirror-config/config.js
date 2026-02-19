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
      module: "MMM-MotionWake",
      position: "fullscreen_above",
      config: {
        gpioPin: 17,
        pollIntervalMs: 700,
        sleepStartHour: 1,
        wakeHour: 6,
        greetingText: "Good Morning, Bella :)",
        greetingDurationMs: 5200,
        transitionMs: 700,
        testMode: true,
        debug: false
      }
    },
    {
      module: "MMM-PageDeck",
      position: "top_center",
      classes: "panel-pages-indicator",
      config: {
        pages: [
          { id: "main", label: "Air" },
          { id: "space", label: "Launches" },
          { id: "moon", label: "Moon" }
        ],
        pageDurationMs: 10000,
        initialDelayMs: 4500,
        transitionMs: 700,
        showPageLabel: true,
        pauseOnSleep: true
      }
    },
    {
      module: "clock",
      position: "top_left",
      classes: "panel panel-clock",
      config: {
        displayType: "digital",
        showWeek: false,
        displaySeconds: false
      }
    },
    {
      module: "calendar",
      header: "This Week",
      position: "top_left",
      classes: "panel panel-calendar",
      config: {
        maximumEntries: 5,
        maximumNumberOfDays: 45,
        fade: true,
        fadePoint: 0.7,
        calendars: [
          {
            symbol: "calendar-check",
            url: "https://ics.calendarlabs.com/76/mm3137/US_Holidays.ics"
          }
        ]
      }
    },
    {
      module: "weather",
      position: "top_right",
      header: "Now",
      classes: "panel panel-weather-now",
      config: {
        weatherProvider: "openmeteo",
        type: "current",
        lat: 40.7081,
        lon: -73.9571,
        roundTemp: true,
        showFeelsLike: true,
        showHumidity: false,
        showSun: false,
        showMoon: false,
        showLocation: false
      }
    },
    {
      module: "MMM-AirPulse",
      position: "bottom_left",
      header: "Air",
      classes: "panel panel-air page-main",
      config: {
        title: "Air",
        lat: 40.7081,
        lon: -73.9571,
        refreshInterval: 15 * 60 * 1000
      }
    },
    {
      module: "MMM-SpaceLaunch",
      position: "bottom_left",
      header: "Space",
      classes: "panel panel-space-launch page-space",
      config: {
        title: "Space",
        refreshInterval: 20 * 60 * 1000,
        limit: 3
      }
    },
    {
      module: "MMM-SpaceWatch",
      position: "bottom_left",
      header: "Moon Phases",
      classes: "panel panel-space page-moon",
      config: {
        title: "",
        refreshInterval: 30 * 60 * 1000,
        showISS: false,
        showNextPhases: true,
        showApod: false,
        nasaApiKey: "DEMO_KEY"
      }
    },
    {
      module: "MMM-SubwayL",
      position: "bottom_right",
      header: "L Train",
      classes: "panel panel-subway",
      config: {
        title: "L Train",
        mtaApiKey: "",
        refreshInterval: 30000,
        maxResults: 4,
        stops: [
          {
            id: "L06N",
            label: "Toward 8 Av"
          },
          {
            id: "L06S",
            label: "Toward Canarsie"
          }
        ],
        fallbackTimes: [
          {
            label: "Toward 8 Av",
            minutes: 4
          },
          {
            label: "Toward Canarsie",
            minutes: 7
          }
        ],
        enableRowClick: true,
        clickUrl: "https://new.mta.info/"
      }
    }
  ]
};

if (typeof module !== "undefined") {
  module.exports = config;
}
