import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { createProviderNodeServer } from "./server.mjs";
import { createRequestSignature } from "./signing.mjs";

const NODE_ID = "test-node-01";
const SECRET = "test-only-secret-that-is-longer-than-thirty-two-characters";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}

async function fixture(t) {
  let upstreamCalls = 0;
  let receivedJob = null;

  const upstream = createServer(async (req, res) => {
    upstreamCalls += 1;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    receivedJob = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    if (req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }

    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n');
    res.end("data: [DONE]\n\n");
  });

  const upstreamPort = await listen(upstream);
  const node = createProviderNodeServer({
    nodeId: NODE_ID,
    secret: SECRET,
    allowedModels: new Set(["community/test-model"]),
    upstreamBaseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
    maxConcurrent: 2,
    requestTimeoutMs: 10_000,
    port: 8787
  });
  const nodePort = await listen(node);
  const baseUrl = `http://127.0.0.1:${nodePort}`;

  t.after(async () => {
    await Promise.all([close(node), close(upstream)]);
  });

  function signedHeaders(path, method, rawBody = "", nonce = randomBytes(18).toString("hex")) {
    const timestamp = String(Date.now());
    return {
      "x-aveiro-node-id": NODE_ID,
      "x-aveiro-timestamp": timestamp,
      "x-aveiro-nonce": nonce,
      "x-aveiro-signature": createRequestSignature({
        method,
        path,
        timestamp,
        nonce,
        nodeId: NODE_ID,
        body: rawBody,
        secret: SECRET
      })
    };
  }

  async function signedRequest(path, method = "GET", value, options = {}) {
    const rawBody = value === undefined ? "" : JSON.stringify(value);
    const headers = signedHeaders(path, method, rawBody, options.nonce);
    if (value !== undefined) headers["content-type"] = "application/json";
    return fetch(baseUrl + path, {
      method,
      headers,
      ...(value === undefined ? {} : { body: rawBody })
    });
  }

  return {
    baseUrl,
    signedHeaders,
    signedRequest,
    get upstreamCalls() { return upstreamCalls; },
    get receivedJob() { return receivedJob; }
  };
}

test("exposes only a minimal public health check", async (t) => {
  const f = await fixture(t);
  const response = await fetch(f.baseUrl + "/healthz");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "aveiro-provider-node"
  });
});

test("requires a valid signature for node capabilities", async (t) => {
  const f = await fixture(t);
  const response = await fetch(f.baseUrl + "/v1/node/capabilities");
  assert.equal(response.status, 401);
});

test("returns capabilities without exposing the shared secret", async (t) => {
  const f = await fixture(t);
  const response = await f.signedRequest("/v1/node/capabilities");
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.nodeId, NODE_ID);
  assert.equal(result.protocolVersion, 1);
  assert.deepEqual(result.models, ["community/test-model"]);
  assert.equal(result.maxConcurrent, 2);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
});

test("rejects a replayed signed nonce", async (t) => {
  const f = await fixture(t);
  const path = "/v1/node/capabilities";
  const headers = f.signedHeaders(path, "GET");
  const first = await fetch(f.baseUrl + path, { headers });
  const second = await fetch(f.baseUrl + path, { headers });
  assert.equal(first.status, 200);
  assert.equal(second.status, 401);
});

test("rejects a body changed after signing", async (t) => {
  const f = await fixture(t);
  const path = "/v1/node/infer";
  const original = JSON.stringify({
    requestId: "req-tamper",
    modelId: "community/test-model",
    messages: [{ role: "user", content: "original" }]
  });
  const changed = JSON.stringify({
    requestId: "req-tamper",
    modelId: "community/test-model",
    messages: [{ role: "user", content: "changed" }]
  });
  const headers = f.signedHeaders(path, "POST", original);
  headers["content-type"] = "application/json";
  const response = await fetch(f.baseUrl + path, {
    method: "POST",
    headers,
    body: changed
  });
  assert.equal(response.status, 401);
  assert.equal(f.upstreamCalls, 0);
});

test("rejects models outside the provider allowlist", async (t) => {
  const f = await fixture(t);
  const response = await f.signedRequest("/v1/node/infer", "POST", {
    requestId: "req-unapproved",
    modelId: "not-approved",
    messages: [{ role: "user", content: "hello" }]
  });
  assert.equal(response.status, 403);
  assert.equal(f.upstreamCalls, 0);
});

test("streams an approved model response from the local inference runtime", async (t) => {
  const f = await fixture(t);
  const response = await f.signedRequest("/v1/node/infer", "POST", {
    requestId: "req-stream",
    modelId: "community/test-model",
    messages: [{ role: "user", content: "hello" }]
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /^text\/event-stream/);
  assert.equal(
    await response.text(),
    'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n'
  );
  assert.deepEqual(f.receivedJob, {
    model: "community/test-model",
    messages: [{ role: "user", content: "hello" }],
    stream: true
  });
  assert.equal(f.upstreamCalls, 1);
});
