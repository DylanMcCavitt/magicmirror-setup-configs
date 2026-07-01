import http from "node:http";

const serviceName = "magic-mirror-agent-control";
const startedAt = new Date();
const port = Number(process.env.PORT || 80);

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/status")) {
    sendJson(response, 200, {
      service: serviceName,
      status: "ok",
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
    return;
  }

  sendJson(response, 404, {
    error: "not_found"
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`${serviceName} listening on ${port}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received; closing HTTP server");
  server.close(() => {
    process.exit(0);
  });
});
