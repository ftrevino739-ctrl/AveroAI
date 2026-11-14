import { checkRegistryConnection } from "@/lib/provider-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const required = [
    process.env.AVEIRO_REDIS_REST_URL,
    process.env.AVEIRO_REDIS_REST_TOKEN,
    process.env.AVEIRO_NODE_SECRET_ENCRYPTION_KEY,
    process.env.AVEIRO_ADMIN_TOKEN
  ];
  if (required.some((value) => !value)) {
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
