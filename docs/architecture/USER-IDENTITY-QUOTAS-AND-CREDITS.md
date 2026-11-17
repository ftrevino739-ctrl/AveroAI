# User identity, quotas and credits — architecture decision

**Status:** design approved for implementation planning; no account system is active.
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
- short-lived opaque session records;
- verification and login attempt rate limits;
- temporary inference concurrency reservations already used by the scheduler;
- short-lived idempotency/coordination keys where needed.

Redis loss must fail closed for session validation and new inference admission. It must not erase durable balances or ledger history.

## 3. Authentication decision

Use email magic-link verification as the initial passwordless sign-in method. This avoids introducing password storage, password reset and credential-stuffing risk before the service has an email delivery provider.

Implementation is blocked until an organization-controlled transactional email provider and verified sender domain are configured. Define a provider-neutral mail adapter; do not hard-code a vendor or pretend that email delivery works without credentials.

Flow:
1. Normalize and validate the email address; apply an IP-based and email-digest-based rate limit.
2. Return the same generic response whether the address is new or already registered.
3. Create or reuse a pending account and store only a cryptographic hash of a random, single-use verification token in PostgreSQL. Token lifetime: 15 minutes.
4. Send a link to the configured canonical HTTPS origin. Never build the origin from an untrusted Host header.
5. On redemption, atomically consume the unexpired token and activate the account. A token can succeed once only.
6. Issue a cryptographically random opaque session token. Store only its SHA-256 hash in Redis with a bounded lifetime (initial target: 7 days). Rotate on authentication and privilege changes.
7. Set a host-only __Host-aveiro_session cookie with HttpOnly; Secure; SameSite=Lax; Path=/. Never expose the raw token to JavaScript or localStorage.
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

- Start with explicit server-configured free-tier limits, not a promise of unlimited use. Limits must be versioned and visible to users before sending a request.
- Reserve a conservative maximum charge in a PostgreSQL transaction before dispatch. Reject the request if the account is inactive, the limit is exhausted or the reservation cannot be committed.
- Use a unique idempotency key for each ledger entry and a unique request ID for each reservation. Multiple compensating ledger entries may reference one request; retries with the same idempotency key must not duplicate an entry.
- Settle only from authoritative provider usage metadata. If a node/runtime cannot report trustworthy input and output token counts, mark the request unmetered and do not debit credits or issue provider rewards; apply a separate strict request/concurrency cap until metering is supported.
- On a confirmed failure with no billable usage, release the reservation. On partial usage, settle only the measured amount according to the published policy.
- Ledger entries are append-only. Corrections use compensating entries; never mutate historical entries or accept balance changes from the browser.
- Do not invent token counts from streamed character lengths. The Provider Node protocol must carry validated usage metadata from the inference runtime before token-based billing is enabled.

## 6. Provider and privacy boundary

The gateway resolves the authenticated account and enforces limits before scheduling. It creates a random request ID and sends only the selected model, conversation payload and protocol authentication to the Provider Node. It does not send user UUID, email, plan, balance or account cookies. Provider logs must not contain prompts by default; retention and operator disclosure must be decided before inviting public providers.

## 7. Required API surface (not yet implemented)

- POST /api/auth/request-link — generic response; rate-limited; sends email only through configured adapter.
- POST /api/auth/verify — atomically consumes one-time token and issues session cookie.
- GET /api/auth/session — returns minimal public account status, never session secrets.
- POST /api/auth/logout — revokes current session and clears cookie.
- GET /api/account/usage — returns current limits and ledger-derived usage summary.
- POST /api/chat — requires active session and a committed usage reservation before dispatch; remains exact-model only.

These endpoints must not be stubbed with fake success responses. Until the required infrastructure exists, the current pre-account staging behavior remains explicitly non-production and must not be presented as a public account system.

## 8. Delivery gates

1. Choose and provision organization-controlled PostgreSQL and transactional email services; set canonical production origin.
2. Add schema migrations, unique constraints, foreign keys, indexes and transactional integration tests.
3. Implement and test magic-link issuance/consumption, generic responses, origin/CSRF checks, session rotation, expiry, revocation and logout.
4. Require an active account in the chat gateway and atomically reserve per-account quotas before node dispatch.
5. Extend the Provider Node protocol to return trustworthy usage metadata; test success, partial usage, cancellation, timeout, duplicate settlement and provider disconnect.
6. Add append-only ledger settlement and a user-visible usage page.
7. Complete privacy/retention disclosures, abuse operations, security review and production deployment review before public launch.

**Schema milestone:** the first PostgreSQL migration is available at `db/migrations/0001_identity_and_usage.sql`. It creates the account, one-time email token, limits, reservation and append-only ledger tables with constraints and indexes. GitHub Actions now starts PostgreSQL 16 and applies the migration as a CI gate. This validates the DDL in CI; it does not provision a managed database or connect the application to one.

**Current gate:** no PostgreSQL database, email provider, sender domain or production deployment has been provisioned. Therefore this document is an implementation contract, not a claim that accounts, email login, quotas or credits already work.
