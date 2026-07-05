# WealthOS — Architecture Design Package

Status: **DRAFT — awaiting review and approval. No implementation has begun.**

| # | Document | Contents |
|---|----------|----------|
| 01 | [System Architecture](01-system-architecture.md) | Container/block diagrams, phase state machine, ingestion pipeline, strategy flow (Mermaid) |
| 02 | [Domain Model](02-domain-model.md) | DDD bounded contexts, Entity & Value Object matrices, aggregates, invariants, domain events |
| 03 | [Prisma Schema Draft](03-schema.prisma) | Full draft `schema.prisma` |
| 04 | [Module Decomposition](04-module-decomposition.md) | Monorepo package layout, dependency rules, enforcement |
| 05 | [Development Roadmap](05-roadmap.md) | Milestones as discrete single-feature git branch commits, with approval gates |
| 06 | [Risks, Assumptions & Questions](06-risks-assumptions-questions.md) | Open items requiring your input |

## Decisions already confirmed by the owner (2026-07-02)

- **Hosting:** Railway (app + managed PostgreSQL). Dedicated GitHub repo and Railway project to be provided by owner; wiring deferred until then.
- **UI:** Bilingual Hebrew (RTL) + English from day one, full i18n.
- **Auth:** Single shared household login (per-person `FamilyMember` modeling underneath).
- **Parsers:** Built fixture-first against synthetic Israeli-format documents; real documents swapped in later.

## Decisions proposed in this package (need your approval)

1. **tRPC** (hosted inside Next.js) over REST/Express — end-to-end type safety across the monorepo.
2. **npm workspaces + Turborepo** — lowest-friction monorepo tooling on Windows.
3. **Class-table inheritance ledger**: one canonical `LedgerItem` base row (single source of truth, provenance, verification) + typed detail tables per specialization. No JSONB for core financial fields.
4. **Money as `Decimal(18,4)` + ISO currency code** — never floats.
5. **Append-only valuations and audit events** (event-sourcing-lite) rather than full event sourcing.
6. **Worker process deferred** to the milestone where parsing becomes long-running; v1 parses synchronously in the web app.

<!-- END OF DOCUMENT 00 -->

## Decisions revised during M0 implementation (verified against live versions)

1. **Auth**: Auth.js/next-auth replaced by a first-party minimal session — argon2id (`@node-rs/argon2`) + signed httpOnly JWT cookie (`jose`). next-auth v5 never stabilized; for a single shared login, first-party is smaller and 5-year maintainable.
2. **Prisma 7**: connection URL lives in `prisma.config.ts`; client uses the `@prisma/adapter-pg` driver adapter.
3. **Next 16**: `proxy.ts` replaces the deprecated `middleware.ts` convention; Turbopack requires extensionless relative imports in transpiled packages.
4. **ESLint boundary rules** (`feat/m0-lint-boundaries`) deferred to the start of M1 — ESLint 10 plugin compatibility needs its own verification pass. Recorded as M0 technical debt.
