import { checkIdentityDatabase } from "@/lib/postgres";
import { checkRegistryConnection } from "@/lib/provider-registry";
import { getReadinessConfigurationIssues } from "@/lib/readiness-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const missing = getReadinessConfigurationIssues();
  if (missing.length > 0) {
    return Response.json({
      service: "aveiro.ai",
      status: "not_ready",
      reason: "Required infrastructure and account configuration is missing or invalid.",
      missing
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const [registry, identityDatabase] = await Promise.all([
      checkRegistryConnection(),
      checkIdentityDatabase()
    ]);
    if (!registry || !identityDatabase) throw new Error("A required dependency is unavailable.");
    return Response.json({
      service: "aveiro.ai",
      status: "ready",
      dependencies: {
        providerRegistry: "connected",
        identityDatabase: "connected",
        emailDeliveryConfiguration: "configured",
        monthlyRequestQuota: "configured"
      }
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({
      service: "aveiro.ai",
      status: "not_ready",
      reason: "A required database or provider-registry dependency is unavailable."
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
