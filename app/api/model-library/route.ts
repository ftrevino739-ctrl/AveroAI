import { LOCAL_MODEL_LIBRARY } from "@/lib/local-model-library.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    models: LOCAL_MODEL_LIBRARY,
    sourcePolicy: "Los pesos se descargan directamente del creador o del repositorio Hugging Face indicado. AveroAI solo conserva metadatos y comandos; nunca copia los archivos de pesos al repositorio."
  }, { headers: { "Cache-Control": "no-store" } });
}
