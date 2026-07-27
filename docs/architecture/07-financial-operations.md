# 07 — Financial Operations & Cash Flow (design package, awaiting approval)

**Status:** PROPOSED — no production code written. Supersedes nothing; extends documents 01–06.
**Owner decisions locked 2026-07-27** (see §1). **Target milestones: M36–M42.**

> Purpose: convert monthly income into long-term wealth according to the approved household
> strategy. **This is not a budgeting module.** It never enforces spending; it optimises the
> allocation of household capital. The advice/execution firewall of §0 PRODUCT-STRATEGY holds
> unchanged: strategy-level channels and wrappers only, never products or securities, never
> execution.

---

## 1. Owner decisions (authoritative for this package)

| # | Decision | Consequence |
|---|---|---|
| D1 | **Extend existing engines; do not build a parallel allocation/action system** | FinOps produces a *verified monthly surplus* that is fed INTO the existing `engine-strategy/deployment.ts`. Operational actions are `Recommendation` rows with `origin=OPERATIONAL`. `ActionItemTelemetry` = append-only `ActionEvent` table + computed metrics over `DecisionJournalEntry`. |
| D2 | **FinOps is cross-phase, not a 6th workflow state** | New `minPhaseGuard("VERIFICATION")` alongside `workflowGuard`. `WorkflowState` enum is UNCHANGED. Monthly and strategic cadences run independently. |
| D3 | **No LLM anywhere in the pipeline** | Categorisation is deterministic: versioned merchant/alias rules in the Registry + Hebrew-aware normalisation, each emitting a confidence score. `<0.85` → Suspense. Reproducibility pins stay meaningful. Redaction layer is built regardless, as a persistence-boundary guard. |
| D4 | **Staged milestones M36…M42**, each deployable and STATUS-committed | No big-bang drop. |
| D5 | **Transactions are evidence; `CashFlowDetail` streams stay canonical** | `Transaction` is never read by NetWorthCalculator or the strategy analyzers. FinOps aggregates transactions → a *proposed* stream create/update that the owner confirms. Double-counting is impossible by construction. |
| D6 | **Ingestion targets: Israeli bank statements + credit-card statements** | Institution-specific adapters. **BLOCKED on owner-supplied format samples** (§10). A generic column-mapping adapter is built first as the substrate all institution profiles sit on, so nothing is blocked waiting for samples. |
| D7 | **Surplus is net-of-payroll; pension + hishtalmut contributions are SAVINGS, not expenses** | Baseline starts at NET salary. Contributions surface as *capital already deployed*, feeding the ceiling-utilisation analyzers. Does not depend on the unsigned IL tax matrices. |

---

## 2. How this integrates with the existing domain model

### 2.1 New bounded context: **Operations**

Added to the table in `02-domain-model.md §1`:

| Context | Responsibility | Key aggregates |
|---|---|---|
| **Operations** | Transaction observation, dual-axis classification, monthly normalisation, verified surplus, financial calendar, recurring decisions, operational action lifecycle | `OperatingPeriod`, `Transaction`, `CashFlowCategory`, `CalendarEvent`, `RecurringDecision` |

Relationship to existing contexts — **strictly one-directional where it matters**:

```
Ingestion ──(RawDataPayload)──► Operations ──(MonthlyCashFlow)──► Strategy
    │                               │                                │
    │                               ├──(proposed stream)──► Ledger ──┘   (owner-confirmed only)
    │                               │
    └──(SuspenseItem)───────────────┘
                                    ▲
Registry ──(assumptions, merchant rules, calendar rules)──┘
```

- **Operations reads** Ledger (`CashFlowDetail`, `MortgageDetail`, `AccountDetail`), Registry, Goals.
- **Operations writes** only its own aggregates + `Recommendation(origin=OPERATIONAL)` + `SuspenseItem`.
- **Operations never writes** `LedgerItem`/`Valuation` directly. It emits a *proposal* the owner accepts in the Mapping UI, which then goes through the existing `LedgerFactory` path with full provenance.
- **Strategy is unchanged in shape.** `deployment.ts` currently derives deployable capital from ledger cash-flow streams; it gains one new optional input — `verifiedMonthlySurplus` from the latest closed `OperatingPeriod` — with the existing "never guess" rule: if no closed period exists, it falls back to today's behaviour and reports the gap. **No existing analyzer output changes for a household with no FinOps data.** That is the backward-compatibility guarantee.

### 2.2 Two cadences, one graph

```
STRATEGIC (quarterly/annual)          OPERATIONAL (monthly)
─────────────────────────             ─────────────────────
snapshot → analyzers → findings       transactions → dual-axis → normalise
  → Recommendation(STRATEGIC)           → OperatingPeriod.verifiedSurplus
  → StrategyPlan narrative               → deployment engine (existing)
  → AllocationPlan (existing cart)       → Recommendation(OPERATIONAL, cadence, dueDate)
                                         → ActionEvent telemetry
        ▲                                          │
        └──────── monthly review feedback ─────────┘
        (closed period → OPERATIONS_REVIEW snapshot → drift/alert if
         surplus deviates from the approved AllocationPlan assumptions)
```

The feedback loop is deliberately **evidence, not control**: a closed month never mutates the
approved strategy. It raises a `MonitoringAlert` (existing model, new `kind` values) recommending
`RERUN_STRATEGY` or `REVIEW`. The owner decides.

### 2.3 Aggregates & invariants (extends `02-domain-model.md §2`)

| Entity | Context | Identity | Lifecycle | Core invariants |
|---|---|---|---|---|
| `CashFlowCategory` | Operations | uuid | Configurable tree; soft-archive only | Acyclic; `parentId` same household; every leaf carries a `defaultBehavioralClass`; system-seeded rows are `isSystem` and cannot be deleted, only archived or re-parented |
| `Transaction` | Operations | uuid | Append-only; corrections supersede | Never counted by NetWorth/Strategy; must reference an `ImportBatch` OR be `source=MANUAL`; `descriptionRaw` is **never persisted** — only `descriptionRedacted` |
| `TransactionClassification` | Operations | txnId | Re-classifiable; history kept | Exactly one ACTIVE classification per transaction; confidence < `operations_classification_min_confidence` ⇒ `status=SUSPENSE` and category = system "Other / Unclassified" |
| `MerchantRule` | Registry | (pattern, version) | Versioned, immutable | New pattern/mapping = new version; a version bump re-opens affected classifications for review but never silently rewrites a confirmed one |
| `OperatingPeriod` | Operations | (household, year, month) | OPEN → CLOSED (reopenable → new version) | A CLOSED period's computed figures are frozen in `computed` JSON with engine version + assumption pins; `unverifiedCount>0` ⇒ `surplusIsProvisional=true` |
| `CalendarEvent` | Operations | uuid | SCHEDULED → DUE → DONE/SKIPPED/EXPIRED | Generated events carry `ruleId`; a rule change regenerates only FUTURE unactioned events |
| `RecurringDecision` | Operations | uuid | Active/paused | Emits `CalendarEvent`s on its cadence; never emits into the past |
| `ActionEvent` | Operations | uuid | **Append-only** | Records every status transition of an operational Recommendation with actor + timestamp + optional dismissal reason |

### 2.4 New value objects (extends `02-domain-model.md §3`)

