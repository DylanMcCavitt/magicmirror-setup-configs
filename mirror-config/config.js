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
      module: "weather",
      position: "top_right",
      header: "Next Up",
      classes: "panel panel-weather-forecast",
      config: {
        weatherProvider: "openmeteo",
        type: "forecast",
        lat: 40.7081,
        lon: -73.9571,
        maxEntries: 3,
        colored: false,
        tableClass: "small",
        showLocation: false
      }
    },
    {
      module: "compliments",
      position: "bottom_left",
      classes: "love-line",
      config: {
        compliments: {
          anytime: [
            "you + me, always.",
            "built with love, for love.",
            "my favorite view is us."
          ]
        },
        updateInterval: 18000,
        fadeSpeed: 1200
      }
    },
    {
      module: "MMM-SpaceWatch",
      position: "bottom_left",
      header: "Moon Phases",
      classes: "panel panel-space",
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
