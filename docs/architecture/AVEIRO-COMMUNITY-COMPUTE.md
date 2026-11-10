# Aveiro.ai — Community Compute Architecture

**Status:** foundational design / implementation not yet complete  
**Repository:** AveroAI  
**Target:** public, hosted multi-model AI platform with an independent community-compute network

## 1. Product decisions

1. Aveiro.ai is a public hosted service. End users must not need to supply provider API keys.
2. Aveiro must not depend on the founder's personal API keys or personal subscriptions.
3. Aveiro is not a local-model desktop app. End-user inference runs remotely.
4. Venice.ai is a product/architecture reference only. Aveiro must have its own identity, code, infrastructure and provider relationships.
5. Separate models into:
   - **Community-hosted open-weight models:** run by opted-in GPU providers on Aveiro nodes, subject to each model's license.
   - **Official proprietary models:** OpenAI/ChatGPT, Anthropic/Claude and proprietary Kimi models can appear only when Aveiro has authorized access and a sustainable funding arrangement. Never imitate official clients, scrape consumer accounts, share subscriptions, or bypass provider limits.
   - **Other authorized hosted models:** external inference services can be added only after terms, pricing, privacy, and commercial-use rights are verified.
6. No claim of unlimited free inference. Community credits can reward contributions but do not pay electricity or guarantee capacity.

## 2. Model strategy

### Open-weight candidates

- Moonshot Kimi K2.5: multimodal open-weight candidate; verify the exact current license and deployment obligations before enabling public model-as-a-service.
- Moonshot Kimi K2 / K3: evaluate separately; do not assume licenses are identical across releases.
- Other candidates should be added only after reviewing weights license, commercial-use terms, redistribution, attribution, acceptable-use terms, hardware needs, and inference stack compatibility.

### Proprietary models

- OpenAI GPT / ChatGPT models: official access requires an approved commercial/API arrangement or another explicitly authorized hosting agreement.
- Anthropic Claude models: same rule; no public weights to self-host.
- Moonshot proprietary Kimi services: official Moonshot access or an authorized reseller is required.
- Keep these providers disabled by default until Aveiro has its own organization-owned credentials, budget controls, user quotas, and a documented funding source. Never place secrets in browser code or Git.

## 3. Target architecture

### A. Public application
- Liquid Glass interface, responsive desktop/tablet/mobile.
- Model catalog with search, capabilities, context, modality, hosting type, availability and clear cost/access labels.
- Chat, streaming, conversation history, image/file attachments and vision-capability checks.
- Account/authentication, abuse controls, usage quotas and privacy controls before public launch.
- User-facing provider labels distinguish official proprietary models from community-hosted open weights.

### B. Aveiro control plane
- **Model registry:** canonical model IDs, license review status, capabilities, runtime requirements, provider policy and enabled/disabled state.
- **Provider registry:** provider identity, node ID, declared hardware, supported models, region, capacity, heartbeat and reputation.
- **Scheduler/router:** select an eligible healthy node based on model compatibility, available capacity, latency, policy and fair-use limits.
- **Inference gateway:** validate requests, normalize messages, stream responses, enforce quotas/timeouts and redact secrets.
- **Credits ledger:** auditable accounting for accepted compute contributions and usage; credits are not cash and do not guarantee service.
- **Admin operations:** suspend nodes/models, revoke credentials, review abuse reports, inspect health and manage incidents.

### C. Aveiro Provider Node
- Explicit opt-in installation and clear disclosure that the node processes user prompts.
- Provider chooses which approved models to serve and when the node is online.
- Node reports hardware/runtime/model availability and receives signed, scoped jobs.
- Jobs run in an isolated runtime with resource limits, timeouts, egress restrictions and no access to host secrets.
- Node returns streamed output and usage telemetry; it must not receive end-user account identity.
- Provider can pause, update, inspect, or uninstall at any time.
- Never run arbitrary user-supplied code as part of inference.

### D. Trust, privacy and safety
- Assume a GPU provider can technically inspect prompts sent to its node. Do not promise end-to-end confidentiality unless a verified confidential-computing design actually provides it.
- Minimize personal data; avoid sending account identity to provider nodes.
- Use TLS, signed short-lived job tokens, replay protection, per-node authorization, request limits and audit events.
- Define retention, abuse handling, model safety policy, copyright handling, provider terms and user privacy notice before public beta.
- Add independent security review before accepting untrusted community nodes.

## 4. Request lifecycle

