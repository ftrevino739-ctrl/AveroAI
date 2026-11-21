import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import type { VerifiedProviderUsageReport } from "./provider-usage";

type ExistingReport = QueryResultRow & {
  node_id: string; model_id: string; input_tokens: string | number;
  output_tokens: string | number; source: string; report_signature: string;
  reported_at_ms: string | number;
};

export async function recordProviderUsageReport(
  pool: Pool,
  report: VerifiedProviderUsageReport
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reservation = await client.query<{ model_id: string; status: string }>(
      "SELECT model_id, status FROM usage_reservations WHERE request_id = $1 FOR UPDATE",
      [report.requestId]
    );
    const row = reservation.rows[0];
    if (!row || row.model_id !== report.modelId || row.status !== "unmetered") {
      throw new Error("Usage report does not match a completed request reservation.");
    }

    const inserted = await client.query(
      "INSERT INTO provider_usage_reports (" +
      "id, request_id, node_id, model_id, input_tokens, output_tokens, source, " +
      "trust_class, transport_signature_verified, report_signature, reported_at_ms" +
      ") VALUES ($1,$2,$3,$4,$5,$6,$7,'provider_self_reported',true,$8,$9) " +
      "ON CONFLICT (request_id) DO NOTHING RETURNING id",
      [randomUUID(), report.requestId, report.nodeId, report.modelId,
       report.inputTokens, report.outputTokens, report.source, report.signature, report.reportedAtMs]
    );
    if (inserted.rowCount === 1) {
      await client.query("COMMIT");
      return true;
    }

    const existingResult = await client.query<ExistingReport>(
      "SELECT node_id, model_id, input_tokens, output_tokens, source, report_signature, reported_at_ms " +
      "FROM provider_usage_reports WHERE request_id = $1",
      [report.requestId]
    );
    const existing = existingResult.rows[0];
    const same = Boolean(existing) &&
      existing.node_id === report.nodeId &&
      existing.model_id === report.modelId &&
      Number(existing.input_tokens) === report.inputTokens &&
      Number(existing.output_tokens) === report.outputTokens &&
      existing.source === report.source &&
      existing.report_signature === report.signature &&
      Number(existing.reported_at_ms) === report.reportedAtMs;
    if (!same) throw new Error("A conflicting usage report already exists for this request.");
    await client.query("COMMIT");
    return false;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
