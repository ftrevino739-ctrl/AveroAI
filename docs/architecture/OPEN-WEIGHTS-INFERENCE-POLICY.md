# Aveiro inference policy: open-weight first, community-hosted

**Product decision:** Aveiro's normal inference path uses open-weight checkpoints executed on remote GPU capacity operated by Aveiro or opted-in community providers. The browser is only a client.

## Non-negotiable rules

- No end-user API keys, subscriptions, local model downloads, local runtimes, or local GPU requirements.
- No dependency on OpenAI, Anthropic, Google, OpenRouter, or another hosted-model API for the core chat product.
- No scraping consumer AI websites, shared consumer accounts, credential rotation, or rate-limit evasion.
- The public model picker lists only exact model IDs that are approved and currently served by a live, ready, non-revoked Aveiro community node.
- The chat gateway accepts only `aveiro-community:<exact-model-id>` for public inference. Proprietary providers and arbitrary custom endpoints are rejected.
- If no eligible node exists, the model is unavailable. Never silently switch to a different model.
- Provider credentials remain server-side. GPU operators are separate opt-in infrastructure contributors, never ordinary end users.

## What "uncensored" means for model selection

Aveiro should prefer capable checkpoints with fewer unnecessary refusals and broad legitimate-use coverage. "Uncensored" is not a promise to facilitate harm, and no model should be described as unrestricted or guaranteed to answer everything.

Every candidate must be evaluated on a repeatable benchmark covering:
1. General reasoning, instruction following, factuality, and long-context consistency.
2. Coding, debugging, mathematics, and multilingual quality (including Spanish).
3. False refusals on benign sensitive, controversial, political, fictional, and research prompts.
4. Appropriate refusal behavior for clearly harmful requests.
5. Prompt-injection resistance, data leakage, and tool-use boundaries where applicable.
6. Tokens/second, time-to-first-token, peak VRAM/RAM, context-memory growth, and concurrent throughput.

Do not select a model from its marketing label alone. Run the same evaluation set across candidate checkpoints and publish a short model card with limitations.

## Model admission gate

A model is not available merely because its name appears in a catalogue or a Hugging Face page.

Before setting `AVEIRO_APPROVED_COMMUNITY_MODELS` or provisioning a node, record:
- Exact repository, checkpoint name, immutable revision/commit, quantization, and tokenizer revision.
- Model-card and licence text for that exact checkpoint; commercial use, redistribution, derivatives, attribution, and any revenue/user thresholds.
- Runtime and serving-stack licences, source provenance, security scan, and known vulnerabilities.
- Minimum and recommended GPU VRAM, system RAM, disk, number/type of accelerators, interconnect, and measured throughput.
- Benchmark results from the evaluation above.
- Operator deployment profile, network exposure, isolation, update process, monitoring, and revocation procedure.

If licence terms are unclear or incompatible with Aveiro's intended hosted service, do not approve that checkpoint until reviewed.

## Initial candidate tiers

These are research candidates, not live promises or approvals:

- **Accessible node tier:** smaller distilled or dense Qwen/DeepSeek-family checkpoints that can be served on a single suitable GPU. Choose the exact size and licence after benchmark and hardware testing.
- **High-capability tier:** larger Qwen/DeepSeek-family checkpoints or mixtures of experts, requiring multi-GPU or high-memory accelerators. Do not advertise them until an operator demonstrates stable capacity.
- **Specialist tier:** coding, reasoning, vision, and multilingual checkpoints selected by measured task quality rather than brand.

Do not make `gpt-oss`, any one vendor, or any single model family a mandatory fallback. The catalogue should remain model-family agnostic and checkpoint-specific.

## Runtime architecture

`Browser → Aveiro web/API → account, quota and policy checks → Redis-backed scheduler → signed job → remote Provider Node → local inference runtime → streamed response`

The model weights live only on the remote provider machine. The Provider Node is the operator's adapter to an OpenAI-compatible local inference runtime; it does not make an external hosted API call. The scheduler reserves capacity for the exact requested model and releases the reservation on completion, cancellation, or error.

## Availability and honest product messaging

- No approved online node: show an empty state explaining that community capacity is not connected yet.
- Node offline, overloaded, revoked, or missing the exact checkpoint: return unavailable; do not fallback.
- Candidate under review: show it only in internal/admin research, never as a selectable public model.
- Community compute is not automatically free to operate. GPU time, electricity, bandwidth, and maintenance have real costs. Any future free tier must be backed by explicit capacity and quota budgets.

## Current implementation boundary

The provider registry and signed multi-node scheduler are groundwork only. A model becomes selectable only after the registry reports a fresh heartbeat, a ready inference runtime, and the exact approved model ID. No GPU node or real model is currently verified as connected. The public catalogue and chat gateway now enforce the open-weight/community-only rule; a deployment without a live approved node should correctly show no available models.
