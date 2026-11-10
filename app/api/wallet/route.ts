import { NextResponse } from "next/server";
import { VeniceClient } from "venice-x402-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WALLET_KEY_PATTERN = /^0x[0-9a-f]{64}$/i;

export async function GET() {
  const walletKey = process.env.VENICE_WALLET_PRIVATE_KEY || "";
  if (!WALLET_KEY_PATTERN.test(walletKey)) {
    return NextResponse.json(
      { error: "La wallet EVM de Venice no está configurada correctamente en el servidor." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    // getBalance signs a fresh SIWX request and only reads the wallet balance.
    // It does not call topUp() or submit a payment.
    const venice = new VeniceClient(walletKey, { timeoutMs: 12_000 });
    const balance = await venice.getBalance();
    return NextResponse.json({
      balance: {
        balanceUsd: Number(balance.balanceUsd) || 0,
        diemBalanceUsd: Number(balance.diemBalanceUsd) || 0,
        canConsume: balance.canConsume === true,
        minimumTopUpUsd: Number(balance.minimumTopUpUsd) || 0,
        suggestedTopUpUsd: Number(balance.suggestedTopUpUsd) || 0
      },
      checkedAt: new Date().toISOString(),
      source: "Venice x402 balance endpoint",
      paymentAction: "none"
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Venice no pudo verificar el saldo. Revisa la wallet, la autenticación SIWX y la disponibilidad de la API." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
