# User identity, quotas and credits — architecture decision

**Status:** PostgreSQL identity, Redis sessions, SMTP delivery and browser authentication routes implemented; external services remain unprovisioned.
**Scope:** browser-only end-user accounts, abuse controls, durable usage accounting and future credits.
**Depends on:** the existing Redis-backed control plane and the community inference gateway.

## 1. Product invariants

1. End users continue to use Aveiro entirely in a browser. No local runtime, model weights, provider account or personal API key is required.
2. An account identifies the user to Aveiro only. The gateway must never forward account IDs, email addresses, session cookies or other user identity to a Provider Node.
3. A model request may execute only on a currently approved node serving the exact selected model. Account or quota logic must never introduce silent model/provider fallback.
4. No account, quota or credit balance may be represented as unlimited by default. Capacity and funding are finite.
5. A failed, rejected, cancelled-before-usage or unmetered inference must not earn provider rewards or debit user credits as if successful.
6. The current localStorage chat history remains local until a separately disclosed, explicit cloud-sync feature is designed.

## 2. Storage boundaries

### PostgreSQL — durable source of truth

Use a managed PostgreSQL database for:
- users: immutable UUID, normalized unique email, status (pending, active, suspended, deleted), created/updated timestamps.
- email_verification_tokens: user ID, SHA-256 token hash, expiry, consumed timestamp. Never store raw verification tokens.
- usage_ledger: append-only entries with UUID, user ID, request ID, unique per-entry idempotency key, entry type, model ID, input/output token counts when authoritative, signed integer credit delta, metadata version and creation time. Multiple compensating entries may refer to one request.
- usage_reservations: request ID (unique), user ID, model ID, reserved amount, status, expiry and settlement reference. Reservation and ledger writes must be transactional.
- account_limits: plan/limit version, period boundaries and explicit request/token/credit caps.

PostgreSQL is authoritative for account state, balances and usage. Never use Redis counters as the accounting ledger. Never derive a balance from browser state.

### Redis — ephemeral security and coordination

Continue using Redis for:
- short-lived opaque session records (SHA-256 token digest only, 24-hour idle expiry and 7-day absolute expiry);
- verification and login attempt rate limits;
- temporary inference concurrency reservations already used by the scheduler;
- short-lived idempotency/coordination keys where needed.

Redis loss must fail closed for session validation and new inference admission. It must not erase durable balances or ledger history.

## 3. Authentication decision

Use email magic-link verification as the initial passwordless sign-in method. This avoids introducing password storage, password reset and credential-stuffing risk before the service has an email delivery provider.

A vendor-neutral SMTP adapter (`lib/mail.ts`) now exists. Production activation remains blocked until an organization-controlled SMTP account, verified sender domain, canonical HTTPS origin, managed PostgreSQL and persistent Redis are configured. The adapter fails closed when required settings are absent.

Flow:
1. Normalize and validate the email address; apply an IP-based and email-digest-based rate limit.
2. Return the same generic response whether the address is new or already registered.
3. Create or reuse a pending account and store only a cryptographic hash of a random, single-use verification token in PostgreSQL. Token lifetime: 15 minutes.
4. Send a link to the configured canonical HTTPS origin. Never build the origin from an untrusted Host header. The token is placed in the URL fragment, not the request path or query, and the auth page requires a deliberate user click before POST redemption.
5. On redemption, atomically consume the unexpired token and activate the account. A token can succeed once only.
6. Issue a cryptographically random opaque session token. Store only its SHA-256 hash in Redis with a bounded lifetime (initial target: 7 days). Rotate on authentication and privilege changes.
7. Set a host-only `__Host-aveiro_session` cookie with HttpOnly; Secure; SameSite=Lax; Path=/. A second `__Host-aveiro_csrf` cookie is readable by same-origin JavaScript, bound to the server session by a SHA-256 hash in Redis, and required in a request header. Never expose the session token to JavaScript or localStorage.
8. Logout deletes the server-side session and expires the cookie.

Do not enable a production login endpoint until email delivery, canonical origin, database migrations and end-to-end tests are configured.

## 4. CSRF, origin and session rules

- For state-changing browser endpoints, require an exact allowlisted Origin matching the configured canonical application origin; reject missing or mismatched origins.
- Use a synchronizer CSRF token or an equivalent double-submit design bound to the server session for state-changing requests. SameSite is defense in depth, not the only CSRF control.
- Validate session records on the server for every protected request. Never trust a user ID supplied in JSON, query parameters or headers.
- Enforce absolute and idle session expiry; revoke sessions on logout, account suspension and security-sensitive account changes.
- Use generic authentication errors to prevent account enumeration.
- Do not log magic links, raw tokens, cookies, email contents or prompts.
- Add security headers and explicit cache controls to all authentication responses.

