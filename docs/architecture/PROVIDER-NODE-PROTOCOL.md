# Aveiro Provider Node Protocol v1

**Status:** executable single-node prototype; not yet connected to the public control plane.  
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

- No central node registration, heartbeat, scheduler, revocation endpoint or credits ledger.
- No streaming cancellation acknowledgment or usage metering yet.
- No image, audio, video or file payload support.
- Nonces are stored in process memory; multi-process deployments need a shared replay store or sticky routing.
- No automatic model licence verification or remote attestation.
- No claim that node operators cannot read prompts.
- No public production readiness claim.

Before adding public nodes, the control plane must implement node onboarding, per-node secret issuance/revocation, signed job creation, TLS enforcement, health/readiness checks, streaming cancellation, auditable metering, abuse controls and security review.
