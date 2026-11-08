import { NextRequest } from "next/server";
import { createAuthFetch } from "venice-x402-client";
import { models as fallbackModels } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Message = { role: "system" | "user" | "assistant"; content: string };
const hits = new Map<string, { count: number; reset: number }>();
const BASE = "https://api.venice.ai/api/v1";

function limited(key: string) {
  const now = Date.now();
  if (hits.size > 2000) for (const [ip, entry] of hits) if (entry.reset < now) hits.delete(ip);
  const item = hits.get(key);
  if (!item || item.reset < now) { hits.set(key, { count: 1, reset: now + 60_000 }); return false; }
  item.count++;
  return item.count > 10;
}
function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const walletKey = process.env.VENICE_WALLET_PRIVATE_KEY || process.env.WALLET_KEY;
  if (!walletKey) return error("Venice x402 no está configurado. Añade VENICE_WALLET_PRIVATE_KEY como secreto del servidor.", 503);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return error("Límite temporal alcanzado. Espera un minuto.", 429);

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2_000_000) return error("La solicitud supera 2 MB.", 413);
    body = JSON.parse(raw);
  } catch { return error("El cuerpo de la solicitud no es JSON válido.", 400); }
  if (!body || typeof body !== "object") return error("Solicitud no válida.", 400);

  const data = body as { model?: unknown; messages?: unknown; max_tokens?: unknown; temperature?: unknown };
  const modelId = typeof data.model === "string" ? data.model : "";
  const valid = fallbackModels.some(m => m.id === modelId) || /^[a-z0-9][a-z0-9._-]{1,120}$/i.test(modelId);
  if (!valid) return error("Identificador de modelo no válido.", 400);
  if (!Array.isArray(data.messages) || data.messages.length < 1 || data.messages.length > 80) return error("La conversación debe contener entre 1 y 80 mensajes.", 400);
  const messages = data.messages as Message[];
  let total = 0;
  for (const m of messages) {
    if (!m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 500_000) return error("Mensaje no válido o demasiado largo.", 400);
    total += m.content.length;
  }
  if (total > 1_500_000) return error("El contexto enviado supera el límite de AveroAI (1.5 M caracteres).", 413);
  if (!messages.some(m => m.role === "user")) return error("Se requiere al menos un mensaje del usuario.", 400);

  const requested = typeof data.max_tokens === "number" ? Math.floor(data.max_tokens) : 32768;
  const maxTokens = Math.max(1, Math.min(requested, 65536));
  const temperature = typeof data.temperature === "number" ? Math.max(0, Math.min(data.temperature, 2)) : 0.7;
  const authFetch = createAuthFetch(walletKey);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]);
  try {
    const upstream = await authFetch(`${BASE}/chat/completions`, {
      method: "POST", signal,
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ model: modelId, messages, stream: true, max_tokens: maxTokens, temperature })
    });
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 900);
      if (upstream.status === 402) return error("Venice x402 necesita saldo USDC disponible en la wallet configurada. Recarga el saldo; la API se cobra por uso.", 402);
      if (upstream.status === 429) return error("Venice está limitando temporalmente este modelo. Espera y vuelve a intentarlo.", 429);
      return error(`Venice respondió ${upstream.status}: ${detail}`, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502);
    }
    if (!upstream.body) return error("Venice no devolvió un flujo de respuesta.", 502);
    const reader = upstream.body.getReader(), decoder = new TextDecoder(), encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";
        const consume = (line: string) => {
          if (!line.startsWith("data:")) return;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") return;
          try {
            const parsed = JSON.parse(raw);
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (typeof chunk === "string" && chunk) controller.enqueue(encoder.encode(chunk));
          } catch { /* Ignore SSE keepalives. */ }
        };
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n"); buffer = lines.pop() || "";
            for (const line of lines) consume(line.replace(/\r$/, ""));
          }
          buffer += decoder.decode();
          if (buffer.trim()) consume(buffer);
          controller.close();
        } catch { controller.error(new Error("La conexión con Venice se interrumpió.")); }
        finally { reader.releaseLock(); }
      },
      cancel() { reader.cancel().catch(() => {}); }
    });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") return error("Venice tardó demasiado en responder.", 504);
    return error("No se pudo completar la solicitud x402. Revisa el saldo de la wallet y la conexión.", 502);
  }
}