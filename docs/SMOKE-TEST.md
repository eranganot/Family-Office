# WealthOS — Full Smoke Test (M1 → M9)

A single walkthrough that exercises **every feature and capability** shipped across milestones 1–9.
It uses only synthetic data. Follow it top to bottom in one household; each phase depends on the
previous one. Budget ~30–40 minutes.

- **Live app:** https://wealthos-web-production-c1f7.up.railway.app
- **Local:** `npm run dev --workspace=web` → http://localhost:3000 (after the local-Postgres steps in the README).
- Every screen has a **language toggle** (top-right, "עברית / English"). Flip it at least once per
  phase to confirm the UI mirrors to **RTL for Hebrew** and all strings are translated (M0/M1 i18n).

Legend: **Do** = an action to take · **Expect** = what you should see · covers = milestone/feature.

---

## 0. Sign in & the phase model

1. **Do** open the app. **Expect** a login screen; sign in with the household credentials.
2. **Expect** a top bar showing the **current phase** badge (starts at **Mapping**) and a nav bar:
   Dashboard, Mapping, Documents, Verification, Goals, Strategy, Scenarios, Journal, **Monitoring**,
   Household, FX, Registry. *(covers: auth, four-phase state machine, bilingual shell.)*
3. **Do** toggle to Hebrew. **Expect** the whole layout flips to RTL and every label is Hebrew. Toggle back.

---

## 1. M1 — Household core & canonical ledger (MAPPING)

### 1.1 Household & members
1. **Do** go to **Household**. Add the household (base currency **ILS**, timezone Asia/Jerusalem) and
   two members (one ADULT "employed", one CHILD). **Expect** both listed; base currency shown.

### 1.2 Manual ledger entry (one of every kind)
Go to **Mapping → new** and add, verifying each appears on the mapping dashboard with an ownership split:

1. **Bank checking** account — "עו"ש", ILS, value 250,000, owner 100% adult. *(AccountDetail, Israeli AccountType.)*
2. **Keren hishtalmut** account — BROKERAGE/KEREN_HISHTALMUT type, ILS 180,000. *(tax-advantaged type.)*
3. **Foreign brokerage** — currency **USD**, value 50,000. *(multi-currency.)*
4. **Real estate** — primary residence, ILS 2,300,000. *(RealEstateDetail.)*
5. **Mortgage** with **two tracks**: a fixed-CPI-linked track (₪700,000 @ 3.1%, CPI-linked) and a
   Prime track (₪100,000 @ 9.5%). *(MortgageDetail + multi-track.)*
6. **Cash flow** — living expense, ₪15,000 / MONTHLY, out. *(CashFlowDetail.)*
7. **Insurance** and **Loan** — add one of each with any values. *(remaining detail tables.)*

**Expect** each item on the dashboard; ownership shares sum to 100% (the form rejects otherwise).

### 1.3 Net worth (multi-currency) & FX
1. **Do** go to **FX rates**; add a manual **USD→ILS** rate (e.g. 3.70). *(FxRate table, manual rates.)*
2. **Do** open **Dashboard**. **Expect** a consolidated **net worth in ILS**, with the USD brokerage
   converted at your rate. Temporarily delete the FX rate → **Expect** the USD item is reported as
   **excluded / unconverted** rather than guessed. Re-add the rate.
3. **Do** edit any valuation. **Expect** the old value is preserved (append-only) and an **audit
   event** is recorded. *(covers: NetWorthCalculator, append-only valuations, audit events.)*

---

## 2. M2 — Ingestion (fixture-first)

1. **Do** go to **Documents**; upload the same synthetic fixture twice (a keren-hishtalmut or bank CSV
   from the test corpus). **Expect** the second upload is **de-duplicated** (sha256), not stored twice.
2. **Do** run an **import** of the Israeli **account-summary CSV** fixture (Hebrew headers). Assign
   ownership. **Expect** an **import report**: recognized items become canonical ledger entries with
   **per-field provenance**; anything unrecognized lands in the **Suspense** list (never halts).
