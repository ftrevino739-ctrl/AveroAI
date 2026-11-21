import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";
import { createIdentityStore } from "./identity-store";

const databaseUrl = process.env.AVEIRO_DATABASE_URL;

test("magic-link storage normalizes addresses, hashes tokens and consumes each link once", {
  skip: !databaseUrl ? "AVEIRO_DATABASE_URL is required for PostgreSQL integration tests." : false
}, async (t) => {
  if (!databaseUrl) return;
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const store = createIdentityStore(pool);
  const suffix = randomUUID();
  const email = "ci-auth-" + suffix + "@example.invalid";
  const suspendedEmail = "ci-auth-suspended-" + suffix + "@example.invalid";
  const emails = [email, suspendedEmail];

  t.after(async () => {
    await pool.query(
      "DELETE FROM email_verification_tokens " +
      "WHERE user_id IN (SELECT id FROM app_users WHERE email = ANY($1::text[]))",
      [emails]
    );
    await pool.query("DELETE FROM app_users WHERE email = ANY($1::text[])", [emails]);
    await pool.end();
  });

  const firstLink = await store.createMagicLink("  " + email.toUpperCase() + "  ");
  assert.ok(firstLink);
  assert.equal(firstLink.email, email);
  const firstHash = createHash("sha256").update(firstLink.token).digest();
  const storedFirst = await pool.query<{ token_hash: Buffer }>(
    "SELECT token_hash FROM email_verification_tokens " +
    "WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [firstLink.userId]
  );
  assert.equal(Buffer.compare(storedFirst.rows[0].token_hash, firstHash), 0);
  assert.notEqual(storedFirst.rows[0].token_hash.toString("utf8"), firstLink.token);

  const secondLink = await store.createMagicLink(email);
  assert.ok(secondLink);
  assert.equal(await store.consumeMagicLink(firstLink.token), null);
  const attempts = await Promise.all([
    store.consumeMagicLink(secondLink.token),
    store.consumeMagicLink(secondLink.token)
  ]);
  const successful = attempts.filter((account) => account !== null);
  assert.equal(successful.length, 1);
  assert.deepEqual(successful[0], { id: secondLink.userId, email, status: "active" });
  assert.equal(await store.consumeMagicLink(secondLink.token), null);
  assert.deepEqual(await store.getActiveAccount(secondLink.userId), {
    id: secondLink.userId, email, status: "active"
  });

  const expiredLink = await store.createMagicLink(email);
  assert.ok(expiredLink);
  await pool.query(
    "UPDATE email_verification_tokens " +
    "SET created_at = now() - interval '1 hour', " +
    "expires_at = now() - interval '1 minute' WHERE token_hash = $1",
    [createHash("sha256").update(expiredLink.token).digest()]
  );
  assert.equal(await store.consumeMagicLink(expiredLink.token), null);

  await pool.query(
    "INSERT INTO app_users (id, email, status) VALUES ($1, $2, 'suspended')",
    [randomUUID(), suspendedEmail]
  );
  const suspendedLink = await store.createMagicLink(suspendedEmail);
  assert.ok(suspendedLink);
  assert.equal(await store.consumeMagicLink(suspendedLink.token), null);
  assert.equal(await store.createMagicLink("not-an-email"), null);
});