| Value Object | Shape | Rules |
|---|---|---|
| `BehavioralClass` | `FIXED_CONTRACTUAL \| VARIABLE_DISCRETIONARY \| FINANCIAL_DRAG \| SAVINGS_FLOW \| TRANSFER` | `SAVINGS_FLOW` = pension/hishtalmut/gemel contributions and standing-order savings (D7 — not an expense). `TRANSFER` = between own accounts; **excluded from both income and expense** to prevent double-count. |
| `StatementRange` | `{ start, end, activeDays, sourceKind: SINGLE_MONTH \| MULTI_MONTH \| CUSTOM }` | Normalisation divisor is `activeDays`, never a hardcoded 30 |
| `MonthlyBaseline` | `{ amountBase: Money, method: OBSERVED \| NORMALISED \| DECLARED, sampleMonths: int, confidence }` | `DECLARED` = from a `CashFlowDetail` stream; `OBSERVED`/`NORMALISED` from transactions |
| `DiscretionaryLiquidityFloor` | `{ safeToSpendBase, netIncome, fixed, committedInWindow, bufferContribution, windowDays }` | Safe-to-Spend = net income − fixed/contractual − calendar commitments falling in the window − required buffer top-up. Refuses (returns `null` + reason) when expenses are unmapped — same "never guess" rule as `deployment.ts` |
| `OpportunityImpact` | `{ monthlyBase, annualBase, eoyBase, taxBase?, method, confidence }` | Every figure traceable to a pinned assumption or an observed transaction set |

---

## 3. Module decomposition delta (extends `04-module-decomposition.md`)

```
packages/
├── engine-operations/          # NEW — dual-axis, normalisation, surplus, calendar,
│   ├── src/classify.ts         #        opportunities, health score. Versioned engine.
│   ├── src/normalize.ts
│   ├── src/surplus.ts
│   ├── src/calendar.ts
│   ├── src/recurring.ts
│   ├── src/opportunities/      #   leakage.ts, subscriptions.ts, fx-markup.ts,
│   │                           #   employer-benefits.ts, deadlines.ts, cashflow.ts
│   ├── src/projection.ts       #   current-trajectory vs optimised EOY
│   ├── src/health-score.ts
│   └── src/telemetry.ts        #   computed metrics over ActionEvent + DecisionJournalEntry
├── ingestion/                  # EXTENDED, not replaced
│   ├── src/redact.ts           #   NEW — PII boundary guard (§7)
│   ├── src/statement-range.ts  #   NEW — date-range detection & normalisation
│   └── src/adapters/
│       ├── generic-tabular.ts  #   NEW — CSV/XLSX + saved column-mapping profile
│       ├── il-bank-*.ts        #   NEW — per institution (BLOCKED on samples)
│       └── il-card-*.ts        #   NEW — per issuer (BLOCKED on samples)
├── registry/
│   └── src/seed-data/
│       ├── merchant-rules.ts   #   NEW — versioned, Hebrew-aware, synthetic-safe
│       └── il-calendar.ts      #   NEW — Israeli statutory calendar rules
└── engine-strategy/            # ONE new optional input; no behavioural change without it
```

Dependency matrix additions (enforced by `eslint-plugin-boundaries`, CI-failing):

| Package | May import | Must never import |
|---|---|---|
| `engine-operations` | `domain`, `db`, `registry`, `engine-goals` (read-model types) | `api`, `next`, `ingestion`, `engine-strategy` |
| `engine-strategy` | …existing… **+ `engine-operations` read-model types only** | unchanged |

The `engine-strategy → engine-operations` edge is a documented exception in the same spirit as the
existing `engine-strategy → engine-goals` exception, and is types-only (`MonthlyCashFlow`,
`VerifiedSurplus`).

---

## 4. Prisma schema changes

**All additive. No column drops, no enum-value removals, no type changes on existing columns.**
Every existing query keeps working; every existing row stays valid.

### 4.1 Modified existing models (additive columns only)

```prisma
enum RecommendationOrigin {
  STRATEGIC     // default — every pre-M36 row
  OPERATIONAL
}

enum ActionCadence {
  ONE_TIME
  WEEKLY
  MONTHLY
  QUARTERLY
  SEMI_ANNUAL
  ANNUAL
  EVENT_DRIVEN
}

enum ActionDifficulty { TRIVIAL  EASY  MODERATE  HARD }

model Recommendation {
  // ... all existing fields unchanged ...
  origin            RecommendationOrigin @default(STRATEGIC)
  cadence           ActionCadence        @default(ONE_TIME)
  dueDate           DateTime?            @db.Date
  expiresAt         DateTime?            @db.Date   // opportunity expiry
  difficulty        ActionDifficulty?
  reversibility     String?              // REVERSIBLE | PARTIALLY_REVERSIBLE | IRREVERSIBLE
  impactMonthlyBase Decimal?             @db.Decimal(18, 4)
  impactAnnualBase  Decimal?             @db.Decimal(18, 4)
  impactEoyBase     Decimal?             @db.Decimal(18, 4)
  operatingPeriodId String?              // the month that produced it
  calendarEventId   String?
  dependsOn         RecommendationDependency[] @relation("dependent")
  dependents        RecommendationDependency[] @relation("prerequisite")
  actionEvents      ActionEvent[]

  @@index([householdId, origin, status])
}

model RecommendationDependency {
  dependentId    String
  prerequisiteId String
  dependent      Recommendation @relation("dependent",   fields: [dependentId],    references: [id])
  prerequisite   Recommendation @relation("prerequisite", fields: [prerequisiteId], references: [id])
  @@id([dependentId, prerequisiteId])
}
```

**Status mapping — the spec's four statuses map onto the existing enum; no new status values.**
This is deliberate: it keeps one action inbox and one decision journal.

| Spec status | `RecommendationStatus` | UI label (he / en) |
|---|---|---|
| `PENDING` | `PROPOSED` | ממתין / Pending |
| `IN_PROGRESS` | `ACCEPTED` | בביצוע / In progress |
| `COMPLETED` | `IMPLEMENTED` | הושלם / Completed |
| `DISMISSED` | `REJECTED` | נדחה / Dismissed |

`SUPERSEDED` and `INVALIDATED` keep their existing meanings (a new assumption version still
invalidates a pinned operational recommendation — unchanged rule).

`SuspenseItem.reason` gains the values `UNRECOGNISED_MERCHANT` and `LOW_CONFIDENCE_CATEGORY`
(free-text column today — no migration needed, documented here).

`MonitoringAlert.kind` gains `SURPLUS_DRIFT`, `LEAKAGE_SPIKE`, `CALENDAR_DEADLINE_MISSED`
(free-text column today — no migration needed).

`SnapshotKind` gains `OPERATIONS_REVIEW`.

### 4.2 New models

