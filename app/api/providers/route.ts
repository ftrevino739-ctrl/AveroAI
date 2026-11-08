import { NextRequest } from "next/server";
import { getVeniceTextCatalog } from "@/lib/venice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const configured = Boolean(process.env.VENICE_WALLET_PRIVATE_KEY || process.env.WALLET_KEY);
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const catalog = await getVeniceTextCatalog(forceRefresh);
    return Response.json({
      providers: [{ id: "venice", name: "Venice AI", configured, models: catalog.models.length }],
      models: catalog.models,
      traits: catalog.traits,
      compatibilityMapping: catalog.compatibilityMapping,
      connection: {
        provider: "Venice x402",
        configured,
        catalogue: "live",
        filter: "all-available-text-models"
      },
      policy: "Se incluyen todos los modelos de texto disponibles en GET /models?type=text de Venice. El indicador Uncensored solo aparece cuando model_spec.uncensored === true."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      providers: [{ id: "venice", name: "Venice AI", configured, models: 0 }],
      models: [],
      connection: { provider: "Venice x402", configured, catalogue: "error" },
      error: error instanceof Error ? error.message : "No se pudo consultar el catálogo oficial de Venice."
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
