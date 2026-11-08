import type { ModelInfo } from "@/lib/models";

const BASE = "https://api.venice.ai/api/v1";
type AnyRecord = Record<string, any>;
type CatalogResult = { models: ModelInfo[]; mostUncensoredId?: string };

let cached: { expires: number; value: CatalogResult } | null = null;
let pending: Promise<CatalogResult> | null = null;

function isExplicitlyUncensored(row: AnyRecord, spec: AnyRecord): boolean {
  const caps = spec.capabilities || row.capabilities;
  if (spec.uncensored === true || spec.isUncensored === true || row.uncensored === true || row.isUncensored === true) return true;
  if (Array.isArray(caps) && caps.some((v) => typeof v === "string" && /uncensored/i.test(v))) return true;
  if (caps && typeof caps === "object" && Object.entries(caps).some(([key, value]) => /uncensored/i.test(key) && (value === true || value === "true" || value === 1 || value === "Uncensored"))) return true;
  const traits = [spec.traits, row.traits, spec.tags, row.tags, spec.capabilityTags, row.capabilityTags].flatMap((v) => Array.isArray(v) ? v : []);
  if (traits.some((v) => typeof v === "string" && /uncensored|abliterated|heretic/i.test(v))) return true;
  return /uncensored|abliterated|heretic/i.test([spec.name, spec.description, row.id].filter(Boolean).join(" "));
}

function priceValue(value: any): number | undefined {
  const raw = value && typeof value === "object" ? (value.usd ?? value.USD ?? value.value) : value;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function mapModel(row: AnyRecord): ModelInfo | null {
  if (!row || typeof row.id !== "string") return null;
  const spec: AnyRecord = row.model_spec && typeof row.model_spec === "object" ? row.model_spec : row;
  if (spec.offline === true) return null;
  if (!isExplicitlyUncensored(row, spec)) return null;
  const caps = spec.capabilities;
  const capNames = Array.isArray(caps)
    ? caps.filter((v: unknown) => typeof v === "string")
    : caps && typeof caps === "object"
      ? Object.entries(caps).filter(([, v]) => v === true).map(([k]) => k)
      : [];
  const context = Number(spec.availableContextTokens ?? spec.context_length ?? spec.contextLength ?? spec.context_window);
  const pricing = spec.pricing || {};
  const input = priceValue(pricing.input?.usd ?? pricing.input_usd ?? pricing.input);
  const output = priceValue(pricing.output?.usd ?? pricing.output_usd ?? pricing.output);
  const name = typeof spec.name === "string" ? spec.name : row.id;
  const description = typeof spec.description === "string" ? spec.description : "";
  return {
    id: row.id,
    name,
    provider: "Venice · modelo uncensored",
    providerId: "venice",
    description: [description, ...capNames.map((v: string) => v.replace(/([A-Z])/g, " $1")), spec.deprecation ? "Retiring" : ""].filter(Boolean).join(" · ").slice(0, 420) || "Modelo marcado Uncensored en el catálogo oficial de Venice",
    category: /flash|fast|haiku|mini/i.test(name + row.id) ? "Fast" : "Frontier",
    context: context > 0 ? (context >= 1000 ? Math.round(context / 1000) + "K" : String(context)) : "No publicado",
    uncensored: true,
    deprecated: Boolean(spec.deprecation),
    inputPrice: input,
    outputPrice: output,
    maxCompletionTokens: Number(spec.maxCompletionTokens) > 0 ? Number(spec.maxCompletionTokens) : undefined,
    privacy: typeof spec.privacy === "string" ? spec.privacy : undefined,
    supportsVision: Boolean(caps?.supportsVision),
    supportsReasoning: Boolean(caps?.supportsReasoning),
    supportsFunctionCalling: Boolean(caps?.supportsFunctionCalling)
  } as ModelInfo;
}

async function loadCatalog(): Promise<CatalogResult> {
  const response = await fetch(`${BASE}/models?type=text`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Venice model catalog returned ${response.status}`);
  const payload: AnyRecord = await response.json();
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
  if (!rows.length) throw new Error("Venice returned an empty or unrecognized text-model catalog");

  let mostUncensoredId: string | undefined;
  try {
    const traitsResponse = await fetch(`${BASE}/models/traits?type=text`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000)
    });
    if (traitsResponse.ok) {
      const traitsPayload: AnyRecord = await traitsResponse.json();
      const traits = traitsPayload.data || traitsPayload;
      if (typeof traits.most_uncensored === "string") mostUncensoredId = traits.most_uncensored;
    }
  } catch { /* The explicit Uncensored capability remains authoritative when traits are unavailable. */ }

  const models = rows.map(mapModel).filter((m: ModelInfo | null): m is ModelInfo => Boolean(m));
  if (mostUncensoredId && !models.some((m) => m.id === mostUncensoredId)) {
    const row = rows.find((item: AnyRecord) => item.id === mostUncensoredId);
    if (row) {
      const spec = row.model_spec || row;
      const promoted = mapModel({ ...row, model_spec: { ...spec, traits: [...(Array.isArray(spec.traits) ? spec.traits : []), "uncensored"] } });
      if (promoted) models.unshift(promoted);
    }
  }
  models.sort((a, b) => Number(a.deprecated) - Number(b.deprecated) || a.name.localeCompare(b.name));
  return { models, mostUncensoredId };
}

export async function getUncensoredTextCatalog(force = false): Promise<CatalogResult> {
  if (!force && cached && cached.expires > Date.now()) return cached.value;
  if (!pending) {
    pending = loadCatalog().then((value) => {
      cached = { value, expires: Date.now() + 60_000 };
      return value;
    }).finally(() => { pending = null; });
  }
  return pending;
}

export function clearModelCatalogCache() { cached = null; }