```prisma
enum BehavioralClass {
  FIXED_CONTRACTUAL         // mortgage, arnona, tuition, insurance premiums
  VARIABLE_DISCRETIONARY    // dining, entertainment, shopping, travel
  FINANCIAL_DRAG            // amlot, FX markup, overdraft interest, dead subscriptions
  SAVINGS_FLOW              // pension / hishtalmut / gemel / standing-order savings (D7)
  TRANSFER                  // between own accounts — excluded from income AND expense
}

enum CategoryAxis { INCOME  EXPENSE }

/// Configurable functional hierarchy. Seeded with the IL-aware default tree
/// (Housing → Mortgage/Arnona/Electricity/Water/Internet/Home insurance/Maintenance;
/// Food → Groceries/Restaurants/Coffee/Delivery; …). System rows are archivable, not deletable.
model CashFlowCategory {
  id                     String            @id @default(uuid())
  householdId            String
  household              Household         @relation(fields: [householdId], references: [id])
  parentId               String?
  parent                 CashFlowCategory? @relation("tree", fields: [parentId], references: [id])
  children               CashFlowCategory[] @relation("tree")
  axis                   CategoryAxis
  key                    String            // stable slug, e.g. "housing.arnona"
  nameEn                 String
  nameHe                 String
  defaultBehavioralClass BehavioralClass
  /// Optional bridge to the canonical stream model — lets a category roll up into
  /// the CashFlowType the strategy engine already understands.
  mapsToFlowType         CashFlowType?
  isSystem               Boolean           @default(false)
  isArchived             Boolean           @default(false)
  sortOrder              Int               @default(0)

  transactions           Transaction[]
  classifications        TransactionClassification[]

  @@unique([householdId, key])
  @@index([householdId, axis, parentId])
}

enum TransactionSource { IMPORT  MANUAL  DERIVED }

/// Observation layer. NEVER read by NetWorthCalculator or the strategy analyzers (D5).
/// `descriptionRaw` is deliberately absent — only the redacted form is persisted (§7).
model Transaction {
  id                  String            @id @default(uuid())
  householdId         String
  household           Household         @relation(fields: [householdId], references: [id])
  importBatchId       String?
  importBatch         ImportBatch?      @relation(fields: [importBatchId], references: [id])
  source              TransactionSource
  bookedAt            DateTime          @db.Date
  valueDate           DateTime?         @db.Date
  amount              Decimal           @db.Decimal(18, 4)   // signed: negative = outflow
  currency            String            @db.Char(3)
  amountBase          Decimal?          @db.Decimal(18, 4)   // converted via FxRate; null if no rate
  fxRateId            String?
  descriptionRedacted String                                  // post-redaction only
  merchantKey         String?                                 // normalised, Hebrew-aware
  counterpartyMasked  String?                                 // last-4 style, never full
  /// Links the observation back to the canonical stream it is evidence FOR (optional).
  ledgerItemId        String?
  ledgerItem          LedgerItem?       @relation(fields: [ledgerItemId], references: [id])
  categoryId          String?
  category            CashFlowCategory? @relation(fields: [categoryId], references: [id])
  behavioralClass     BehavioralClass?                        // owner override of category default
  isRecurringCandidate Boolean          @default(false)
  isDuplicateOf       String?
  externalRef         String?                                 // for idempotent re-import
  createdAt           DateTime          @default(now())

  classifications     TransactionClassification[]

  @@unique([householdId, externalRef])
  @@index([householdId, bookedAt])
  @@index([householdId, categoryId, bookedAt])
  @@index([householdId, merchantKey])
}

enum ClassificationStatus { AUTO  SUSPENSE  CONFIRMED  SUPERSEDED }

/// Full classification history — how a transaction got its dual-axis tags, with the
/// rule version that decided it. One ACTIVE (non-SUPERSEDED) row per transaction.
model TransactionClassification {
  id              String               @id @default(uuid())
  transactionId   String
  transaction     Transaction          @relation(fields: [transactionId], references: [id])
  categoryId      String
  category        CashFlowCategory     @relation(fields: [categoryId], references: [id])
  behavioralClass BehavioralClass
  confidence      Decimal              @db.Decimal(4, 3)   // 0.000–1.000
  method          String               // RULE | ALIAS | OWNER | CARRIED_FORWARD
  ruleVersion     String?
  status          ClassificationStatus @default(AUTO)
  decidedBy       String?
  createdAt       DateTime             @default(now())

  @@index([transactionId, status])
}

enum OperatingPeriodStatus { OPEN  CLOSED }

/// A household-month. `computed` freezes the full normalised cash-flow result at close,
/// with engineVersion + assumption pins — the same reproducibility contract as StrategyPlan.
model OperatingPeriod {
  id                   String                @id @default(uuid())
  householdId          String
  household            Household             @relation(fields: [householdId], references: [id])
  year                 Int
  month                Int                   // 1–12
  status               OperatingPeriodStatus @default(OPEN)
  engineVersion        String?
  /// { income{gross?,net,byCategory[]}, expenses{byCategory[],byBehavioral{...}},
  ///   savingsFlows[], transfers[], surplusBase, safeToSpend{...},
  ///   workingCapitalBase, leakageBase, healthScore{...} }
  computed             Json?
  pins                 Json?                 // [{ key, version }]
  surplusBase          Decimal?              @db.Decimal(18, 4)
  surplusIsProvisional Boolean               @default(true)   // "contains unverified transactions"
  unverifiedCount      Int                   @default(0)
  unverifiedAmountBase Decimal?              @db.Decimal(18, 4)
  reviewNote           String?
  closedAt             DateTime?
  createdAt            DateTime              @default(now())

  @@unique([householdId, year, month])
  @@index([householdId, year, month])
}

enum CalendarEventKind {
  TAX_DEADLINE  BITUACH_LEUMI  PENSION_WINDOW  HISHTALMUT_CEILING  GEMEL_CONTRIBUTION
  MORTGAGE_RESET  INSURANCE_RENEWAL  ARNONA  VEHICLE_LICENSE  VEHICLE_INSURANCE
  SCHOOL_PAYMENT  CHILDCARE_PAYMENT  SALARY_BONUS  HOLIDAY_SPENDING  ANNUAL_SUBSCRIPTION
  REVIEW  OTHER
}

enum CalendarEventStatus { SCHEDULED  DUE  DONE  SKIPPED  EXPIRED }

model CalendarEvent {
  id             String              @id @default(uuid())
  householdId    String
  household      Household           @relation(fields: [householdId], references: [id])
  kind           CalendarEventKind
  titleEn        String
  titleHe        String
  dueDate        DateTime            @db.Date
  windowDays     Int                 @default(0)   // lead time for "upcoming"
  amountBase     Decimal?            @db.Decimal(18, 4)   // expected cash impact
  isCashImpacting Boolean            @default(false)      // feeds liquidity forecast
  status         CalendarEventStatus @default(SCHEDULED)
  ruleId         String?             // generated-by rule (registry or RecurringDecision)
  recurringDecisionId String?
  recurringDecision   RecurringDecision? @relation(fields: [recurringDecisionId], references: [id])
  ledgerItemId   String?
  sourceNote     String?             // provenance: statutory | household | derived
  completedAt    DateTime?
  createdAt      DateTime            @default(now())

  @@index([householdId, dueDate, status])
}

/// Recurring operational decision (e.g. "review insurance annually"). Emits future
/// CalendarEvents on its cadence; never emits into the past.
model RecurringDecision {
  id            String        @id @default(uuid())
  householdId   String
  household     Household     @relation(fields: [householdId], references: [id])
  key           String        // stable slug, e.g. "review.mortgage"
  titleEn       String
  titleHe       String
  cadence       ActionCadence
  anchorDate    DateTime      @db.Date
  leadDays      Int           @default(14)
  isActive      Boolean       @default(true)
  lastEmittedAt DateTime?
  createdAt     DateTime      @default(now())

  events CalendarEvent[]

  @@unique([householdId, key])
}

/// Append-only operational telemetry. The `ActionItemTelemetry` of the spec is a COMPUTED
/// projection over this table + DecisionJournalEntry (D1) — acceptance rate, completion rate,
/// average time-to-completion, dismissal reasons. No metric is stored denormalised.
model ActionEvent {
  id               String         @id @default(uuid())
  householdId      String
  household        Household      @relation(fields: [householdId], references: [id])
  recommendationId String
  recommendation   Recommendation @relation(fields: [recommendationId], references: [id])
  fromStatus       RecommendationStatus?
  toStatus         RecommendationStatus
  dismissalReason  String?        // NOT_RELEVANT | TOO_HARD | DISAGREE | ALREADY_DONE | LATER | OTHER
  actor            String
  at               DateTime       @default(now())

  @@index([householdId, at])
  @@index([recommendationId, at])
}

/// Saved column-mapping profile for the generic tabular adapter — this is what makes
/// "any bank export" work before an institution-specific adapter exists.
model ImportMappingProfile {
  id            String   @id @default(uuid())
  householdId   String
  household     Household @relation(fields: [householdId], references: [id])
  name          String
  institutionId String?
  adapterId     String
  mapping       Json     // { date, description, amount|debit/credit, currency, ref, encoding, dateFormat, headerRow }
  version       Int      @default(1)
  createdAt     DateTime @default(now())

  @@unique([householdId, name])
}
```

