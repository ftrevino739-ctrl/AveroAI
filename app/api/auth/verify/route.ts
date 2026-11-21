import { NextRequest } from "next/server";
import { createIdentityStore } from "@/lib/identity-store";
import { getIdentityPool } from "@/lib/postgres";
import { sessionStore } from "@/lib/session-store";
import {
  SESSION_COOKIE_NAME,
  getCanonicalAuthOrigin,
  isTrustedOrigin,
  sessionCookieHeaders
} from "@/lib/auth-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store", "Vary": "Origin" }
  });
}

export async function POST(request: NextRequest) {
  try {
    getCanonicalAuthOrigin();
  } catch {
    return fail("El origen seguro de autenticación no está configurado.", 503);
  }
  if (!isTrustedOrigin(request.headers.get("origin"))) return fail("Origen no autorizado.", 403);

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4096) return fail("La solicitud es demasiado grande.", 413);
    body = JSON.parse(raw);
  } catch {
    return fail("La solicitud no es válida.", 400);
  }

  const token = body && typeof body === "object" ? (body as { token?: unknown }).token : null;
  try {
    const account = await createIdentityStore(getIdentityPool()).consumeMagicLink(token);
    if (!account) return fail("El enlace no es válido, ya se utilizó o ha caducado.", 401);

    // Token consumption precedes session creation; a Redis outage requires a fresh email link.
    const created = await sessionStore.createSession(account.id);
    const previousToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (previousToken) {
      try {
        await sessionStore.revokeSession(previousToken);
      } catch {
        await sessionStore.revokeSession(created.token).catch(() => false);
        return fail("No se pudo completar el inicio de sesión. Solicita un enlace nuevo.", 503);
      }
    }

    const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin" });
    for (const cookie of sessionCookieHeaders(created.token, created.csrfToken)) {
      headers.append("Set-Cookie", cookie);
    }
    return Response.json({
      authenticated: true,
      user: { id: account.id, email: account.email }
    }, { status: 200, headers });
  } catch {
    return fail("El servicio de acceso no está disponible temporalmente.", 503);
  }
}
