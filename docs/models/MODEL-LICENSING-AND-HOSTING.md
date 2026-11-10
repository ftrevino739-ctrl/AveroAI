# Model licensing and hosting decision record

**Last reviewed:** 2026-11-10  
**Repository branch:** `feature/aveiro-community-compute-foundation`  
**Purpose:** engineering and product planning, not legal advice.

## Executive decision

Aveiro can pursue a self-hosted community-GPU route for Kimi K2.5 and Kimi K3 because Moonshot publishes their weights and grants rights under model-specific licences. This is not the same as a blanket right to run every model from Moonshot, and it does not make inference free.

GPT/ChatGPT and Claude are proprietary hosted services. Aveiro cannot download their service-model weights and place them on volunteer GPUs. To include those models, Aveiro needs its own authorized commercial/API access (or another written, explicitly authorized hosting/reseller agreement), cost controls and compliance with the provider's terms.

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

- [x] Existing Next.js chat UI and server-side provider adapters are present.
- [x] Community-compute architecture is documented.
- [x] This model licensing/hosting decision record is added.
- [x] A read-only model-access metadata endpoint is added.
- [ ] Existing chat still requires server-side provider API keys; it is not yet the keyless public community network.
- [ ] No provider node, node authentication, scheduler, job queue, credit ledger or inference cluster is implemented yet.
- [ ] Kimi K2.5 / K3 are not connected to the live chat route.
- [ ] GPT / Claude are not activated for Aveiro and no commercial agreement is represented as obtained.
- [ ] CI/build must pass on the pull request before merge.
- [ ] Production authentication, shared rate limiting, abuse controls, privacy/legal review and hosting are still required.

**Do not announce Aveiro as an unlimited free service.** Community hardware must be contributed and online; credits do not pay for power, bandwidth or maintenance.