### 4.3 New Assumption keys (Registry — thresholds live here, never in code)

| Key | Default | Unit | Purpose |
|---|---|---|---|
| `operations_classification_min_confidence` | 0.85 | RATIO | Below this → Suspense (spec-mandated) |
| `operations_normalisation_min_days` | 20 | DAYS | Below this active-days count, refuse to normalise |
| `operations_baseline_months` | 3 | MONTHS | Trailing window for a monthly baseline |
| `working_capital_months` | 1.5 | MONTHS | Working-capital buffer target (distinct from `emergency_fund_months` = 6) |
| `leakage_subscription_dormant_days` | 90 | DAYS | Unused recurring charge → leakage candidate |
| `leakage_fx_markup_notice_pct` | 1.5 | PCT | FX conversion spread above which markup is flagged |
| `leakage_bank_fee_monthly_notice_base` | 40 | ILS | Monthly amlot above which fee-drag is flagged |
| `safe_to_spend_window_days` | 30 | DAYS | Discretionary Liquidity Floor horizon |
| `calendar_upcoming_window_days` | 60 | DAYS | Dashboard "upcoming deadlines" horizon |
| `health_score_weights` | `{cashflow, liquidity, leakage, execution, goals}` | JSON | Household Financial Health Score composition |
| `operations_surplus_drift_pct` | 20 | PCT | Deviation of realised vs planned surplus that raises a MonitoringAlert |

Each is a normal versioned `Assumption`; a new version **invalidates pinned operational
recommendations** exactly as it does strategic ones — the existing rule, unchanged.

---

## 5. The dual-axis engine & surplus calculation

### 5.1 Classification pipeline (deterministic — D3)

```
RawDataPayload (adapter)
  → redact()                       § 7 — before ANY persistence or parsing
  → StatementRange detection       single-month | multi-month | custom → activeDays
  → dedupe (externalRef, or hash of bookedAt+amount+merchantKey)
  → FX conversion (existing FxRate; null amountBase if no rate — never guessed)
  → merchantKey normalisation      Hebrew-aware: strip niqqud, normalise finals (ך→כ …),
                                   collapse whitespace, strip branch/terminal numbers
  → MerchantRule match (Registry, versioned)  → { categoryId, behavioralClass, confidence }
  → confidence ≥ 0.85 ? AUTO : SUSPENSE  (+ category = system "other.unclassified")
```

**Non-blocking rule (spec-mandated), implemented literally:** suspense items are *included* in the
cash-flow computation inside the `Other / Unclassified` bucket. `OperatingPeriod.surplusBase` is
always computed. `surplusIsProvisional` + `unverifiedCount` + `unverifiedAmountBase` drive the UI's
*"Contains unverified transactions"* banner. Closing a period with `unverifiedCount > 0` is allowed
and records the fact in the frozen `computed` JSON.

### 5.2 Surplus formula (D7 — net-of-payroll)

```
netIncome        = Σ INCOME transactions/streams, net of payroll  (TRANSFER excluded)
fixed            = Σ EXPENSE where behavioralClass = FIXED_CONTRACTUAL
variable         = Σ EXPENSE where behavioralClass = VARIABLE_DISCRETIONARY
leakage          = Σ EXPENSE where behavioralClass = FINANCIAL_DRAG
savingsFlows     = Σ where behavioralClass = SAVINGS_FLOW      ← NOT an expense
debtService      = Σ MortgageDetail tracks + LoanDetail scheduled payments (from Ledger)
committed        = Σ CalendarEvent(isCashImpacting, dueDate ∈ window)

verifiedSurplus  = netIncome − fixed − variable − leakage − debtService
                   (savingsFlows are reported separately as capital already deployed)

safeToSpend      = netIncome − fixed − debtService − committed − requiredBufferTopUp
workingCapital   = liquid balances − committed(next 30d)
```

Refusal conditions (the "engines never guess" rule): no income mapped, or expense coverage below
`operations_normalisation_min_days`, or a currency with no `FxRate` ⇒ the engine returns
`{ surplus: null, reason }` and the UI shows what is missing. **It never substitutes a default.**

### 5.3 Hand-off to the existing deployment engine

`engine-strategy/deployment.ts` gains one optional context field:

```ts
interface AnalyzerContext {
  // ...existing...
  verifiedSurplus?: { monthlyBase: number; periodId: string; provisional: boolean } | undefined;
}
```

When present, monthly deployable capital is `verifiedSurplus.monthlyBase` (with a provisional badge
carried into the candidate rationale). When absent, **today's behaviour is unchanged**. No new
deployment kinds are added — the spec's destination list already maps onto existing
`DeploymentStepKind` values, plus goal-linked destinations that already flow through `Goal`:

| Spec destination | Existing mechanism |
|---|---|
| Emergency Fund | `BUFFER_TOP_UP` |
| Working Capital Buffer | `BUFFER_TOP_UP` (new sub-target from `working_capital_months`) |
| Pension / Kupat Gemel | `TAX_CEILING_PENSION` |
| Kupat Histalmut | `TAX_CEILING_HISHTALMUT` |
| Mortgage Prepayment | `REPAY_DEBT` / `REPAY_EXPENSIVE_DEBT` (per-track, already) |
| Long-Term Investment | `INVEST_GROWTH` / `INVEST_DEFENSIVE` |
| Real estate / Education / Vacation / Opportunity / user-defined | `Goal` (existing `GoalType` + goal-linked candidate) |

Ranking, not selection: the existing engine already emits three named VARIANTS with computed
pros/cons/risks plus a free-mix candidate menu. That **is** the spec's "rank rather than select one".

---

## 6. Opportunity engine

Implemented as new analyzers in `engine-operations/src/opportunities/`, emitting the same
`Finding` shape the strategy engine already uses, then rendered into `Recommendation`
(`origin=OPERATIONAL`) through the existing `generators.ts` → `rationale.ts` → `validator.ts`
pipeline. **The product-reference validator applies unchanged** — no product or security names.

| Category | Where it comes from |
|---|---|
| Tax optimization, Pension, Mortgage, Liquidity, Currency, Concentration, Insurance gaps | **Existing** `engine-strategy/analyzers/*` — surfaced in the operational inbox, not re-implemented |
| Expense leakage | NEW — `FINANCIAL_DRAG` aggregation + trend |
| Redundant / dormant subscriptions | NEW — recurring merchantKey with no matching benefit signal for `leakage_subscription_dormant_days` |
| FX conversion markup | NEW — compare transaction implied rate vs `FxRate` on `bookedAt` |
| Cash-flow improvements | NEW — timing/smoothing of committed outflows against the calendar |
| Employer benefit utilization | NEW — contribution vs statutory ceiling per employed member |
| Upcoming regulatory deadlines | NEW — `CalendarEvent` within `calendar_upcoming_window_days` |
| Goal acceleration | Existing `engine-goals` funding-gap + new surplus |

