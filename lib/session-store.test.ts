import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createSessionStore } from "./session-store";

type Entry = { value: string; expiresAtMs: number };

function fakeRedis(clock: { now: number }) {
  const values = new Map<string, Entry>();
  const command = async (parts: Array<string | number>): Promise<unknown> => {
    const [operation, rawKey, ...args] = parts;
    const op = String(operation).toUpperCase();
    const key = String(rawKey);
    const existing = values.get(key);
    if (existing && existing.expiresAtMs <= clock.now) values.delete(key);

    if (op === "SET") {
      const value = String(args[0]);
      const ttlIndex = args.findIndex((item) => item === "EX");
      const ttl = Number(args[ttlIndex + 1]);
      if (values.has(key)) return null;
      values.set(key, { value, expiresAtMs: clock.now + ttl * 1000 });
      return "OK";
    }
    if (op === "GET") return values.get(key)?.value ?? null;
    if (op === "EXPIRE") {
      const entry = values.get(key);
      if (!entry) return 0;
      entry.expiresAtMs = clock.now + Number(args[0]) * 1000;
      return 1;
    }
    if (op === "DEL") return values.delete(key) ? 1 : 0;
    throw new Error("Unexpected fake Redis command: " + op);
  };
  return { command, values };
}

test("stores only digests, refreshes idle expiry and enforces absolute expiry", async () => {
  const clock = { now: Date.now() };
  const redis = fakeRedis(clock);
  const store = createSessionStore(redis.command, () => clock.now);
  const userId = randomUUID();
  const created = await store.createSession(userId);

  assert.match(created.token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(created.csrfToken, /^[A-Za-z0-9_-]{43}$/);
  const digest = createHash("sha256").update(created.token).digest("hex");
  const key = "aveiro:session:v1:" + digest;
  const stored = redis.values.get(key);
  assert.ok(stored);
  assert.equal(stored.value.includes(created.token), false);
  assert.equal(stored.value.includes(created.csrfToken), false);
  assert.match(JSON.parse(stored.value).csrfTokenHash, /^[a-f0-9]{64}$/);

  assert.equal(await store.verifyCsrf(created.token, created.csrfToken), true);
  assert.equal(await store.verifyCsrf(created.token, Buffer.alloc(32, 1).toString("base64url")), false);

  clock.now += 60 * 60 * 1000;
  assert.deepEqual(await store.getSession(created.token), { userId, expiresAtMs: created.expiresAtMs });
  assert.ok(redis.values.get(key)!.expiresAtMs > clock.now);

  clock.now = created.expiresAtMs + 1;
  assert.equal(await store.getSession(created.token), null);
  assert.equal(await store.verifyCsrf(created.token, created.csrfToken), false);
  assert.equal(redis.values.has(key), false);
});

test("revokes sessions and rejects malformed or corrupted session data", async () => {
  const clock = { now: Date.now() };
  const redis = fakeRedis(clock);
  const store = createSessionStore(redis.command, () => clock.now);
  const created = await store.createSession(randomUUID());

  assert.equal(await store.revokeSession("not-a-session-token"), false);
  assert.equal(await store.revokeSession(created.token), true);
  assert.equal(await store.getSession(created.token), null);

  const forgedToken = Buffer.alloc(32, 7).toString("base64url");
  const digest = createHash("sha256").update(forgedToken).digest("hex");
  const key = "aveiro:session:v1:" + digest;
  redis.values.set(key, {
    value: JSON.stringify({
      version: 1, userId: "not-a-uuid", createdAtMs: clock.now,
      expiresAtMs: clock.now + 1000, csrfTokenHash: "0".repeat(64)
    }),
    expiresAtMs: clock.now + 60_000
  });
  assert.equal(await store.getSession(forgedToken), null);
  assert.equal(redis.values.has(key), false);
});
