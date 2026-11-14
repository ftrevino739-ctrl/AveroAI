# Aveiro Provider Node Protocol v1

**Status:** executable provider-node protocol with signed outbound registry heartbeat; chat scheduling is not yet connected to the registry.  
**Transport:** HTTPS is required outside a private development environment.  
**Scope:** text-only inference through a provider's local OpenAI-compatible runtime.

## Trust boundaries

The provider node is an independent machine operated by a volunteer or invited provider. It can inspect prompts it processes. Aveiro must disclose that fact, minimize personal data, and never send end-user account identity to a node.

The node does not accept model names outside its local allowlist and does not accept arbitrary URLs, shell commands, code execution requests, downloads, or provider credentials in inference payloads. It forwards only to a fixed loopback inference URL configured by the node operator.

## Authentication

Every protected request carries:

- 'X-Aveiro-Node-Id': exact node ID expected by the node.
- 'X-Aveiro-Timestamp': Unix timestamp in milliseconds (13 decimal digits).
- 'X-Aveiro-Nonce': unique random value (16–128 URL-safe characters).
- 'X-Aveiro-Signature': lower-case or upper-case hexadecimal HMAC-SHA256 digest.

The signed UTF-8 message is the following fields joined by a single line feed (LF), with no trailing LF:

~~~text
HTTP_METHOD
URL_PATH
TIMESTAMP
NONCE
NODE_ID
RAW_REQUEST_BODY
~~~

The HMAC key is the per-node AVEIRO_NODE_SECRET. For a GET request the raw body is the empty string. The signature authenticates the exact transmitted body bytes interpreted as UTF-8; JSON must not be parsed and re-serialized before signing.

The node accepts timestamps within 60 seconds of its local clock and stores accepted nonces in memory for two minutes. A repeated nonce is rejected. The node secret must be unique per node, stored only in server-side secret storage, rotated after suspected exposure, and never included in logs or browser code.

The control plane must generate a fresh cryptographically random nonce and timestamp for every request. It must use constant-time signature comparison. Protect the service with TLS and network-level ingress restrictions; HMAC does not encrypt prompts.

## Outbound control-plane heartbeat

An invited node can report availability to the Aveiro registry by configuring `AVEIRO_CONTROL_PLANE_URL` on the provider machine. It sends:

- `POST /api/provider-nodes/heartbeat` every 30 seconds (configurable from 10 to 120 seconds).
- The same HMAC-SHA256 signing format described above, with a fresh 13-digit timestamp and random nonce for every request.
- A compact payload containing the node ID, exact runtime-advertised model IDs, active jobs, maximum concurrency, runtime identifier and a `ready` / `unavailable` status.

Before sending the heartbeat, the node queries its local OpenAI-compatible `GET /v1/models` endpoint. It reports only IDs that are both present in the runtime response and in the node's configured allowlist. A process that is running while its model runtime is down therefore reports unavailable rather than ready. Heartbeats never contain conversation messages, end-user identity or provider API credentials.

The control plane accepts only registered, non-revoked node IDs, verifies the per-node signature and uses Redis `SET NX EX` to reject nonce replay across application instances. The HMAC secret is AES-256-GCM encrypted at rest. A node becomes offline after 90 seconds without a valid heartbeat.

## Endpoints

### GET /healthz

Unauthenticated liveness response. It exposes no model list or internal configuration.

~~~json
{ "status": "ok", "service": "aveiro-provider-node" }
~~~

### GET /v1/node/capabilities

HMAC-authenticated. The request must have an empty body.

Example response:

~~~json
{
  "nodeId": "gpu-node-01",
  "protocolVersion": 1,
  "runtime": "openai-compatible-http",
  "models": ["community/approved-model"],
  "activeJobs": 0,
  "maxConcurrent": 1
}
~~~

This reports configured allowlist entries, not proof that weights are loaded, the model is healthy, or the GPU has sufficient capacity. A later control-plane health check must verify readiness before scheduling work.

### POST /v1/node/infer

HMAC-authenticated JSON request.

~~~json
{
  "requestId": "req_01J...",
  "modelId": "community/approved-model",
  "messages": [
    { "role": "user", "content": "Explain this concept." }
  ]
}
~~~

Constraints:

- requestId is 1–120 characters from letters, digits, dot, underscore, colon and hyphen.
- modelId must exactly match an allowlisted ID.
- 1–40 messages; roles are system, user, or assistant.
- Message content is plain text, maximum 20,000 characters per message and 60,000 total.
- At least one user message is required.
- Raw request size is limited to 100,000 bytes.
- The node enforces a maximum number of concurrent jobs and a per-job timeout.

Successful responses stream the local runtime's Server-Sent Events body using text/event-stream. The node forwards chunks without interpreting the model's content. The upstream request sent to the loopback runtime has the OpenAI-compatible shape:

~~~json
{
  "model": "community/approved-model",
  "messages": [{ "role": "user", "content": "..." }],
  "stream": true
}
~~~

The node includes the original request ID in X-Aveiro-Request-Id. It does not forward user identity, email, account metadata, or the HMAC secret to the local runtime.

## Error semantics

- 400: malformed JSON or invalid job schema.
- 401: absent, invalid, expired, or replayed signature.
- 403: requested model is not in the node's allowlist.
- 413: request exceeds the payload limit.
- 415: unsupported content type.
- 429: node has reached its configured concurrency limit.
- 502: local inference runtime unavailable or rejected the request.
- 504: local inference runtime exceeded the node timeout.

The control plane must not silently send the request to another model or paid provider after an error. It may retry the same exact model on another eligible community node according to a bounded retry policy, or return a clear unavailable error.

## Deliberate v1 limitations

- Central registration, admin revocation and signed readiness heartbeat are implemented, but dynamic registry nodes are not yet used by the chat scheduler.
- No streaming cancellation acknowledgment or usage metering yet.
- No image, audio, video or file payload support.
- Nonces are stored in process memory; multi-process deployments need a shared replay store or sticky routing.
- No automatic model licence verification or remote attestation.
- No claim that node operators cannot read prompts.
- No public production readiness claim.

Before routing public traffic to community nodes, the control plane must implement multi-node scheduling, signed job dispatch, TLS enforcement and ingress restrictions, streaming cancellation, auditable metering, abuse controls and security review. Registration and readiness heartbeats alone are not sufficient to admit a node to production inference.
