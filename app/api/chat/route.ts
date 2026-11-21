import { randomUUID } from "node:crypto";
import { getIdentityPool } from "@/lib/postgres";
import { createIdentityStore } from "@/lib/identity-store";
import { sessionStore } from "@/lib/session-store";
import { createQuotaStore } from "@/lib/quota-store";
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  constantTimeTextEquals,
  getCanonicalAuthOrigin
} from "@/lib/auth-security";
import { NextRequest } from "next/server";
import { models, type ProviderId, COMMUNITY_MODEL_PREFIX } from "@/lib/models";
import { consumeChatRateLimit, reserveProviderNodeForModel, type ProviderNodeReservation } from "@/lib/provider-registry";
import type { CommunityNodeConfig } from "@/lib/community-node";
import {
  communityNodeEndpoint,
  getCommunityNodeConfig,
  signCommunityNodeRequest
} from "@/lib/community-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Message = { role: "system" | "user" | "assistant"; content: string };
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

function error(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}


function accountAuthRequired(): boolean {
  return process.env.AVEIRO_REQUIRE_AUTH === "true" ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview");
}

async function requireAccountSession(request: NextRequest): Promise<{ accountId: string | null } | Response> {
  if (!accountAuthRequired()) return { accountId: null };

  let expectedOrigin: string;
  try {
    expectedOrigin = getCanonicalAuthOrigin();
  } catch {
    return error("El origen seguro de autenticación no está configurado.", 503);
  }
  if (request.headers.get("origin") !== expectedOrigin) {
    return error("Origen no autorizado.", 403);
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return error("Inicia sesión para continuar.", 401);

  try {
    const session = await sessionStore.getSession(sessionToken);
    if (!session) return error("Tu sesión ha caducado. Inicia sesión de nuevo.", 401);

    const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value || null;
    const csrfHeader = request.headers.get("x-aveiro-csrf");
    if (!constantTimeTextEquals(csrfCookie, csrfHeader) ||
        !await sessionStore.verifyCsrf(sessionToken, csrfHeader)) {
      return error("La validación CSRF de la sesión no es válida.", 403);
    }

    const account = await createIdentityStore(getIdentityPool()).getActiveAccount(session.userId);
    if (!account) {
      await sessionStore.revokeSession(sessionToken);
      return error("La cuenta no está activa. Inicia sesión de nuevo.", 401);
    }

    const accountLimit = await consumeChatRateLimit("auth-chat-account:" + account.id, 15, 60);
    if (!accountLimit.allowed) {
      return Response.json(
        { error: "Has alcanzado el límite temporal de solicitudes de esta cuenta." },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(accountLimit.retryAfterSeconds) } }
      );
    }
    return { accountId: account.id };
  } catch {
    return error("La autenticación no está disponible temporalmente.", 503);
  }
}

