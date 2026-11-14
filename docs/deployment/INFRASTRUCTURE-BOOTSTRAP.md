# Aveiro.ai — initial hosted infrastructure

**Target:** a private staging deployment of the Next.js web application and its Redis-backed provider control plane.  
**User experience:** browser-only. End users install nothing and never receive provider or infrastructure credentials.  
**Current state:** deployment configuration and readiness checks are in the repository; no Vercel project, Upstash database, production domain, secrets or GPU provider have been provisioned yet.

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

The current Upstash Free plan is intended for prototypes and includes one database, 256 MB data, 500,000 commands per month and 10 GB monthly bandwidth. Treat these as prototype limits, not a production capacity promise. The registry performs multiple Redis commands per catalogue lookup, reservation and heartbeat, so monitor command usage as soon as a real node is connected. See the [Upstash Redis pricing page](https://upstash.com/pricing/redis).

The registry client uses Upstash's documented REST command format: a single JSON array in the POST request body, including Redis commands such as `PING`, `GET`, `SET`, `SMEMBERS` and `EVAL`. See the [Upstash REST API guide](https://upstash.com/docs/redis/features/restapi).

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
4. In Project Settings → Environment Variables, add the following values for the Preview environment:

| Variable | Value |
| --- | --- |
| `AVEIRO_REDIS_REST_URL` | Upstash HTTPS REST URL |
| `AVEIRO_REDIS_REST_TOKEN` | Upstash REST read/write token |
| `AVEIRO_NODE_SECRET_ENCRYPTION_KEY` | Generated 64-character hexadecimal key |
| `AVEIRO_ADMIN_TOKEN` | Separately generated 64-character hexadecimal admin bearer token |
| `AVEIRO_APPROVED_COMMUNITY_MODELS` | Leave empty until a specific checkpoint and licence have been reviewed |
| `APP_URL` | Set to the final preview URL after the first deploy |

5. Leave all AI provider API keys empty until Aveiro has its own authorized provider account and budget. The registry can be smoke-tested without an inference provider.
6. Redeploy after setting or changing environment variables.

Vercel's Hobby plan is limited to personal, non-commercial use. It is appropriate only for private development/testing that meets those terms. Before Aveiro becomes a commercial/public product, choose a plan/host whose terms permit that use. Vercel lists Pro at $20 USD/month before applicable taxes and usage. Review the [Vercel pricing page](https://vercel.com/pricing) and [Hobby terms](https://vercel.com/legal/terms) before choosing. Do not silently treat a free personal plan as production hosting.

## 5. Verify the deployment

After Vercel completes its first deployment, open these endpoints on the preview domain:

- `/api/health` — liveness only; should return HTTP 200 and `status: "alive"`.
- `/api/ready` — checks that all registry secret variables exist and the Redis REST `PING` succeeds. It should return HTTP 200 and `status: "ready"`.

If `/api/health` works but `/api/ready` returns HTTP 503, the web app is running but registry storage is not ready. Check the environment variable names, redeploy, and verify the Upstash database/token. The readiness response never exposes credentials.

A ready registry is not a ready inference network. With `AVEIRO_APPROVED_COMMUNITY_MODELS` empty and no provider GPU connected, the model picker must not advertise community models. This is intentional.

## 6. Current deployment boundaries

This bootstrap does not create or claim:

- a paid Vercel/Upstash account, a domain, or a deployed production service;
- a real GPU node, model weights or inference capacity;
- a reviewed model licence or an enabled community model;
- public user accounts, durable chat history, user quotas, billing or credits;
- production SLA, independent security review or end-to-end prompt confidentiality.

Do not add a provider node or set `AVEIRO_APPROVED_COMMUNITY_MODELS` until an exact checkpoint, model licence, commercial-use terms, runtime compatibility and the provider's privacy/security controls have been reviewed. A provider operator can technically inspect prompts processed on their node.

## 7. Upgrade path

For a private prototype, Vercel Preview + one Upstash Free database is sufficient to validate web deployment and Redis connectivity. Before inviting external users, review the hosting terms, upgrade to commercial-capable compute/storage as needed, establish spend alerts and rate limits, configure a production domain, and complete account security, authentication, retention, abuse and privacy work.

For a host-independent deployment, use the existing Dockerfile on a managed container platform or VPS and point it at the same Upstash-compatible Redis REST endpoint. The web app must remain separate from volunteer inference machines; no inference node should become the public web app's only host.
