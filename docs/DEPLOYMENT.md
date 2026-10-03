# Local operations and deployment runbook

This repository does not deploy an external environment. Its Compose configuration is a loopback-bound local demo with public example credentials. Use an isolated authorized environment and replace configuration before any production rollout.

## Commands and processes

`pnpm demo` migrates/seeds the embedded database and starts API/web. The ordinary sequence is `pnpm install`, `docker compose up -d`, configure `.env`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`. `pnpm start:worker` additionally requires network PostgreSQL and optionally REDIS_URL. The host developer launcher does not start a worker automatically.

`docker compose --profile app up -d --build` starts PostgreSQL, Redis, RustFS, migration/seed, API, Next.js and worker. API listens on 4000, web on 3000, object API on 9000, console on 9001. Health: `/api/health`, PostgreSQL `pg_isready`, Redis `PING`, RustFS `/health`. The app image runs as a non-root user. Runtime currently retains build/development dependencies because API/worker run TypeScript via tsx; prune or compile to plain JS for a smaller hardened production image.

Stop host processes with Ctrl+C or `powershell -File scripts/stop.ps1`; stop containers with `docker compose --profile app down`. These commands preserve data. Do not delete `.data` or volumes as routine troubleshooting.

## Configuration and HTTPS

Copy `.env.example` and choose database/storage mode. Independently generate SESSION_SECRET and CREDENTIAL_KEY with at least 32 characters. Set NODE_ENV=production, DEMO_MODE=false, real DATABASE_URL, HTTPS APP_URL and HTTPS PUBLIC_API_URL. The API rejects unsafe production defaults. Production startup uses migrations only; do not seed demonstration users. Mail transport/provider writes are still launch gaps.

Next rewrites are evaluated during build: set API_INTERNAL_URL at Docker build time to the API's internal hostname, not its public URL. `infra/deployment/Caddyfile` is an HTTPS reverse-proxy example using your own hostname. Route `/api/*` to API and other traffic to web; use consistent public origin settings. Review proxy trust/rate limits for the actual network. Keep database/Redis/object storage private.

## Jobs, monitoring, and secrets

The PostgreSQL outbox is authoritative. Workers claim queued jobs with SKIP LOCKED, retry failures, dead-letter after four attempts, and recover stale running jobs. BullMQ optionally distributes the work; it does not authorize delivery. Worker daily retention removes old configured data; the owner/admin retention API offers a dry run before confirmed cleanup. Monitor failed jobs and queue lag. Provider errors are sanitized.

Use managed secret storage for provider tokens and application secrets. Rotate the encryption key with a migration that decrypts/re-encrypts credentials; simply changing it breaks existing connections. OpenTelemetry API hooks require an SDK/exporter and collector. Define latency/error/queue/backlog SLOs and alerts before launch. Run CI and a smoke test after every build.

## Backup and recovery

For PostgreSQL, use `pg_dump --format=custom` from a trusted administrative environment, encrypt the artifact, and retain it under an explicit policy. Restore into a separate empty database with `pg_restore`; run migrations and verify tenant/auth/catalog/order invariants before switching traffic. Preserve S3 objects/versioning separately and verify uploaded assets after restoration. Redis is queue acceleration; rebuild work from the outbox if needed.

For embedded mode, stop the API before copying `.data/postgres` and `.data/uploads`; do not copy an active PGlite store. Backups contain personal data and credential ciphertext. A real backup/restore drill has not been completed during this build. Do not claim HA from the single-node local Compose services.

The unavailable MinIO image was replaced with official RustFS pinned by digest after a real pull failure. The local S3 put/get acceptance probe is recorded in TEST_RESULTS. Provider credentialed tests and real inbox verification must be performed separately.

After starting the complete container profile, run `pnpm test:smoke` to check the built frontend through its API proxy, login, dashboard, editor, and AMP validation. It writes screenshots under `test-results/container-smoke`. The separate `pnpm test:postgres` probe requires a local DATABASE_URL and tests stock races and revision conflicts with simultaneous pooled connections. Set VERIFY_WORKER=true to include completion/dead-letter checks against an already running worker. Its dedicated tenant fixture is removed afterward; these probes are for the local demonstration environment.
