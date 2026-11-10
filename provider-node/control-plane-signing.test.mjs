import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { verifyRequestSignature } from "./signing.mjs";

const source = await readFile(new URL("../lib/community-node.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;
const moduleUrl = "data:text/javascript;base64," + Buffer.from(compiled).toString("base64");
const community = await import(moduleUrl);

const SECRET = "test-only-secret-that-is-longer-than-thirty-two-characters";

test("control-plane signer and provider-node verifier use the same protocol", () => {
  const config = community.getCommunityNodeConfig({
    AVEIRO_PROVIDER_NODE_URL: "https://provider.example.net",
    AVEIRO_NODE_ID: "test-node-01",
    AVEIRO_NODE_SECRET: SECRET,
    AVEIRO_COMMUNITY_MODEL_ID: "community/test-model",
    AVEIRO_COMMUNITY_MODEL_NAME: "Test community model"
  });

  assert.ok(config);
  assert.equal(config.modelId, "community/test-model");
  assert.equal(config.modelName, "Test community model");
  assert.equal(
    community.communityNodeEndpoint(config, "/v1/node/infer"),
    "https://provider.example.net/v1/node/infer"
  );

  const path = "/v1/node/infer";
  const body = JSON.stringify({
    requestId: "req-compatible",
    modelId: config.modelId,
    messages: [{ role: "user", content: "test" }]
  });
  const headers = community.signCommunityNodeRequest(config, "POST", path, body);

  assert.equal(verifyRequestSignature({
    signature: headers["X-Aveiro-Signature"],
    method: "POST",
    path,
    timestamp: headers["X-Aveiro-Timestamp"],
    nonce: headers["X-Aveiro-Nonce"],
    nodeId: headers["X-Aveiro-Node-Id"],
    body,
    secret: SECRET
  }), true);
});

test("community node config refuses partial and insecure remote settings", () => {
  assert.throws(() => community.getCommunityNodeConfig({
    AVEIRO_NODE_ID: "test-node-01"
  }));

  assert.throws(() => community.getCommunityNodeConfig({
    AVEIRO_PROVIDER_NODE_URL: "http://provider.example.net",
    AVEIRO_NODE_ID: "test-node-01",
    AVEIRO_NODE_SECRET: SECRET,
    AVEIRO_COMMUNITY_MODEL_ID: "community/test-model"
  }));
});

test("community node config allows loopback HTTP for local development", () => {
  const config = community.getCommunityNodeConfig({
    AVEIRO_PROVIDER_NODE_URL: "http://127.0.0.1:8787",
    AVEIRO_NODE_ID: "test-node-01",
    AVEIRO_NODE_SECRET: SECRET,
    AVEIRO_COMMUNITY_MODEL_ID: "community/test-model"
  });
  assert.equal(config?.baseUrl, "http://127.0.0.1:8787");
});
