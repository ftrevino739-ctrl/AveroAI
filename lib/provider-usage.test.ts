import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createProviderUsageSignature, verifyProviderUsageReport } from "./provider-usage";

const SECRET = "test-only-node-secret-long-enough-for-hmac-validation";

function signedReport(overrides: Record<string, unknown> = {}) {
  const unsigned = {
    protocolVersion: 1 as const,
    type: "aveiro_usage_report" as const,
    requestId: randomUUID(),
    nodeId: "gpu-node-01",
    modelId: "community/model",
    inputTokens: 123,
    outputTokens: 45,
    source: "openai_compatible_runtime" as const,
    reportedAtMs: Date.now(),
    ...overrides
  };
  return { ...unsigned, signature: createProviderUsageSignature(unsigned, SECRET) };
}

test("accepts signed usage only for the exact request, node and model", () => {
  const report = signedReport();
  assert.deepEqual(verifyProviderUsageReport(report, SECRET, {
    requestId: report.requestId as string,
    nodeId: report.nodeId as string,
    modelId: report.modelId as string
  }), report);
});

test("rejects tampering, cross-request reports, invalid counts and stale timestamps", () => {
  const report = signedReport();
  const expected = {
    requestId: report.requestId as string,
    nodeId: report.nodeId as string,
    modelId: report.modelId as string
  };
  assert.equal(verifyProviderUsageReport({ ...report, inputTokens: 999 }, SECRET, expected), null);
  assert.equal(verifyProviderUsageReport(report, SECRET, { ...expected, modelId: "community/other" }), null);
  assert.equal(verifyProviderUsageReport({ ...report, outputTokens: -1 }, SECRET, expected), null);
  const stale = signedReport({ reportedAtMs: Date.now() - 11 * 60 * 1000 });
  assert.equal(verifyProviderUsageReport(stale, SECRET, {
    requestId: stale.requestId as string,
    nodeId: stale.nodeId as string,
    modelId: stale.modelId as string
  }), null);
});
