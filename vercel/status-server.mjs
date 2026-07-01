import http from "node:http";
import { normalizeAgentSnapshot, readBearerToken, summarizeSnapshot, timingSafeEqualString } from "../lib/agent-snapshot.mjs";

const serviceName = "magic-mirror-agent-control";
const startedAt = new Date();
const port = Number(process.env.PORT || 80);
const snapshotBodyLimitBytes = 256 * 1024;

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    let tooLarge = false;

    request.on("data", (chunk) => {
      if (tooLarge) return;
      received += chunk.length;
      if (received > snapshotBodyLimitBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(Object.assign(new Error("request_too_large"), { statusCode: 413, error: "request_too_large" }));
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error("invalid_json"), { statusCode: 400, error: "invalid_json" }));
      }
    });

    request.on("error", () => {
      reject(Object.assign(new Error("request_error"), { statusCode: 400, error: "request_error" }));
    });
  });
}

function isAuthorized(headers) {
  const expected = process.env.MIRROR_INGEST_TOKEN || "";
  return Boolean(expected) && timingSafeEqualString(readBearerToken(headers), expected);
}

function safeValidationErrors(errors) {
  return Array.isArray(errors) ? errors.map(String) : ["invalid_snapshot"];
}

async function handleAgentSnapshot(request, response) {
  if (!isAuthorized(request.headers)) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    if (!response.destroyed) {
      sendJson(response, error.statusCode || 400, { error: error.error || "invalid_request" });
    }
    return;
  }

  const receivedAt = new Date().toISOString();
  const result = normalizeAgentSnapshot(payload, { receivedAt });
  if (!result.ok) {
    sendJson(response, 400, {
      error: "invalid_snapshot",
      errors: safeValidationErrors(result.errors)
    });
    return;
  }

  sendJson(response, 202, {
    accepted: true,
    digest: result.snapshot.digest,
    receivedAt,
    summary: summarizeSnapshot(result.snapshot)
  });
}


function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/healthz")) {
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
    return;
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/status")) {
    const status = {
      service: serviceName,
      status: "ok",
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      ingestConfigured: Boolean(process.env.MIRROR_INGEST_TOKEN),
      timestamp: new Date().toISOString()
    };
    sendJson(response, 200, status);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/agent-snapshot") {
    await handleAgentSnapshot(request, response);
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
