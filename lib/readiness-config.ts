import { getCanonicalAuthOrigin } from "./auth-security";
import { assertMagicLinkMailConfigured } from "./mail";

const MAX_MONTHLY_REQUESTS = 1_000_000;

function validRedisUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) &&
      !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  } catch { return false; }
}

function validDatabaseUrl(env: NodeJS.ProcessEnv): boolean {
  try {
    const url = new URL(env.AVEIRO_DATABASE_URL?.trim() || "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
        !url.hostname || !url.username || !url.pathname || url.pathname === "/" || url.hash) return false;
    const ssl = (url.searchParams.get("sslmode") || "").toLowerCase();
    return env.NODE_ENV !== "production" ||
      ssl === "require" || ssl === "verify-full" || env.AVEIRO_DATABASE_SSL === "require";
  } catch { return false; }
}

function validMonthlyCap(value: string | undefined): boolean {
  if (!value || !/^[1-9][0-9]*$/.test(value.trim())) return false;
  const cap = Number(value);
  return Number.isSafeInteger(cap) && cap >= 1 && cap <= MAX_MONTHLY_REQUESTS;
}

/** Validate configuration shape; database reachability is checked separately. */
export function getReadinessConfigurationIssues(env: NodeJS.ProcessEnv = process.env): string[] {
  const issues: string[] = [];
  if (!validRedisUrl(env.AVEIRO_REDIS_REST_URL?.trim() || "")) issues.push("AVEIRO_REDIS_REST_URL");
  if (!env.AVEIRO_REDIS_REST_TOKEN?.trim()) issues.push("AVEIRO_REDIS_REST_TOKEN");
  if (!/^[a-f0-9]{64}$/i.test(env.AVEIRO_NODE_SECRET_ENCRYPTION_KEY || "")) issues.push("AVEIRO_NODE_SECRET_ENCRYPTION_KEY");
  if ((env.AVEIRO_ADMIN_TOKEN || "").length < 32) issues.push("AVEIRO_ADMIN_TOKEN");
  if (!validDatabaseUrl(env)) issues.push("AVEIRO_DATABASE_URL");

  let originValid = false;
  try { getCanonicalAuthOrigin(env); originValid = true; }
  catch { issues.push("AVEIRO_AUTH_ORIGIN"); }

  if (originValid) {
    try { assertMagicLinkMailConfigured(env); }
    catch { issues.push("AVEIRO_SMTP_HOST/PORT/USER/PASS/FROM"); }
  } else if (!env.AVEIRO_SMTP_HOST || !env.AVEIRO_SMTP_USER ||
      !env.AVEIRO_SMTP_PASS || !env.AVEIRO_SMTP_FROM) {
    issues.push("AVEIRO_SMTP_HOST/PORT/USER/PASS/FROM");
  }

  if (!validMonthlyCap(env.AVEIRO_DEFAULT_REQUESTS_PER_MONTH)) {
    issues.push("AVEIRO_DEFAULT_REQUESTS_PER_MONTH");
  }
  return [...new Set(issues)];
}
