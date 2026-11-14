# Aveiro Provider Node — first prototype

This is the first executable provider-node prototype for Aveiro Community Compute. It is a separate service; it does not change the existing Next.js chat route.

## What it does

- Accepts signed inference jobs from an authorized Aveiro control-plane caller.
- Uses HMAC-SHA256 signatures, a short timestamp window and in-memory nonce replay protection.
- Exposes only the exact model IDs in `AVEIRO_ALLOWED_MODELS`.
- Forwards text-only chat requests to a local OpenAI-compatible inference runtime.
- Streams the runtime's Server-Sent Events response back to the caller.
- Enforces request-size, message-count, message-size, timeout and concurrent-job limits.
- Never receives the end user's account identity and never executes user-supplied code.

## What it does not do yet

- Registration is provisioned by an Aveiro administrator; the node does not self-register or select its own approved models.
- It sends signed availability heartbeats when `AVEIRO_CONTROL_PLANE_URL` is configured, but it is not yet selected by the chat scheduler.
- It does not download, install, or select model weights.
- It does not verify a model licence automatically. An operator must approve the exact checkpoint and terms before allowing it.
- It does not provide TLS, user authentication, usage credits, billing, moderation, or a production abuse-control system.
- It has not yet been tested against a real GPU or a real model runtime.

This is an integration prototype, not permission to expose an untrusted node to public traffic.

## Requirements

- Node.js 22 or newer.
- A separately installed local inference runtime exposing an OpenAI-compatible `/v1/chat/completions` endpoint.
- One exact, license-reviewed open-weight model configured in that runtime.
- Network access only from the Aveiro control plane to this node.

The provider runs this service on its GPU machine. Aveiro end users do **not** install or run anything locally.

## Configuration

Required environment variables:

| Variable | Meaning |
| --- | --- |
| `AVEIRO_NODE_ID` | Stable node identifier, 3–80 safe characters. |
| `AVEIRO_NODE_SECRET` | Private shared HMAC secret, at least 32 characters. Use a unique secret per node. |
| `AVEIRO_ALLOWED_MODELS` | Comma-separated exact model IDs that this node is approved to serve. Never use a wildcard. |

Optional environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `LOCAL_INFERENCE_BASE_URL` | `http://127.0.0.1:8000/v1` | Local runtime base URL. HTTP loopback only; this restriction prevents the node from becoming an arbitrary network proxy. |
| `LOCAL_INFERENCE_API_KEY` | empty | Optional key used only to authenticate to the local inference runtime. It is not an Aveiro or third-party hosted API key. |
| `AVEIRO_NODE_MAX_CONCURRENT` | `1` | Maximum concurrent inference jobs, from 1 to 32. |
| `AVEIRO_NODE_REQUEST_TIMEOUT_MS` | `120000` | Per-job timeout, from 10,000 to 600,000 ms. |
| `PORT` | `8787` | HTTP listen port. |
| `AVEIRO_CONTROL_PLANE_URL` | empty | Aveiro HTTPS origin. When set, the node sends signed readiness heartbeats every 30 seconds. HTTP is allowed only for loopback development. |
| `AVEIRO_HEARTBEAT_INTERVAL_MS` | `30000` | Heartbeat interval, from 10,000 to 120,000 ms.

Generate a unique secret on Linux/macOS:

```bash
openssl rand -hex 32
```

Example Linux/macOS launch (replace the model ID with the exact served model name):

```bash
export AVEIRO_NODE_ID="gpu-node-01"
export AVEIRO_NODE_SECRET="<paste-a-new-64-character-hex-secret>"
export AVEIRO_ALLOWED_MODELS="community/approved-model"
export LOCAL_INFERENCE_BASE_URL="http://127.0.0.1:8000/v1"
node provider-node/server.mjs
```

Example PowerShell launch:

```powershell
$env:AVEIRO_NODE_ID = "gpu-node-01"
$env:AVEIRO_NODE_SECRET = (node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")
$env:AVEIRO_ALLOWED_MODELS = "community/approved-model"
$env:LOCAL_INFERENCE_BASE_URL = "http://127.0.0.1:8000/v1"
$env:AVEIRO_CONTROL_PLANE_URL = "https://aveiro.example"
node provider-node/server.mjs
```

The inference runtime must already be running on the same machine and serve the configured model under the exact ID passed by Aveiro. This prototype does not launch vLLM, SGLang, llama.cpp, Ollama or another runtime.

## Connecting to the Aveiro registry

An Aveiro administrator first creates an invited provider through the private `POST /api/admin/provider-nodes` endpoint. The response displays the node ID and secret once. The provider operator configures those values as `AVEIRO_NODE_ID` and `AVEIRO_NODE_SECRET`, and copies the exact approved model IDs into `AVEIRO_ALLOWED_MODELS`.

Set `AVEIRO_CONTROL_PLANE_URL` to the public Aveiro HTTPS origin. The node then sends a signed heartbeat every 30 seconds to `POST /api/provider-nodes/heartbeat`. Before reporting readiness, it queries its local runtime's `GET /v1/models` endpoint and reports only exact allowlisted IDs that the runtime actually advertises. The heartbeat contains no prompts, user identity or provider API keys.

An administrator can inspect node status through `GET /api/admin/provider-nodes` and revoke a node through `DELETE /api/admin/provider-nodes`. Revocation causes the control plane to reject subsequent heartbeats. This registry is not yet connected to inference scheduling, so registering a node does not make it selectable by end users.

## Endpoints

- `GET /healthz`: minimal unauthenticated liveness check.
- `GET /v1/node/capabilities`: HMAC-authenticated node ID, protocol version, approved models and concurrency.
- `POST /v1/node/infer`: HMAC-authenticated text inference job; response is streamed SSE.

See [the protocol document](../docs/architecture/PROVIDER-NODE-PROTOCOL.md) for signing and payload details.

## Network and privacy requirements

The process listens on `0.0.0.0` so it can be reached from a control plane, but it serves plain HTTP. **Do not expose port 8787 directly to the public internet.** Put it behind a correctly configured TLS reverse proxy or a private authenticated network, restrict ingress to the Aveiro control plane, and keep the shared secret private. The reverse proxy must preserve the Aveiro authentication headers and stream SSE without buffering.

A node operator can technically inspect prompts and generated output processed on the node. This prototype provides transport authentication, not confidential computing or end-to-end encryption from the node operator. The public app must disclose community processing and avoid sending user identity to the node.

The service only accepts a loopback local inference URL. Do not weaken that restriction to arbitrary URLs: doing so could turn volunteer nodes into SSRF/network proxies.

## Local verification

From the repository root:

```bash
npm run test:provider-node
```

The tests use fake local OpenAI-compatible and control-plane servers. They verify inference authentication, replay rejection, request integrity, model allowlisting, SSE streaming, readiness detection and the signed heartbeat client. Passing these tests does not verify a real GPU, model quality, licensing, production TLS, persistent Redis availability, or live deployment security.
