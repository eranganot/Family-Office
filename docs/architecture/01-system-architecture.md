# 01 — System Architecture

## 1. Overview

WealthOS is a self-hosted household wealth **strategy** operating system. It is a decision-support
system, not a trading/execution platform. The architecture is organized around one canonical
household domain model (single source of truth), a strict four-phase state machine, decoupled
ingestion adapters, versioned regulatory/assumption registries, and explainable strategy engines.

Guiding constraint: **every module reads from the canonical model; duplicate financial data is
prohibited; the Strategy Module is physically blocked unless `workflow_state = STRATEGY`.**

## 2. Container diagram (deployment: Railway)

```mermaid
flowchart TB
    U((Household browser<br/>he-RTL / en)) -->|HTTPS + session cookie| WEB

    subgraph RAILWAY[Railway project]
        WEB["apps/web — Next.js<br/>UI (App Router, i18n he/en)<br/>tRPC API host<br/>Auth.js single shared login"]
        DB[("PostgreSQL<br/>(Railway managed)<br/>Prisma ORM")]
        VOL[("Railway volume<br/>original uploaded documents<br/>(immutable, sha256-addressed)")]
        WORKER["apps/worker (deferred milestone)<br/>long-running parsing, scheduled snapshots,<br/>drift detection"]
    end

    WEB --> DB
    WEB --> VOL
    WORKER -.-> DB
    WORKER -.-> VOL
```

Notes:
- v1 ships as **one deployable** (Next.js) + Postgres + volume. The worker is introduced only when
  parsing/monitoring jobs outgrow request lifecycles (roadmap M9); until then jobs run in-process.
- Original documents are stored immutably on a volume, addressed by sha256; the DB stores metadata
  and provenance only. Every imported value stays traceable to its source file forever.
- No third-party data egress. No bank connectivity in v1 (out of scope by design).

## 3. Logical architecture — clean layering

```mermaid
flowchart TB
    subgraph UI["Presentation — apps/web"]
        PAGES["Pages per phase:<br/>Mapping · Verification · Strategy · Monitoring"]
    end

    subgraph API["packages/api — tRPC routers"]
        GUARD["workflowGuard middleware<br/>(blocks strategy procedures unless state = STRATEGY)"]
    end

    subgraph ENGINES["Application services / engines"]
        ING["packages/ingestion<br/>adapters → RawDataPayload"]
        VER["packages/engine-verification<br/>completeness · staleness · confidence"]
        GOAL["packages/engine-goals"]
        STRAT["packages/engine-strategy<br/>recommendations + explainability + priority"]
        SCEN["packages/engine-scenario"]
        REG["packages/registry<br/>TaxRegistry · AssumptionRegistry (versioned)"]
    end

    subgraph DOMAIN["packages/domain — pure TypeScript, zero infrastructure deps"]
        MODEL["Entities · Value Objects · Domain factories<br/>(RawDataPayload → CanonicalLedgerItem)<br/>Suspense routing rules · State machine"]
    end

    subgraph INFRA["packages/db — Prisma repositories"]
        PG[(PostgreSQL)]
    end

    PAGES --> API
    API --> ENGINES
    ENGINES --> DOMAIN
    ENGINES --> INFRA
    API --> DOMAIN
    INFRA --> PG
```

Dependency rule (enforced by lint boundaries, see doc 04): arrows only point downward.
`packages/domain` imports nothing but `zod`. Ingestion adapters never import Prisma; they emit
`RawDataPayload` and hand off to the domain factory.

## 4. Phase state machine (product behavior)

```mermaid
stateDiagram-v2
    [*] --> MAPPING
    MAPPING --> VERIFICATION: user declares mapping complete
    VERIFICATION --> MAPPING: material gaps / new documents arrive
    VERIFICATION --> STRATEGY: verification complete AND suspense account empty
    STRATEGY --> MONITORING: strategy reviewed and accepted
    MONITORING --> VERIFICATION: drift or staleness threshold breached
    MONITORING --> STRATEGY: scheduled or manual re-evaluation
```

