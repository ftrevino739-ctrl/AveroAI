import { modelAccessCatalog } from "@/lib/model-access-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, read-only catalogue of model access and deployment policy.
 * This endpoint intentionally does not expose credentials or mark candidates
 * as available for inference. The live chat route remains independent.
 */
export async function GET() {
  return Response.json(
    {
      product: "Aveiro.ai",
      stage: "community-compute-foundation",
      note: "Catalogue metadata only. Candidate models are not connected or available for inference.",
      models: modelAccessCatalog
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=600"
      }
    }
  );
}
