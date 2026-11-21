import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODEL_ID_MAX_LENGTH = 200;
const RESERVATION_TTL_SECONDS = 10 * 60;

type LimitRow = QueryResultRow & {
  policy_version: string;
  max_requests: string | number;
  period_starts_at: Date | string;
  period_ends_at: Date | string;
};

type UsageCountRow = QueryResultRow & { used_requests: string | number };

export type RequestUsageSnapshot = {
  policyVersion: string;
  usedRequests: number;
  maxRequests: number;
  remainingRequests: number;
  periodStartsAt: string;
  periodEndsAt: string;
};

export type ReserveRequestResult =
  | { ok: true; requestId: string; usage: RequestUsageSnapshot }
  | { ok: false; reason: "account_inactive" | "limit_not_configured" }
  | { ok: false; reason: "limit_reached"; usage: RequestUsageSnapshot };

type QuotaStoreOptions = {
  /** Explicitly inject null in tests to disable automatic default-plan creation. */
  defaultMaxRequestsPerMonth?: number | null;
  reservationTtlSeconds?: number;
};

function parseDefaultLimit(env: NodeJS.ProcessEnv = process.env): number | null {
  const value = env.AVEIRO_DEFAULT_REQUESTS_PER_MONTH?.trim();
  if (!value) return null;
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error("AVEIRO_DEFAULT_REQUESTS_PER_MONTH must be a positive integer.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 1_000_000) {
    throw new Error("AVEIRO_DEFAULT_REQUESTS_PER_MONTH must not exceed 1000000.");
  }
  return parsed;
}

function toSafePositiveInteger(value: string | number, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("The account quota contains an invalid " + field + ".");
  }
  return parsed;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("The account quota contains an invalid period date.");
  return date.toISOString();
}

async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function snapshot(limit: LimitRow, usedRequestsInput: string | number): RequestUsageSnapshot {
  const maxRequests = toSafePositiveInteger(limit.max_requests, "request limit");
  const usedRequests = toSafePositiveInteger(usedRequestsInput, "usage count");
  return {
    policyVersion: limit.policy_version,
    usedRequests,
    maxRequests,
    remainingRequests: Math.max(0, maxRequests - usedRequests),
    periodStartsAt: toIso(limit.period_starts_at),
    periodEndsAt: toIso(limit.period_ends_at)
  };
}

