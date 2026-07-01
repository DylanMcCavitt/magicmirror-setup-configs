// Data-source providers polled by node_helper. Append new providers here;
// each exports { dataSourceId, refreshIntervalSeconds, collect(env, deps) }.
module.exports = [
  require("./calendar-ics.js")
];
