import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionCookieHeaders,
  constantTimeTextEquals,
  getCanonicalAuthOrigin,
  isTrustedOrigin,
  sessionCookieHeaders
} from "./auth-security";

test("requires a canonical HTTPS origin in production", () => {
  const prod = { NODE_ENV: "production", AVEIRO_AUTH_ORIGIN: "https://aveiro.example" } as NodeJS.ProcessEnv;
  assert.equal(getCanonicalAuthOrigin(prod), "https://aveiro.example");
  assert.equal(isTrustedOrigin("https://aveiro.example", prod), true);
  assert.equal(isTrustedOrigin("https://other.example", prod), false);
  assert.equal(isTrustedOrigin(null, prod), false);
  assert.throws(() => getCanonicalAuthOrigin({
    NODE_ENV: "production", AVEIRO_AUTH_ORIGIN: "http://aveiro.example"
  } as NodeJS.ProcessEnv));
});

test("development HTTP is limited to loopback and rejects URL paths", () => {
  assert.equal(getCanonicalAuthOrigin({
    NODE_ENV: "development", AVEIRO_AUTH_ORIGIN: "http://localhost:3000"
  } as NodeJS.ProcessEnv), "http://localhost:3000");
  assert.throws(() => getCanonicalAuthOrigin({
    NODE_ENV: "development", AVEIRO_AUTH_ORIGIN: "http://example.com"
  } as NodeJS.ProcessEnv));
  assert.throws(() => getCanonicalAuthOrigin({
    NODE_ENV: "development", AVEIRO_AUTH_ORIGIN: "https://aveiro.example/path"
  } as NodeJS.ProcessEnv));
});

test("session cookies are host-only and CSRF values use a constant-time comparison", () => {
  const [sessionCookie, csrfCookie] = sessionCookieHeaders("session", "csrf");
  assert.match(sessionCookie, /HttpOnly/);
  assert.match(sessionCookie, /Secure/);
  assert.match(sessionCookie, /Path=\//);
  assert.doesNotMatch(sessionCookie, /Domain=/);
  assert.doesNotMatch(csrfCookie, /HttpOnly/);
  assert.equal(clearSessionCookieHeaders().length, 2);
  assert.equal(constantTimeTextEquals("same-value", "same-value"), true);
  assert.equal(constantTimeTextEquals("different", "same-value"), false);
  assert.equal(constantTimeTextEquals(null, "same-value"), false);
});
