import assert from "node:assert/strict";
import test from "node:test";
import { getReadinessConfigurationIssues } from "./readiness-config";

function validEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    AVEIRO_REDIS_REST_URL: "https://redis.example.upstash.io",
    AVEIRO_REDIS_REST_TOKEN: "private-redis-token",
    AVEIRO_NODE_SECRET_ENCRYPTION_KEY: "a".repeat(64),
    AVEIRO_ADMIN_TOKEN: "private-admin-token-that-is-at-least-32-chars",
    AVEIRO_DATABASE_URL: "postgresql://aveiro:db-pass@db.example.com:5432/aveiro?sslmode=require",
    AVEIRO_DATABASE_SSL: "require",
    AVEIRO_AUTH_ORIGIN: "https://aveiro.example",
    AVEIRO_SMTP_HOST: "smtp.example.com",
    AVEIRO_SMTP_PORT: "587",
    AVEIRO_SMTP_USER: "smtp-user",
    AVEIRO_SMTP_PASS: "smtp-pass",
    AVEIRO_SMTP_FROM: "Aveiro <no-reply@example.com>",
    AVEIRO_DEFAULT_REQUESTS_PER_MONTH: "120"
  } as NodeJS.ProcessEnv;
}

test("accepts complete production configuration", () => {
  assert.deepEqual(getReadinessConfigurationIssues(validEnv()), []);
});

test("reports missing settings by variable name without exposing secret values", () => {
  const issues = getReadinessConfigurationIssues({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
  for (const name of [
    "AVEIRO_REDIS_REST_URL", "AVEIRO_REDIS_REST_TOKEN", "AVEIRO_NODE_SECRET_ENCRYPTION_KEY",
    "AVEIRO_ADMIN_TOKEN", "AVEIRO_DATABASE_URL", "AVEIRO_AUTH_ORIGIN",
    "AVEIRO_SMTP_HOST/PORT/USER/PASS/FROM", "AVEIRO_DEFAULT_REQUESTS_PER_MONTH"
  ]) assert.ok(issues.includes(name));
  assert.ok(issues.every((issue) => !issue.includes("private-")));
});

test("rejects insecure production origin/database transport and unlimited caps", () => {
  const env = validEnv();
  env.AVEIRO_AUTH_ORIGIN = "http://aveiro.example";
  env.AVEIRO_DATABASE_URL = "postgresql://aveiro:db-pass@db.example.com:5432/aveiro?sslmode=disable";
  env.AVEIRO_DATABASE_SSL = "";
  env.AVEIRO_DEFAULT_REQUESTS_PER_MONTH = "1000001";
  const issues = getReadinessConfigurationIssues(env);
  assert.ok(issues.includes("AVEIRO_AUTH_ORIGIN"));
  assert.ok(issues.includes("AVEIRO_DATABASE_URL"));
  assert.ok(issues.includes("AVEIRO_DEFAULT_REQUESTS_PER_MONTH"));
});

test("allows loopback HTTP and local PostgreSQL during development", () => {
  const env = validEnv();
  env.NODE_ENV = "development";
  env.AVEIRO_AUTH_ORIGIN = "http://localhost:3000";
  env.AVEIRO_DATABASE_URL = "postgresql://aveiro:db-pass@localhost:5432/aveiro";
  env.AVEIRO_DATABASE_SSL = "";
  assert.deepEqual(getReadinessConfigurationIssues(env), []);
});
