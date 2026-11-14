/**
 * Static access and licensing registry for the Aveiro product roadmap.
 *
 * These records describe the model-access path. They do not activate a model,
 * grant a licence, create provider credentials, or imply inference capacity.
 */
export type ModelAccessKind = "open-weights" | "proprietary-service";
export type ModelLaunchStatus =
  | "candidate-review-required"
  | "requires-commercial-provider-access";

export type ModelAccessRecord = {
  id: string;
  name: string;
  organization: string;
  accessKind: ModelAccessKind;
  launchStatus: ModelLaunchStatus;
  selfHostWeights: boolean;
  communityNodeCandidate: boolean;
  licenseName: string;
  commercialUseNotes: string[];
  deploymentNotes: string[];
  officialSources: string[];
};

export const modelAccessCatalog: readonly ModelAccessRecord[] = [
  {
    id: "openai-gpt-family",
    name: "GPT / ChatGPT models",
    organization: "OpenAI",
    accessKind: "proprietary-service",
    launchStatus: "requires-commercial-provider-access",
    selfHostWeights: false,
    communityNodeCandidate: false,
    licenseName: "No public model-weights licence for the GPT service models",
    commercialUseNotes: [
      "Aveiro must access GPT through an authorized OpenAI business/API agreement or another explicitly authorized arrangement.",
      "ChatGPT consumer or personal subscriptions are not a backend licence for reselling or sharing access with Aveiro users.",
      "Budget, usage limits, permitted end-user use, privacy terms and branding must be checked before activation."
    ],
    deploymentNotes: [
      "The model remains hosted by OpenAI; Aveiro would integrate an authorized endpoint.",
      "Never scrape ChatGPT web sessions, share personal accounts, or bypass rate limits."
    ],
    officialSources: [
      "https://openai.com/policies/service-terms/",
      "https://openai.com/policies/business-terms/"
    ]
  },
  {
    id: "anthropic-claude-family",
    name: "Claude models",
    organization: "Anthropic",
    accessKind: "proprietary-service",
    launchStatus: "requires-commercial-provider-access",
    selfHostWeights: false,
    communityNodeCandidate: false,
    licenseName: "No public model-weights licence for Claude service models",
    commercialUseNotes: [
      "Organizations can create a Claude Console account, configure billing and use the API subject to Anthropic Commercial Terms.",
      "Aveiro needs its own authorized organization access and must follow commercial terms and usage policies.",
      "A Claude Pro/Max/Ultra consumer subscription is not a substitute for an approved public inference integration."
    ],
    deploymentNotes: [
      "The model remains hosted by Anthropic; Aveiro would integrate an authorized endpoint.",
      "No Claude weights can be placed on volunteer GPU nodes under a public self-hosting licence."
    ],
    officialSources: [
      "https://support.claude.com/en/articles/8114521-how-can-i-access-the-claude-api",
      "https://www.anthropic.com/legal/commercial-terms"
    ]
  },
  {
    id: "openai-gpt-6-astra",
    name: "GPT-6 Astra",
    organization: "OpenAI",
    accessKind: "proprietary-service",
    launchStatus: "requires-commercial-provider-access",
    selfHostWeights: false,
    communityNodeCandidate: false,
    licenseName: "OpenAI API / business terms",
    commercialUseNotes: ["Requires authorized OpenAI API or business access; verify current pricing and permitted use at activation.", "Proprietary hosted model; no public weights for community hosting."],
    deploymentNotes: ["Requests are served by OpenAI-hosted inference; never scrape ChatGPT sessions or share personal subscriptions."],
    officialSources: ["https://developers.openai.com/api/docs/models"]
  },
  {
    id: "openai-gpt-6-1-sol",
    name: "GPT-6.1 Sol",
    organization: "OpenAI",
    accessKind: "proprietary-service",
    launchStatus: "requires-commercial-provider-access",
    selfHostWeights: false,
    communityNodeCandidate: false,
    licenseName: "OpenAI API / business terms",
    commercialUseNotes: ["Requires authorized OpenAI API or business access; verify current pricing and permitted use at activation.", "Proprietary hosted model; no public weights for community hosting."],
    deploymentNotes: ["Requests are served by OpenAI-hosted inference; never scrape ChatGPT sessions or share personal subscriptions."],
    officialSources: ["https://developers.openai.com/api/docs/models"]
  },
  {
    id: "google-gemini-family",
    name: "Gemini model family",
    organization: "Google DeepMind",
    accessKind: "proprietary-service",
    launchStatus: "requires-commercial-provider-access",
    selfHostWeights: false,
    communityNodeCandidate: false,
    licenseName: "Google Gemini API terms; model-specific terms apply",
    commercialUseNotes: ["Use official Gemini API or an authorized Google Cloud arrangement; check model, region, quota, pricing and data terms before launch.", "Evaluate Gemma separately as Google's open-model family."],
    deploymentNotes: ["Official Gemini inference is hosted by Google; Gemini is not the same thing as self-hosted Gemma."],
    officialSources: ["https://ai.google.dev/gemini-api/docs/models", "https://deepmind.google/models/gemma/"]
  },
  {
    id: "deepseek-family",
    name: "DeepSeek model family",
    organization: "DeepSeek",
    accessKind: "open-weights",
    launchStatus: "candidate-review-required",
    selfHostWeights: true,
    communityNodeCandidate: true,
    licenseName: "Model-specific licence and usage terms; verify each checkpoint",
    commercialUseNotes: ["DeepSeek publishes open-weight releases and a hosted API; do not assume every release has identical terms.", "Hosted API use requires an authorized account and current provider terms."],
    deploymentNotes: ["Evaluate current V4 Pro and V4 Flash checkpoints separately for licence, GPU footprint, serving support and throughput."],
    officialSources: ["https://www.deepseek.com/en/transparency/", "https://deepseek.com/en/news/v4-preview/"]
  },
  {
    id: "qwen-family",
    name: "Qwen model family",
    organization: "Alibaba Qwen",
    accessKind: "open-weights",
    launchStatus: "candidate-review-required",
    selfHostWeights: true,
    communityNodeCandidate: true,
    licenseName: "Model-specific licence; verify each Qwen checkpoint",
    commercialUseNotes: ["Qwen includes open-weight releases and hosted services; commercial rights depend on the exact model and licence.", "Never assume one licence applies to the entire Qwen family."],
    deploymentNotes: ["Evaluate current Qwen3.5 releases and variants for modalities, serving-stack compatibility and GPU requirements."],
    officialSources: ["https://qwenlm.github.io/", "https://home.alibabagroup.com/en-US/document-1960233590314762240"]
  },
  {
    id: "openai-gpt-oss-20b",
    name: "gpt-oss-20b",
    organization: "OpenAI",
    accessKind: "open-weights",
    launchStatus: "candidate-review-required",
    selfHostWeights: true,
    communityNodeCandidate: true,
    licenseName: "Apache 2.0 plus gpt-oss usage policy",
    commercialUseNotes: [
      "OpenAI publishes the weights under Apache 2.0, allowing broad commercial use subject to the gpt-oss usage policy.",
      "This is not a ChatGPT model endpoint and is not served by the OpenAI API or the ChatGPT product."
    ],
    deploymentNotes: [
      "OpenAI describes gpt-oss-20b as a 21B-parameter text-only reasoning model that can run within about 16 GB of memory with MXFP4.",
      "This is a much more practical first community-node candidate than Kimi K2.5 or Kimi K3, but actual latency and memory use must be benchmarked."
    ],
    officialSources: [
      "https://help.openai.com/en/articles/11870455-openai-open-weight-models-gpt-oss",
      "https://github.com/openai/gpt-oss"
    ]
  },
  {
    id: "openai-gpt-oss-120b",
    name: "gpt-oss-120b",
    organization: "OpenAI",
    accessKind: "open-weights",
    launchStatus: "candidate-review-required",
    selfHostWeights: true,
    communityNodeCandidate: true,
    licenseName: "Apache 2.0 plus gpt-oss usage policy",
    commercialUseNotes: [
      "OpenAI publishes the weights under Apache 2.0, allowing broad commercial use subject to the gpt-oss usage policy.",
      "This is not GPT available inside ChatGPT and is not served by the OpenAI API."
    ],
    deploymentNotes: [
      "OpenAI describes gpt-oss-120b as a 117B-parameter text-only reasoning model designed to fit on a single 80 GB accelerator such as an NVIDIA H100 or AMD MI300X.",
      "It is a production-scale GPU requirement, but still substantially more approachable than a trillion-parameter model spread across multiple machines."
    ],
    officialSources: [
      "https://help.openai.com/en/articles/11870455-openai-open-weight-models-gpt-oss",
      "https://github.com/openai/gpt-oss"
    ]
  },
  {
    id: "moonshot-kimi-k2-5",
    name: "Kimi K2.5",
    organization: "Moonshot AI",
    accessKind: "open-weights",
    launchStatus: "candidate-review-required",
    selfHostWeights: true,
    communityNodeCandidate: true,
    licenseName: "Modified MIT License",
    commercialUseNotes: [
      "The published licence permits use, modification, distribution and sale subject to its conditions.",
      "If used in a commercial product or service with more than 100 million monthly active users OR more than USD 20 million in monthly revenue, the interface must prominently display Kimi K2.5.",
      "The licence text does not state the Kimi K3 Model-as-a-Service revenue-triggered separate-agreement clause."
    ],
    deploymentNotes: [
      "Open weights do not make inference free: the full model still needs substantial storage, accelerator memory and a compatible multi-GPU deployment.",
      "Moonshot recommends vLLM, SGLang or KTransformers and documents native image input; video is currently described as official-API-only in the cited model card.",
      "Before production, review the exact current licence, third-party notices, code/runtime licences, model card and hosting arrangement."
    ],
    officialSources: [
      "https://github.com/MoonshotAI/Kimi-K2.5",
      "https://github.com/MoonshotAI/Kimi-K2.5/blob/master/LICENSE",
      "https://huggingface.co/moonshotai/Kimi-K2.5"
    ]
  },
  {
    id: "moonshot-kimi-k3",
    name: "Kimi K3",
    organization: "Moonshot AI",
    accessKind: "open-weights",
    launchStatus: "candidate-review-required",
    selfHostWeights: true,
    communityNodeCandidate: true,
    licenseName: "Kimi K3 License",
    commercialUseNotes: [
      "The licence grants broad rights to use, copy, modify, distribute, sell, deploy and create derivatives, subject to its conditions.",
      "For a Model-as-a-Service business, if the licensee and affiliates have aggregate revenue exceeding USD 20 million over any consecutive 12 months, a separate agreement with Moonshot AI is required BEFORE commercial use of the software or derivatives.",
      "For commercial products/services exceeding 100 million monthly active users OR USD 20 million monthly revenue, Kimi K3 must be prominently displayed in the UI.",
      "The licence defines Model-as-a-Service and excludes mere relaying of requests to models hosted by others. Aveiro's exact hosted product structure should receive legal review before activation."
    ],
    deploymentNotes: [
      "The model card describes 2.8 trillion total parameters, 104 billion activated parameters, MXFP4 weights, native image capability and a 1-million-token context.",
      "NVIDIA deployment guidance currently lists data-center GPU generations such as B200, B300, GB200 and GB300 for Kimi K3.",
      "This is a data-center-scale deployment candidate, not a model for a normal laptop or single consumer GPU. The full expert weights must be stored and served across suitable infrastructure even though only a subset of experts is activated per token.",
      "Validate the exact MXFP4 checkpoint, compatible inference engine, interconnect, memory, throughput and operational cost before promising availability."
    ],
    officialSources: [
      "https://github.com/MoonshotAI/Kimi-K3",
      "https://github.com/MoonshotAI/Kimi-K3/blob/main/LICENSE"
    ]
  }
] as const;