export async function POST(request: NextRequest) {
  const forwarded = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  let rateLimit: { allowed: boolean; remaining: number; retryAfterSeconds: number };
  try {
    rateLimit = await consumeChatRateLimit(forwarded.slice(0, 200));
  } catch {
    return error("El control de solicitudes no está disponible. Inténtalo de nuevo más tarde.", 503);
  }
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "Has enviado demasiadas solicitudes. Espera un minuto e inténtalo de nuevo." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const authContext = await requireAccountSession(request);
  if (authContext instanceof Response) return authContext;
  const accountId = authContext.accountId;

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
  const dynamicCommunityModelId = modelId.startsWith(COMMUNITY_MODEL_PREFIX)
    ? modelId.slice(COMMUNITY_MODEL_PREFIX.length)
    : null;

  let communityConfig: CommunityNodeConfig | null = null;
  let communityConfigInvalid = false;
  try {
    communityConfig = getCommunityNodeConfig();
  } catch {
    communityConfigInvalid = true;
  }
  if (communityConfigInvalid && modelId === process.env.AVEIRO_COMMUNITY_MODEL_ID) {
    return error("La configuración del nodo comunitario del servidor es inválida.", 503);
  }

  const communityModel = dynamicCommunityModelId
    ? {
        id: dynamicCommunityModelId,
        name: dynamicCommunityModelId,
        provider: "Aveiro Community Compute",
        providerId: "community" as const,
        description: "Open-weight model served by a live registered Aveiro node",
        category: "Open" as const,
        context: "Runtime dependent"
      }
    : communityConfig && modelId === communityConfig.modelId
      ? {
          id: communityConfig.modelId,
          name: communityConfig.modelName,
          provider: "Aveiro Community Compute",
          providerId: "community" as const,
          description: "Open-weight model served by a statically configured Aveiro node",
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
  if (model.providerId !== "community" || !dynamicCommunityModelId) {
    return error("Aveiro solo acepta inferencia de modelos open-weight mediante nodos comunitarios aprobados. Los proveedores propietarios y endpoints externos están deshabilitados.", 403);
  }

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
  let dynamicReservation: ProviderNodeReservation | null = null;
  if (dynamicCommunityModelId) {
    try {
      dynamicReservation = await reserveProviderNodeForModel(dynamicCommunityModelId);
    } catch {
      return error("El registro de nodos comunitarios no está disponible.", 503);
    }
    if (!dynamicReservation) {
      return error("No hay un nodo comunitario listo con capacidad para ese modelo. Inténtalo más tarde.", 503);
    }
  }

  let reservationReleased = false;
  const releaseReservation = async () => {
    if (!dynamicReservation || reservationReleased) return;
    reservationReleased = true;
    await dynamicReservation.release().catch(() => {});
  };

  if (!ready(model.providerId, Boolean(communityConfig || dynamicReservation))) {
    await releaseReservation();
    return error(
      `Configura el acceso autorizado de ${model.provider} en las variables privadas del servidor.`,
      503
    );
  }

  // The monthly account allowance is reserved before any remote inference.
  // Community-node token counts remain unbilled until independently trustworthy.
  const requestId = randomUUID();
  let quotaStore: ReturnType<typeof createQuotaStore> | null = null;
  let quotaReserved = false;
  let quotaFinalization: Promise<boolean> | null = null;
  let dispatchAttempted = false;

  const finalizeRequestQuota = (outcome: "unmetered" | "released"): Promise<boolean> => {
    if (!accountId || !quotaStore || !quotaReserved) return Promise.resolve(false);
    if (!quotaFinalization) {
      quotaFinalization = (async () => {
        try {
          return outcome === "unmetered"
            ? await quotaStore!.markRequestUnmetered(accountId, requestId)
            : await quotaStore!.releaseUndispatchedRequest(accountId, requestId);
        } catch {
          // A stranded reservation expires after ten minutes and remains counted.
          return false;
        }
      })();
    }
    return quotaFinalization;
  };

  if (accountId) {
    try {
      quotaStore = createQuotaStore(getIdentityPool());
      const admission = await quotaStore.reserveChatRequest(accountId, model.id, requestId);
      if (!admission.ok) {
        await releaseReservation();
        if (admission.reason === "account_inactive") {
          return error("La cuenta ya no está activa. Inicia sesión de nuevo.", 401);
        }
        if (admission.reason === "limit_not_configured") {
          return error("Tu cuenta no tiene un límite mensual configurado. No se inició la inferencia.", 503);
        }
        if (admission.reason !== "limit_reached") {
          return error("No se pudo comprobar el límite de uso de la cuenta.", 503);
        }
        const retryAfterSeconds = Math.max(1, Math.ceil(
          (Date.parse(admission.usage.periodEndsAt) - Date.now()) / 1000
        ));
        return Response.json({
          error: "Has alcanzado el límite mensual de solicitudes de tu cuenta.",
          usage: admission.usage
        }, {
          status: 429,
          headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfterSeconds) }
        });
      }
      quotaReserved = true;
    } catch {
      await releaseReservation();
      return error("No se pudo reservar el uso de esta cuenta. La inferencia no se inició.", 503);
    }
  }

  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(model.providerId === "community" ? 150_000 : 90_000)
  ]);

  try {
    let upstream: Response;

    if (model.providerId === "community") {
      const activeCommunityConfig: CommunityNodeConfig | null = dynamicReservation
        ? {
            nodeId: dynamicReservation.nodeId,
            secret: dynamicReservation.secret,
            modelId: dynamicReservation.modelId,
            modelName: dynamicReservation.modelId,
            baseUrl: dynamicReservation.baseUrl
          }
        : communityConfig;
      if (!activeCommunityConfig) {
        await releaseReservation();
        return error("No hay un nodo comunitario configurado o disponible.", 503);
      }
      const path = "/v1/node/infer";
      const requestBody = JSON.stringify({
        requestId,
        modelId: model.id,
        messages: cleanMessages
      });
      const signedHeaders = signCommunityNodeRequest(
        activeCommunityConfig,
        "POST",
        path,
        requestBody
      );

      if (signal.aborted) {
        await finalizeRequestQuota("released");
        await releaseReservation();
        return error("La solicitud se canceló antes de enviarse al nodo.", 499);
      }
      dispatchAttempted = true;
      upstream = await fetch(communityNodeEndpoint(activeCommunityConfig, path), {
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
      await finalizeRequestQuota("unmetered");
      await releaseReservation();
      return error(
        `Error de ${model.provider} (${upstream.status}): ${detail}`,
        upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502
      );
    }
    if (!upstream.body) {
      await finalizeRequestQuota("unmetered");
      await releaseReservation();
      return error("El proveedor no devolvió un flujo de respuesta.", 502);
    }

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
          await finalizeRequestQuota("unmetered");
          await releaseReservation();
        }
      },
      async cancel() {
        await reader.cancel().catch(() => {});
        await finalizeRequestQuota("unmetered");
        await releaseReservation();
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
    await finalizeRequestQuota(dispatchAttempted ? "unmetered" : "released");
    await releaseReservation();
    if (err instanceof Error && err.name === "TimeoutError") {
      return error("El proveedor tardó demasiado en responder. Inténtalo de nuevo.", 504);
    }
    return error("No se pudo completar la solicitud. Comprueba la conexión y la configuración del proveedor.", 502);
  }
}
