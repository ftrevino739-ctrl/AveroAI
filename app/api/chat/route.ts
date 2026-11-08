import { NextRequest } from "next/server";
import { models, providerReady } from "@/lib/models";

export const runtime = "nodejs";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const modelId = String(body.model || "");
    const messages = body.messages as ChatMessage[];
    const model = models.find((item) => item.id === modelId);
    if (!model) return Response.json({ error: "Modelo no reconocido." }, { status: 400 });
    if (!Array.isArray(messages) || messages.length === 0) return Response.json({ error: "No hay mensajes para enviar." }, { status: 400 });
    if (!providerReady(model.providerId)) return Response.json({ error: `Falta configurar la API key del proveedor ${model.provider} en el servidor.` }, { status: 503 });

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return Response.json({ error: "Se requiere un mensaje del usuario." }, { status: 400 });

    let upstream: Response;
    if (model.providerId === "anthropic") {
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: model.id, max_tokens: 4096, stream: true, messages: messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content })), system: messages.find(m => m.role === "system")?.content })
      });
    } else {
      const configs: Record<string, { url: string; key: string; model: string }> = {
        openai: { url: "https://api.openai.com/v1/chat/completions", key: process.env.OPENAI_API_KEY!, model: model.id },
        google: { url: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, key: process.env.GOOGLE_API_KEY!, model: model.id },
        openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", key: process.env.OPENROUTER_API_KEY!, model: model.id }
      };
      const config = configs[model.providerId] || { url: `${process.env.CUSTOM_BASE_URL}/chat/completions`, key: process.env.CUSTOM_API_KEY!, model: model.id };
      upstream = await fetch(config.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.key}`, ...(model.providerId === "openrouter" ? { "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": "AveroAI" } : {}) },
        body: JSON.stringify({ model: config.model, messages, stream: true })
      });
    }

    if (!upstream.ok) {
      const detail = await upstream.text();
      return Response.json({ error: `El proveedor respondió ${upstream.status}: ${detail.slice(0, 500)}` }, { status: upstream.status });
    }
    if (!upstream.body) return Response.json({ error: "El proveedor no devolvió un flujo de respuesta." }, { status: 502 });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();
    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const parsed = JSON.parse(payload);
                const text = model.providerId === "anthropic"
                  ? (parsed.type === "content_block_delta" ? parsed.delta?.text || "" : "")
                  : parsed.choices?.[0]?.delta?.content || "";
                if (text) controller.enqueue(encoder.encode(text));
              } catch { /* Ignore non-JSON SSE keepalives. */ }
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      }
    });
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
  } catch {
    return Response.json({ error: "No se pudo procesar la solicitud." }, { status: 500 });
  }
}
