import { NextRequest } from "next/server";
import { createAuthFetch } from "venice-x402-client";
import { getVeniceTextCatalog } from "@/lib/venice";
import { resolveVeniceModelId } from "@/lib/venice-catalog.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Message = { role: "system" | "user" | "assistant"; content: string };
const hits = new Map<string, { count: number; reset: number }>();
const BASE = "https://api.venice.ai/api/v1";
const WALLET_KEY_PATTERN = /^0x[0-9a-f]{64}$/i;
const DEFAULT_COMPLETION_TOKENS = 4096;
const HARD_COMPLETION_TOKEN_LIMIT = 8192;

function clientIp(request: NextRequest) {
  return request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
function limited(key: string) {
  const now = Date.now();
  if (hits.size > 2000) for (const [ip, entry] of hits) if (entry.reset < now) hits.delete(ip);
  const item = hits.get(key);
  if (!item || item.reset < now) { hits.set(key, { count: 1, reset: now + 60_000 }); return false; }
  item.count++;
  return item.count > 10;
}
function error(message: string, status: number, headers: Record<string,string> = {}) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function visibleText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map(part => {
    if (typeof part === "string") return part;
    if (!isRecord(part)) return "";
    if (typeof part.text === "string") return part.text;
    if (part.type === "text" && typeof part.content === "string") return part.content;
    return "";
  }).join("");
}
function extractVisibleText(payload: Record<string, any>) {
  const choice = payload.choices?.[0];
  const delta = choice?.delta;
  const content = delta?.content ?? choice?.message?.content ?? payload.output_text;
  const text = visibleText(content);
  return text || (typeof delta?.refusal === "string" ? delta.refusal : "");
}

