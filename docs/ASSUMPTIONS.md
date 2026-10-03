# Assumptions and constraints

- The workspace was empty. InboxFlow is original source, branding, copy and fictional demonstration data.
- The public reference describes capabilities, not private implementation. Unavailable pages and provider capabilities are recorded as unverified.
- No provider keys, ESP AMP entitlement, sender approval, public HTTPS endpoint, or authorized deployment environment were supplied.
- Persistent sandbox services are the default; commercial subscription changes and real email/SMS/payment delivery remain disabled.
- Currency is USD and prices use integer cents. Taxes/shipping/real selling-plan pricing are the merchant's responsibility.
- Tokens are short-lived bearer capabilities. A forwarded token grants its scope until expiry/revocation; possession is not proof of mailbox identity.
- PGlite is for a single-process local demo. Network PostgreSQL is required for the standalone worker and concurrent deployment.
- The product feed engine is deterministic. Previous/viewed/abandoned recommendations depend on explicit configured IDs; no behavioral ingestion or machine-learning system is implied.
- Assistants are deterministic local fallbacks. A model/provider evaluation pipeline remains future work.
- Legal pages are placeholders. No compliance, security certification, causal lift, real payment-success, or full commercial parity is asserted.
- RustFS replaces a MinIO image that failed to pull. The S3 client contract is preserved.
- No external production deployment or live send is authorized by this implementation.
