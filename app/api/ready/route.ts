import { checkRegistryConnection } from "@/lib/provider-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const encryptionKey = process.env.AVEIRO_NODE_SECRET_ENCRYPTION_KEY || "";
  const adminToken = process.env.AVEIRO_ADMIN_TOKEN || "";
  const redisUrl = process.env.AVEIRO_REDIS_REST_URL || "";
  const redisToken = process.env.AVEIRO_REDIS_REST_TOKEN || "";
  if (
    !redisUrl ||
    !redisToken ||
    !/^([a-f0-9]{64})$/i.test(encryptionKey) ||
    adminToken.length < 32
  ) {
    return Response.json(
      { service: "aveiro.ai", status: "not_ready", reason: "Infrastructure secrets are not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const connected = await checkRegistryConnection();
    if (!connected) throw new Error("Registry ping failed.");
    return Response.json(
      { service: "aveiro.ai", status: "ready", dependencies: { providerRegistry: "connected" } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return Response.json(
      { service: "aveiro.ai", status: "not_ready", reason: "Provider registry is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
