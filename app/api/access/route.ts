import { NextRequest, NextResponse } from "next/server";

const COOKIE = "avero_session";
const encoder = new TextEncoder();
const attempts = new Map<string, { count: number; reset: number }>();

async function signature(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const attempt = attempts.get(ip);
  if (attempt && attempt.reset > now && attempt.count >= 5) return NextResponse.json({ error: "Demasiados intentos. Espera 15 minutos." }, { status: 429 });
  if (!attempt || attempt.reset <= now) attempts.set(ip, { count: 1, reset: now + 15 * 60_000 });
  else { attempt.count++; attempts.set(ip, attempt); }
  const accessCode = process.env.AVERO_ACCESS_CODE;
  const secret = process.env.AVERO_SESSION_SECRET;
  if (!accessCode || !secret) return NextResponse.json({ error: "El administrador debe configurar AVERO_ACCESS_CODE y AVERO_SESSION_SECRET en el servidor." }, { status: 503 });
  let body: { code?: unknown } = {};
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 }); }
  if (typeof body.code !== "string" || body.code.length > 256 || body.code !== accessCode) return NextResponse.json({ error: "Código de acceso incorrecto." }, { status: 401 });
  const issued = String(Date.now());
  const token = issued + "." + await signature(issued, secret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
