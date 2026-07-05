# 05 — Development Roadmap

Process rules (binding):
- One milestone at a time. At the end of each milestone: summary, architectural decisions,
  tradeoffs, technical debt — then **wait for approval** before continuing. Never skip.
- Each bullet below is a **discrete, single-feature git branch** (`feat/mX-<slug>`) merged via its
  own commit to `main`. Branch = smallest reviewable unit.
- GitHub remote and Railway project will be provided by owner; until then all work is local-git.
  The two wiring branches in M0 are executed whenever credentials arrive (non-blocking).

## M0 — Foundation (no product features)

| Branch | Delivers |
|---|---|
| feat/m0-monorepo-scaffold | npm workspaces + Turborepo, tsconfig/eslint/prettier via packages/config |
| feat/m0-prisma-init | packages/db, schema.prisma (from doc 03), first migration, local Postgres via docker-compose for dev |
| feat/m0-domain-vos | Money, CurrencyCode, Percentage, ConfidenceScore, DateRange + property-based tests |
| feat/m0-nextjs-shell | apps/web with App Router, Tailwind (logical properties config), health route |
| feat/m0-i18n-shell | next-intl he/en, RTL layout switching, formatters, no-literal-strings lint |
| feat/m0-auth | Auth.js credentials provider, single household user, argon2, protected routes |
| feat/m0-trpc-wiring | packages/api, context, error shape, first ping procedure end-to-end typed |
| feat/m0-ci | GitHub Actions: typecheck, lint, test, prisma validate (activated when repo provided) |
| feat/m0-railway-deploy | Railway service + Postgres + volume, env schema, deploy check (when project provided) |

Exit: empty but deployable bilingual authenticated shell; CI green.

## M1 — Household Core + Canonical Ledger (Phase 1: manual mapping)

| Branch | Delivers |
|---|---|
| feat/m1-lint-boundaries | eslint-plugin-boundaries per doc 04 dependency matrix (moved from M0 — recorded debt) |
| feat/m1-household-entity | Household + FamilyMember CRUD, base currency, timezone |
| feat/m1-state-machine | WorkflowStateMachine in domain + WorkflowTransition persistence + tests for every legal/illegal transition |
| feat/m1-workflow-guard | tRPC workflowGuard middleware + blocking-matrix test (procedures × states) |
| feat/m1-ledger-base | LedgerItem + OwnershipShare + Valuation (append-only) + repositories |
| feat/m1-account-detail | AccountDetail + Institution, Israeli AccountType enum |
| feat/m1-realestate-mortgage | RealEstateDetail + MortgageDetail + MortgageTrack (multi-track) |
| feat/m1-cashflow-insurance-loan | remaining detail tables |
| feat/m1-manual-entry-ui | Mapping-phase UI: guided manual entry per kind, bilingual |
| feat/m1-networth-view | NetWorthCalculator (multi-currency, FxRate table, manual rates) + mapping dashboard |
| feat/m1-audit-events | AuditEvent written on every mutation |

Exit: full household can be mapped manually in he/en; net worth consolidates to ILS.

## M2 — Ingestion Framework (fixture-first)

| Branch | Delivers |
|---|---|
| feat/m2-document-store | upload, sha256 dedup, volume storage, Document metadata UI |
| feat/m2-adapter-framework | IngestionAdapter interface, RawDataPayload zod schema (versioned), adapter registry |
| feat/m2-ledger-factory | domain factory: RawDataPayload → CanonicalLedgerItem / SuspenseItem; deterministic mapping rules; exhaustive tests |
| feat/m2-suspense-account | SuspenseItem persistence + "never halt, never guess" routing + import report |
| feat/m2-provenance | ImportedField written for every ingested value |
| feat/m2-csv-adapter | generic CSV adapter + column-mapping profiles + fixtures |
| feat/m2-fixture-corpus | synthetic Israeli fixture corpus: pension annual report, keren hishtalmut statement, bank statement, Mislaka-style export (Hebrew, RTL) |
| feat/m2-il-pension-pdf-adapter | first PDF adapter against fixtures (text-matrix extraction, RTL normalization) |
| feat/m2-import-ui | upload → parse → report flow in Mapping phase |

