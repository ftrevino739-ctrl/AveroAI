import { Pool } from "pg";

type GlobalWithIdentityPool = typeof globalThis & { __aveiroIdentityPool?: Pool };
const globalForPostgres = globalThis as GlobalWithIdentityPool;

function validateDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const value = env.AVEIRO_DATABASE_URL?.trim() || "";
  if (!value) throw new Error("Aveiro identity storage is not configured.");
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("AVEIRO_DATABASE_URL is invalid."); }

  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname ||
      !url.username || !url.pathname || url.pathname === "/" || url.hash) {
    throw new Error("AVEIRO_DATABASE_URL must be a PostgreSQL connection URL with a database name.");
  }

  const sslMode = (url.searchParams.get("sslmode") || "").toLowerCase();
  const sslRequired = sslMode === "require" || sslMode === "verify-full" ||
    env.AVEIRO_DATABASE_SSL === "require";
  if (env.NODE_ENV === "production" && !sslRequired) {
    throw new Error("AVEIRO_DATABASE_URL must require TLS in production.");
  }
  return value;
}

/** Lazy, small process-wide pool; importing the app does not require a database. */
export function getIdentityPool(env: NodeJS.ProcessEnv = process.env): Pool {
  if (globalForPostgres.__aveiroIdentityPool) return globalForPostgres.__aveiroIdentityPool;

  const connectionString = validateDatabaseUrl(env);
  const parsedUrl = new URL(connectionString);
  const sslMode = (parsedUrl.searchParams.get("sslmode") || "").toLowerCase();
  const useTls = sslMode === "require" || sslMode === "verify-full" ||
    env.AVEIRO_DATABASE_SSL === "require";
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    query_timeout: 12_000,
    keepAlive: true,
    application_name: "aveiro-web",
    ...(useTls ? { ssl: { rejectUnauthorized: true } } : {})
  });
  pool.on("error", () => {});
  globalForPostgres.__aveiroIdentityPool = pool;
  return pool;
}

export async function checkIdentityDatabase(): Promise<boolean> {
  const result = await getIdentityPool().query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
