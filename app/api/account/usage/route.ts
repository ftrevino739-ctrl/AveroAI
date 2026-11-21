import { NextRequest } from "next/server";
import { createIdentityStore } from "@/lib/identity-store";
import { getIdentityPool } from "@/lib/postgres";
import { createQuotaStore } from "@/lib/quota-store";
import { sessionStore } from "@/lib/session-store";
import { SESSION_COOKIE_NAME, clearSessionCookieHeaders } from "@/lib/auth-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: unknown, status = 200, clearCookies = false) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (clearCookies) {
    for (const cookie of clearSessionCookieHeaders()) headers.append("Set-Cookie", cookie);
  }
  return Response.json(body, { status, headers });
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return response({ authenticated: false }, 401);
  try {
    const session = await sessionStore.getSession(token);
    if (!session) return response({ authenticated: false }, 401, true);
    const pool = getIdentityPool();
    const account = await createIdentityStore(pool).getActiveAccount(session.userId);
    if (!account) {
      await sessionStore.revokeSession(token);
      return response({ authenticated: false }, 401, true);
    }
    const usage = await createQuotaStore(pool).getRequestUsage(account.id);
    if (!usage) {
      return response({
        authenticated: true,
        configured: false,
        requests: null,
        accounting: { tokenMetering: "disabled", credits: "disabled" }
      });
    }
    return response({
      authenticated: true,
      configured: true,
      requests: usage,
      accounting: {
        tokenMetering: "disabled_until_trusted_provider_metadata",
        credits: "disabled"
      }
    });
  } catch {
    return response({ error: "No se pudo consultar el uso de la cuenta." }, 503);
  }
}
