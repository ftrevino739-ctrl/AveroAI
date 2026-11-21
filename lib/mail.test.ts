import assert from "node:assert/strict";
import test from "node:test";
import { buildMagicLinkUrl } from "./mail";

test("keeps magic-link credentials in a browser fragment, never in request path or query", () => {
  const token = Buffer.alloc(32, 3).toString("base64url");
  const url = buildMagicLinkUrl(token, {
    NODE_ENV: "production",
    AVEIRO_AUTH_ORIGIN: "https://aveiro.example"
  } as NodeJS.ProcessEnv);
  assert.equal(url, "https://aveiro.example/auth#aveiro_magic=" + token);
  assert.equal(new URL(url).search, "");
  assert.equal(new URL(url).pathname, "/auth");
});