3. **Do** import the generated **Hebrew pension PDF** fixture. **Expect** the RTL text is repaired and
   the account is extracted; unsupported product types route to Suspense.
   *(covers: document store, adapter framework, ledger factory, provenance, CSV + PDF adapters, suspense.)*

---

## 3. M3 — Verification (Phase 2)

1. **Do** advance the phase: **Verification** page → transition MAPPING → **VERIFICATION**.
2. **Expect** a **review queue** listing every item with issues (no/stale valuation, never-confirmed,
   low-confidence). For each item **verify**, **reject-with-note**, or **correct-value** (the
   correction **appends**, preserving provenance).
3. **Do** open the **missing-docs report**. **Expect** an expected-vs-present matrix
   (pension / hishtalmut / bank / mortgage / 106…) with present/stale/missing.
4. **Do** resolve every **Suspense** item (discard / link to existing / create account from raw data).
5. **Do** attempt VERIFICATION → **STRATEGY** while one item is still unverified. **Expect** the **gate
   blocks** you (completeness < 100% or suspense not empty). Finish verifying everything, empty
   suspense, then transition succeeds. *(covers: assessor, missing-docs, review/suspense UI, phase gate.)*

---

## 4. M4 — Registries

1. **Do** open **Registry**. **Expect** two views:
   - **Tax matrices** IL **2025 & 2026** with **cited sources** and a "not owner-reviewed" badge
     (income brackets incl. the March-2026 retroactive widening, capital gains, hishtalmut/pension
     ceilings, bituach leumi, purchase tax).
   - **Assumptions** — conservative defaults (returns, inflation, emergency-fund months, staleness
     thresholds, priority weights, and the new **drift thresholds**).
2. **Do** override one assumption (e.g. `emergency_fund_months` 6 → 9). **Expect** a **new version** is
   created (old version retained). If any recommendation was pinned to the old version, it is later
   flagged **INVALIDATED**. *(covers: TaxRegistry, AssumptionRegistry, versioning, invalidation.)*

---

## 5. M5 — Goals

1. **Do** go to **Goals**; create several: an **EMERGENCY_FUND** (priority 1), a **RETIREMENT** goal,
   and a **PROPERTY_PURCHASE** goal that **depends on** the emergency fund.
2. **Do** try to create a **cyclic** dependency. **Expect** it is **rejected** (acyclic validation).
3. **Expect** the **gap dashboard**: per-goal funding gap, required monthly saving (from the
   conservative real-return assumption), and any **incomputable** goals listed with reasons.
   *(covers: goal model, dependencies, funding-gap engine, gap dashboard.)*

---

## 6. M6 — Strategy engine (Phase 3)

1. **Do** open **Strategy** (only reachable in the STRATEGY phase) and press **Run**.
2. **Expect** recommendations as **explainability cards**, each with a full bilingual rationale block
   (why / benefits / risks / tradeoffs / tax / liquidity / horizon / sensitivity / alternatives /
   expected impact), ordered by **priority score**. Typical findings from the §1 household: reduce
   idle cash, expensive Prime track, CPI-linked concentration, foreign-currency home bias,
   tax-advantaged headroom.
3. **Expect** every card shows **reproducibility pins**: snapshot id, engine version, the exact
   assumption rows, evidence items, and linked goals. No card names a product or security.
4. **Do** (optional) weaken data quality (add an unverified item, re-enter STRATEGY): **Expect** the
   engine **refuses** with a **data-gap report** instead of low-confidence advice.
5. **Do** **Accept** one recommendation and **Reject** another (with notes).
   *(covers: snapshot, analyzers, generators, scoring, quality gate, strategy UI.)*

---

## 7. M7 — Decision journal

1. **Do** open **Journal**. **Expect** your accept/reject decisions recorded with **who / when /
   expected outcome / implementation date**.
