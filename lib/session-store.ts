import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { redisCommand } from "./provider-registry";

const SESSION_KEY_PREFIX = "aveiro:session:v1:";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const IDLE_TTL_SECONDS = 24 * 60 * 60;
const ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RedisCommand = (command: Array<string | number>) => Promise<unknown>;
type StoredSession = {
  version: 1;
  userId: string;
  createdAtMs: number;
  expiresAtMs: number;
  csrfTokenHash: string;
};

export type CreatedSession = { token: string; csrfToken: string; expiresAtMs: number };
export type ActiveSession = { userId: string; expiresAtMs: number };

function digestToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function sessionKey(token: string): string {
  return SESSION_KEY_PREFIX + digestToken(token);
}

function isStoredSession(value: unknown, nowMs: number): value is StoredSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<StoredSession>;
  return record.version === 1 &&
    typeof record.userId === "string" && UUID_PATTERN.test(record.userId) &&
    Number.isSafeInteger(record.createdAtMs) && Number.isSafeInteger(record.expiresAtMs) &&
    typeof record.csrfTokenHash === "string" && HASH_PATTERN.test(record.csrfTokenHash) &&
    Number(record.createdAtMs) <= nowMs &&
    Number(record.expiresAtMs) > nowMs &&
    Number(record.expiresAtMs) - Number(record.createdAtMs) <= ABSOLUTE_TTL_MS;
}

/** Redis stores only hashes for both the session cookie and its CSRF token. */
export function createSessionStore(
  command: RedisCommand = (args) => redisCommand<unknown>(args),
  now: () => number = () => Date.now()
) {
  async function getSession(tokenInput: unknown): Promise<ActiveSession | null> {
    if (typeof tokenInput !== "string" || !TOKEN_PATTERN.test(tokenInput)) return null;
    const key = sessionKey(tokenInput);
    const raw = await command(["GET", key]);
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") {
      await command(["DEL", key]);
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await command(["DEL", key]);
      return null;
    }

    const currentTime = now();
    if (!isStoredSession(parsed, currentTime)) {
      await command(["DEL", key]);
      return null;
    }

    const remainingSeconds = Math.ceil((parsed.expiresAtMs - currentTime) / 1000);
    const nextIdleTtl = Math.max(1, Math.min(IDLE_TTL_SECONDS, remainingSeconds));
    const refreshed = await command(["EXPIRE", key, nextIdleTtl]);
    if (Number(refreshed) !== 1) return null;
    return { userId: parsed.userId, expiresAtMs: parsed.expiresAtMs };
  }

  return {
    async createSession(userId: string): Promise<CreatedSession> {
      if (!UUID_PATTERN.test(userId)) throw new Error("A valid account ID is required.");
      const createdAtMs = now();
      const expiresAtMs = createdAtMs + ABSOLUTE_TTL_MS;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const token = randomBytes(32).toString("base64url");
        const csrfToken = randomBytes(32).toString("base64url");
        const record: StoredSession = {
          version: 1, userId, createdAtMs, expiresAtMs,
          csrfTokenHash: digestToken(csrfToken)
        };
        const result = await command([
          "SET", sessionKey(token), JSON.stringify(record), "EX", IDLE_TTL_SECONDS, "NX"
        ]);
        if (result === "OK") return { token, csrfToken, expiresAtMs };
      }
      throw new Error("Could not create a unique browser session.");
    },

    getSession,

    async verifyCsrf(sessionTokenInput: unknown, csrfTokenInput: unknown): Promise<boolean> {
      if (
        typeof sessionTokenInput !== "string" || !TOKEN_PATTERN.test(sessionTokenInput) ||
        typeof csrfTokenInput !== "string" || !TOKEN_PATTERN.test(csrfTokenInput)
      ) return false;
      if (!await getSession(sessionTokenInput)) return false;

      const raw = await command(["GET", sessionKey(sessionTokenInput)]);
      if (typeof raw !== "string") return false;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return false;
      }
      if (!isStoredSession(parsed, now())) return false;

      const expected = Buffer.from(parsed.csrfTokenHash, "hex");
      const actual = Buffer.from(digestToken(csrfTokenInput), "hex");
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    },

    async revokeSession(tokenInput: unknown): Promise<boolean> {
      if (typeof tokenInput !== "string" || !TOKEN_PATTERN.test(tokenInput)) return false;
      const deleted = await command(["DEL", sessionKey(tokenInput)]);
      return Number(deleted) === 1;
    }
  };
}

export const sessionStore = createSessionStore();
