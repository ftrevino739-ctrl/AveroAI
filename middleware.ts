import { NextRequest, NextResponse } from "next/server";

const COOKIE = "avero_session";
const encoder = new TextEncoder();

async function signature(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/_next") || path === "/favicon.ico" || path === "/access" || path.startsWith("/api/access")) return NextResponse.next();
  const secret = process.env.AVERO_SESSION_SECRET;
  const accessCode = process.env.AVERO_ACCESS_CODE;
  if (!secret || !accessCode) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "AveroAI está cerrado: configura AVERO_ACCESS_CODE y AVERO_SESSION_SECRET." }, { status: 503 });
    return NextResponse.redirect(new URL("/access?setup=1", request.url));
  }
  const token = request.cookies.get(COOKIE)?.value || "";
  const [issued, supplied] = token.split(".");
  const timestamp = Number(issued);
  const validTime = Number.isFinite(timestamp) && Date.now() - timestamp >= 0 && Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000;
  const expected = validTime ? await signature(issued, secret) : "";
  if (validTime && supplied && supplied === expected) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Acceso no autorizado. Inicia sesión en AveroAI." }, { status: 401 });
  const target = new URL("/access", request.url);
  target.searchParams.set("from", path);
  return NextResponse.redirect(target);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
