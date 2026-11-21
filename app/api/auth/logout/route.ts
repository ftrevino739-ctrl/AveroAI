import { NextRequest } from "next/server";
import { sessionStore } from "@/lib/session-store";
import {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  clearSessionCookieHeaders,
  constantTimeTextEquals,
  getCanonicalAuthOrigin,
  isTrustedOrigin
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

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value || null;
  const csrfHeader = request.headers.get("x-aveiro-csrf");

  try {
    if (sessionToken) {
      const session = await sessionStore.getSession(sessionToken);
      if (session) {
        if (!constantTimeTextEquals(csrfCookie, csrfHeader) ||
            !await sessionStore.verifyCsrf(sessionToken, csrfHeader)) {
          return fail("La validación de seguridad de la sesión no es válida.", 403);
        }
        await sessionStore.revokeSession(sessionToken);
      }
    }

    const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin" });
    for (const cookie of clearSessionCookieHeaders()) headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 204, headers });
  } catch {
    return fail("No se pudo cerrar la sesión. Inténtalo de nuevo.", 503);
  }
}