1. User selects a model and sends a message.
2. Gateway authenticates the user and checks quotas, model status and modality support.
3. Router finds a healthy, authorized node with the required model and capacity.
4. Gateway issues a short-lived signed job with minimum necessary data.
5. Provider node runs inference in its isolated runtime and streams output.
6. Gateway validates the stream, records metering and returns it to the user.
7. Ledger credits the provider only for accepted, policy-compliant work.
8. Monitoring updates node health and reputation.

If no eligible provider is online, return a clear capacity-unavailable message. Do not silently route to a paid provider or use an unauthorized fallback.

## 5. Phased implementation

### Phase 0 — Foundation (current)
- Preserve the existing Next.js app and current working chat.
- Create a separate feature branch for community-compute work.
- Document product decisions, trust boundaries, model licensing and rollout gates.
- Audit existing provider adapters and identify personal-key assumptions.

### Phase 1 — Model catalog and provider contracts
- Replace hard-coded model assumptions with a typed registry.
- Add model fields for modality, hosting class, license-review state, context, availability and access mode.
- Define provider-node protocol and API schemas before writing networking code.
- Keep community models disabled until licensing and node execution are verified.

### Phase 2 — Single trusted provider prototype
- Implement one provider node and one open-weight model with a verified license.
- Run the node on a separately controlled GPU machine, not an end user's device.
- Add heartbeat, capability registration, job dispatch, streaming and cancellation.
- Test failure, malicious payload, timeout, node disconnect and prompt privacy boundaries.

### Phase 3 — Multi-node beta
- Add provider onboarding, node identity, signed jobs, scheduler, quotas and credits ledger.
- Start with invited providers and explicit user disclosure.
- Add abuse monitoring, incident response, provider reputation and admin controls.

### Phase 4 — Public launch
- Complete legal/license review, privacy policy, terms, security review and funding plan.
- Establish capacity targets, per-user quotas, rate limits, cost ceilings and transparent availability.
- Enable proprietary models only after authorized access and a sustainable budget are in place.

## 6. Current executable provider-node prototype

The repository now contains a standalone first provider-node service in `provider-node/`:

- `server.mjs` exposes minimal liveness, authenticated capabilities, and authenticated text inference endpoints.
- `signing.mjs` implements HMAC-SHA256 request signing and constant-time signature comparison.
- Requests include a timestamp and nonce; expired and replayed signed requests are rejected.
- The node accepts only exact model IDs in its local allowlist and forwards only to a configured loopback OpenAI-compatible inference runtime.
- Inference responses are streamed as SSE. Request size, message size/count, concurrency, and request timeout are bounded.
- `server.test.mjs` uses a fake local runtime to test health, authentication, signature/body integrity, nonce replay, model allowlisting and streaming.
- `npm run test:provider-node` is included in GitHub Actions CI.

The prototype is intentionally disconnected from the Next.js chat route and from any public scheduler. It does not register nodes, issue secrets, perform heartbeats, meter usage, or handle image/audio/video. The tests prove protocol behavior against a fake runtime; they do not prove GPU availability, model quality, model licensing or production network security.

## 7. Next implementation gates

1. Run the provider node against a real local OpenAI-compatible inference runtime and one exact license-reviewed open-weight checkpoint.
2. Add central node onboarding, server-side secret generation/revocation, authenticated heartbeat and readiness checks.
3. Add a server-side control-plane client that signs requests and dispatches jobs only to registered eligible nodes.
4. Integrate one selected community model into the model registry as unavailable until a healthy registered node advertises that exact model.
5. Add end-to-end tests for dispatch, streaming cancellation, timeout, disconnection, capacity exhaustion and retry to another node serving the same exact model.
6. Add durable usage metering and credits only after the gateway can measure accepted tokens/jobs consistently.
7. Complete TLS ingress, authentication, quotas, abuse review and privacy disclosures before any public or untrusted node is admitted.

The platform must not silently substitute a proprietary paid model or a different model when a community model is unavailable. It must clearly report capacity unavailability.

## 8. Acceptance criteria for the first usable community prototype

- A user can chat without supplying a third-party API key.
- At least one invited provider node serves one license-reviewed open-weight model remotely.
- The app clearly identifies it as community-hosted.
- The gateway routes only to registered healthy nodes and reports unavailability honestly.
- Streaming, cancellation, timeout and provider disconnect are tested.
- No personal provider credentials or user identity are exposed to provider nodes.
- Usage accounting is auditable; no credits are issued for failed or rejected jobs.