Each opportunity carries: `impactMonthlyBase` / `impactAnnualBase` / `impactEoyBase`, `difficulty`,
`priorityScore` (existing weighted composite), `expiresAt`, `confidenceScore`, goal links,
`reversibility`, and the full bilingual `rationale` block (why / benefits / risks / tradeoffs /
tax / liquidity / alternatives / sensitivity) — **the existing `Recommendation.rationale` shape
already covers every explainability field the spec lists.**

---

## 7. Ingestion, PII redaction & security

### 7.1 Redaction boundary (`packages/ingestion/src/redact.ts`)

Applied to every field **before persistence and before any parser sees it** — a pure function with
its own exhaustive test suite, invoked inside the adapter → factory seam so it cannot be bypassed.

| Class | Detection | Result |
|---|---|---|
| Teudat Zehut | 9-digit with Israeli check-digit validation (avoids nuking legitimate 9-digit amounts) | dropped |
| Bank account / branch | IL IBAN + `bank-branch-account` patterns | `counterpartyMasked` = last 4 only |
| Card PAN | 13–19 digits passing Luhn | last 4 only |
| Personal names | Known-member name list + account-holder header fields | dropped |
| Free-text remainder | — | stored as `descriptionRedacted` |

`descriptionRaw` **has no column.** The original document bytes remain in `Document` (existing,
already access-controlled) as the audit trail; the transaction table never holds raw PII.
`redact()` is idempotent and version-stamped, so a redaction-rule change is auditable.

### 7.2 Adapters

1. **`generic-tabular`** (M38, first) — CSV/XLSX, encoding sniffing (Windows-1255 and UTF-8 both
   appear in Israeli exports), header-row detection, RTL-aware Hebrew column matching,
   debit/credit-column or signed-amount handling, saved as an `ImportMappingProfile`. **Works with
   every bank and card issuer on day one, without me having a sample.**
2. **Institution adapters** (M38b) — `il-bank-<name>`, `il-card-<issuer>`. Each is a *profile plus
   quirks* on top of the generic adapter, not a separate stack. **Blocked on samples (§10).**
3. **Manual entry** — existing form pattern, extended for transactions.

All ingestion fixtures stay **synthetic** (public-repo rule, unchanged). Institution adapters are
built from a *structure description* of your sample; the sample itself is never committed.

---

## 8. API surface (`packages/api/src/routers/operations.ts`)

New guard in `trpc.ts` — added alongside `workflowGuard`, which is untouched:

```ts
const PHASE_ORDER: WorkflowState[] = ["MAPPING","VERIFICATION","ALLOCATION","STRATEGY","MONITORING"];
export function minPhaseGuard(min: WorkflowState) { /* rejects below `min`, reads state from DB */ }
export const operationsProcedure = minPhaseGuard("VERIFICATION");
```

| Procedure | Type | Zod input (abridged) | Returns |
|---|---|---|---|
| `operations.categories.tree` | query | `{ axis? }` | nested `CashFlowCategory[]` |
| `operations.categories.upsert` | mutation | `{ id?, parentId?, axis, key, nameEn, nameHe, defaultBehavioralClass, mapsToFlowType? }` | `{ id }` |
| `operations.categories.archive` | mutation | `{ id, reassignToId? }` | `{ ok }` |
| `operations.transactions.list` | query | `{ from, to, categoryId?, behavioralClass?, status?, cursor?, limit≤200 }` | paginated + facets |
| `operations.transactions.createManual` | mutation | `{ bookedAt, amount, currency, description, categoryId?, behavioralClass? }` | `{ id }` |
| `operations.transactions.classify` | mutation | `{ transactionIds[], categoryId, behavioralClass, applyToFutureMerchant? }` | `{ updated, ruleCreated }` |
| `operations.transactions.bulkClassify` | mutation | `{ merchantKey, categoryId, behavioralClass }` | `{ updated }` |
| `operations.suspense.queue` | query | `{ cursor? }` | unresolved classifications + suggestions |
| `operations.import.preview` | mutation | `{ documentId, adapterId, mappingProfileId? }` | dry-run: rows, detected range, dupes, confidence histogram — **nothing persisted** |
| `operations.import.commit` | mutation | `{ documentId, adapterId, mapping, saveProfileAs? }` | `{ batchId, inserted, suspense, duplicates }` |
| `operations.mapping.profiles` | query/mutation | CRUD on `ImportMappingProfile` | — |
| `operations.period.current` | query | `—` | `OperatingPeriod` + live computed |
| `operations.period.get` | query | `{ year, month }` | frozen or live computed |
| `operations.period.recompute` | mutation | `{ year, month }` | recomputed figures |
| `operations.period.close` | mutation | `{ year, month, reviewNote? }` | freezes `computed` + pins, takes `OPERATIONS_REVIEW` snapshot, raises drift alerts |
| `operations.period.reopen` | mutation | `{ year, month, reason }` | supersedes the frozen version |
| `operations.cashflow.dualAxis` | query | `{ year, month }` | functional tree totals + behavioral totals |
| `operations.surplus.get` | query | `{ year, month }` | `VerifiedSurplus \| { surplus: null, reason }` |
| `operations.surplus.safeToSpend` | query | `{ windowDays? }` | `DiscretionaryLiquidityFloor \| null + reason` |
| `operations.allocation.propose` | mutation | `{ periodId }` | delegates to **existing** deployment engine with `verifiedSurplus` |
| `operations.opportunities.list` | query | `{ status?, category?, minPriority? }` | ranked `Recommendation[]` (`origin=OPERATIONAL`) |
| `operations.opportunities.scan` | mutation | `—` | runs the operational analyzers |
| `operations.actions.list` | query | `{ status?, dueBefore?, cadence? }` | action cards + dependency graph |
| `operations.actions.setStatus` | mutation | `{ id, status: PENDING\|IN_PROGRESS\|COMPLETED\|DISMISSED, dismissalReason?, note? }` | recomputed forecast + EOY **in the same response** (spec: real-time) |
| `operations.calendar.upcoming` | query | `{ windowDays? }` | `CalendarEvent[]` + cash impact |
| `operations.calendar.upsert` / `.setStatus` | mutation | — | — |
| `operations.recurring.list` / `.upsert` / `.pause` | query/mutation | — | — |
| `operations.projection.eoy` | query | `{ mode: CURRENT\|OPTIMISED }` | trajectory series + delta |
| `operations.telemetry.summary` | query | `{ from?, to? }` | acceptance %, completion %, avg time-to-complete, dismissal histogram |
| `operations.health.score` | query | `—` | composite + component breakdown |

**Zod schemas** live in `packages/api/src/schemas/operations.ts`, mirroring the existing
`schemas/ledger.ts` conventions (`DecimalString`, `PositiveDecimalString`, `z.coerce.date()`).
Every mutation inherits the existing audit middleware — no change needed.

---

## 9. UI

### 9.1 New tab — `apps/web/src/app/[locale]/(app)/operations/`

Rendered in the existing `(app)/layout.tsx` nav (which currently lists the five phase tabs) as a
**cadence-independent** tab, visually separated from the phase strip and enabled from VERIFICATION
onward. `phase-gate.tsx` is NOT rendered here — operations is never gated forward or backward.

