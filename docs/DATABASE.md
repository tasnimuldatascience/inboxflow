# Database model

SQL source: `packages/database/migrations/001_initial.sql`. Run `pnpm db:migrate` and `pnpm db:seed`. Migration statements are currently idempotent and execute on startup; the migrations table records the baseline. Future schema changes require ordered, immutable migration files and an explicit deployment migration phase.

| Tables                                   | Purpose and invariant                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| users / organizations / memberships      | Unique normalized email; composite organization/member identity; constrained role                                      |
| sessions / recovery_tokens / invitations | Hashed bearer credentials, expiry, one-time recovery/acceptance                                                        |
| templates / template_versions            | Validated document JSON, optimistic revisions, immutable snapshots, composite foreign keys                             |
| products / variants                      | Tenant catalog snapshot, provider ID uniqueness, integer cents, nonnegative inventory                                  |
| entities                                 | Typed smaller aggregates, revision/status; updates cannot change a record's kind                                       |
| connections                              | Unique provider per organization, mode, encrypted credential, public metadata                                          |
| action_tokens                            | Signed bearer hash, recipient/scope/target/expiry/revocation, result and attribution metadata                          |
| idempotency                              | Tenant + key uniqueness, input fingerprint and stored result                                                           |
| events                                   | Tenant/time/type index, pseudonymous recipient, message/template/campaign/block/action IDs, cents/currency/demo/cohort |
| experiment_assignments                   | Unique experiment/recipient, deterministic cohort, exposure and conversion                                             |
| submissions / consent                    | Persisted answers; unique channel/address; pending/confirmed/revoked evidence                                          |
| audit_logs / jobs / webhook_events       | Audit trail; durable outbox retries/dead letters; provider event deduplication                                         |

Entities include profiles, subscriptions, forms, feeds, themes, saved blocks, campaigns, flows, experiments, reports, billing, executions, exports, provider receipts, OAuth states, API credentials, assets and Stripe test checkouts. Kind-specific Zod contracts validate writable record types. Commercial provider receipts are distinguished from local business records to avoid overwriting an entity under the same ID.

PGlite defaults to `.data/postgres` and tests use `:memory:`. Network PostgreSQL is selected with `DATABASE_URL`; a standalone worker requires it. Do not allow multiple processes to open the same PGlite directory. Composite keys enforce tenant relationships; application code additionally scopes every private lookup.

Token execution locks its token and recipient profile. Checkout locks the token, applies conditional inventory decrements in a transaction and records one confirmed purchase. API idempotency locks the organization and checks a payload fingerprint. Review uniqueness is additionally protected by a partial database index. Published template quota changes hold an organization lock.

The seed is fictional and idempotent: two organizations, five role accounts, 24 products/48 variants, 12 profiles, eight subscriptions, six templates/campaigns, ten workflow categories, branching form, cohorts and 360 historical events. Seeding skips a nonempty database rather than destructively resetting it.

Retention removes old events, submissions and idempotency entries based on 7–3650 configured days, plus expired interaction tokens. It preserves consent evidence/audits until explicit privacy deletion. Profile deletion removes local responses, consent, tokens, pseudonymous events and directly associated entity records. External providers/backups require their own deletion process.
