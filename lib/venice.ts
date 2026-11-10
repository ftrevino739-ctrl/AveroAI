import type { ModelInfo } from "@/lib/models";
import { asStringMap, mapVeniceModel, selectDefaultModelId } from "@/lib/venice-catalog.js";

const BASE = "https://api.venice.ai/api/v1";
type AnyRecord = Record<string, any>;
export type VeniceTextCatalog = {
  models: ModelInfo[];
  traits: Record<string, string>;
  compatibilityMapping: Record<string, string>;
  mostUncensoredId?: string;
  defaultModelId: string;
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
    .map((row: AnyRecord) => mapVeniceModel(row))
    .filter((model: ModelInfo | null): model is ModelInfo => Boolean(model));

  if (!models.length) throw new Error("Venice no devolvió modelos de texto disponibles.");
  models.sort((a, b) => Number(Boolean(a.deprecated)) - Number(Boolean(b.deprecated)) || a.name.localeCompare(b.name));

  return {
    models,
    traits,
    compatibilityMapping,
    defaultModelId: selectDefaultModelId(models, traits),
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