```
operations/
├── page.tsx                    # month selector + section nav (server component)
├── income/section.tsx
├── expenses/section.tsx        # dual-axis: functional treemap/tree + behavioral bars
├── surplus/section.tsx         # waterfall: net income → fixed → variable → leakage → surplus
├── allocation/section.tsx      # reuses <AllocationCart/> (existing) fed by verifiedSurplus
├── actions/section.tsx         # Action Center — cards with state toggles
├── opportunities/section.tsx
├── recurring/section.tsx
├── calendar/section.tsx
└── projection/section.tsx      # current vs optimised EOY
```

New components (`apps/web/src/components/operations/`):

| Component | Notes |
|---|---|
| `dual-axis-chart.tsx` | recharts (already a dependency since M35). Functional = sunburst/tree; Behavioral = stacked bar. RTL-safe. |
| `surplus-waterfall.tsx` | recharts waterfall; provisional badge when `surplusIsProvisional` |
| `safe-to-spend-gauge.tsx` | Discretionary Liquidity Floor; renders "cannot compute + reason" state |
| `action-card.tsx` | title, impact (monthly + EOY), tax/liquidity/goal chips, confidence, difficulty, due date, dependency lock, 4-state toggle, dismissal-reason picker. Optimistic update + server-recomputed forecast. |
| `opportunity-card.tsx` | + urgency/expiry countdown |
| `transaction-table.tsx` | virtualised, inline re-categorise, bulk-select by merchant |
| `suspense-banner.tsx` | *"Contains unverified transactions"* — the spec's visual flag, linked to the queue |
| `import-mapper.tsx` | column-mapping wizard + live preview + save-as-profile |
| `calendar-timeline.tsx` | next 30/60 days with cash impact |
| `eoy-projection-chart.tsx` | current trajectory vs optimised, delta callout |
| `health-score-ring.tsx` | composite + component breakdown |
| `telemetry-panel.tsx` | acceptance / completion / avg time / dismissal reasons |

### 9.2 Dashboard extensions (`(app)/page.tsx`)

Added **below** the existing M35 cards — no existing card is moved or removed:
operational health strip (income / expenses / surplus / working capital), dual-axis mini-chart,
current-vs-optimised EOY, leakage indicator, telemetry summary, upcoming deadlines (30/60d),
household financial health score. Every card degrades to an empty state with a "start here" link
when no `OperatingPeriod` exists — a household that never touches FinOps sees the dashboard
exactly as it is today.

### 9.3 i18n

All strings bilingual he/en, added to `packages/i18n/messages/{en,he}.json` under an `operations.*`
namespace. The existing **i18n key-parity check stays green** (it is part of the verification gate).
Hebrew is the default locale and RTL; logical CSS properties only — existing rules unchanged.

---

## 10. What I need from you (blockers, earliest first)

| # | Needed | Blocks | Why |
|---|---|---|---|
| **B1** | **Which bank and which card issuer** you actually use, plus one **sample export of each** (scrub the numbers — I need layout, header row, Hebrew column names, encoding, date format, debit/credit vs signed amount). Send as a file; it will **not** be committed. | M38b institution adapters | Every Israeli exporter differs. The generic mapper (M38a) works without this, so it blocks *optimisation*, not *progress*. |
| **B2** | Sign-off on the **IL 2025/2026 tax matrices** (`ownerReviewed=false` today) | Tax-impact figures in operational opportunities | Without it, tax-impact numbers must be shown as unreviewed. Everything else proceeds. |
| **B3** | Confirm **2026 ceilings**: hishtalmut annual ceiling, gemel/pension deductible ceilings, employee/employer contribution rates | M39 calendar + M40 employer-benefit opportunity | I will research and draft these; you verify before `ownerReviewed=true`. |
| **B4** | Your **statutory calendar dates** for IL 2026/2027 (Tax Authority, Bituach Leumi filing/payment dates) | M39 | Same: I draft, you verify. |
| **B5** | Confirm **transaction data may live in the Railway Postgres** | M36 | The public-repo rule bans household data in *git*; the DB is the intended home. Confirming explicitly because this is the most sensitive data the system will hold. |
| **B6** | Your **household category tree preferences** — or approval to seed the spec's default tree and let you edit it in the UI | M37 | Default: seed the spec's taxonomy, fully editable. |
| **B7** | **Where net salary comes from** — payslip, form 106, or bank credit line | M37 surplus | D7 needs one authoritative net-income source per employed member. |

---

## 11. Migration strategy

**Principle: additive-only, forward-only, reversible by neglect.** A household that never opens the
Operations tab must be byte-identically served by every existing query.

1. **Seven migrations, one per milestone**, named `2026MMDD_m36_operations_core` … `_m42_operations_dashboard`.
   No `DROP`, no `ALTER TYPE ... RENAME`, no `NOT NULL` on a new column without a default.
2. **Enum additions only.** `RecommendationStatus`, `WorkflowState`, `SnapshotKind`(+1 value),
   `CashFlowType` — no existing value removed. Postgres `ADD VALUE` is non-blocking.
3. **`Recommendation` back-fill:** `origin` defaults to `STRATEGIC`, `cadence` to `ONE_TIME`. Every
   existing row is valid the instant the migration lands; no data migration script.
4. **Seed idempotency:** category tree, merchant rules and calendar rules seed through the existing
   `preDeploy` seed path, which already never overwrites an existing version (M4 pattern). Re-running
   is safe. System categories are `isSystem=true` and matched by `(householdId, key)`.
5. **Assumption seeding:** the 11 new keys are appended to `assumption-defaults.ts`; existing
   versions are never overwritten (existing registry rule). **Note: this creates new assumption
   versions, which per the existing invalidation rule will INVALIDATE pinned recommendations from
   before the migration** — expected and correct; you rerun strategy once after M36.
6. **Rollback:** each migration is independently revertible because nothing existing is dropped.
   The practical rollback is a redeploy of the previous image; the new tables sit unused.
7. **Verification gate before every deploy** (unchanged): `tsc --noEmit` via turbo, full test suites,
   `prisma validate`, eslint boundaries, i18n key parity. Plus new per-milestone smoke tests.
8. **Windows-mount discipline (unchanged):** all work in `/tmp/wealthos`, delivered as a patch file
   to the mount; no git write-ops on the mount; no Edit-tool write over ~250 lines.

---

## 12. Milestone sequence

| M | Scope | Migration | Ships |
|---|---|---|---|
| **M36** | Operations bounded context: `CashFlowCategory`, `Transaction`, `TransactionClassification`, `OperatingPeriod`, `ActionEvent`, `ImportMappingProfile`; `Recommendation` additive columns; `minPhaseGuard`; `engine-operations` package skeleton + boundary lint; 11 assumption keys; seeded IL category tree | ✅ core | Manual transaction entry + category tree UI. Nothing else changes. |
| **M37** | Dual-axis engine: classification (deterministic rules + Hebrew normalisation), monthly normalisation, **verified surplus**, safe-to-spend, working capital, suspense queue (non-blocking), leakage aggregation | seed only | Income / Expense / Surplus sections live |
| **M38a** | `generic-tabular` adapter + `redact()` + statement-range detection + import preview/commit + mapping profiles | none | **Import any bank/card CSV or XLSX** |
| **M38b** | Institution adapters for your bank + card issuer | none | *(gated on B1)* |
| **M39** | Financial calendar + recurring decisions + statutory IL rule seed; calendar feeds liquidity forecast | ✅ calendar | Calendar + Recurring sections *(figures gated on B3/B4)* |
| **M40** | Opportunity analyzers (leakage, subscriptions, FX markup, employer benefits, deadlines, cash-flow timing) + operational Recommendation generation through the **existing** rationale/validator pipeline + dependency graph + real-time recompute on status change | ✅ deps table | Action Center + Opportunity Center |
| **M41** | Surplus → **existing** deployment engine hand-off; EOY projection (current vs optimised); monthly review + close/reopen + `OPERATIONS_REVIEW` snapshot + drift alerts back to Strategy | none | The loop closes |
| **M42** | Telemetry projection + dashboard extensions + health score + full bilingual pass + Playwright smoke | none | Dashboard v3 |

