# InboxFlow

An independent interactive-commerce email application built from public product research. It is a working local application with persistent sandbox providers, secure recipient experiences, a visual editor, and email exports. It is not affiliated with Zaymo and is not certified for production sending.

![InboxFlow visual email builder](docs/screenshots/editor.webp)

Browse [application and film screenshots](docs/SCREENSHOTS.md) and the [video production project](video-production/README.md). The project includes a 112-second product launch film, a 30-second vertical cut, and a silent 12-second website loop. Large footage/audio/video files are local deliverables excluded from Git; editable sources, captions, representative screenshots, licenses, and verification records are included.

Download the finished MP4s and the complete source/media bundle from the [v0.1.0 release](https://github.com/tasnimuldatascience/inboxflow/releases/tag/v0.1.0). The repository and release are private.

## Run the demo

Requires Node 22.12+ (Node 24 recommended) and pnpm 11.19.0.

```powershell
pnpm install
pnpm demo
```

Open [InboxFlow](http://localhost:3000). Sign in with `owner@inboxflow.local` / `InboxFlowDemo!2026`. Other seeded roles use `admin`, `editor`, `analyst`, or `viewer` at the same domain and the same demo password. The owner can switch between two isolated organizations.

The default database is persistent embedded PostgreSQL (PGlite) in `.data/postgres`. No provider credentials, Docker, Redis, or outbound delivery are required for the demo. The demo creates no real payments, subscriptions, email campaigns, or SMS messages. The case studies, brands, customers, and historical metrics are fictional.

## PostgreSQL, Redis, and S3-compatible storage

```powershell
docker compose up -d
Copy-Item .env.example .env
# Set DATABASE_URL and, optionally, REDIS_URL and S3_* in .env.
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Compose starts PostgreSQL 17, Redis 7, and RustFS. RustFS replaces an unavailable MinIO image; the application uses the standard AWS S3 client. To run the entire application in containers:

```powershell
docker compose --profile app up -d --build
```

The `app` profile runs migrations/seed, API, web, and worker. Do not run the host web/API and container web/API on the same ports. Stop host processes with Ctrl+C or `powershell -File scripts/stop.ps1`. `docker compose --profile app down` stops containers while retaining volumes. Never use `down -v` unless intentionally discarding demo data.

## What works

- Multi-tenant authentication, role enforcement, organization switching, invitation links, recovery tokens, API keys, and audit records.
- Structured email editor with 27 block types, library drag/drop, reorder, inline edits, styling, conditional visibility, saved blocks, autosave, undo/redo, version history, and publish limits.
- Static HTML, AMP4EMAIL, plain text, MIME exports, official AMP validation, and desktop/mobile browser simulations.
- Product catalog, variants, deterministic feeds, multi-item carts, server price/inventory checks, and idempotent sandbox checkout.
- Subscription skip/delay/quantity/swap/plan/one-time/reactivation/ship-now workflows, branching forms/quizzes, reviews, SMS consent and simulated double opt-in.
- Campaign/flow records and consent-aware simulations; persisted events, charts, CSV, block attribution, cohorts and confidence intervals.
- Deterministic Refine and read-only analytics assistants, clearly labeled as local rule-based implementations.
- Shopify OAuth/read sync/raw webhooks, Klaviyo read adapters, encrypted credentials, image uploads, S3 storage, PostgreSQL outbox/BullMQ worker, test-only Stripe checkout/webhooks, and retention cleanup.

## Verify

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm audit --audit-level moderate
```

With the container stack running, `pnpm test:smoke` verifies the running web/API and captures browser screenshots. To verify real PostgreSQL concurrency, S3 storage, and the running worker:

```powershell
$env:DATABASE_URL='postgresql://inboxflow:local-only-password@localhost:5432/inboxflow'
$env:VERIFY_WORKER='true'
pnpm test:postgres
```

The PostgreSQL probe creates and removes its own tenant fixture. It requires a local database endpoint; the worker check requires the app profile. The browser acceptance configuration explicitly clears DATABASE_URL, REDIS_URL and S3_ENDPOINT for an isolated in-memory fixture.

API: [health](http://localhost:4000/api/health), [route explorer](http://localhost:4000/api/docs), [OpenAPI](http://localhost:4000/api/openapi.json). The explorer primarily describes routes; runtime Zod contracts and examples are documented separately.

Start by reading [user journeys](docs/USER_JOURNEYS.md), [actual feature scope](docs/FEATURE_PARITY.md), [test results](docs/TEST_RESULTS.md), and the [deployment runbook](docs/DEPLOYMENT.md). Live provider credentials, sender approval, ESP AMP support, real inbox testing, managed backups, an observability exporter, and legal review remain launch requirements. Full provider parity and a production deployment are not claimed.
