import { models as fallbackModels, type ModelInfo } from "@/lib/models";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BASE = "https://api.venice.ai/api/v1";

function mapModel(item: any): ModelInfo | null {
  if (!item || typeof item.id !== "string") return null;
  const spec = item.model_spec || item;
  const name = item.name || spec.name || item.id;
  const caps = Array.isArray(spec.capabilities) ? spec.capabilities.join(" · ") : "";
  const contextValue = spec.context_length || spec.contextLength || spec.context_window || spec.constraints?.max_context_tokens;
  const pricing = spec.pricing || {};
  const id = item.id;
  return {
    id, name, provider: "Venice AI", providerId: "venice",
    description: [caps, spec.deprecation ? "Retiring" : ""].filter(Boolean).join(" · ") || "Venice hosted model",
    category: /flash|fast|haiku/i.test(name + id) ? "Fast" : "Frontier",
    context: contextValue ? (Number(contextValue) >= 1000 ? Math.round(Number(contextValue) / 1000) + "K" : String(contextValue)) : "Provider dependent",
    uncensored: /uncensored|abliterated|heretic/i.test(name + " " + id),
    deprecated: Boolean(spec.deprecation || /retiring/i.test(name)),
    inputPrice: Number(pricing.input || pricing.input_usd || 0) || undefined,
    outputPrice: Number(pricing.output || pricing.output_usd || 0) || undefined
  };
}

export async function GET() {
  const configured = Boolean(process.env.VENICE_WALLET_PRIVATE_KEY || process.env.WALLET_KEY);
  let catalogue: ModelInfo[] = fallbackModels;
  let live = false;
  try {
    const response = await fetch(`${BASE}/models?type=text`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (response.ok) {
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : (payload.data || payload.models || []);
      const mapped = rows.map(mapModel).filter(Boolean) as ModelInfo[];
      if (mapped.length) { catalogue = mapped; live = true; }
    }
  } catch { /* Keep the verified fallback catalogue when Venice discovery is unavailable. */ }
  return Response.json({
    providers: [{ id: "venice", name: "Venice AI · x402", configured, models: catalogue.length }],
    models: catalogue.map(m => ({ ...m, configured })),
    connection: { provider: "Venice x402", configured, catalogue: live ? "live" : "fallback" }
  }, { headers: { "Cache-Control": "no-store" } });
}