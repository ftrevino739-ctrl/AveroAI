import { createHmac, timingSafeEqual } from "node:crypto";

export type ProviderUsageExpectation = { requestId: string; nodeId: string; modelId: string };
export type VerifiedProviderUsageReport = {
  protocolVersion: 1;
  type: "aveiro_usage_report";
  requestId: string;
  nodeId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  source: "openai_compatible_runtime";
  reportedAtMs: number;
  signature: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NODE = /^[a-zA-Z0-9._-]{3,80}$/;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SIGNATURE = /^[a-f0-9]{64}$/;
const MAX_TOKENS = 1_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function providerUsageCanonicalPayload(report: Omit<VerifiedProviderUsageReport, "signature">): string {
  return [
    String(report.protocolVersion), report.requestId, report.nodeId, report.modelId,
    String(report.inputTokens), String(report.outputTokens), report.source, String(report.reportedAtMs)
  ].join("\n");
}

export function createProviderUsageSignature(
  report: Omit<VerifiedProviderUsageReport, "signature">,
  secret: string
): string {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("A per-node secret is required.");
  return createHmac("sha256", secret).update(providerUsageCanonicalPayload(report), "utf8").digest("hex");
}

/**
 * Verifies node origin and exact request binding. It is not independent
 * attestation: a node operator controls the shared secret and can falsify usage.
 * Callers must keep the provider_self_reported trust class and never bill from it.
 */
export function verifyProviderUsageReport(
  value: unknown,
  secret: string,
  expected: ProviderUsageExpectation,
  nowMs = Date.now()
): VerifiedProviderUsageReport | null {
  if (!isRecord(value) || typeof secret !== "string" || secret.length < 32) return null;
  const report = value as Partial<VerifiedProviderUsageReport>;
  if (
    report.protocolVersion !== 1 ||
    report.type !== "aveiro_usage_report" ||
    report.requestId !== expected.requestId ||
    report.nodeId !== expected.nodeId ||
    report.modelId !== expected.modelId ||
    !UUID.test(String(report.requestId || "")) ||
    !NODE.test(String(report.nodeId || "")) ||
    !MODEL.test(String(report.modelId || "")) ||
    report.source !== "openai_compatible_runtime" ||
    !Number.isSafeInteger(report.inputTokens) ||
    !Number.isSafeInteger(report.outputTokens) ||
    Number(report.inputTokens) < 0 ||
    Number(report.outputTokens) < 0 ||
    Number(report.inputTokens) > MAX_TOKENS ||
    Number(report.outputTokens) > MAX_TOKENS ||
    !Number.isSafeInteger(report.reportedAtMs) ||
    Number(report.reportedAtMs) < nowMs - 600_000 ||
    Number(report.reportedAtMs) > nowMs + 30_000 ||
    typeof report.signature !== "string" ||
    !SIGNATURE.test(report.signature)
  ) return null;

  const unsigned: Omit<VerifiedProviderUsageReport, "signature"> = {
    protocolVersion: 1,
    type: "aveiro_usage_report",
    requestId: report.requestId as string,
    nodeId: report.nodeId as string,
    modelId: report.modelId as string,
    inputTokens: report.inputTokens as number,
    outputTokens: report.outputTokens as number,
    source: "openai_compatible_runtime",
    reportedAtMs: report.reportedAtMs as number
  };
  const expectedSignature = Buffer.from(createProviderUsageSignature(unsigned, secret), "hex");
  const actualSignature = Buffer.from(report.signature, "hex");
  if (expectedSignature.length !== actualSignature.length ||
      !timingSafeEqual(expectedSignature, actualSignature)) return null;
  return { ...unsigned, signature: report.signature };
}
