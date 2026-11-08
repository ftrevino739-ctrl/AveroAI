import type { ModelInfo } from "@/lib/models";

const BASE = "https://api.venice.ai/api/v1";
type AnyRecord = Record<string, any>;
export type VeniceTextCatalog = {
  models: ModelInfo[];
  traits: Record<string, string>;
  compatibilityMapping: Record<string, string>;
  mostUncensoredId?: string;
};

let cached: { expires: number; value: VeniceTextCatalog } | null = null;
let pending: Promise<VeniceTextCatalog> | null = null;

async function getJson(path: string): Promise<AnyRecord> {
  const response = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Venice ${path} returned ${response.status}`);
  return response.json() as Promise<AnyRecord>;
}

function priceValue(value: unknown): number | undefined {
  const raw = value && typeof value === "object"
    ? ((value as AnyRecord).usd ?? (value as AnyRecord).USD ?? (value as AnyRecord).value)
    : value;
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function mapModel(row: AnyRecord): ModelInfo | null {
  if (!row || typeof row.id !== "string") return null;
  const spec: AnyRecord = row.model_spec && typeof row.model_spec === "object" ? row.model_spec : {};
  if (spec.offline === true || row.type && row.type !== "text") return null;

  const capabilities: AnyRecord = spec.capabilities && typeof spec.capabilities === "object"
    ? spec.capabilities
    : {};
  const traits = Array.isArray(spec.traits)
    ? spec.traits.filter((value: unknown): value is string => typeof value === "string")
    : [];
  const contextTokens = Number(spec.availableContextTokens ?? row.context_length ?? spec.context_length ?? 0);
  const maxCompletionTokens = Number(spec.maxCompletionTokens ?? 0);
  const pricing: AnyRecord = spec.pricing || {};
  const name = typeof spec.name === "string" && spec.name.trim() ? spec.name : row.id;
  const description = typeof spec.description === "string" ? spec.description : "";
  const deprecation = spec.deprecation && typeof spec.deprecation === "object"
    ? {
        date: typeof spec.deprecation.date === "string" ? spec.deprecation.date : undefined,
        removesAt: typeof spec.deprecation.removesAt === "string" ? spec.deprecation.removesAt : undefined,
        replacementModelId: typeof spec.deprecation.replacementModelId === "string" ? spec.deprecation.replacementModelId : undefined,
        autoRemap: spec.deprecation.autoRemap === true
      }
    : undefined;
  const isFast = /flash|fast|turbo|mini|haiku/i.test(name + " " + row.id);
  const hasOpenWeights = typeof spec.modelSource === "string" && spec.modelSource.length > 0;

  return {
    id: row.id,
    name,
    provider: "Venice AI",
    providerId: "venice",
    description: description.slice(0, 420) || "Modelo de texto disponible en el catálogo oficial de Venice.",
    category: isFast ? "Fast" : hasOpenWeights ? "Open" : "Frontier",
    context: contextTokens > 0
      ? contextTokens >= 1_000_000 ? (contextTokens / 1_000_000).toFixed(contextTokens % 1_000_000 === 0 ? 0 : 1) + "M"
        : Math.round(contextTokens / 1000) + "K"
      : "No publicado",
    contextTokens,
    uncensored: spec.uncensored === true,
    traits,
    deprecated: Boolean(deprecation),
    deprecation,
    inputPrice: priceValue(pricing.input),
    outputPrice: priceValue(pricing.output),
    maxCompletionTokens: maxCompletionTokens > 0 && Number.isFinite(maxCompletionTokens) ? maxCompletionTokens : undefined,
    privacy: typeof spec.privacy === "string" ? spec.privacy : undefined,
    supportsVision: capabilities.supportsVision === true,
    supportsReasoning: capabilities.supportsReasoning === true,
    supportsFunctionCalling: capabilities.supportsFunctionCalling === true,
    supportsWebSearch: capabilities.supportsWebSearch === true,
    supportsE2EE: capabilities.supportsE2EE === true,
    supportsVideoInput: capabilities.supportsVideoInput === true,
    supportsAudioInput: capabilities.supportsAudioInput === true
  };
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as AnyRecord).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

async function loadCatalog(): Promise<VeniceTextCatalog> {
  // Venice publishes these discovery endpoints. No OpenRouter model registry or IDs are used.
  const modelsPayload = await getJson("/models?type=text");
  const rows = Array.isArray(modelsPayload.data)
    ? modelsPayload.data
    : Array.isArray(modelsPayload.models) ? modelsPayload.models : [];
  if (!rows.length) throw new Error("Venice devolvió un catálogo de texto vacío o con un formato desconocido.");

  const [traitsPayload, compatibilityPayload] = await Promise.all([
    getJson("/models/traits?type=text").catch(() => ({} as AnyRecord)),
    getJson("/models/compatibility_mapping?type=text").catch(() => ({} as AnyRecord))
  ]);
  const traits = asStringMap(traitsPayload.data ?? traitsPayload);
  const compatibilityMapping = asStringMap(compatibilityPayload.data ?? compatibilityPayload);
  const models = rows
    .map((row: AnyRecord) => mapModel(row))
    .filter((model: ModelInfo | null): model is ModelInfo => Boolean(model));

  if (!models.length) throw new Error("Venice no devolvió modelos de texto disponibles.");
  models.sort((a, b) =>
    Number(a.deprecated) - Number(b.deprecated) ||
    Number(b.uncensored) - Number(a.uncensored) ||
    a.name.localeCompare(b.name)
  );

  return {
    models,
    traits,
    compatibilityMapping,
    mostUncensoredId: traits.most_uncensored
  };
}

export async function getVeniceTextCatalog(force = false): Promise<VeniceTextCatalog> {
  if (!force && cached && cached.expires > Date.now()) return cached.value;
  if (!pending) {
    pending = loadCatalog().then((value) => {
      cached = { value, expires: Date.now() + 60_000 };
      return value;
    }).finally(() => { pending = null; });
  }
  return pending;
}

export function clearModelCatalogCache() {
  cached = null;
}
