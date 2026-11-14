# Dynamic community provider registration and heartbeat

**Status:** first control-plane registry milestone. It is not a multi-node scheduler and does not make a model publicly available by itself.

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
- `POST /api/admin/provider-nodes`: create a node. JSON body: `{"label":"Provider label","allowedModels":["exact/model-id"]}`. The response returns the generated node ID and HMAC secret **once**. Store the secret securely and pass it only to the invited provider.
- `DELETE /api/admin/provider-nodes`: revoke a node. JSON body: `{"nodeId":"avn_..." }`. Future heartbeats are rejected.

The creation endpoint only accepts model IDs in `AVEIRO_APPROVED_COMMUNITY_MODELS`. Keep this list empty until each exact checkpoint, licence, commercial-use terms, runtime and serving requirements have been reviewed. The API must not be used to self-approve model licences.

## Provider heartbeat

A registered provider node sends a signed heartbeat to `POST /api/provider-nodes/heartbeat` every 30 seconds. Requests use the existing HMAC-SHA256 signature format, include a fresh timestamp and nonce, and are rejected when stale, replayed, revoked or outside the node's approved model allowlist.

The heartbeat reports only node ID, exact model IDs the local OpenAI-compatible runtime currently advertises, active jobs, concurrency and a coarse runtime readiness flag. It does not send user prompts, account identity, API keys or model weights. The shared secret is encrypted in Redis with AES-256-GCM and is never returned by the list endpoint.

A node is marked offline when its last valid heartbeat is older than 90 seconds. It is ready only when it is online and reports at least one approved model actually present in the runtime's `GET /v1/models` response. This is a readiness signal, not a benchmark or guarantee of quality.

## Current boundaries

This milestone creates an operator-only registry and real runtime readiness heartbeat. It does **not** yet:
- select among multiple nodes for inference;
- dispatch requests through the registry;
- issue job-scoped credentials or support end-to-end cancellation;
- meter tokens, account for credits, or settle provider rewards;
- provide public provider self-onboarding or an admin dashboard;
- verify licences automatically, attest hardware, or prove prompt confidentiality.

The current chat route still uses its earlier static single-node environment configuration. Do not expose untrusted nodes or list dynamic registry nodes as user-selectable until scheduler dispatch, policy checks, quotas, network security and tests are complete.
