# Integration modes

Every connection reports `sandbox` or `live` and its status. Missing credentials leave persistent sandbox workflows usable. A successful mock receipt does not indicate a commercial provider accepted a request.

## Shopify

The sandbox stores product/variant inventory and carts in PostgreSQL. New tenant fixtures are independent of other tenants. Live read mode accepts a `*.myshopify.com` domain and encrypted Admin token, or development-app OAuth using `SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET`. OAuth requests read_products/read_inventory, binds a short-lived state hash to the initiating browser session, verifies callback HMAC, consumes state once and encrypts the granted token.

Admin GraphQL version 2026-10 reads products/variants/inventory/images/collections and selling-plan IDs/names. Product/variant pagination has safety limits; excessive collection/plan memberships fail explicitly. Catalog publication is transactional and removes deleted products/variants after a complete read. Live selling-plan pricing policies are not interpreted; merchant checkout must remain authoritative. Protected customer/order reads are not requested.

Webhook `/api/webhooks/shopify/:org` requires exact raw JSON, client-secret HMAC, matching shop domain and unique event ID. Uninstall clears the credential; other events enqueue a catalog sync. Offline OAuth token expiry/refresh policy must be reviewed for the merchant app before launch. A Storefront cartCreate contract exists but hosted purchase routes intentionally use the sandbox.

## Klaviyo

API-key reads use revision 2026-07-15 with JSON:API headers and validated pagination links. Connection/list/import routes use the selected provider. Import converts safe text into a structured editable document; it does not reconstruct proprietary layouts. Live draft creation, flows/campaign reads and profile-import contracts exist in the adapter, but application writes remain disabled pending credentialed acceptance.

Sandbox exports store HTML, AMP, text, MIME, template revision and provider version. Expected versions prevent silent overwrites. Idempotency keys prevent duplicate local exports. Live overwrite is refused. Live AMP delivery/account enablement is not inferred from ordinary template read access. The organization live-flow-sync setting is a stored opt-in for future supported sync; it does not currently activate a sender.

## Subscriptions, reviews, SMS

SandboxRecharge implements all hosted subscription actions, including payment-status failure paths. The Recharge adapter contains read/activate/delay/quantity contracts; live connection/action routes are disabled until capabilities and scopes are reviewed. Other subscription platforms and commercial review/SMS providers are not implemented. The mock review provider persists received payloads; the SMS simulator records evidence and pending consent, and only a demo-authenticated callback confirms it.

## Stripe and storage

Billing always offers local simulation. Optional `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_PRICE_STARTER/GROWTH/SCALE` and `STRIPE_WEBHOOK_SECRET` enable Stripe test Checkout. Live keys are rejected; callbacks must be fresh, signed, known test sessions with `livemode:false` and paid status. Browser return never changes billing. Broader lifecycle events/portal/invoices remain future work.

Images use local storage by default or the AWS SDK S3 client with `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Compose provides pinned RustFS. Access credentials and uploads never enter the email document; only public opaque image URLs do.

Provider HTTP requests use HTTPS allowlisted hosts, blocked redirects, timeouts, and bounded retries for GET and read-only GraphQL query 429/5xx responses. Mutations are not automatically retried. GraphQL errors are surfaced and webhook jobs retry from the durable outbox. Real credentialed integration tests have not been run.
