# Aveiro.ai — initial hosted infrastructure

**Target:** a private staging deployment of the Next.js web application and its Redis-backed provider control plane.  
**User experience:** browser-only. End users install nothing and never receive provider or infrastructure credentials.  
**Current state:** deployment configuration, browser authentication, monthly request quotas and provider-usage telemetry are implemented in the repository. No managed PostgreSQL, Upstash database, SMTP sender/domain, production domain, secrets or GPU provider have been provisioned yet.

## 1. Initial infrastructure layout

- **Web application:** Vercel, using the Next.js App Router deployment.
- **Persistent registry:** Upstash Redis REST.
- **Compute providers:** invited GPU operators, each running a separate Provider Node on remote hardware.
- **Source of truth:** GitHub repository `ftrevino739-ctrl/AveroAI`, development branch `feature/aveiro-community-compute-foundation`.

The initial Vercel function region is pinned to `iad1` (Washington, D.C., AWS us-east-1). Create the Upstash database in the matching AWS us-east-1 region so the application and registry are close together. Vercel recommends placing functions close to their database. If the deployment region is changed later, move/recreate the database in the matching region as part of the same maintenance window.

The existing Dockerfile remains available for a portable container deployment. The initial Vercel path does not require Docker or any local setup on end-user devices.

## 2. Create the Redis database

1. Sign in to Upstash and create a Redis database.
2. Select AWS `us-east-1` to match the initial Vercel function region.
3. Keep database access private; do not publish the REST token or share it in screenshots.
4. Copy the database's HTTPS REST URL and read/write REST token into the Vercel environment variables in the next section.

The current Upstash Free plan is intended for prototypes and includes 256 MB data, 500,000 commands per month and 10 GB monthly bandwidth. Upstash's pricing FAQ currently says an account can create up to 10 free databases, so use separate databases for Preview and Production rather than sharing a single dataset. Treat Free limits as prototype capacity, not a production promise. The registry performs multiple Redis commands per catalogue lookup, reservation and heartbeat, so monitor command usage as soon as a real node is connected. See the [Upstash Redis pricing page](https://upstash.com/pricing/redis).

The registry client uses Upstash's documented REST command format: a single JSON array in the POST request body, including Redis commands such as `PING`, `GET`, `SET`, `SMEMBERS` and `EVAL`. See the [Upstash REST API guide](https://upstash.com/docs/redis/features/restapi).

A provider heartbeat currently uses two Redis commands: one `GET` to load the registered node and verify its HMAC secret, then one Lua `EVAL` that atomically checks replay nonce, revocation state and writes the new heartbeat. At a 30-second interval, one continuously online node uses approximately 172,800 Redis commands over 30 days for heartbeats alone. Model catalogue reads and inference reservations add more. This is why the Free tier is suitable for controlled staging only; monitor actual usage before inviting multiple always-on nodes.

## 3. Generate private secrets on Windows

