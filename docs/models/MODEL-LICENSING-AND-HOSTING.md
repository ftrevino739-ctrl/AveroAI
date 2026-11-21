# Model licensing and hosting decision record

**Last reviewed:** 2026-11-10  
**Repository branch:** `feature/aveiro-community-compute-foundation`  
**Purpose:** engineering and product planning, not legal advice.

## Executive decision

Aveiro can pursue a self-hosted community-GPU route for Kimi K2.5 and Kimi K3 because Moonshot publishes their weights and grants rights under model-specific licences. This is not the same as a blanket right to run every model from Moonshot, and it does not make inference free.

GPT/ChatGPT and Claude are proprietary hosted services. Aveiro cannot download their service-model weights and place them on volunteer GPUs. To include those models, Aveiro needs its own authorized commercial/API access (or another written, explicitly authorized hosting/reseller agreement), cost controls and compliance with the provider's terms.

## Expanded multi-provider roadmap

Aveiro is intended to be provider-agnostic. The catalogue should include leading model families from multiple organizations while distinguishing official hosted services from open-weight models that can run on community nodes.

| Family | Target examples | Access route | Community hosting |
|---|---|---|---|
| OpenAI flagship | GPT-6 Astra, GPT-6.1 Sol | Official OpenAI API/business access | No; proprietary hosted models |
| Anthropic | Claude Opus / Sonnet / Haiku | Official Anthropic API/business access | No; proprietary hosted models |
| Google | Gemini family | Official Gemini API / Google Cloud | No; evaluate Gemma separately |
| DeepSeek | V4 Pro / V4 Flash and later releases | Open weights where published, or official API | Yes, after reviewing each checkpoint |
| Alibaba | Qwen family, including Qwen3.5 | Open weights where published, or official hosted service | Yes, after reviewing each checkpoint |
| Moonshot | Kimi K2.5 / K3 and later releases | Open weights where published, or official API | Yes, after reviewing each checkpoint |

The current OpenAI API catalogue lists GPT-6 Astra and GPT-6.1 Sol. These are hosted proprietary models, not weights available for community deployment. Exact model IDs, pricing and access terms must be checked at integration time.

Gemini, DeepSeek and Qwen each contain multiple model releases with different hosting and licensing conditions. Aveiro must review the exact model and checkpoint, not apply one family-wide licence assumption.

## Decision matrix

| Model family | Public weights for self-hosting? | Licence / terms | Can Aveiro put it on volunteer nodes? | Main blocker |
|---|---|---|---|---|
| OpenAI GPT / ChatGPT service models | No public weights licence | OpenAI business/API terms | No | Authorized provider access and usage costs |
| Anthropic Claude service models | No public weights licence | Anthropic Commercial Terms for API use | No | Authorized provider access and usage costs |
| OpenAI gpt-oss-20b / 120b | Yes | Apache 2.0 plus gpt-oss usage policy | Candidate; practical first Aveiro-hosted OpenAI-family models | GPU memory (about 16 GB for 20b; single 80 GB accelerator for 120b per OpenAI docs) |
| Moonshot Kimi K2.5 | Yes | Modified MIT License | Candidate, after technical and legal review | Large model deployment; preserve notices and comply with special display clause |
| Moonshot Kimi K3 | Yes | Kimi K3 License | Candidate, after technical and legal review | Extremely large distributed serving; possible separate agreement threshold for Model-as-a-Service |

## OpenAI gpt-oss — the open-weight alternative to ChatGPT models

OpenAI publishes two open-weight models, `gpt-oss-20b` and `gpt-oss-120b`, under Apache 2.0 plus the gpt-oss usage policy. OpenAI explicitly states these models are **not available in ChatGPT and are not served through the OpenAI API**. They are separate models that can be hosted on infrastructure Aveiro controls or through a hosting provider.

The current OpenAI documentation describes:
- `gpt-oss-20b`: 21B parameters, text-only, can fit within about 16 GB memory with MXFP4.
- `gpt-oss-120b`: 117B parameters, text-only, designed to fit a single 80 GB accelerator such as H100 / MI300X.