export async function POST(request: NextRequest) {
  const walletKey = process.env.VENICE_WALLET_PRIVATE_KEY || "";
  if (!WALLET_KEY_PATTERN.test(walletKey)) return error("Configura VENICE_WALLET_PRIVATE_KEY como una clave EVM de 32 bytes en formato 0x hexadecimal.", 503);
  if (limited(clientIp(request))) return error("Límite temporal alcanzado. Espera un minuto.", 429);

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2_000_000) return error("La solicitud supera 2 MB.", 413);
    body = JSON.parse(raw);
  } catch { return error("El cuerpo de la solicitud no es JSON válido.", 400); }
  if (!isRecord(body)) return error("Solicitud no válida.", 400);
  const modelId = typeof body.model === "string" ? body.model.trim() : "";
  if (!/^[a-z0-9][a-z0-9._:-]{0,120}$/i.test(modelId)) return error("Identificador de modelo no válido.", 400);
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 80) return error("La conversación debe contener entre 1 y 80 mensajes.", 400);
  const messages = body.messages as Message[];
  let total = 0;
  for (const message of messages) {
    if (!isRecord(message) || !["system","user","assistant"].includes(message.role) || typeof message.content !== "string" || message.content.length > 500_000) return error("Mensaje no válido o demasiado largo.", 400);
    total += message.content.length;
  }
  if (total > 1_500_000) return error("El contexto enviado supera el límite de AveroAI (1.5 M caracteres).", 413);
  if (!messages.some(message => message.role === "user")) return error("Se requiere al menos un mensaje del usuario.", 400);

  let catalog;
  try { catalog = await getVeniceTextCatalog(); }
  catch { return error("No se pudo verificar el modelo contra el catálogo oficial de Venice. No se enviará la solicitud.", 503); }

  const canonicalModelId = resolveVeniceModelId(modelId, catalog.models, catalog.compatibilityMapping);
  if (!canonicalModelId) return error("El modelo o alias no pertenece al catálogo actual de Venice.", 403);
  const selectedModel = catalog.models.find(model => model.id === canonicalModelId);
  if (!selectedModel) return error("El modelo solicitado ya no está disponible.", 403);
  const providerLimit = selectedModel.maxCompletionTokens && selectedModel.maxCompletionTokens > 0 ? selectedModel.maxCompletionTokens : HARD_COMPLETION_TOKEN_LIMIT;
  const hardLimit = Math.max(1, Math.min(providerLimit, HARD_COMPLETION_TOKEN_LIMIT));
  const requested = typeof body.max_completion_tokens === "number" && Number.isFinite(body.max_completion_tokens) && body.max_completion_tokens > 0
    ? Math.floor(body.max_completion_tokens) : DEFAULT_COMPLETION_TOKENS;
  const maxCompletionTokens = Math.max(1, Math.min(requested, hardLimit));
  const temperature = typeof body.temperature === "number" && Number.isFinite(body.temperature) ? Math.max(0,Math.min(body.temperature,2)) : undefined;
  const payload: Record<string, unknown> = {
    model: canonicalModelId, messages, stream: true, max_completion_tokens: maxCompletionTokens,
    venice_parameters: { include_venice_system_prompt: false }
  };
  if (temperature !== undefined) payload.temperature = temperature;

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]);
  try {
    // SIWX authenticates the wallet; this route does not call topUp() or settle payments.
    const authFetch = createAuthFetch(walletKey);
    const upstream = await authFetch(BASE + "/chat/completions", {
      method:"POST", signal,
      headers:{"content-type":"application/json",accept:"text/event-stream"},
      body:JSON.stringify(payload)
    });
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0,700);
      if (upstream.status === 401) return error("Venice rechazó la autenticación SIWX o el modelo requiere acceso adicional.",401);
      if (upstream.status === 402) return error("Venice respondió 402 Payment Required. Puede requerir credenciales, saldo apto o un límite de gasto; AveroAI no realiza topUp ni pagos automáticos.",402);
      if (upstream.status === 429) {
        const retry = upstream.headers.get("retry-after");
        return error("Venice está limitando temporalmente este modelo. Inténtalo más tarde.",429,retry?{"Retry-After":retry}:{});
      }
      if (upstream.status === 404) return error("Venice ya no reconoce ese modelo. Actualiza el catálogo.",404);
      return error("Venice respondió "+upstream.status+": "+detail,upstream.status>=400&&upstream.status<600?upstream.status:502);
    }
    if (!upstream.body) return error("Venice no devolvió un flujo de respuesta.",502);
    const reader=upstream.body.getReader(),decoder=new TextDecoder(),encoder=new TextEncoder();
    const stream=new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer="",dataLines:string[]=[],received=false;
        const dispatch=()=>{
          const raw=dataLines.join("\n").trim();dataLines=[];
          if(!raw||raw==="[DONE]")return;
          try {
            const parsed:unknown=JSON.parse(raw);
            if(!isRecord(parsed))return;
            if(isRecord(parsed.error)){
              const message=typeof parsed.error.message==="string"?parsed.error.message:"El proveedor interrumpió la generación.";
              received=true;controller.enqueue(encoder.encode("\n\n[Error de Venice: "+message.slice(0,500)+"]"));
              return;
            }
            if(parsed.type==="content_filter_error"){
              received=true;controller.enqueue(encoder.encode("\n\n[Venice bloqueó parte de esta respuesta por sus políticas de contenido.]"));
              return;
            }
            // Do not expose reasoning_content as the assistant's user-facing answer.
            const chunk=extractVisibleText(parsed);
            if(chunk){received=true;controller.enqueue(encoder.encode(chunk));}
          } catch {}
        };
        const consume=(line:string)=>{
          const value=line.replace(/\r$/,"");
          if(value===""){dispatch();return;}
          if(value.startsWith("data:"))dataLines.push(value.slice(5).replace(/^ /,""));
        };
        try {
          while(true){
            const {done,value}=await reader.read();if(done)break;
            buffer+=decoder.decode(value,{stream:true});
            const lines=buffer.split("\n");buffer=lines.pop()||"";
            for(const line of lines)consume(line);
          }
          buffer+=decoder.decode();if(buffer)consume(buffer);dispatch();
          if(!received)controller.enqueue(encoder.encode("El modelo terminó sin devolver texto visible compatible con el chat."));
          controller.close();
        } catch { controller.error(new Error("La conexión con el modelo se interrumpió.")); }
        finally { reader.releaseLock(); }
      },
      cancel(){reader.cancel().catch(()=>{});}
    });
    return new Response(stream,{headers:{
      "Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-cache, no-transform","X-Accel-Buffering":"no",
      "X-AveroAI-Model":canonicalModelId,"X-AveroAI-Requested-Model":modelId,"X-AveroAI-Provider":"Venice"
    }});
  } catch (caught) {
    if(caught instanceof Error&&caught.name==="TimeoutError")return error("Venice tardó demasiado en responder.",504);
    return error("No se pudo completar la inferencia x402. Revisa SIWX, el saldo y la conexión.",502);
  }
}