Each milestone ends with `chore: STATUS — M<N> complete` and a deployable patch, per the existing
milestone flow.

---

## 13. Explicit non-goals & backlog extension points

**Non-goals (this module will not do these, by design):** spending limits or enforcement, budget
envelopes, product or security recommendations, trade execution, autonomous ledger mutation.

**Backlog — extension points designed in, not implemented:**

| Capability | Seam already provided |
|---|---|
| Adaptive behavioural AI tuning | `ActionEvent` is the training corpus; `priority_weights` already lives in the Registry, so tuning = writing a new assumption version, not changing code |
| Liquidity waterfall engine | `DiscretionaryLiquidityFloor` + `CalendarEvent.isCashImpacting` already produce the ordered claims on cash |
| Open banking / card API sync | `TransactionSource` enum + `ImportBatch` provenance + `externalRef` idempotency key — a connector is a new adapter, not a new pipeline |
| Automatic recurring-bill detection | `Transaction.isRecurringCandidate` + `merchantKey` clustering |
| Predictive cash-flow forecasting | `OperatingPeriod` history is the time series; `projection.ts` is the insertion point |
| Spouse collaborative workflows | `ActionEvent.actor` + `DecisionJournalEntry.decidedBy` already carry identity; needs the planned DB-User swap |
| Mobile push | `CalendarEvent` + `MonitoringAlert` are the notification sources; `apps/worker` is the emitter |

---

## Appendix A — DDD diagrams

### A.1 Context map (existing contexts unchanged; Operations added)

```
┌──────────────┐   RawDataPayload   ┌───────────────────────────────────────────┐
│  Ingestion   │───────────────────►│              OPERATIONS  (new)            │
│ (extended)   │   SuspenseItem ◄───│                                           │
└──────┬───────┘                    │  OperatingPeriod ◄── Transaction          │
       │ Document                   │        │              └ Classification    │
       ▼                            │        │                                  │
┌──────────────┐   CashFlowDetail   │        │   CashFlowCategory (tree)        │
│    LEDGER    │───────────────────►│        │   CalendarEvent ◄ RecurringDec.  │
│              │◄───────────────────│        │   ActionEvent                    │
└──────┬───────┘  proposed stream   └────┬───┴──────────────────┬───────────────┘
       │          (owner-confirmed only) │  VerifiedSurplus     │ Finding
       │                                 │  MonthlyCashFlow     │
       ▼                                 ▼                      ▼
┌──────────────┐                  ┌─────────────┐        ┌──────────────┐
│  VERIFICATION│                  │  STRATEGY   │        │  Recommendation
│              │                  │ deployment  │───────►│ origin=OPERATIONAL
└──────────────┘                  │ analyzers   │        │ (existing model)
                                  └──────┬──────┘        └───────┬──────┘
┌──────────────┐  assumptions            │ AllocationPlan        │ ActionEvent
│   REGISTRY   │─────────────────────────┤                       ▼
│ +merchant    │  merchant rules         │               ┌──────────────┐
│ +calendar    │─────────────────────────┘               │   JOURNAL    │
└──────────────┘                                         │ +telemetry   │
                                                         └──────────────┘
┌──────────────┐   funding gaps                          ┌──────────────┐
│    GOALS     │────────────────────────────────────────►│  MONITORING  │
└──────────────┘                        OPERATIONS_REVIEW│  +drift      │
                                        snapshot ───────►└──────────────┘
```

Integration styles: Ingestion→Operations and Operations→Strategy are **Published Language**
(`RawDataPayload`, `MonthlyCashFlow`/`VerifiedSurplus`). Operations→Ledger is **Customer/Supplier
with human confirmation** — Operations proposes, the owner accepts, `LedgerFactory` constructs.
Registry→Operations is **Conformist** (Operations takes registry shapes as given). Nothing in
Operations is upstream of an existing context's invariants.

### A.2 Operations aggregates & consistency boundaries

```
OperatingPeriod  (AGGREGATE ROOT — a household-month)
 ├─ computed: MonthlyCashFlow      (frozen at CLOSED, with engineVersion + pins)
 ├─ surplusBase / surplusIsProvisional / unverifiedCount
 └─ transactional boundary: close / reopen

Transaction  (AGGREGATE ROOT — append-only observation)
 └─ TransactionClassification[]    (exactly one non-SUPERSEDED)
    transactional boundary: one classify() per transaction-set

CashFlowCategory  (AGGREGATE ROOT — configurable acyclic tree)
 └─ children[]                     invariant: acyclic, same household, leaf has behavioral default

RecurringDecision  (AGGREGATE ROOT)
 └─ CalendarEvent[]                invariant: emits forward only; rule change touches
                                   only FUTURE unactioned events

Recommendation (EXISTING ROOT, extended)
 ├─ rationale / assumptionPins / goalImpacts / evidence   (existing)
 ├─ RecommendationDependency[]     (new; acyclic)
 └─ ActionEvent[]                  (new; append-only status history)
```

Cross-aggregate rules enforced by domain services, not FK constraints (existing convention):
a period may not close while an unresolved *duplicate* exists (unverified *category* is fine —
non-blocking rule); an action may not move to `IN_PROGRESS` while a prerequisite is `PENDING`;
an assumption version bump invalidates pinned operational recommendations.

### A.3 The operational feedback loop, mapped to code

```
Income                         ← Transaction(IN) + CashFlowDetail(DECLARED)
  ↓
Dual-Axis Classification       ← engine-operations/classify.ts       (deterministic, ≥0.85)
  ↓
Monthly Cash Flow              ← engine-operations/normalize.ts      (activeDays divisor)
  ↓
Verified Monthly Surplus       ← engine-operations/surplus.ts        → OperatingPeriod
  ↓
Dynamic Surplus Allocation     ← engine-strategy/deployment.ts       (EXISTING, new input)
  ↓
Action & Opportunity Engine    ← engine-operations/opportunities/*   → Recommendation(OPERATIONAL)
  ↓
Execution Tracking             ← ActionEvent (append-only)
  ↓
Monthly Review                 ← operations.period.close → OPERATIONS_REVIEW snapshot
  ↓
Feedback Loop                  ← engine-monitoring/drift.ts          → MonitoringAlert
  ↓
Strategy Engine                ← owner-triggered rerun (never automatic)
```

---

## Appendix B — Real source formats (structure only; no household data recorded)

Owner supplied six real exports on 2026-07-27. **The files themselves are never committed**; only
the structural facts below, and all ingestion fixtures remain synthetic. Six exports resolve to
**five distinct adapters across two banks and two card issuers.**

