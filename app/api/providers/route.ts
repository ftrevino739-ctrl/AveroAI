import { COMMUNITY_MODEL_PREFIX } from "@/lib/models";
import { getAvailableCommunityModels } from "@/lib/provider-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aveiro's public catalogue is open-weight/community-compute only.
 * Proprietary APIs and arbitrary custom endpoints are intentionally not
 * surfaced as selectable providers.
 */
export async function GET() {
  let modelIds: string[] = [];
  let registryAvailable = false;
  try {
    modelIds = await getAvailableCommunityModels();
    registryAvailable = true;
  } catch {
    // An unavailable registry means no models are currently selectable.
  }

  const models = modelIds.map((modelId) => ({
    id: COMMUNITY_MODEL_PREFIX + modelId,
    name: modelId,
    provider: "Aveiro Community Compute",
    providerId: "community" as const,
    description: "Open-weight model running on an approved, live Aveiro community GPU node",
    category: "Open" as const,
    context: "Runtime dependent",
    configured: true
  }));

  return Response.json({
    inferencePolicy: "open-weights-community-only",
    providers: [{
      id: "community",
      name: "Aveiro Community Compute",
      configured: registryAvailable && models.length > 0,
      models: models.length
    }],
    models
  }, {
    headers: { "Cache-Control": "no-store" }
  });
}
