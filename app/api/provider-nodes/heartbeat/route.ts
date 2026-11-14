import { acceptProviderHeartbeat } from "@/lib/provider-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!String(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: "Could not read heartbeat body." }, { status: 400 });
  }
  if (new TextEncoder().encode(rawBody).byteLength > 16_000) {
    return Response.json({ error: "Heartbeat payload is too large." }, { status: 413 });
  }
  try {
    const result = await acceptProviderHeartbeat(rawBody, request.headers);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({
      accepted: true,
      ready: result.ready,
      heartbeatIntervalSeconds: 30
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return Response.json({ error: "Heartbeat could not be persisted." }, { status: 503 });
  }
}
