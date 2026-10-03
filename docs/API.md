# API contracts

Base URL is `/api`. The UI proxies it to Fastify. Explore route paths at `/api/docs` and `/api/openapi.json`; Zod is the authoritative runtime validation layer. Normal errors are `{ "error": "message", "details": [...] }` with 400 validation, 401 session/token, 403 permission, 404 missing tenant resource, 409 conflict/replay, 410 expiry, or 422 unavailable action/quota.

Sign in through `POST /auth/login` with `{email,password}`. The response returns a CSRF token; the HttpOnly session cookie carries identity. All authenticated mutations require `X-CSRF-Token`; origin checks apply when Origin is supplied. Session mutations use POST/PATCH/PUT/DELETE. Organization IDs come from the session, never a client-selected mutation scope.

| Routes                                                                                                               | Operations                                                           |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/switch`, `/auth/recover`, `/auth/reset`          | Identity/session/recovery                                            |
| `/account`, `/organizations`, `/team`, `/team/invite`, `/team/accept`, `/team/:id`                                   | Profile, organization and role management                            |
| `/templates`, `/templates/:id`, `/:id/versions`, `/:id/render`, `/:id/refine`, `/:id/operations`                     | Structured documents, revisions, export, typed operation proposals   |
| `/products`, `/products/:id`, `/products/sync`                                                                       | Catalog reads and provider/sandbox sync                              |
| `/records/:kind`, `/records/:kind/:id`                                                                               | Allowlisted, schema-validated aggregate CRUD with revision conflicts |
| `/feeds/:id/preview`, `/flows/:id/simulate`, `/forms/:id/submit`, `/forms/:id/responses`                             | Recommendations, consent-aware simulation, forms                     |
| `/integrations`, `/:provider/connect`, `/:provider`, `/integrations/shopify/oauth`, `/integrations/shopify/callback` | Connection, encrypted key/read validation, OAuth                     |
| `/klaviyo/templates`, `/klaviyo/import/:id`, `/klaviyo/export/:id`                                                   | Provider listing/text import/local draft export                      |
| `/action-tokens`, `/action-tokens/:id`, `/experience`, `/experience/action`                                          | Recipient-scoped token mint/revoke and intentional actions           |
| `/amp/data`, `/amp/action`                                                                                           | Cookie-free data/action with AMP sender/CORS authorization           |
| `/carts`, `/checkout/:id/confirm`                                                                                    | Idempotent carts and sandbox purchase confirmation                   |
| `/analytics`, `/analytics.csv`, `/analytics/ask`, `/experiments/:id/{assign,convert,results}`                        | Read-only metrics, CSV, cohort measurements                          |
| `/billing`, `/billing/change`, `/billing/stripe-test-checkout`                                                       | Local billing/quota and test-only Stripe                             |
| `/assets`, `/assets/:id`                                                                                             | Authenticated image upload and public opaque image serving           |
| `/settings`, `/audit`, `/credentials`, `/credentials/:id`, `/v1/metrics`                                             | Admin settings, audit and read-only metric keys                      |
| `/privacy/export`, `/privacy/profile/:id`, `/maintenance/retention`                                                  | Export/deletion and preview/confirmed cleanup                        |
| `/consent`, `/sms/:id/confirm`, `/webhooks/shopify/:org`, `/webhooks/stripe`, `/health`                              | Consent simulator, signed raw callbacks, health                      |

Template update: `{document,revision,status:"draft"|"published"}`. Record update: `{name,data,revision,status}`. Existing revisions must match. Entitlement limits apply to published templates (10/100/1000), not draft editing.

Mint a recipient link with `{recipientId:"profile-1",scope:"cart",targetId:"product-1"}`. Then POST `/experience/action` with `{token,input:{confirm:true,lines:[{variantId:"variant-1-1",quantity:2}]}}`. Supported scopes: cart, subscription, reactivation, swap, form, review, SMS, unsubscribe, engagement. The signed token determines tenant and ownership. Same-input retry returns its result; changed retry fails.

`Idempotency-Key` is required for cart creation, authenticated form submission, local Klaviyo export, and Stripe test checkout. Keys are tenant scoped and must be reused only for the same payload. Uploaded assets accept `{name,base64}` for PNG/JPEG/WebP up to 2 MB. No SVG/HTML uploads are accepted.

`GET /v1/metrics` accepts `Authorization: Bearer if_...`; it grants only read-only tenant metrics. Keys are shown once and stored hashed. Raw provider webhook bodies must use `application/json`; signature verification precedes payload processing.
