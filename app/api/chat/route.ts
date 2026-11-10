import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { models, type ProviderId } from "@/lib/models";
import type { CommunityNodeConfig } from "@/lib/community-node";
import {
  communityNodeEndpoint,
  getCommunityNodeConfig,
  signCommunityNodeRequest
} from "@/lib/community-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Message = { role: "system" | "user" | "assistant"; content: string };
const hits = new Map<string, { count: number; reset: number }>();

function ready(id: ProviderId, communityConfigured: boolean) {
  if (id === "community") return communityConfigured;
  const env: Record<Exclude<ProviderId, "community">, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    custom: process.env.CUSTOM_API_KEY
  };
  return Boolean(env[id] && (
    id !== "custom" ||
    (process.env.CUSTOM_BASE_URL && process.env.CUSTOM_MODEL_ID)
  ));
}

function limited(key: string) {
  const now = Date.now();
  if (hits.size > 2000) {
    for (const [ip, entry] of hits) {
      if (entry.reset < now) hits.delete(ip);
    }
  }
  const item = hits.get(key);
  if (!item || item.reset < now) {
    hits.set(key, { count: 1, reset: now + 60_000 });
    return false;
  }
  item.count++;
  return item.count > 15;
}

function error(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(forwarded)) {
    return error("Has enviado demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.", 429);
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 100_000) {
      return error("La solicitud es demasiado grande.", 413);
    }
    body = JSON.parse(raw);
  } catch {
    return error("El cuerpo de la solicitud no es JSON válido.", 400);
  }

  if (!body || typeof body !== "object") return error("Solicitud no válida.", 400);
  const data = body as { model?: unknown; messages?: unknown };
  const modelId = typeof data.model === "string" ? data.model : "";

  let communityConfig: CommunityNodeConfig | null;
  try {
    communityConfig = getCommunityNodeConfig();
  } catch {
    return error("La configuración del nodo comunitario del servidor es inválida.", 503);
  }

  const communityModel = communityConfig && modelId === communityConfig.modelId
    ? {
        id: communityConfig.modelId,
        name: communityConfig.modelName,
        provider: "Aveiro Community Compute",
        providerId: "community" as const,
        description: "Open-weight model served by an Aveiro community node",
        category: "Open" as const,
        context: "Runtime dependent"
      }
    : undefined;

  const customModel = process.env.CUSTOM_MODEL_ID && modelId === process.env.CUSTOM_MODEL_ID
    ? {
        id: modelId,
        name: process.env.CUSTOM_MODEL_NAME || "Custom model",
        provider: "Custom endpoint",
        providerId: "custom" as const,
        description: "OpenAI-compatible custom model",
        category: "Open" as const,
        context: "Provider defined"
      }
    : undefined;

  const model = communityModel || models.find((item) => item.id === modelId) || customModel;
  if (!model) return error("Modelo no reconocido.", 400);

  if (!Array.isArray(data.messages) || data.messages.length < 1 || data.messages.length > 40) {
    return error("La conversación debe contener entre 1 y 40 mensajes.", 400);
  }

  const messages = data.messages as Message[];
  let total = 0;
  for (const message of messages) {
    if (
      !message ||
      !["system", "user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      message.content.length > 20_000
    ) {
      return error("Hay un mensaje con formato no válido o demasiado largo.", 400);
    }
    total += message.content.length;
  }
  if (total > 60_000) return error("La conversación supera el límite de contexto de Aveiro.", 413);
  if (!messages.some((message) => message.role === "user")) {
    return error("Se requiere al menos un mensaje del usuario.", 400);
  }

  const cleanMessages = messages.map(({ role, content }) => ({ role, content }));
  if (!ready(model.providerId, Boolean(communityConfig))) {
    return error(
      `Configura el acceso autorizado de ${model.provider} en las variables privadas del servidor.`,
      503
    );
  }

  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(model.providerId === "community" ? 150_000 : 90_000)
  ]);

  try {
    let upstream: Response;

    if (model.providerId === "community") {
      if (!communityConfig) return error("No hay un nodo comunitario configurado.", 503);
      const path = "/v1/node/infer";
      const requestBody = JSON.stringify({
        requestId: randomUUID(),
        modelId: model.id,
        messages: cleanMessages
      });
      const signedHeaders = signCommunityNodeRequest(
        communityConfig,
        "POST",
        path,
        requestBody
      );

      upstream = await fetch(communityNodeEndpoint(communityConfig, path), {
        method: "POST",
        signal,
        redirect: "error",
        headers: {
          ...signedHeaders,
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: requestBody
      });
    } else if (model.providerId === "anthropic") {
      const system = messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n");
      upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: model.id,
          max_tokens: 4096,
          stream: true,
          messages: cleanMessages
            .filter((message) => message.role !== "system")
            .map((message) => ({ role: message.role, content: message.content })),
          ...(system ? { system } : {})
        })
      });
    } else {
      const configs: Record<string, { url: string; key: string }> = {
        openai: {
          url: "https://api.openai.com/v1/chat/completions",
          key: process.env.OPENAI_API_KEY!
        },
        google: {
          url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          key: process.env.GOOGLE_API_KEY!
        },
        openrouter: {
          url: "https://openrouter.ai/api/v1/chat/completions",
          key: process.env.OPENROUTER_API_KEY!
        }
      };
      const cfg = configs[model.providerId] || {
        url: `${process.env.CUSTOM_BASE_URL!.replace(/\/$/, "")}/chat/completions`,
        key: process.env.CUSTOM_API_KEY!
      };
      let endpoint: URL;
      try {
        endpoint = new URL(cfg.url);
      } catch {
        return error("CUSTOM_BASE_URL no es una URL válida.", 500);
      }
      if (
        endpoint.protocol !== "https:" &&
        endpoint.hostname !== "localhost" &&
        endpoint.hostname !== "127.0.0.1"
      ) {
        return error("El endpoint personalizado debe usar HTTPS.", 500);
      }
      upstream = await fetch(cfg.url, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.key}`,
          ...(model.providerId === "openrouter"
            ? {
                "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
                "X-Title": "Aveiro.ai"
              }
            : {})
        },
        body: JSON.stringify({
          model: model.id,
          messages: cleanMessages,
          stream: true
        })
      });
    }

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 700);
      return error(
        `Error de ${model.provider} (${upstream.status}): ${detail}`,
        upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502
      );
    }
    if (!upstream.body) return error("El proveedor no devolvió un flujo de respuesta.", 502);

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = "";
        const consume = (line: string) => {
          if (!line.startsWith("data:")) return;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") return;
          try {
            const parsed = JSON.parse(raw);
            const chunk = model.providerId === "anthropic"
              ? (parsed.type === "content_block_delta" ? parsed.delta?.text || "" : "")
              : parsed.choices?.[0]?.delta?.content;
            if (typeof chunk === "string" && chunk) controller.enqueue(encoder.encode(chunk));
          } catch {
            // Ignore SSE comments and malformed keepalives.
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) consume(line.replace(/\r$/, ""));
          }
          buffer += decoder.decode();
          if (buffer.trim()) consume(buffer);
          controller.close();
        } catch {
          controller.error(new Error("La conexión con el proveedor se interrumpió."));
        } finally {
          reader.releaseLock();
        }
      },
      cancel() {
        reader.cancel().catch(() => {});
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return error("El proveedor tardó demasiado en responder. Inténtalo de nuevo.", 504);
    }
    return error("No se pudo completar la solicitud. Comprueba la conexión y la configuración del proveedor.", 502);
  }
}
