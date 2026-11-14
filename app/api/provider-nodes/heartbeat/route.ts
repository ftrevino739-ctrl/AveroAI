import { acceptProviderHeartbeat } from "@/lib/provider-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readLimitedBody(request: Request, limit: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request) {
  if (!String(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }
  const rawBody = await readLimitedBody(request, 16_000);
  if (rawBody === null) {
    return Response.json({ error: "Heartbeat body is missing or too large." }, { status: 413 });
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
