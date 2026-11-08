import { NextRequest } from "next/server";
import { getUncensoredTextCatalog } from "@/lib/venice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const walletKey = process.env.VENICE_WALLET_PRIVATE_KEY || process.env.WALLET_KEY;
  if (!walletKey) {
    return Response.json({
      providers: [{ id: "venice", name: "Venice AI", configured: false, models: 0 }],
      models: [],
      connection: { provider: "Venice x402", configured: false, catalogue: "unavailable" },
      error: "Configura VENICE_WALLET_PRIVATE_KEY en el servidor para consultar el catálogo real."
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";
    const catalog = await getUncensoredTextCatalog(walletKey, forceRefresh);
    return Response.json({
      providers: [{ id: "venice", name: "Venice AI", configured: true, models: catalog.models.length }],
      models: catalog.models,
      traits: { mostUncensored: catalog.mostUncensoredId || null },
      connection: { provider: "Venice x402", configured: true, catalogue: "live", filter: "official-uncensored-only" },
      policy: "Only models explicitly marked Uncensored by Venice metadata are returned."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      providers: [{ id: "venice", name: "Venice AI", configured: true, models: 0 }],
      models: [],
      connection: { provider: "Venice x402", configured: true, catalogue: "error" },
      error: error instanceof Error ? error.message : "No se pudo consultar el catálogo oficial de Venice."
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
