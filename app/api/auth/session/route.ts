import { NextRequest } from "next/server";
import { createIdentityStore } from "@/lib/identity-store";
import { getIdentityPool } from "@/lib/postgres";
import { sessionStore } from "@/lib/session-store";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookieHeaders
} from "@/lib/auth-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized(clear = false) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (clear) {
    for (const cookie of clearSessionCookieHeaders()) headers.append("Set-Cookie", cookie);
  }
  return Response.json({ authenticated: false }, { status: 401, headers });
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return unauthorized();

  try {
    const session = await sessionStore.getSession(token);
    if (!session) return unauthorized(true);

    const account = await createIdentityStore(getIdentityPool()).getActiveAccount(session.userId);
    if (!account) {
      await sessionStore.revokeSession(token);
      return unauthorized(true);
    }

    return Response.json({
      authenticated: true,
      user: { id: account.id, email: account.email }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "El servicio de sesión no está disponible temporalmente." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
