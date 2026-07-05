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
