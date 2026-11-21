import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type IdentityAccount = { id: string; email: string; status: "active" };
export type MagicLink = { userId: string; email: string; token: string; expiresAt: string };
type UserRow = QueryResultRow & {
  id: string;
  email: string;
  status: "pending" | "active" | "suspended" | "deleted";
};

async function inTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
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

export function normalizeAccountEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (Buffer.byteLength(email, "utf8") < 3 || Buffer.byteLength(email, "utf8") > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return null;
  return email;
}

function tokenDigest(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/**
 * Database primitives only. Issue the same form of link for all syntactically
 * valid addresses to avoid exposing account state through request-link responses.
 * consumeMagicLink still rejects suspended and deleted accounts.
 */
export function createIdentityStore(pool: Pool) {
  return {
    async createMagicLink(emailInput: unknown): Promise<MagicLink | null> {
      const email = normalizeAccountEmail(emailInput);
      if (!email) return null;
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

      return inTransaction(pool, async (client) => {
        await client.query(
          "INSERT INTO app_users (id, email, status) " +
          "VALUES ($1, $2, 'pending') ON CONFLICT (email) DO NOTHING",
          [randomUUID(), email]
        );
        const userResult = await client.query<UserRow>(
          "SELECT id, email, status FROM app_users WHERE email = $1 FOR UPDATE",
          [email]
        );
        const user = userResult.rows[0];
        if (!user) return null;

        await client.query(
          "UPDATE email_verification_tokens SET consumed_at = now() " +
          "WHERE user_id = $1 AND consumed_at IS NULL",
          [user.id]
        );
        await client.query(
          "INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at) " +
          "VALUES ($1, $2, $3, $4)",
          [randomUUID(), user.id, tokenDigest(token), expiresAt]
        );
        return { userId: user.id, email: user.email, token, expiresAt: expiresAt.toISOString() };
      });
    },

    async consumeMagicLink(tokenInput: unknown): Promise<IdentityAccount | null> {
      if (typeof tokenInput !== "string" || !TOKEN_PATTERN.test(tokenInput)) return null;
      const digest = tokenDigest(tokenInput);
      return inTransaction(pool, async (client) => {
        const result = await client.query<UserRow>(
          "UPDATE email_verification_tokens AS token SET consumed_at = now() " +
          "FROM app_users AS account WHERE token.user_id = account.id " +
          "AND token.token_hash = $1 AND token.consumed_at IS NULL " +
          "AND token.expires_at > now() AND account.status IN ('pending', 'active') " +
          "RETURNING account.id, account.email, account.status",
          [digest]
        );
        const user = result.rows[0];
        if (!user) return null;
        if (user.status === "pending") {
          await client.query(
            "UPDATE app_users SET status = 'active', updated_at = now() " +
            "WHERE id = $1 AND status = 'pending'",
            [user.id]
          );
        }
        return { id: user.id, email: user.email, status: "active" };
      });
    },

    async revokeMagicLink(userId: string, tokenInput: unknown): Promise<boolean> {
      if (typeof tokenInput !== "string" || !TOKEN_PATTERN.test(tokenInput)) return false;
      const result = await pool.query(
        "UPDATE email_verification_tokens SET consumed_at = now() " +
        "WHERE user_id = $1 AND token_hash = $2 AND consumed_at IS NULL",
        [userId, tokenDigest(tokenInput)]
      );
      return result.rowCount === 1;
    },

    async getActiveAccount(userId: string): Promise<IdentityAccount | null> {
      const result = await pool.query<UserRow>(
        "SELECT id, email, status FROM app_users WHERE id = $1 AND status = 'active' LIMIT 1",
        [userId]
      );
      const user = result.rows[0];
      return user ? { id: user.id, email: user.email, status: "active" } : null;
    }
  };
}
