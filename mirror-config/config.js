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
        staleAfterSeconds: 300
      }
    }
  ]
};

if (typeof module !== "undefined") {
  module.exports = config;
}
