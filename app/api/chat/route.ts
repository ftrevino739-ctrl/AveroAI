import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Message = { role: "system" | "user" | "assistant"; content: string };
const OLLAMA_BASE = (process.env.AVERO_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const hits = new Map<string, { count: number; reset: number }>();

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function clientIp(request: NextRequest) {
  return request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
function limited(key: string) {
  const now = Date.now();
  if (hits.size > 2000) for (const [ip, entry] of hits) if (entry.reset < now) hits.delete(ip);
  const item = hits.get(key);
  if (!item || item.reset < now) { hits.set(key, { count: 1, reset: now + 60_000 }); return false; }
  item.count++;
  return item.count > 20;
}

export async function POST(request: NextRequest) {
  if (limited(clientIp(request))) return error("Límite temporal alcanzado. Espera un minuto.", 429);

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2_000_000) return error("La solicitud supera 2 MB.", 413);
    body = JSON.parse(raw);
  } catch { return error("El cuerpo de la solicitud no es JSON válido.", 400); }
  if (!isRecord(body)) return error("Solicitud no válida.", 400);

  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model || model.length > 240) return error("Selecciona un modelo local válido.", 400);
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 80) return error("La conversación debe contener entre 1 y 80 mensajes.", 400);

  const messages = body.messages as Message[];
  let total = 0;
  for (const message of messages) {
    if (!isRecord(message) || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string" || message.content.length > 500_000) {
      return error("Mensaje no válido o demasiado largo.", 400);
    }
    total += message.content.length;
  }
  if (total > 1_500_000) return error("El contexto supera el límite local de AveroAI (1.5 M caracteres).", 413);
  if (!messages.some(message => message.role === "user")) return error("Se requiere al menos un mensaje del usuario.", 400);

  try {
    const tagsResponse = await fetch(OLLAMA_BASE + "/api/tags", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store"
    });
    if (!tagsResponse.ok) return error("Ollama no está disponible. Inicia el motor local.", 503);
    const tagsPayload: unknown = await tagsResponse.json();
    const installed = isRecord(tagsPayload) && Array.isArray(tagsPayload.models) ? tagsPayload.models : [];
    const isInstalled = installed.some((entry: unknown) => isRecord(entry) && (entry.name === model || entry.model === model));
    if (!isInstalled) return error("Ese modelo no está instalado en Ollama. Descárgalo localmente y actualiza el catálogo.", 404);

    const requested = typeof body.max_completion_tokens === "number" && Number.isFinite(body.max_completion_tokens) && body.max_completion_tokens > 0
      ? Math.floor(body.max_completion_tokens) : 1024;
    const maxTokens = Math.max(64, Math.min(requested, 4096));
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]);
    const upstream = await fetch(OLLAMA_BASE + "/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: maxTokens })
    });
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 700);
      return error("El motor local respondió " + upstream.status + ": " + detail, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
    }
    if (!upstream.body) return error("El motor local no devolvió un flujo de respuesta.", 502);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no"
      }
    });
  } catch {
    return error("No se pudo contactar con Ollama en " + OLLAMA_BASE + ". Este modo utiliza los pesos instalados localmente y no recurre a Venice como respaldo.", 503);
  }
}
