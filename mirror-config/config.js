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
    }
  ]
};

if (typeof module !== "undefined") {
  module.exports = config;
}
