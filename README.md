# WealthOS

A self-hosted Household Wealth Strategy Operating System — the internal software of a family
office: **map, verify, strategize, monitor**. Strategy-level decision support only; never product or
security recommendations, never trade execution.

- Design package: [`docs/architecture/`](docs/architecture/00-README.md) · Roadmap: [`docs/architecture/05-roadmap.md`](docs/architecture/05-roadmap.md)
- Monorepo: npm workspaces + Turborepo. TypeScript end-to-end (Next.js 16, tRPC v11, Prisma 7 / PostgreSQL).
- Bilingual he (RTL) / en from day one.
- Four-phase state machine: **MAPPING → VERIFICATION → STRATEGY → MONITORING**, enforced at the API by a
  schema-driven `workflowGuard`. The loop closes: monitoring routes back to verification or strategy.

## The four phases

1. **MAPPING** — build the canonical ledger (accounts, real estate, multi-track mortgages, cash flow,
   insurance, loans) by manual entry or by ingesting documents. Unknowns land in a Suspense account;
   the system never guesses.
2. **VERIFICATION** — every item is verified, corrected (append-only), or rejected; suspense is
   resolved. STRATEGY unlocks only through the gate (all verified + suspense empty).
3. **STRATEGY** — a reproducible, explainable engine snapshots the household, runs analyzers
   (liquidity, concentration, currency, tax-advantaged headroom, debt structure), and emits
   household-level recommendations with full bilingual rationale, each pinned to the snapshot,
   engine version, and exact assumption rows it used. Decisions are journaled. Scenarios project
   deterministic multi-year outcomes under assumption overrides.
4. **MONITORING** (M9) — a scheduled worker takes snapshots, the **DriftDetector** compares them to
   the strategy baseline, a **staleness sweep** flags aged valuations, and **re-evaluation** routes
   the household back to VERIFICATION (re-verify) or STRATEGY (re-run). See
   [`docs/architecture/06-monitoring.md`](docs/architecture/06-monitoring.md).

## Packages

| Package | Role |
|---|---|
| `packages/domain` | Value objects, the workflow state machine, and the versioned `SnapshotPayload` contract. Pure. |
| `packages/db` | Prisma schema, client, repositories, content-addressed file store. |
| `packages/ingestion` | Adapter framework, Israeli CSV + pension-PDF adapters, normalization. |
| `packages/registry` | Versioned tax matrices (IL 2025/2026) + assumption registry (conservative defaults). |
| `packages/engine-verification` | Completeness / staleness / confidence assessor + missing-docs report. |
| `packages/engine-goals` | Goal model + funding-gap engine. |
| `packages/engine-strategy` | Analyzers, generators, priority scoring, quality gate, rationale. |
| `packages/engine-scenario` | Deterministic multi-year projector + canned scenarios. |
| `packages/engine-monitoring` | **(M9)** Pure DriftDetector + staleness sweep. |
| `packages/api` | tRPC routers, `workflowGuard`, snapshot/strategy/monitoring services. |
| `apps/web` | Next.js App Router UI, bilingual he/en, RTL. |
| `apps/worker` | **(M9)** One-shot monitoring worker for Railway cron. |

## Local development

```bash
npm install
docker compose -f docker-compose.dev.yml up -d      # local Postgres
export DATABASE_URL=postgres://wealthos:wealthos@localhost:5432/wealthos
npm run migrate:deploy --workspace=@wealthos/db
npm run seed --workspace=@wealthos/registry          # idempotent registry seed
npm run dev --workspace=web                          # http://localhost:3000
```

Run the monitoring worker on demand (same code path as the cron):

```bash
DATABASE_URL=... npm run monitor --workspace=@wealthos/worker
```

## Quality gates

```bash
npm run typecheck    # tsc --noEmit across every package
npm run lint         # eslint incl. dependency-boundary rules
npm run test         # vitest; DB-bound integration tests run when TEST_DATABASE_URL is set
npm run build        # next build (web)
```

DB-bound integration tests (`packages/api/test/*-integration.test.ts`) skip unless
`TEST_DATABASE_URL` points at a disposable Postgres; CI provides one as a service.

## Deployment

Railway. The **web** service and the **worker** (cron) service are documented in
[`docs/DEPLOY.md`](docs/DEPLOY.md). Migrations and the idempotent registry seed run in the web
service's `preDeploy`.

## Testing it yourself

A complete, click-by-click smoke test covering every feature from M1 to M9 lives in
[`docs/SMOKE-TEST.md`](docs/SMOKE-TEST.md).

## Repository discipline

This repository is public. It must never contain household data: no real documents, no real
balances, no institution statements. All ingestion fixtures are synthetic.