Enforcement is **schema-driven**: `Household.workflowState` is a DB enum; every transition is
persisted to `WorkflowTransition` (audit); tRPC `workflowGuard` middleware rejects any strategy or
scenario procedure when state ≠ `STRATEGY`. Phase gating is enforced at the API boundary, not by
UI convention.

## 5. Ingestion pipeline (Adapter Pattern + Suspense Routing)

```mermaid
sequenceDiagram
    participant U as User
    participant D as Document store (volume)
    participant A as Adapter (PDF/CSV/Manual)
    participant F as Domain factory
    participant L as Canonical Ledger
    participant S as Suspense Account

    U->>D: upload file (sha256, immutable)
    U->>A: trigger parse (adapter chosen by docType + institution)
    A->>A: extract text matrix (RTL-aware, Hebrew normalization)
    A->>F: RawDataPayload (strict zod schema, versioned)
    alt field maps to known canonical shape
        F->>L: CanonicalLedgerItem + Valuation + ImportedField provenance
    else unknown / ambiguous / unmappable
        F->>S: SuspenseItem (raw preserved verbatim, reason recorded)
    end
    F-->>U: import report — created N, suspense M, skipped K
    Note over S: Resolved by human in Phase 2.<br/>Never halts. Never guesses.
```

Provenance invariant: every imported field persists source document, original value, original
currency, import date, confidence, verification status, and last update — no exceptions.

## 6. Strategy generation flow (explainability-first)

```mermaid
flowchart LR
    SNAP["Pre-strategy snapshot<br/>(reproducibility)"] --> AN
    REGV["Registry versions pinned:<br/>tax year matrices + assumption versions"] --> AN
    AN["Household graph analysis:<br/>liquidity · concentration · currency ·<br/>tax-advantaged headroom · debt structure ·<br/>goal funding gaps"] --> RECS
    RECS["Candidate recommendations<br/>(strategy-level only, never products)"] --> SCORE
    SCORE["Priority score = f(impact, ease,<br/>tax benefit, risk reduction,<br/>goal contribution, urgency)"] --> GATE
    GATE{"Data quality gate:<br/>completeness & confidence<br/>sufficient?"} -->|yes| OUT["Recommendation with full rationale,<br/>confidence, evidence, assumptions,<br/>sensitivity, alternatives"]
    GATE -->|no| REFUSE["Refuse high-confidence output;<br/>emit data-gap report instead"]
    OUT --> JRNL["Decision Journal<br/>(accept / reject / outcomes)"]
```

Reproducibility invariant: a recommendation records the snapshot id, engine version, tax registry
version, and assumption versions it was computed from. Re-running with identical inputs yields
identical outputs. Changing an assumption automatically invalidates dependent recommendations.

## 7. Cross-cutting concerns

| Concern | Approach |
|---|---|
| i18n / RTL | `next-intl`, locale-per-route (`/he`, `/en`), `dir` derived from locale, Tailwind logical properties (`ms-`/`me-`), all strings in message catalogs from commit one |
| Money | `Decimal(18,4)` + ISO-4217 code value object; FX conversions store rate, rate date, source; never floats |
| Auth | Auth.js credentials provider, one household user, argon2 hash, secure session cookie |
| Auditability | Append-only `AuditEvent` for every mutation; append-only `Valuation` history; `WorkflowTransition` log |
| Reproducibility | Versioned engines, pinned registry versions, pre-strategy `HouseholdSnapshot` |
| Testing | Unit tests for all domain factories, engines, registries; integration tests over Prisma with a test DB; fixture corpus for adapters |
| Backups | Railway Postgres backups + periodic logical dump of DB and document volume (see risks doc) |

<!-- END OF DOCUMENT 01 -->
