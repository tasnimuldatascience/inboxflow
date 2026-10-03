# Verification record

Executed October 3, 2026 on Windows/PowerShell with Node 24.19.0 and Docker Desktop. Results below refer to real commands, not planned checks.

| Check                                          | Result                                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                    | PASS                                                                                                          |
| `pnpm typecheck`                               | PASS                                                                                                          |
| `pnpm test`                                    | PASS: 47 unit/API/renderer tests                                                                              |
| `pnpm test:e2e`                                | PASS: all 21 Chromium acceptance journeys, final suite 49.6 seconds                                           |
| `pnpm build`                                   | PASS: strict TypeScript and optimized Next.js build                                                           |
| `pnpm audit --audit-level moderate`            | PASS: no known vulnerabilities reported                                                                       |
| Embedded migrations/seed                       | PASS; persistent demo store created                                                                           |
| AMP fixtures                                   | PASS: all 27 block types using official validator and HTTPS fixture context                                   |
| Docker Compose config                          | PASS                                                                                                          |
| Docker image build                             | PASS: migration, API, web and worker images                                                                   |
| `docker compose --profile app up -d --build`   | PASS: six running services; API/PostgreSQL/Redis healthy; migration/seed exited successfully                  |
| `pnpm test:smoke`                              | PASS: built web/API proxy, mobile overflow check, login, dashboard/editor, AMP preview, no browser exceptions |
| Network PostgreSQL / S3 / worker               | PASS: pooled concurrency, S3 put/get, completion and dead-letter checks                                       |
| Real provider credentials                      | NOT RUN: none supplied                                                                                        |
| Real email inboxes / live marketing / payments | NOT RUN; intentionally no live sends/charges                                                                  |
| Public deployment / CI remote run              | NOT RUN                                                                                                       |

The 21 browser tests exercise registration, builder persistence/style, validation/MIME download, catalog sync, cart/checkout, confirmed subscription delay, reactivation, branching form/profile mapping, reviews, consent, Klaviyo draft import/export, cohorts, Refine/undo, analytics/CSV, role/tenant denial, responsive marketing and major dashboard routes. Added journeys verify library dragging, keyboard order changes persisted across reload, uploaded images actually decoding/loading, manual feed exclusions, confirmed customer privacy deletion, and publication surviving preview and further edits without redundant versions. The keyboard journey also passed three consecutive repetitions after synchronizing with its accessibility announcement.

API/security tests cover revision conflicts, token expiry/revocation/signature/scope/replay, transactional rollback, selling plans and discounts, purchase idempotency, cross-tenant lookup, roles, CSRF/origins, both AMP sender conventions, recovery, API keys, privacy deletion, safe schemas, webhook signatures/deduplication/uninstall, OAuth session/state, image uploads, Stripe test callbacks, quota limits, retention boundaries and template/block/message purchase attribution.

Earlier failures were repaired and rerun: provider-review receipts collided with business review IDs; checkout links used provider IDs rather than cart IDs; HTTP AMP actions failed validation; style fields had ambiguous accessible names; repetitive role tests exhausted a shared IP rate budget; empty-body DELETE requests incorrectly advertised JSON; public images inherited a same-origin embedding policy; keyboard sorting included the parent drop target; a fixed-width rotated mobile hero caused horizontal overflow; unchanged previews created extra versions and previews/edits could silently demote published templates. A browser test initially checked only image presence after keyboard input; it was strengthened to assert actual order changes and persistence, and synchronized with the drag announcement. Authentication/confirmation were not weakened. A vulnerable transitive static-serving dependency was overridden to a compatible patched version and the audit rerun.

`pnpm test:postgres` ran against the real Compose PostgreSQL and RustFS services. Two simultaneous pooled checkouts competing for one unit produced one success and one rejection, stock remained zero, and exactly one purchase event existed. Replayed winning checkouts returned the same order. Concurrent updates produced one success and one revision conflict. A dedicated tenant fixture was cleaned up. VERIFY_WORKER=true verified the running PostgreSQL/BullMQ worker completed a catalog job and dead-lettered an exhausted unsupported job. An S3 bucket/object put/get round trip matched the original bytes.

The built-container browser smoke was run after Compose finished restarting the services. Its first visual run found the mobile overflow and was repaired; a request during a subsequent container restart was refused and rerun after readiness. Final smoke passed. Desktop dashboard/editor and mobile/desktop marketing screenshots under `test-results/container-smoke` were visually inspected. These are local browser screenshots, not email-inbox screenshots.

Browser screenshots and failure traces are under ignored `test-results`; the HTML report is under `playwright-report`. Screenshots are browser simulations. The route smoke audit is not an exhaustive proof that every possible field combination or provider response works. Separate-process race/load tests, Safari/Firefox, formal accessibility tooling, real inboxes, credentialed providers and backup restoration remain unverified. CI configuration exists but has not run on a remote GitHub runner.

## GitHub and video handoff recheck — October 3, 2026

Before the initial GitHub push, lint, strict type checking, the 47 unit/API tests, all 21 Chromium journeys (59.7 seconds), and the optimized production build were rerun and passed. The product source was unchanged for filming. Documentation, screenshot samples and the editable video project were added; large captured media and model caches are excluded from Git and provided as release assets.

The actual product-rich film preview exposed an HTTP-origin limitation: AMP image URLs require HTTPS. The video consequently presents the working static HTML simulation and verified hosted fallback, rather than claiming local AMP validation or real inbox execution. Sixteen recorded takes use a dedicated synthetic tenant. Sandbox order, subscription delay, review receipt, branching form/profile mapping and event deltas were verified after recording. See [video evidence](../video-production/assets/verification.json), [export validation](../video-production/output/validation.json), and [visual samples](SCREENSHOTS.md).
