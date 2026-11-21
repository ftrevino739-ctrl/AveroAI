import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { createQuotaStore } from "./quota-store";
import { createProviderUsageSignature, verifyProviderUsageReport } from "./provider-usage";
import { recordProviderUsageReport } from "./provider-usage-store";

const databaseUrl = process.env.AVEIRO_DATABASE_URL;
const SECRET = "integration-only-node-secret-long-enough-for-hmac";

test("persists signed provider-self-reported usage once without creating credits", {
  skip: !databaseUrl ? "AVEIRO_DATABASE_URL is required for PostgreSQL integration tests." : false
}, async (t) => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const userId = randomUUID();
  const requestId = randomUUID();
  const email = "usage-report-" + randomUUID() + "@example.invalid";

  await pool.query("INSERT INTO app_users (id, email, status) VALUES ($1, $2, 'active')", [userId, email]);
  t.after(async () => {
    await pool.query("DELETE FROM provider_usage_reports WHERE request_id = $1", [requestId]);
    await pool.query("DELETE FROM usage_reservations WHERE request_id = $1", [requestId]);
    await pool.query("DELETE FROM account_limits WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM email_verification_tokens WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM app_users WHERE id = $1", [userId]);
    await pool.end();
  });

  const quota = createQuotaStore(pool, { defaultMaxRequestsPerMonth: 10 });
  const reservation = await quota.reserveChatRequest(userId, "community/model", requestId);
  assert.ok(reservation.ok);
  assert.equal(await quota.markRequestUnmetered(userId, requestId), true);

  const unsigned = {
    protocolVersion: 1 as const, type: "aveiro_usage_report" as const,
    requestId, nodeId: "gpu-node-01", modelId: "community/model",
    inputTokens: 1200, outputTokens: 340, source: "openai_compatible_runtime" as const,
    reportedAtMs: Date.now()
  };
  const raw = { ...unsigned, signature: createProviderUsageSignature(unsigned, SECRET) };
  const verified = verifyProviderUsageReport(raw, SECRET, {
    requestId, nodeId: unsigned.nodeId, modelId: unsigned.modelId
  });
  assert.ok(verified);
  assert.equal(await recordProviderUsageReport(pool, verified), true);
  assert.equal(await recordProviderUsageReport(pool, verified), false);

  const stored = await pool.query<{
    input_tokens: string; output_tokens: string; trust_class: string; transport_signature_verified: boolean;
  }>(
    "SELECT input_tokens, output_tokens, trust_class, transport_signature_verified " +
    "FROM provider_usage_reports WHERE request_id = $1",
    [requestId]
  );
  assert.equal(stored.rows.length, 1);
  assert.equal(Number(stored.rows[0].input_tokens), 1200);
  assert.equal(Number(stored.rows[0].output_tokens), 340);
  assert.equal(stored.rows[0].trust_class, "provider_self_reported");
  assert.equal(stored.rows[0].transport_signature_verified, true);
  await assert.rejects(
    pool.query("UPDATE provider_usage_reports SET input_tokens = 0 WHERE request_id = $1", [requestId]),
    /provider_usage_reports is append-only/
  );
});
