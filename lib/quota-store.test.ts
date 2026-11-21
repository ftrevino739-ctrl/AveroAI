import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { createQuotaStore } from "./quota-store";

const databaseUrl = process.env.AVEIRO_DATABASE_URL;

async function fixture(t: { after: (fn: () => void | Promise<void>) => void }, status = "active") {
  if (!databaseUrl) throw new Error("AVEIRO_DATABASE_URL is required.");
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const userId = randomUUID();
  const email = "quota-" + randomUUID() + "@example.invalid";
  await pool.query(
    "INSERT INTO app_users (id, email, status) VALUES ($1, $2, $3)",
    [userId, email, status]
  );
  t.after(async () => {
    await pool.query("DELETE FROM usage_reservations WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM account_limits WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM email_verification_tokens WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM app_users WHERE id = $1", [userId]);
    await pool.end();
  });
  return { pool, userId };
}

test("serializes concurrent admissions and counts only reserved or dispatched requests", {
  skip: !databaseUrl ? "AVEIRO_DATABASE_URL is required for PostgreSQL integration tests." : false
}, async (t) => {
  const { pool, userId } = await fixture(t);
  const quotas = createQuotaStore(pool, { defaultMaxRequestsPerMonth: 2 });
  const attempts = await Promise.all(Array.from({ length: 8 }, () =>
    quotas.reserveChatRequest(userId, "community/test-model")
  ));
  const accepted = attempts.filter((result) => result.ok);
  const denied = attempts.filter((result) => !result.ok);
  assert.equal(accepted.length, 2);
  assert.equal(denied.length, 6);
  assert.ok(denied.every((result) => !result.ok && result.reason === "limit_reached"));

  const [first, second] = accepted;
  assert.ok(first.ok && second.ok);
  assert.equal(await quotas.releaseUndispatchedRequest(userId, first.requestId), true);

  const replacement = await quotas.reserveChatRequest(userId, "community/test-model");
  assert.ok(replacement.ok);
  if (!replacement.ok) return;

  assert.equal(await quotas.markRequestUnmetered(userId, second.requestId), true);
  assert.equal(await quotas.markRequestUnmetered(userId, replacement.requestId), true);
  assert.equal(await quotas.markRequestUnmetered(userId, replacement.requestId), true);

  const usage = await quotas.getRequestUsage(userId);
  assert.ok(usage);
  assert.equal(usage.usedRequests, 2);
  assert.equal(usage.remainingRequests, 0);
  assert.equal(usage.maxRequests, 2);

  const exhausted = await quotas.reserveChatRequest(userId, "community/test-model");
  assert.equal(exhausted.ok, false);
  assert.ok(!exhausted.ok && exhausted.reason === "limit_reached");
});

test("expires abandoned reservations and rejects inactive or unconfigured accounts", {
  skip: !databaseUrl ? "AVEIRO_DATABASE_URL is required for PostgreSQL integration tests." : false
}, async (t) => {
  const active = await fixture(t);
  const quotas = createQuotaStore(active.pool, { defaultMaxRequestsPerMonth: 1 });
  const first = await quotas.reserveChatRequest(active.userId, "community/test-model");
  assert.ok(first.ok);
  if (!first.ok) return;

  await active.pool.query(
    "UPDATE usage_reservations SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 second' WHERE request_id = $1",
    [first.requestId]
  );
  const afterExpiry = await quotas.reserveChatRequest(active.userId, "community/test-model");
  assert.ok(afterExpiry.ok);

  const inactive = await fixture(t, "suspended");
  const inactiveQuotas = createQuotaStore(inactive.pool, { defaultMaxRequestsPerMonth: 5 });
  assert.deepEqual(
    await inactiveQuotas.reserveChatRequest(inactive.userId, "community/test-model"),
    { ok: false, reason: "account_inactive" }
  );

  const unconfigured = createQuotaStore(active.pool, { defaultMaxRequestsPerMonth: null });
  // The account already received a default plan in this test, so use a new account.
  const noPlan = await fixture(t);
  const noPlanQuotas = createQuotaStore(noPlan.pool, { defaultMaxRequestsPerMonth: null });
  assert.deepEqual(
    await noPlanQuotas.reserveChatRequest(noPlan.userId, "community/test-model"),
    { ok: false, reason: "limit_not_configured" }
  );
  assert.equal(await unconfigured.getRequestUsage(noPlan.userId), null);
});
