import type { ModelInfo } from "@/lib/models";
import { getLocalModelByOllamaTag } from "@/lib/local-model-library.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OLLAMA_BASE = (process.env.AVERO_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function GET() {
  try {
    const response = await fetch(OLLAMA_BASE + "/api/tags", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store"
    });
    if (!response.ok) throw new Error("Ollama respondió " + response.status);
    const payload: unknown = await response.json();
    const rows = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];
    const models: ModelInfo[] = rows.flatMap((row: unknown) => {
      if (!isRecord(row)) return [];
      const id = typeof row.name === "string" ? row.name : typeof row.model === "string" ? row.model : "";
      if (!id || id.length > 240) return [];
      const match = getLocalModelByOllamaTag(id);
      return [{
        id,
        name: match?.name || id,
        provider: "Ollama · ejecución local",
        providerId: "local" as const,
        description: match?.note || "Modelo instalado en el motor local Ollama.",
        category: "Open" as const,
        context: "Local",
        contextTokens: 0,
        uncensored: match?.uncensored ?? /uncensored|abliterated|heretic/i.test(id),
        traits: match?.uncensored ? ["uncensored", "local"] : ["local"],
        privacy: "Se ejecuta en este equipo",
        supportsVision: false,
        supportsReasoning: false,
        supportsFunctionCalling: false
      }];
    });
    models.sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({
      providers: [{ id: "local", name: "Ollama local", configured: true, models: models.length }],
      models,
      defaultModelId: models[0]?.id || "",
      connection: { provider: "Ollama local", configured: true, catalogue: "installed-models", externalInference: false }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({
      providers: [{ id: "local", name: "Ollama local", configured: false, models: 0 }],
      models: [],
      defaultModelId: "",
      connection: { provider: "Ollama local", configured: false, catalogue: "unavailable", externalInference: false },
      error: "No se puede conectar con Ollama en " + OLLAMA_BASE + ". Instálalo e inicia un modelo local; AveroAI no enviará mensajes a Venice ni a otro proveedor externo."
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