| # | Source | Adapter id | Format | Extraction |
|---|---|---|---|---|
| 1 | FIBI (הבינלאומי) current account | `il-bank-fibi-pdf` | PDF, `Winnovative Chromium` HTML→PDF | `extract_tables()` gives clean 8-col rows incl. a `<th>` header row |
| 2 | OneZero current account | `il-bank-onezero-xls` | BIFF `.xls` (CDFV2), 9 cols | `xlrd`; header row 0; dates are Excel serials |
| 3 | Isracard Platinum Mastercard (×2 cards) | `il-card-isracard-pdf` | PDF, `Creator=ISRACARD`, iText 7.2.3 + pdfCalligraph | line-based text; `extract_tables()` unreliable (0 tables on one file) |
| 4 | Isracard via FIBI online | `il-card-isracard-html` | HTML, UTF-8, `dir=rtl` | `<table name="hiuvumTbl211_*">` with real `<th>` |
| 5 | Visa CAL via FIBI online | `il-card-cal-pdf` | PDF, `Skia/PDF` (Chrome print) | no table structure; grouped `₪amount merchant dd/mm/yy` lines under batch headers |

### B.1 Column contracts

```
FIBI PDF        תאריך | תיאור | זכות | חובה | יתרה | אסמכתא | סופ"פ | תאריך ערך
                → debit/credit COLUMN mode (not signed); running balance present
OneZero XLS     תאריך תנועה | תאריך ערך | סוג פעולה | תיאור | סכום פעולה | מטבע |
                חיוב/זיכוי | יתרה | אסמכתא
                → signed amount AND a direction column (cross-validate); currency column
Isracard PDF    תאריך רכישה | שם בית עסק | סכום עסקה | סכום חיוב | מס' שובר | פירוט נוסף
Isracard HTML   tbl_1: תאריך עסקה | שם העסק | סכום עסקה | סכום חיוב | פירוט
                tbl_2: + תאריך חיוב  (transactions not on the billing date)
CAL PDF         no columns — batch header lines + "₪<amount> <merchant> <dd/mm/yy>"
```

### B.2 Quirks the adapters must handle (all observed in the real files)

| Quirk | Detail | Handling |
|---|---|---|
| **Bidi reversal** | Hebrew is stored in *visual order* in all three PDF sources, in the Isracard HTML `פירוט` column, and inside `U+202D`-wrapped strings in the OneZero XLS | Reuse the existing `pdf/` RTL-repair from `il-pension-pdf` (documented in CLAUDE.md); `U+202D`/`U+202E` presence is a reliable detection signal |
| **Unicode minus** | Refunds use `U+2212 MINUS SIGN`, not `-` | Normalise in `normalize.ts` before parse |
| **Excel serial dates** | OneZero dates are numeric serials | `xlrd` datemode conversion |
| **Debit/credit columns** | FIBI has separate זכות/חובה columns, empty string for the unused side | Generic adapter already planned for this mode (§7.2) |
| **Pending transactions** | CAL groups under `עסקאות בתהליך קליטה` (in-process) vs `עסקאות לחיוב ב-<date>` | Pending rows are **not booked** — imported with `status=PENDING`, excluded from the period computation until they settle |
| **Installments (תשלומים)** | `סכום עסקה` (full) ≠ `סכום חיוב` (this month), with `תשלום N מתוך M` in the details column | See B.3 — new first-class concept |
| **Multi-currency** | Isracard shows `$10.00 → ₪29.79` on the same row, plus an `אתר חו"ל` flag and a `הנחה` (rebate) sub-line | Implied FX rate = חיוב/עסקה; compare to `FxRate` on `bookedAt` → **the FX-markup opportunity works from day one** |
| **Rebate sub-lines** | `הנחה ₪0.60` appears as its own line attached to the parent transaction | Attach to parent; never a standalone transaction |
| **Standing-order marker** | `הוראת קבע` in `פירוט נוסף` | Free, high-confidence `isRecurringCandidate=true` — no clustering needed |
| **Card fee** | `דמי כרטיס` line | Seeded `FINANCIAL_DRAG` rule → straight into leakage |
| **Account-holder name** | Present in every card statement header | Redacted at the `redact()` boundary (§7.1) — confirmed necessary by the real files |

### B.3 Two structural findings that change the design

**(1) Card settlements are a double-count hazard.**
The bank statements carry the card settlement as a *single aggregate debit* (`ישראכרט בע"מ - <last4>`),
while the card statement itemises that same money. Importing both naively doubles every card expense.

Rule: a bank-side line matching a card-settlement pattern is classified `TRANSFER` (excluded from
income and expense) **if and only if** a card statement covering that billing period is present and
its total reconciles within tolerance. Otherwise the aggregate line stands as the expense, tagged
`coverage=AGGREGATE_ONLY`, so the month is still computable — the non-blocking rule applied at the
settlement level. `Transaction.settlementLinkId` links the two; the UI shows the aggregate line as
an expandable parent. Same rule covers inter-bank transfers (FIBI ↔ OneZero, observed in both files).

**(2) Installments create committed FUTURE outflows.**
An Israeli `תשלום 1 מתוך 3` means two more charges are contractually committed. Cash flow for the
month uses `סכום חיוב`; the remaining instalments are **not** expenses yet but they *are* claims on
future liquidity. They are emitted as `CalendarEvent(kind=ANNUAL_SUBSCRIPTION→INSTALMENT,
isCashImpacting=true)` so they flow into the liquidity forecast and Safe-to-Spend automatically.
This adds `CalendarEventKind.INSTALMENT` and three `Transaction` columns:
`instalmentNumber Int?`, `instalmentTotal Int?`, `originalAmount Decimal?`.

### B.4 Household facts confirmed by the owner (2026-07-27)

| Fact | Consequence |
|---|---|
| **Two earners** (owner + spouse), one salary credited to FIBI, one to OneZero from a different payer | Each salary maps to its own `FamilyMember`. Pension / hishtalmut / gemel ceiling utilisation is computed **per person**, not per household — this is what makes the M40 employer-benefit opportunities correct rather than approximate. |
| **A US Chase account exists**, export to follow | Adds `us-bank-chase-csv` to M38b (Chase's CSV layout is stable and documented, so this adapter is low-risk). More importantly it makes **USD a first-class account currency**, not just a transaction currency: net-worth consolidation, the currency-exposure analyzer, and Safe-to-Spend must all handle an ILS-base household holding a USD operating account. Until the export arrives, coverage is reported as INCOMPLETE rather than assumed complete. |
| **History depth: Jan–Jul 2026 (7 months)** | Exceeds the 3-month `operations_baseline_months` default. Annual-cycle events (arnona, insurance renewal, school payments) are seeded from statutory rules in M39 rather than inferred from history; history-based inference improves as months accumulate. Import is idempotent on `externalRef`, so backfilling longer history later is safe and non-destructive. |

**Coverage rule (M37):** the engine tracks which sources cover which date range and reports
`coverage: COMPLETE | PARTIAL | AGGREGATE_ONLY` per period. A period with a known-but-unimported
source (today: Chase) is **never** silently treated as complete — it computes, and it says so.

**Net effect on the plan:** M38b grows from 2 adapters to 5, but M38a's generic tabular adapter
covers the OneZero XLS and the Isracard HTML almost unchanged, and the FIBI PDF via `extract_tables`.
Only the Isracard PDF and CAL PDF need bespoke line parsers. The settlement-linking and instalment
logic moves **into M37** (engine), not M38, because it is a classification concern, not a parsing one.

<!-- END OF DOCUMENT 07 — APPROVED 2026-07-27; APPENDIX B ADDED FROM REAL FORMAT SAMPLES -->