Run this in PowerShell on the administrator's own computer. It generates two independent 32-byte random values without installing software:

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$env:AVEIRO_NODE_SECRET_ENCRYPTION_KEY = [BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()

$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$env:AVEIRO_ADMIN_TOKEN = [BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()

$rng.Dispose()

"Encryption key: $env:AVEIRO_NODE_SECRET_ENCRYPTION_KEY"
"Admin token: $env:AVEIRO_ADMIN_TOKEN"
```

Copy these values directly into the hosting provider's private Environment Variables panel. Do not send them in chat, put them in GitHub Issues/PRs, commit them to the repository, or prefix them with `NEXT_PUBLIC_`. Store an offline backup in a password manager. Losing the encryption key means the control plane cannot decrypt existing provider-node secrets; replacing it requires a deliberate key-rotation/re-enrollment procedure.

## 4. Create the Vercel staging project

1. Sign in to Vercel and import the GitHub repository `ftrevino739-ctrl/AveroAI`.
2. Set the project root directory to `/` (repository root) and let Vercel detect Next.js.
3. Deploy the development branch `feature/aveiro-community-compute-foundation` as a preview/staging deployment. Do not merge the draft PR just to deploy it.
4. In Project Settings → Environment Variables, add the following values for the Preview environment only. Do not copy these secrets into Production yet: create a separate production Redis database and separate encryption/admin secrets before creating a production deployment.

| Variable | Value |
| --- | --- |
| `AVEIRO_REDIS_REST_URL` | Upstash HTTPS REST URL |
| `AVEIRO_REDIS_REST_TOKEN` | Upstash REST read/write token |
| `AVEIRO_NODE_SECRET_ENCRYPTION_KEY` | Generated 64-character hexadecimal key |
| `AVEIRO_ADMIN_TOKEN` | Separately generated 64-character hexadecimal admin bearer token |
| `AVEIRO_APPROVED_COMMUNITY_MODELS` | Leave empty until a specific checkpoint and licence have been reviewed |
| `AVEIRO_DATABASE_URL` | Managed PostgreSQL URL with a database name and TLS (`sslmode=require` or `verify-full`) |
| `AVEIRO_DATABASE_SSL` | Set to `require` to force TLS in the PostgreSQL client |
| `AVEIRO_AUTH_ORIGIN` | Exact public HTTPS origin for the deployed web app (no path) |
| `AVEIRO_SMTP_HOST` / `AVEIRO_SMTP_PORT` | SMTP host and port from an organization-controlled mail provider |
| `AVEIRO_SMTP_USER` / `AVEIRO_SMTP_PASS` | Private SMTP credentials |
| `AVEIRO_SMTP_FROM` | Sender address on a verified domain controlled by Aveiro |
| `AVEIRO_DEFAULT_REQUESTS_PER_MONTH` | Finite monthly request cap for new accounts (1–1,000,000) |
| `APP_URL` | Set to the final preview URL after the first deploy |

5. Create the PostgreSQL database and apply `db/migrations/0001_identity_and_usage.sql` followed by `db/migrations/0002_provider_usage_reports.sql` exactly once, using the managed database SQL console or a trusted PostgreSQL client. Keep both migration files under version control.
6. Configure an organization-controlled SMTP account and verify its sender domain before requesting live magic links. `/api/ready` validates SMTP settings but does not send a test email or prove sender-domain reputation.
7. Leave all AI provider API keys empty until Aveiro has its own authorized provider account and budget. The registry can be smoke-tested without an inference provider.
8. Keep Preview and Production variables separate. Create distinct PostgreSQL and Upstash databases and distinct encryption/admin secrets for Production; never share state or keys between environments.
9. Redeploy after setting or changing environment variables.

Vercel's Hobby plan is limited to personal, non-commercial use. It is appropriate only for private development/testing that meets those terms. Before Aveiro becomes a commercial/public product, choose a plan/host whose terms permit that use. Vercel lists Pro at $20 USD/month before applicable taxes and usage. Review the [Vercel pricing page](https://vercel.com/pricing) and [Hobby terms](https://vercel.com/legal/terms) before choosing. Do not silently treat a free personal plan as production hosting.

## 5. Verify the deployment

After Vercel completes its first deployment, open these endpoints on the preview domain:

- `/api/health` — liveness only; should return HTTP 200 and `status: "alive"`.
- `/api/ready` — validates registry secrets, PostgreSQL URL/TLS, SMTP configuration, exact HTTPS auth origin and finite monthly request cap; it then runs Redis `PING` and PostgreSQL `SELECT 1`. It returns HTTP 200 and `status: "ready"` only when both databases are reachable. SMTP is configuration-checked, not contacted.

If `/api/health` works but `/api/ready` returns HTTP 503, the web app is alive but required configuration or storage is unavailable. The `missing` field lists variable names only, never values. Check PostgreSQL URL/TLS, Redis credentials, SMTP settings, HTTPS origin and the finite monthly cap.

A ready registry is not a ready inference network. With `AVEIRO_APPROVED_COMMUNITY_MODELS` empty and no provider GPU connected, the model picker must not advertise community models. This is intentional.

## 6. Current deployment boundaries

This bootstrap does not create or claim:

- a paid Vercel/Upstash account, a domain, or a deployed production service;
- a real GPU node, model weights or inference capacity;
- a reviewed model licence or an enabled community model;
- live magic-link access until managed PostgreSQL, SMTP and the canonical HTTPS origin are provisioned;
- cloud-synced chat history (history remains browser-local);
- financial-grade token metering, billing, credits or provider rewards (node-reported counts are signed telemetry only);
- production SLA, independent security review or end-to-end prompt confidentiality.

Do not add a provider node or set `AVEIRO_APPROVED_COMMUNITY_MODELS` until an exact checkpoint, model licence, commercial-use terms, runtime compatibility and the provider's privacy/security controls have been reviewed. A provider operator can technically inspect prompts processed on their node.

## 7. Secret and environment operations

- Keep `AVEIRO_APPROVED_COMMUNITY_MODELS` empty until a specific checkpoint and its exact licence, commercial-use conditions, acceptable-use terms, and serving profile have been reviewed.
- Never reuse the Preview encryption key or admin token in Production. Generate independent values for every environment.
- Keep an offline recovery copy of the encryption key in a password manager with restricted access. It protects stored provider HMAC secrets; losing it prevents decrypting those records.
- Rotate the administrator bearer token after staff changes or suspected exposure. Revoke and re-enroll an affected provider node if its HMAC secret may have leaked.
- Do not enable public provider enrollment. Node registration remains an administrator-only action and should be limited to invited providers until security review is complete.
- Do not expose the Provider Node HTTP port publicly. Provider endpoints need HTTPS and network-level ingress restrictions so only the Aveiro control plane can reach them.

## 8. Account services and database migrations

Account access uses one-time magic links delivered through SMTP. Sessions use host-only HttpOnly/Secure cookies and Redis-bound CSRF tokens. Apply PostgreSQL migrations in ascending order before deploying account routes. Migration 0001 creates identity, monthly request quota, reservation and append-only credit-ledger structures; migration 0002 stores append-only provider-self-reported token telemetry. Provider reports do not debit credits.

`AVEIRO_DEFAULT_REQUESTS_PER_MONTH` must be a finite positive integer. New accounts without an explicit `account_limits` row receive this monthly request-only cap. Chat reserves one request in PostgreSQL before remote dispatch. Token billing and provider rewards remain disabled until independent node attestation or an equivalent trust mechanism exists.

## 9. Dependency security gate

The build pins the Next.js 15.5 line to `15.5.29` and keeps the compatible React release at `19.1.10`. The dependency tree previously included PostCSS `<=8.5.22` transitively through Next.js; this falls inside published PostCSS advisories. The project now forces the compatible patched PostCSS `8.5.32` through npm `overrides`. The GitHub Actions workflow runs `npm audit --omit=dev --audit-level=high` before type checking and blocks deployment-quality CI if a high-severity production dependency advisory remains. Review the [PostCSS security advisory](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp) and keep this override under review as Next.js updates.

The audit step covers production dependencies only. Development-tool advisories may still appear in the full `npm install` summary and should be reviewed separately; they do not get silently treated as fixed by this gate.

## 10. Upgrade path

For a private prototype, Vercel Preview + one Upstash Free database is sufficient to validate web deployment and Redis connectivity. Before inviting external users, review the hosting terms, upgrade to commercial-capable compute/storage as needed, establish spend alerts and rate limits, configure a production domain, and complete account security, authentication, retention, abuse and privacy work.

For a host-independent deployment, use the existing Dockerfile on a managed container platform or VPS and point it at the same Upstash-compatible Redis REST endpoint. The web app must remain separate from volunteer inference machines; no inference node should become the public web app's only host.
