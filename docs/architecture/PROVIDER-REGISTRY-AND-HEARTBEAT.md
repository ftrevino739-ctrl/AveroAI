# Dynamic community provider registration and heartbeat

**Status:** registry, readiness heartbeat and first multi-node scheduler implementation. It has not been tested against a provisioned Redis instance or a real GPU provider.

## End-user contract

Normal Aveiro users remain browser-only. They do not install a Provider Node, runtime, CLI, extension or model, and they never receive node secrets. All setup in this document is for Aveiro operators and volunteer GPU providers.

## Control-plane storage

The registry uses an Upstash-compatible Redis REST endpoint. Configure these private server-side variables in the Aveiro hosting environment:

- `AVEIRO_REDIS_REST_URL`: HTTPS REST endpoint.
- `AVEIRO_REDIS_REST_TOKEN`: private REST token.
- `AVEIRO_NODE_SECRET_ENCRYPTION_KEY`: 32-byte key encoded as 64 hexadecimal characters. It encrypts each node's HMAC secret at rest.
- `AVEIRO_ADMIN_TOKEN`: random administrator bearer token, at least 32 characters.
- `AVEIRO_APPROVED_COMMUNITY_MODELS`: comma-separated exact model IDs that have passed the model-specific licence and deployment review.

Do not add these values to the browser, public variables, source code or Git. The registry fails closed when persistent storage or the encryption key is missing. There is no process-memory fallback.

## Admin API

All routes require `Authorization: Bearer <AVEIRO_ADMIN_TOKEN>`.

- `GET /api/admin/provider-nodes`: list sanitized node records and computed online/readiness states.
- `POST /api/admin/provider-nodes`: create a node. JSON body: `{"label":"Provider label","endpointUrl":"https://provider.example","allowedModels":["exact/model-id"]}`. `endpointUrl` must be a public HTTPS origin with no path, credentials or query string. The response returns the generated node ID and HMAC secret **once**. Store the secret securely and pass it only to the invited provider.
- `DELETE /api/admin/provider-nodes`: revoke a node. JSON body: `{"nodeId":"avn_..." }`. Future heartbeats are rejected.

The creation endpoint only accepts model IDs in `AVEIRO_APPROVED_COMMUNITY_MODELS`. Keep this list empty until each exact checkpoint, licence, commercial-use terms, runtime and serving requirements have been reviewed. The API must not be used to self-approve model licences.

## Provider heartbeat

A registered provider node sends a signed heartbeat to `POST /api/provider-nodes/heartbeat` every 30 seconds. Requests use the existing HMAC-SHA256 signature format, include a fresh timestamp and nonce, and are rejected when stale, replayed, revoked or outside the node's approved model allowlist.

The heartbeat reports only node ID, exact model IDs the local OpenAI-compatible runtime currently advertises, active jobs, concurrency and a coarse runtime readiness flag. It does not send user prompts, account identity, API keys or model weights. The shared secret is encrypted in Redis with AES-256-GCM and is never returned by the list endpoint.

A node is marked offline when its last valid heartbeat is older than 90 seconds. It is ready only when it is online and reports at least one currently approved model actually present in the runtime's `GET /v1/models` response. This is a readiness signal, not a benchmark or guarantee of quality. Removing a model ID from `AVEIRO_APPROVED_COMMUNITY_MODELS` removes it from the public model list and prevents new reservations even if a provider had previously been enrolled for it.

## Model catalogue and inference scheduler

`GET /api/providers` now queries the registry and publishes only exact model IDs on nodes with a fresh heartbeat, a ready runtime and a current entry in `AVEIRO_APPROVED_COMMUNITY_MODELS`. Dynamic community entries use an `aveiro-community:` ID prefix so they cannot collide with an official provider model ID.

When a user selects one of those IDs, `POST /api/chat` asks the registry for a matching node. A Redis Lua reservation checks the node record, revocation state, heartbeat age, approved/available exact model ID and current concurrency limit atomically before reserving a slot. The scheduler prefers the least-loaded eligible node using the latest heartbeat data. The inference request is signed with that node's HMAC secret and sent only to its stored HTTPS endpoint. The slot is released after the response stream ends, the client cancels, or an upstream error occurs; a 240-second Redis expiry prevents a permanently stuck reservation after a process crash.

No silent fallback is performed. When no node has the exact model and capacity, the gateway returns a clear 503 instead of switching to another model or a paid provider. This is a first-pass scheduler, not a distributed job queue: it does not retry another node after a dispatch failure, keep a durable job history, issue job-scoped short-lived tokens, or provide usage accounting. Provider node ingress must still be restricted to the Aveiro control plane using TLS and network controls.

## Current boundaries

This milestone creates an operator-only registry, signed readiness heartbeat, model catalogue discovery and a first multi-node scheduler. It still does **not**:
- retry another eligible node after a provider failure;
- provide a durable distributed job queue or job history;
- issue short-lived job-scoped credentials or remote attestation;
- meter tokens, account for credits, or settle provider rewards;
- provide public provider self-onboarding or an admin dashboard;
- automatically verify licences or guarantee prompt confidentiality.

The scheduler must remain restricted to invited providers until an actual Redis deployment, an HTTPS provider endpoint, an exact licence-reviewed model and a real GPU inference smoke test have all passed. The existing static single-node environment adapter remains as a legacy route. Do not admit unknown nodes or claim production readiness based on heartbeat-only tests.