Exit: fixture documents ingest end-to-end; unknowns land in Suspense; provenance complete.

## M3 — Verification (Phase 2)

| Branch | Delivers |
|---|---|
| feat/m3-verification-assessor | completeness/staleness/confidence computation per item and household-wide |
| feat/m3-missing-docs-report | expected-vs-present document matrix, assumptions list, unresolved questions |
| feat/m3-review-queue-ui | verify/reject/correct per item; corrections append (never overwrite provenance) |
| feat/m3-suspense-resolution-ui | human classification of suspense items into canonical kinds |
| feat/m3-phase-gate | VERIFICATION→STRATEGY transition guard: all verified + suspense empty |

Exit: Phase 2 complete; STRATEGY unlockable only through the gate.

## M4 — Registries

| Branch | Delivers |
|---|---|
| feat/m4-tax-registry | TaxRuleSet model + accessor API + versioning; seed IL 2025+2026 matrices (brackets, capital gains, hishtalmut ceilings, pension deduction ceilings, bituach leumi) **with cited sources, owner-reviewed** |
| feat/m4-assumption-registry | Assumption model + defaults (conservative) + household overrides + version pinning |
| feat/m4-invalidation | assumption/registry change → dependent recommendations flagged INVALIDATED |
| feat/m4-registry-ui | view/edit assumptions, view tax matrices with sources |

Exit: no rate or ceiling exists anywhere in code.

## M5 — Goal Engine

| Branch | Delivers |
|---|---|
| feat/m5-goal-model | Goal CRUD, types, priorities, dependencies (acyclic validation) |
| feat/m5-funding-gap | funding-gap analysis per goal from verified ledger + assumptions |
| feat/m5-goal-ui | bilingual goal management + gap dashboard |

## M6 — Strategy Engine v1 (Phase 3)

| Branch | Delivers |
|---|---|
| feat/m6-snapshot | HouseholdSnapshot (pre-strategy, schema-versioned) |
| feat/m6-analyzers | liquidity, concentration, currency exposure, geographic mix, tax-advantaged headroom, debt structure analyzers (each: pure function over snapshot + registries, unit-tested) |
| feat/m6-recommendation-model | Recommendation + pins (assumptions, goals, evidence) + structured rationale |
| feat/m6-generators | rule-based generators per recommendation type (strategy-level only; validator rejects product/security references) |
| feat/m6-priority-scoring | composite PriorityScore, weights from AssumptionRegistry |
| feat/m6-quality-gate | refuse high confidence when completeness/confidence below thresholds; emit data-gap report |
| feat/m6-strategy-ui | recommendation cards with full explainability block, accept/reject |

Exit: reproducible, explainable, gated household-level recommendations.

## M7 — Decision Journal

| Branch | Delivers |
|---|---|
| feat/m7-journal | DecisionJournalEntry on every accept/reject; expected outcome capture |
| feat/m7-outcome-tracking | later actual-outcome entry + journal history UI |

## M8 — Scenario Engine v1

| Branch | Delivers |
|---|---|
| feat/m8-projector | deterministic multi-year projection (cash flow, balances, goals) under assumption overrides |
| feat/m8-scenarios | canned scenarios (retire earlier/later, job loss, market crash, high inflation, refinance, savings-rate changes) + custom overrides |
| feat/m8-comparison-ui | baseline vs scenario outcome comparison |

Deferred (explicitly): Monte Carlo — additive later, same projector interface.

## M9 — Monitoring (Phase 4)

| Branch | Delivers |
|---|---|
| feat/m9-worker | apps/worker on Railway (cron): scheduled snapshots |
| feat/m9-drift | DriftDetector vs strategy baseline; staleness sweep → items flagged STALE |
| feat/m9-reevaluation | drift/staleness → transition to VERIFICATION or STRATEGY re-run flow |
| feat/m9-history-ui | snapshot timeline, drift alerts, journal outcomes |

Exit: full four-phase loop closed.

## Post-v1 backlog (architecture already accommodates)

Real-document adapters per institution · Monte Carlo · AI copilot (read-only over canonical model)
· additional countries (registry keyed by country) · per-person auth · connectors (new
ValuationSource) · estate module deep-dive.

<!-- END OF DOCUMENT 05 -->
