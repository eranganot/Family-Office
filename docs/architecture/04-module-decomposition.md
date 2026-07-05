# 04 — Module Decomposition (TypeScript Monorepo)

Tooling: **npm workspaces + Turborepo**. One repo, dedicated GitHub remote + Railway project to be
provided by owner (wiring deferred; everything below works locally until then).

## 1. Repository layout

```
wealthos/
├── apps/
│   ├── web/                  # Next.js (App Router): UI + tRPC host + Auth.js
│   └── worker/               # DEFERRED (M9): background parsing, scheduled snapshots, drift
├── packages/
│   ├── domain/               # Pure domain: entities, VOs, factories, state machine. Deps: zod only
│   ├── db/                   # prisma/schema.prisma, migrations, repositories, seed
│   ├── api/                  # tRPC routers, context, workflowGuard middleware, zod I/O schemas
│   ├── ingestion/            # Adapter framework + adapters + fixture corpus
│   │   └── adapters/         #   generic-csv, il-pension-annual-pdf, mislaka, manual, ...
│   ├── registry/             # TaxRegistry + AssumptionRegistry accessors, versioned matrices, seeds
│   ├── engine-verification/  # completeness, staleness, confidence, missing-docs report
│   ├── engine-goals/         # goal model logic, funding-gap analysis, dependency validation
│   ├── engine-strategy/      # analyzers, recommendation generators, scoring, quality gate
│   ├── engine-scenario/      # deterministic projections, scenario comparison
│   ├── i18n/                 # message catalogs he/en, formatting (ILS/USD/EUR, Hebrew dates)
│   └── config/               # shared tsconfig, eslint (incl. boundary rules), prettier
├── docs/architecture/        # this design package (living documents)
└── turbo.json
```

## 2. Package responsibility & dependency matrix

| Package | May import | Must never import | Public surface |
|---|---|---|---|
| domain | zod | prisma, next, node APIs with I/O | Entities, VOs, `LedgerFactory`, `WorkflowStateMachine`, `RawDataPayload`/`CanonicalLedgerItem` types |
| db | domain, @prisma/client | api, engines, next | Repositories (interface-first), `prisma` client, migration scripts |
| registry | domain, db | engines, api | `TaxRegistry.forYear(y)`, `AssumptionRegistry.current(key)`, version pinning helpers |
| ingestion | domain | db, api, engines | `Adapter` interface, `runImport(fileStream, adapterId) → RawDataPayload`, adapter registry |
| engine-* | domain, db, registry | api, next, each other* | One service class per engine, versioned (`engineVersion`) |
| api | domain, db, registry, engines, ingestion | next UI code | `appRouter` (tRPC), `workflowGuard`, context factory |
| i18n | — | everything else | message catalogs, `formatMoney`, `formatDate` per locale |
| web (app) | api (client types), i18n | domain internals, db, engines directly | pages, components |
| worker (app) | ingestion, engines, db, registry | web | job runners |

\* Exception: `engine-strategy` may import `engine-goals` and `engine-verification` read-model types
(strategy consumes goal gaps and data-quality scores). No other inter-engine imports.

Enforcement: `eslint-plugin-boundaries` in `packages/config`; CI fails on violation. This is what
keeps "future capabilities added with minimal changes to the core domain" true in practice.

## 3. Key contracts

### Adapter (Ingestion Adapter Pattern)

```ts
interface IngestionAdapter {
  id: string;                 // "il-pension-annual-pdf"
  version: string;            // bumped on any mapping change
  accepts(doc: DocumentMeta): boolean;
  parse(stream: ReadableStream, meta: DocumentMeta): Promise<RawDataPayload>;
}
// Adapters: file stream → text matrix (RTL-aware) → RawDataPayload. Nothing else.
// packages/domain/LedgerFactory: RawDataPayload → CanonicalLedgerItem[] | SuspenseItem[].
```

### Workflow guard (Schema-Driven State Locking)

```ts
const strategyProcedure = protectedProcedure.use(workflowGuard("STRATEGY"));
// workflowGuard reads Household.workflowState from DB per request;
// throws TRPCError FORBIDDEN with the current state if it doesn't match.
// All engine-strategy and engine-scenario procedures are built on strategyProcedure.
```

### Registry access (Versioned Regulatory Registry)

```ts
const rules = await taxRegistry.forYear(2026).get("HISHTALMUT_CEILING");
// Engines receive registry handles pinned to a year+version; raw rates never appear in code.
```

## 4. apps/web structure (bilingual from day one)

```
apps/web/src/
├── app/[locale]/(phases)/
│   ├── mapping/        # Phase 1: manual entry, uploads, ledger overview
│   ├── verification/   # Phase 2: review queue, suspense resolution, confidence report
│   ├── strategy/       # Phase 3: recommendations, explanations, decisions
│   └── monitoring/     # Phase 4: drift, snapshots, history
├── app/api/trpc/[trpc]/route.ts
├── components/         # RTL-safe primitives (logical properties only)
└── middleware.ts       # locale negotiation (he default) + auth session check
```

Rules: no hardcoded strings (lint rule `no-literal-strings` on JSX); no `left/right` CSS — logical
properties only; every number/date rendered through `i18n` formatters.

## 5. Testing layout

| Layer | Tool | What |
|---|---|---|
| domain | Vitest | factories, state machine, VO validation — exhaustive; property-based tests for Money |
| ingestion | Vitest + fixture corpus | each adapter: fixture file → expected RawDataPayload golden files |
| engines | Vitest | golden-master tests: snapshot in → recommendations out, per engine version |
| db | Vitest + testcontainers-postgres (or Railway shadow DB) | repository integration, migration smoke |
| api | Vitest | workflowGuard blocking matrix (every procedure × every state) |
| web | Playwright (later milestone) | phase-gated navigation, RTL rendering smoke |

<!-- END OF DOCUMENT 04 -->