2. **Do** on an accepted entry, later **record the actual outcome** inline. **Expect** it saved and
   shown. *(covers: decision journal, expected-vs-actual outcome round-trip — works in any phase.)*

---

## 8. M8 — Scenario engine

1. **Do** open **Scenarios** (STRATEGY phase). Run a **Market crash**, then a **Retire earlier**, then
   **High inflation** scenario (set a horizon, e.g. 15–20 years).
2. **Expect** a **baseline-vs-scenario comparison**: net-worth milestones with a Δ row, the lowest
   investable point, the **depletion year** (if any), and per-goal funded status under each.
3. **Expect** the crash scenario's terminal net worth is **below** baseline; high inflation stresses
   CPI-linked debt. Each run is **saved** with its baseline snapshot id.
   *(covers: deterministic projector, canned scenarios, comparison UI. Monte Carlo intentionally deferred.)*

---

## 9. M9 — Monitoring (Phase 4) — the loop closes

1. **Do** from **Strategy**, transition **STRATEGY → MONITORING** (this records your strategy baseline).
2. **Do** open **Monitoring**. Press **Run monitoring now** (same code path as the cron worker).
   **Expect** a first run with severity **None**, 0 drift findings, 0 stale — the current picture
   matches the baseline. It appears in **Monitoring history** (trigger MANUAL) and a new **SCHEDULED**
   entry appears in the **snapshot timeline**.
3. **Drift:** **Do** materially change a balance — e.g. go to the checking account and add a new
   valuation far lower/higher than before (a >10% net-worth move). Back on **Monitoring**, press **Run
   monitoring now**. **Expect** an **open alert** "Net-worth drift" with severity **Medium/High** and
   suggested action **Re-run strategy**. **Do** press **Acknowledge** → status becomes Acknowledged.
4. **Staleness:** **Do** (if testing locally) age valuations, or simply wait past the kind threshold;
   run monitoring. **Expect** aged VERIFIED items flip to **STALE**, and a **"Stale valuations"** alert
   appears with action **Re-verify**. **Expect** `itemsFlaggedStale` > 0 in the run row.
5. **Re-evaluation (loop closes):** **Do** on **Monitoring**, choose **Re-verify stale data**.
   **Expect** the phase transitions **MONITORING → VERIFICATION**, open alerts are **resolved**, and you
   land on Verification to re-verify. Re-verify, pass the gate back to STRATEGY, and press **Run** — the
   engine re-runs against the changed picture. Alternatively **Re-run strategy** routes
   **MONITORING → STRATEGY** directly.
6. **Worker/cron:** **Do** (ops) trigger the deployed **worker** service manually in Railway (or run
   `DATABASE_URL=… npm run monitor --workspace=@wealthos/worker`). **Expect** a new MANUAL/CRON run in
   the history with the same behavior. *(covers: worker, DriftDetector, staleness sweep, re-evaluation,
   history UI — the full four-phase loop.)*

---

## 10. Cross-cutting checks (any time)

- **Bilingual/RTL:** every page renders correctly in he (RTL) and en.
- **Workflow guard:** deep-link to `/strategy` while in MAPPING → the API refuses (guarded).
- **Audit trail:** mutations you performed appear as AuditEvents (Household/DB).
- **Determinism:** re-running Strategy supersedes prior PROPOSED recommendations but keeps ACCEPTED ones.

---

## Automated coverage (for reference)

Pure/unit suites run anywhere (`npm run test`): domain (33), engine-monitoring (15: drift + staleness),
engine-strategy, engine-scenario, engine-verification, engine-goals, ingestion (17), registry.
DB-bound integration suites run when `TEST_DATABASE_URL` is set (and in CI): import, phase-gate,
strategy, and **monitoring** (`packages/api/test/monitoring-integration.test.ts` — cycle → drift →
staleness → re-evaluation against real Postgres).