This is the best practical way to offer an OpenAI-created model in Aveiro without paying for the OpenAI API. It does **not** give Aveiro the proprietary models people select inside ChatGPT, nor the exact ChatGPT product behavior.

Sources:
- https://help.openai.com/en/articles/11870455-openai-open-weight-models-gpt-oss
- https://github.com/openai/gpt-oss

## Kimi K2.5 — what the licence means

Moonshot publishes both code and weights under a Modified MIT License. The model card reports 1 trillion total parameters and 32 billion activated parameters. Its native INT4 quantization and MoE structure reduce compute per token, but the complete checkpoint still requires very large aggregate storage and accelerator memory across a suitable multi-GPU serving setup. The published text grants broad rights to use, copy, modify, merge, publish, distribute, sublicense and sell, subject to retaining the copyright and permission notices and the licence's conditions.

The modification requires prominent “Kimi K2.5” display in a commercial product/service if it exceeds **100 million monthly active users OR USD 20 million monthly revenue**. This is a threshold-triggered branding condition; it is not stated as a prohibition on smaller commercial deployments.

The licence does not remove other obligations: review third-party notices, inference-engine licences, the model card, applicable law, data/privacy duties and security requirements. Aveiro should archive the exact licence text and checkpoint revision used.

Official sources:
- https://github.com/MoonshotAI/Kimi-K2.5
- https://github.com/MoonshotAI/Kimi-K2.5/blob/master/LICENSE
- https://huggingface.co/moonshotai/Kimi-K2.5

## Kimi K3 — what the licence means

The Kimi K3 License explicitly covers weights, parameters, configuration, inference/training code and documentation. It grants broad rights to use, modify, distribute, sell and deploy, subject to conditions.

It contains a special **Model-as-a-Service (MaaS)** clause. The licence defines MaaS as giving a third party inference or fine-tuning access (for example, an API) in a way that gives that party meaningful control over inputs, parameters or training data. It excludes end-user products whose model capability is embedded solely in specific features/harnesses, and mere relaying of requests to models hosted by others.

If the licensee or affiliates operate a MaaS business and their aggregate revenue exceeds **USD 20 million over any consecutive 12 months**, a separate agreement with Moonshot AI is required **before commercial use** of the software or derivatives. A further UI attribution condition applies above **100 million monthly active users OR USD 20 million monthly revenue**.

Aveiro's proposed open chat with user-controlled prompts could plausibly be treated as MaaS, depending on the exact product/control surface. Do not assume the embedded-product exception applies. Obtain legal review and, before crossing the stated revenue trigger, the required written agreement.

Official sources:
- https://github.com/MoonshotAI/Kimi-K3
- https://github.com/MoonshotAI/Kimi-K3/blob/main/LICENSE

## GPT and Claude — what Aveiro can and cannot do

### OpenAI GPT / ChatGPT
- The public ChatGPT consumer service and OpenAI API/business services are different products and agreements.
- Aveiro must use an authorized OpenAI API/business arrangement or another explicit authorization.
- A personal ChatGPT plan is not a backend entitlement to serve the model to Aveiro users.
- Do not automate the ChatGPT website, share logins, scrape outputs at scale, or bypass rate limits.

Sources:
- https://openai.com/policies/terms-of-use/
- https://openai.com/policies/service-terms/
- https://openai.com/policies/business-terms/

### Anthropic Claude
- Organizations can create a Claude Console account, add team members, set up billing and access the Claude API.
- Anthropic says API access is subject to its Commercial Terms of Service.
- Claude consumer subscriptions are not a substitute for an authorized public API integration.
- Claude service-model weights are not published for Aveiro to self-host.

Sources:
- https://support.claude.com/en/articles/8114521-how-can-i-access-the-claude-api
- https://www.anthropic.com/legal/commercial-terms

## Engineering difficulty: licensing versus infrastructure