export function createQuotaStore(pool: Pool, options: QuotaStoreOptions = {}) {
  const defaultMaxRequestsPerMonth =
    Object.prototype.hasOwnProperty.call(options, "defaultMaxRequestsPerMonth")
      ? options.defaultMaxRequestsPerMonth ?? null
      : parseDefaultLimit();
  const reservationTtlSeconds = options.reservationTtlSeconds ?? RESERVATION_TTL_SECONDS;

  if (defaultMaxRequestsPerMonth !== null &&
      (!Number.isSafeInteger(defaultMaxRequestsPerMonth) ||
       defaultMaxRequestsPerMonth < 1 ||
       defaultMaxRequestsPerMonth > 1_000_000)) {
    throw new Error("The default monthly request limit is invalid.");
  }
  if (!Number.isInteger(reservationTtlSeconds) || reservationTtlSeconds < 60 || reservationTtlSeconds > 3600) {
    throw new Error("The request reservation TTL must be between 60 and 3600 seconds.");
  }

  async function getOrCreateCurrentLimit(
    client: PoolClient,
    userId: string
  ): Promise<LimitRow | null> {
    const existing = await client.query<LimitRow>(
      "SELECT policy_version, max_requests, period_starts_at, period_ends_at " +
      "FROM account_limits " +
      "WHERE user_id = $1 AND period_starts_at <= now() AND period_ends_at > now() " +
      "ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [userId]
    );
    if (existing.rows[0]) return existing.rows[0];
    if (defaultMaxRequestsPerMonth === null) return null;

    // Default tiers are rolling calendar months in UTC. Token/credit metering
    // remains explicitly disabled (zero caps) until authoritative metering exists.
    const created = await client.query<LimitRow>(
      "INSERT INTO account_limits (" +
      "id, user_id, policy_version, period_starts_at, period_ends_at, " +
      "max_requests, max_input_tokens, max_output_tokens, max_credits" +
      ") VALUES (" +
      "$1, $2, 'request-only-v1', " +
      "(date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), " +
      "((date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'), " +
      "$3, 0, 0, 0" +
      ") RETURNING policy_version, max_requests, period_starts_at, period_ends_at",
      [randomUUID(), userId, defaultMaxRequestsPerMonth]
    );
    return created.rows[0] ?? null;
  }

  async function countRequests(
    client: PoolClient,
    userId: string,
    limit: LimitRow
  ): Promise<number> {
    await client.query(
      "UPDATE usage_reservations SET status = 'expired', updated_at = now() " +
      "WHERE user_id = $1 AND status = 'reserved' AND expires_at <= now()",
      [userId]
    );
    const result = await client.query<UsageCountRow>(
      "SELECT COUNT(*) AS used_requests FROM usage_reservations " +
      "WHERE user_id = $1 AND created_at >= $2 AND created_at < $3 " +
      "AND status IN ('reserved', 'settled', 'unmetered')",
      [userId, limit.period_starts_at, limit.period_ends_at]
    );
    return toSafePositiveInteger(result.rows[0]?.used_requests ?? 0, "usage count");
  }

  async function activeAccount(client: PoolClient, userId: string): Promise<boolean> {
    const result = await client.query(
      "SELECT id FROM app_users WHERE id = $1 AND status = 'active' FOR UPDATE",
      [userId]
    );
    return result.rowCount === 1;
  }

  return {
    async reserveChatRequest(
      userId: string,
      modelId: string,
      requestId = randomUUID()
    ): Promise<ReserveRequestResult> {
      if (!UUID_PATTERN.test(userId) || !UUID_PATTERN.test(requestId)) {
        throw new Error("A valid account ID and request ID are required.");
      }
      if (typeof modelId !== "string" || modelId.length < 1 || modelId.length > MODEL_ID_MAX_LENGTH) {
        throw new Error("The exact model ID is invalid.");
      }

      return inTransaction(pool, async (client) => {
        if (!await activeAccount(client, userId)) {
          return { ok: false, reason: "account_inactive" };
        }
        const limit = await getOrCreateCurrentLimit(client, userId);
        if (!limit) return { ok: false, reason: "limit_not_configured" };

        const usedRequests = await countRequests(client, userId, limit);
        const usage = snapshot(limit, usedRequests);
        if (usedRequests >= usage.maxRequests) {
          return { ok: false, reason: "limit_reached", usage };
        }

        await client.query(
          "INSERT INTO usage_reservations " +
          "(request_id, user_id, model_id, reserved_credits, status, expires_at) " +
          "VALUES ($1, $2, $3, 0, 'reserved', now() + ($4 * interval '1 second'))",
          [requestId, userId, modelId, reservationTtlSeconds]
        );

        return {
          ok: true,
          requestId,
          usage: snapshot(limit, usedRequests + 1)
        };
      });
    },

    /**
     * A successful or ambiguously interrupted dispatch consumes one request
     * allowance but remains unmetered. It never creates a token debit or credits.
     */
    async markRequestUnmetered(userId: string, requestId: string): Promise<boolean> {
      const result = await pool.query(
        "UPDATE usage_reservations SET status = 'unmetered', updated_at = now() " +
        "WHERE user_id = $1 AND request_id = $2 AND status = 'reserved'",
        [userId, requestId]
      );
      if (result.rowCount === 1) return true;
      const existing = await pool.query(
        "SELECT status FROM usage_reservations WHERE user_id = $1 AND request_id = $2",
        [userId, requestId]
      );
      return existing.rows[0]?.status === "unmetered";
    },

    /** Release is only valid when the request was definitely not dispatched. */
    async releaseUndispatchedRequest(userId: string, requestId: string): Promise<boolean> {
      const result = await pool.query(
        "UPDATE usage_reservations SET status = 'released', updated_at = now() " +
        "WHERE user_id = $1 AND request_id = $2 AND status = 'reserved'",
        [userId, requestId]
      );
      if (result.rowCount === 1) return true;
      const existing = await pool.query(
        "SELECT status FROM usage_reservations WHERE user_id = $1 AND request_id = $2",
        [userId, requestId]
      );
      return existing.rows[0]?.status === "released";
    },

    async getRequestUsage(userId: string): Promise<RequestUsageSnapshot | null> {
      if (!UUID_PATTERN.test(userId)) throw new Error("A valid account ID is required.");
      return inTransaction(pool, async (client) => {
        if (!await activeAccount(client, userId)) return null;
        const limit = await getOrCreateCurrentLimit(client, userId);
        if (!limit) return null;
        const usedRequests = await countRequests(client, userId, limit);
        return snapshot(limit, usedRequests);
      });
    }
  };
}
