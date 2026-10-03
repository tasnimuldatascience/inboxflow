# Security model and verification limits

Passwords use salted scrypt; sessions use random bearer credentials stored hashed, HttpOnly/SameSite cookies, expiry and membership checks. Production requires secure cookies, independent secrets, PostgreSQL, HTTPS and DEMO_MODE=false. Recovery tokens are short-lived/one-time and invalidate existing sessions. Recovery/invitation email delivery remains unconfigured; local links are explicitly marked.

The API enforces role permissions, tenant-scoped resource lookup, composite database relationships, CSRF on authenticated mutations and origin checks. Viewer/analyst roles cannot edit templates or administer accounts. No PostgreSQL RLS claim is made. Private response data is no-store. API metric keys are hashed, tenant scoped, read-only and revocable.

Recipient links are signed bearer tokens with hash, recipient, organization, scope, target and expiry in the database. Possession authorizes the narrow interaction: forwarding a link forwards that capability. Tokens expire in 30 minutes and can be revoked. Actions use transactional token/recipient locks, explicit confirmation, stored idempotent results and replay-input checks. GET does not change subscription/order/consent state; link scanners cannot complete actions.

Commerce prices and availability come from tenant database variants. Conditional stock decrement and purchase events share a transaction. Reviews have application duplicate checks and a database unique index. SMS consent is unchecked by default, stores exact wording/timestamp/token evidence, and stays pending until confirmation. No raw cards are collected and no live payment success is fabricated.

Provider credentials use AES-256-GCM derived from CREDENTIAL_KEY and never appear in connection responses. OAuth state is session-bound, hashed and expiring; callback HMAC and webhook exact raw signatures are verified with constant-time comparison. Provider requests use approved HTTPS hostnames, timeouts and no redirects. Uploads permit only image signatures and size limits; public image responses are nosniff and sandboxed. Content is escaped and CSS/URLs are allowlisted by schema. Uploaded image signatures are not a malware scanning or full image-decoding certification.

Logs redact auth/cookies/CSRF and strip query tokens. Audit records track consequential actions. Retention and privacy deletion operate on the selected tenant; consent evidence/audits remain until the explicit deletion path. Backups and external providers require separate deletion handling.

Tests cover cross-tenant denial, role denial, missing CSRF, foreign origins, expired/revoked/forged tokens, changed replay, rollback, raw webhook tampering/duplication, OAuth state, credential encryption, review uniqueness, consent intent, image restrictions, Stripe test-only verification and plan limits. They are not a penetration test, compliance certification or high-volume load test.

Before public launch, add a mail provider, distributed rate-limit store for multiple API replicas, tested proxy trust boundaries, monitoring/exporter, credential rotation, signed commercial SMS callbacks, encrypted/retained backups and a restore drill. API/document explorer exposure and public asset cache policy should be reviewed for the deployment.
