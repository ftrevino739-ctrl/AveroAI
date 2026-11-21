import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { createIdentityStore, normalizeAccountEmail } from "@/lib/identity-store";
import { getIdentityPool } from "@/lib/postgres";
import { consumeChatRateLimit } from "@/lib/provider-registry";
import { assertMagicLinkMailConfigured, sendMagicLinkEmail } from "@/lib/mail";
import { getCanonicalAuthOrigin, isTrustedOrigin } from "@/lib/auth-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(message: string, status: number) {
  return Response.json({ message }, {
    status,
    headers: { "Cache-Control": "no-store", "Vary": "Origin" }
  });
}

export async function POST(request: NextRequest) {
  try {
    getCanonicalAuthOrigin();
  } catch {
    return response("El origen seguro de autenticación no está configurado.", 503);
  }
  if (!isTrustedOrigin(request.headers.get("origin"))) {
    return response("Origen no autorizado.", 403);
  }
  try {
    assertMagicLinkMailConfigured();
  } catch {
    return response("El acceso por correo aún no está configurado en este entorno.", 503);
  }

  const ip = request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    const ipLimit = await consumeChatRateLimit("auth-link-ip:" + ip.slice(0, 180), 5, 900);
    if (!ipLimit.allowed) {
      return Response.json({ message: "Espera antes de solicitar otro enlace." }, {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(ipLimit.retryAfterSeconds) }
      });
    }
  } catch {
    return response("El servicio de acceso no está disponible temporalmente.", 503);
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) {
      return response("La solicitud es demasiado grande.", 413);
    }
    body = JSON.parse(raw);
  } catch {
    return response("La solicitud no es válida.", 400);
  }

  const emailInput = body && typeof body === "object" ? (body as { email?: unknown }).email : null;
  const email = normalizeAccountEmail(emailInput);
  if (!email) {
    return response("Si esta dirección puede acceder a AveiroAI, recibirás un enlace de un solo uso.", 202);
  }

  try {
    // Hash the normalized address before handing it to the shared Redis limiter.
    const emailDigest = createHash("sha256").update(email, "utf8").digest("hex");
    const emailLimit = await consumeChatRateLimit("auth-link-email:" + emailDigest, 3, 900);
    if (!emailLimit.allowed) {
      return Response.json({ message: "Espera antes de solicitar otro enlace." }, {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(emailLimit.retryAfterSeconds) }
      });
    }

    const store = createIdentityStore(getIdentityPool());
    const magicLink = await store.createMagicLink(email);
    if (!magicLink) {
      return response("No se pudo iniciar la solicitud de acceso. Inténtalo más tarde.", 503);
    }

    try {
      await sendMagicLinkEmail(magicLink.email, magicLink.token);
    } catch {
      await store.revokeMagicLink(magicLink.userId, magicLink.token).catch(() => false);
      return response("No se pudo entregar el correo de acceso. Inténtalo más tarde.", 503);
    }
    return response("Si esta dirección puede acceder a AveiroAI, recibirás un enlace de un solo uso.", 202);
  } catch {
    return response("El servicio de acceso no está disponible temporalmente.", 503);
  }
}