| Model | Licensing difficulty | Infrastructure difficulty | Recommendation |
|---|---|---|---|
| GPT | High: commercial API/partner permission | Low for Aveiro (provider operates GPUs), but usage is billed | Add only after budget and authorization |
| Claude | High: Commercial Terms and API billing | Low for Aveiro (provider operates GPUs), but usage is billed | Add only after budget and authorization |
| OpenAI gpt-oss-20b | Low-to-moderate: Apache 2.0 plus usage policy | Moderate: about 16 GB memory | Recommended first hosted model for Aveiro |
| OpenAI gpt-oss-120b | Low-to-moderate: Apache 2.0 plus usage policy | High: single 80 GB accelerator | Good second hosted model when an 80 GB node is available |
| Kimi K2.5 | Moderate: Modified MIT conditions and notices | Very high: 1T total parameters, MoE, distributed deployment | Later phase, after a multi-GPU provider is secured |
| Kimi K3 | Moderate-to-high: special MaaS threshold and attribution terms | Extreme: 2.8T total parameters, 104B activated, large distributed serving | Later phase, not the first prototype |

Kimi K2.5's model card lists vLLM, SGLang and KTransformers as recommended inference engines. K2.5 supports image input. The card describes video chat as experimental and currently supported only by the official API, so Aveiro must not advertise video input for a community deployment until it is independently verified.

Kimi K3's model card reports 2.8T total parameters and 104B activated parameters. MoE sparsity reduces per-token computation, but it does not make the full checkpoint fit in a single ordinary GPU. The model needs substantial aggregate memory/storage, fast GPU interconnects, compatible kernels and engineering work.

## Aveiro launch gates

No model is marked as live in the chat product merely because its weights or licence are public. The initial recommendation is to prototype with gpt-oss-20b, then gpt-oss-120b. Kimi K2.5 should follow only after a provider cluster is available; Kimi K3 should remain a later-scale candidate.

Before activating a community-hosted model:
1. Pin the exact model repository revision and checkpoint.
2. Archive and review the model licence and all third-party notices.
3. Review inference-engine and container/base-image licences.
4. Verify hardware, memory, network and throughput with a reproducible benchmark.
5. Run a security review of the provider node and job protocol.
6. Publish an accurate privacy notice: the node operator can technically inspect prompts unless an independently verified confidential-computing design prevents it.
7. Add monitoring, capacity reporting, quotas, abuse controls, provider terms and takedown/suspension paths.
8. Have counsel review commercial deployment and any model-specific thresholds.

## Current repository status — honest checklist

- [x] Next.js Liquid Glass chat UI, local conversation history, streaming and browser-only end-user experience contract.
- [x] Community-compute architecture, Provider Node protocol and exact-model licensing/hosting decision record.
- [x] Standalone Provider Node with HMAC request authentication, timestamp/nonce replay protection, strict model allowlist, request limits, timeouts and SSE streaming.
- [x] Private Redis-backed node registry, AES-256-GCM encrypted node secrets, admin enrollment/revocation and signed readiness heartbeats.
- [x] Live model catalogue derived only from approved models on online, ready nodes.
- [x] Initial multi-node exact-model scheduler with atomic concurrency reservations and reservation release.
- [x] Public liveness/readiness endpoints and deployment bootstrap documentation.
- [x] CI on the current foundation PR head has passed production dependency audit, typecheck, lint, Provider Node tests, Next.js build and Docker build.
- [ ] Real Redis, hosted application and remote GPU node have not yet been provisioned or smoke-tested together.
- [ ] No production user accounts, durable per-user quotas, credits ledger/token metering, durable job queue or controlled cross-node retries.
- [ ] No public provider onboarding terms, moderation/abuse operations, retention controls or independent security review.
- [ ] No community model is approved by default. AVEIRO_APPROVED_COMMUNITY_MODELS must remain empty until the exact checkpoint, licence, commercial terms and deployment profile are reviewed.
- [ ] Kimi K2.5 / K3 and gpt-oss remain candidates; their presence in research/catalogue metadata does not mean they are deployed or available.
- [ ] GPT and Claude service models remain excluded from public inference. No API, reseller or hosting authorization is represented as obtained.
- [ ] Production deployment, privacy/legal review, operational budget and public launch gates remain outstanding.

**Do not announce Aveiro as an unlimited free service.** Community hardware must be voluntarily contributed, approved, online and adequately provisioned; credits do not pay for electricity, bandwidth, hardware or maintenance. A model is selectable only while an approved, ready node has capacity for that exact model.
