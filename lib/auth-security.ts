import { timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "__Host-aveiro_session";
export const CSRF_COOKIE_NAME = "__Host-aveiro_csrf";
export const SESSION_ABSOLUTE_TTL_SECONDS = 7 * 24 * 60 * 60;

export function getCanonicalAuthOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.AVEIRO_AUTH_ORIGIN?.trim() || "";
  if (!configured) throw new Error("AVEIRO_AUTH_ORIGIN is not configured.");

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("AVEIRO_AUTH_ORIGIN must be a valid origin.");
  }

  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash
  ) {
    throw new Error("AVEIRO_AUTH_ORIGIN must contain only a scheme and host.");
  }

  if (env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("AVEIRO_AUTH_ORIGIN must use HTTPS in production.");
  }

  if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("HTTP is allowed only for loopback development origins.");
  }

  return url.origin;
}

export function isTrustedOrigin(originHeader: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!originHeader) return false;
  try {
    return originHeader === getCanonicalAuthOrigin(env);
  } catch {
    return false;
  }
}

export function constantTimeTextEquals(left: string | null, right: string | null): boolean {
  if (!left || !right || left.length > 128 || right.length > 128) return false;
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function sessionCookieHeaders(sessionToken: string, csrfToken: string): string[] {
  const maxAge = SESSION_ABSOLUTE_TTL_SECONDS;
  return [
    SESSION_COOKIE_NAME + "=" + sessionToken + "; Path=/; Max-Age=" + maxAge + "; Secure; HttpOnly; SameSite=Lax",
    CSRF_COOKIE_NAME + "=" + csrfToken + "; Path=/; Max-Age=" + maxAge + "; Secure; SameSite=Lax"
  ];
}

export function clearSessionCookieHeaders(): string[] {
  return [
    SESSION_COOKIE_NAME + "=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax",
    CSRF_COOKIE_NAME + "=; Path=/; Max-Age=0; Secure; SameSite=Lax"
  ];
}
