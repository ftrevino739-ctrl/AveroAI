import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { startControlPlaneHeartbeat } from "./control-plane-heartbeat.mjs";
import { verifyRequestSignature } from "./signing.mjs";

const NODE_ID = "avn_0123456789abcdefabcd";
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
    server.close(resolve);
    server.closeAllConnections?.();
  });
}

test("sends a signed heartbeat without user prompts or provider secrets", async (t) => {
  let received = null;
  const controlPlane = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    received = {
      method: req.method,
      path: req.url,
      headers: req.headers,
      rawBody,
      body: JSON.parse(rawBody)
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ accepted: true, ready: true }));
  });
  const port = await listen(controlPlane);
  t.after(() => close(controlPlane));

  const heartbeat = startControlPlaneHeartbeat({
    controlPlaneUrl: `http://127.0.0.1:${port}`,
    nodeId: NODE_ID,
    secret: SECRET,
    intervalMs: 60_000,
    getSnapshot: async () => ({
      models: ["community/test-model"],
      activeJobs: 1,
      maxConcurrent: 2,
      runtime: "openai-compatible-http",
      runtimeStatus: "ready"
    })
  });
  t.after(() => heartbeat.stop());

  for (let attempt = 0; attempt < 20 && !received; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.ok(received);
  assert.equal(received.method, "POST");
  assert.equal(received.path, "/api/provider-nodes/heartbeat");
  assert.equal(received.body.nodeId, NODE_ID);
  assert.deepEqual(received.body.models, ["community/test-model"]);
  assert.equal(received.body.activeJobs, 1);
  assert.equal(received.rawBody.includes(SECRET), false);
  assert.equal(received.rawBody.includes("user"), false);
  assert.equal(
    verifyRequestSignature({
      signature: received.headers["x-aveiro-signature"],
      method: received.method,
      path: received.path,
      timestamp: received.headers["x-aveiro-timestamp"],
      nonce: received.headers["x-aveiro-nonce"],
      nodeId: NODE_ID,
      body: received.rawBody,
      secret: SECRET
    }),
    true
  );
});