## 5. Quota and credit accounting

- Start with explicit server-configured finite request caps, not a promise of unlimited use. The first quota-store implementation uses a monthly UTC request-only tier configured by `AVEIRO_DEFAULT_REQUESTS_PER_MONTH` or an explicit `account_limits` row. Limits must be visible to users before sending a request.
- Reserve one request allowance in a PostgreSQL transaction before dispatch. Reject the request if the account is inactive, no explicit/default request plan exists, the monthly limit is exhausted or the reservation cannot be committed. Requests are serialized by locking the account row, preventing concurrent over-admission.
- Use a unique idempotency key for each ledger entry and a unique request ID for each reservation. Multiple compensating ledger entries may reference one request; retries with the same idempotency key must not duplicate an entry.
- Settle token usage only from authoritative provider usage metadata. The current community Provider Node streams runtime SSE without attested usage, so dispatched requests are marked `unmetered`: they consume one monthly request allowance but create no token debit, credits charge or provider reward. Keep a strict request/concurrency cap until metering is supported.
- On a confirmed failure with no billable usage, release the reservation. On partial usage, settle only the measured amount according to the published policy.
- Ledger entries are append-only. Corrections use compensating entries; never mutate historical entries or accept balance changes from the browser.
- Do not invent token counts from streamed character lengths. The Provider Node protocol must carry validated usage metadata from the inference runtime before token-based billing is enabled.

## 6. Provider and privacy boundary

The gateway resolves the authenticated account and enforces limits before scheduling. It creates a random request ID and sends only the selected model, conversation payload and protocol authentication to the Provider Node. It does not send user UUID, email, plan, balance or account cookies. Provider logs must not contain prompts by default; retention and operator disclosure must be decided before inviting public providers.

## 7. Authentication API and browser flow (implemented; environment-gated)

- POST /api/auth/request-link — generic response; rate-limited; sends email only through configured adapter.
- POST /api/auth/verify — atomically consumes one-time token and issues session cookie.
- GET /api/auth/session — returns minimal public account status, never session secrets.
- POST /api/auth/logout — revokes current session and clears cookie.
- GET /api/account/usage — returns current limits and ledger-derived usage summary.
- POST /api/chat — requires active session and a committed usage reservation before dispatch; remains exact-model only.

The routes and browser UI are now present. They are usable only when the required managed services and secrets are configured; missing dependencies return service errors rather than fake success. The chat gateway requires a valid account session and CSRF proof in production (Vercel Preview remains a non-production review environment). No account identity is forwarded to the Provider Node.

## 8. Delivery gates

1. Choose and provision organization-controlled PostgreSQL and transactional email services; set canonical production origin.
2. Add schema migrations, unique constraints, foreign keys, indexes and transactional integration tests. The first migration and the initial token-store integration tests are now in CI; quota transactions remain pending.
3. Implement and test magic-link issuance/consumption, generic responses, origin/CSRF checks, session rotation, expiry, revocation and logout. The HTTP routes and browser flow are implemented; CI covers storage/security primitives, but real SMTP delivery and full browser-to-production end-to-end testing require provisioned services.
4. Require an active account in the chat gateway and atomically reserve per-account quotas before node dispatch.
5. Extend the Provider Node protocol to return trustworthy usage metadata; test success, partial usage, cancellation, timeout, duplicate settlement and provider disconnect.
6. Add append-only ledger settlement and a user-visible usage page.
7. Complete privacy/retention disclosures, abuse operations, security review and production deployment review before public launch.

**Authentication milestone:** `lib/postgres.ts` supplies the durable account pool; `lib/identity-store.ts` issues and atomically consumes single-use, 15-minute links while storing only token hashes; `lib/session-store.ts` stores opaque 7-day sessions and session-bound CSRF hashes in Redis with 24-hour idle expiry; `lib/mail.ts` sends through standard SMTP; `lib/auth-security.ts` validates the canonical origin and produces host-only secure cookies; and `/auth` plus `/api/auth/*` provide the browser flow. Production chat checks the active account and CSRF proof before model dispatch. CI exercises PostgreSQL, session/CSRF logic, auth-origin policy, TypeScript, lint, provider-node tests, Next build and Docker build.

**Current gate:** no managed PostgreSQL database, persistent Redis, SMTP credentials, verified sender domain or production origin has been provisioned. Therefore the new sign-in flow is implemented but not live in the hosted deployment. The request-only quota store is implemented and CI-tested, but it is not yet wired into chat or displayed in an account page. Authoritative token metering, credits settlement, real GPU execution and operational/security review remain unfinished.
