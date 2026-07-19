# WealthOS — Session Status Log

> Read this first in any new session. Update after every meaningful change.

## Current state (2026-07-19)

- **PRODUCT-STRATEGY.md rewritten as v2 — combined WealthOS × InvestWise Pro strategy** (docs
  only, no code). Owner decisions locked: InvestWise Pro is the household-only self-directed
  execution companion (advisor never touches products/orders — firewall codified in §0); the
  advisor buys and bundles both; integration v1 is two-way (plan artifact down, consented
  positions/fills feed up, `BROKER_SYNC` trust tier). Adds HUM-E north-star cut,
  plan-execution-rate KPIs, three end-user journeys (J1 WealthOS-only / J2 bundle / J3
  InvestWise-only), resequenced commercial roadmap (plan export = step 3). Written from the
  sandbox to the mount + verified (294 lines); **needs a docs commit from Windows** (no git
  write-ops on the mount).
- **Follow-up (same day): §12 Operating model added to PRODUCT-STRATEGY.md** (B2B2C × B2C: two
  SKUs of InvestWise, down-bundle / up-referral bridges, channel-conflict fences, one-funded-GTM
  rule) **+ new docs/GAP-ANALYSIS.md** (W1–W11 WealthOS gaps to G1, IW1–IW9 InvestWise gaps to
  bundle-ready, shared seam gaps S1–S5, sequencing). Both verified on mount (333 / 100 lines);
  same pending docs commit. Open owner decisions logged: standalone InvestWise pricing; brand.
- **Follow-up 2 (same day): evidence pass + mission/vision + market research.** New
  docs/MARKET-RESEARCH.md (193 lines): sourced industry data (750 CFP-trained / 300+ FPAI-active;
  457 advisors vs 10,310 agents; ₪6.9T public assets; 161K new trading accounts 2024),
  claim-audit table C1–C14, TAM/SAM/SOM (both products + bundle), 3 SWOTs, trends, sources.
  PRODUCT-STRATEGY.md corrected in place per audit (C6: Plan-T exists — differentiation
  restated; C13: commissions grew, pressure is regulatory; C2 flagged owner-estimate; C7
  Mislaka licensing nuance) + new §13 Mission & vision, §14 Evidence base (now 370 lines).
  Same pending docs commit from Windows.

## Current state (2026-07-15, session 2)

- **M24 (wizard v2 + MC clarity) code-complete — delivered stacked on the M23 patch.** Wizard grows
  10→15 questions and now drives 24 of 39 assumptions (institution concentration, CPI-mortgage share,
  data-strictness → strategy gates + unknown-mix ceiling, taxable-portfolio age → taxable_gain_fraction
  (factual, not preference), advice-priority → priority_weights presets each summing to 100; nagging
  additionally tunes the refinance alert spread; fee importance also scales the global fee fallback).
  Split is now: 24 wizard + 6 risk questionnaire + 9 expert-owned (returns ×2, inflation, goal return,
  MC volatility, pension withdrawal tax, expensive-debt rate, prime spread, large-loan base is asked).
  Monte Carlo goals now carry `notComputableReason` (BEYOND_HORIZON vs MISSING_DATA) and the scenarios
  page prints the reason with a fix hint instead of a bare "not computable". Owner's stale "Monte Carlo"
  card explained: pre-M23 saved run on a snapshot without goal funding; 2050 goals need horizon ≥ 25.
  Verified: registry 7 tests, engine-scenario 14 tests, tsc (registry/scenario/api/web), i18n parity.
  Patches on the mount: `m24.patch` (on top of m23) and `m23-m24-combined.patch` (directly on a069108).

## Current state (2026-07-20, session 2)

- **M28 (plan impact simulation + add-actions UX) code-complete — m28.patch stacks on M27. No schema
  change / no migration.** Answers owner's two questions on the working plan.
  (1) IMPACT: new pure `engine-strategy/src/impact.ts` computePlanImpact(snapshot, ctx, selections,
  bufferTarget, targetGrowthPct) → before→after for liquid cash, growth-share % (→target), total
  mortgage debt, annual interest, tax ceilings captured, goal PV gap, PLUS a deterministic real-terms
  projection of EXTRA net worth over the risk-horizon vs leaving cash idle (invest at expected real
  return; debt at REAL rate = nominal−inflation floored 0; tax deposits tax-free≈growth), broken down
  by source. Documented honesty note: net worth today is unchanged (cash↔asset/debt swap); the gain is
  future trajectory. 5 impact tests (engine-strategy 59). `allocation.impact` query resolves the
  current workingPlan selections against the plan's PINNED snapshot; impact panel renders above the
  action list and recomputes as you toggle/edit.
  (2) ADD ACTIONS: the working plan now splits into "בתוכנית שלכם" (enabled) and "זמינות להוספה (מכל
  מסלול)" (disabled) — the union of all candidates across paths was always rendered, but the split +
  heading makes cross-path adding obvious (owner couldn't find where to add). Each available row has
  its amount field + הוספה.
  Verified: engine 59 tests, eslint clean, api/web tsc, prisma valid, i18n parity.

## Current state (2026-07-20)

- **M27 (deployment v3: editable working plan, partial debt, CI fix, doc-type edit) code-complete —
  m27.patch on 9207ab9 (the pushed M26).** FIRST fixes the red CI on M26 (two unused-var lint errors:
  `flow` in deployment.test, `opt` import in allocation-actions) — full-repo `eslint --max-warnings 0`
  now clean.
  Owner decisions 2026-07-19: (mix of editable working plan + cross-path cherry-pick) engine is now
  CANDIDATE-based — computeDeploymentPlans returns `candidates` (one editable action per mortgage
  TRACK for partial repayment, tax deposit/verify per member, growth+defensive invest) + `presets`
  (GROWTH/DEBT_FREE/BALANCED seed entries) + `variants` (comparison cards, derived from presets).
  Partial mortgage repayment = a smaller amount on a track candidate; highest-rate track first.
  EMPLOYED members → non-editable TAX_VERIFY_PAYROLL candidate satisfiable by form 106 (owner: 106
  already lists deposits — auto-extract backlogged; one-click "אשר על סמך טופס 106" now). AllocationPlan
  gains `workingPlan Json` (migration 20260720090000); router applyPreset/setCandidate(bounds+over-alloc
  guard)/approve replace M26 choose/decide. UI: comparison cards → "השתמש כבסיס" seeds an editable
  working plan with per-candidate enable/amount, a live מוקצה/פנוי meter, over-allocation block, goal
  impact per row; approve opens the STRATEGY gate. Doc-type edit: `documents.setDocType` + inline
  selector on each uploaded doc (your #2; ownership already editable at import; parsed-value edit
  backlogged). 9 engine deployment tests (engine-strategy 54), domain 34. Verified: eslint clean
  (whole repo), engine+domain tests, api/web/registry tsc, prisma valid, i18n parity.

## Current state (2026-07-19)

- **M26 (deployment plan v2 — variants, per-step decisions, employee-aware tax) code-complete —
  delivered as m26.patch on 30e30bb.** Owner decisions: employees get a payroll-verification step
  (never lump-sum deposits; SELF_EMPLOYED keep deposit steps; unknown employment ⇒ verify);
  three variants with extended risk/meaning/potential narratives; gate requires EVERY step decided;
  goal impact qualitative + invest-quantified (full projector simulation → backlog, with payslip
  ingestion).
  Engine: computeDeploymentPlans returns GROWTH (invest-all; mortgage untouched; narrative warns
  when expensive tracks exist) / DEBT_FREE (all tracks rate-desc; interest-saved/yr computed;
  inflation-hedge-reversal + RE-concentration risks named) / BALANCED (threshold waterfall);
  bilingual pros/cons/risks with computed numbers; per-step ids + goalImpact/He (invest steps
  quantified vs total PV goal gap; top-priority goal names embedded); validator scans everything;
  7 rewritten deployment tests (engine-strategy 52). DB: AllocationPlan.chosenVariant +
  stepDecisions (migration 20260719090000). Router: chooseVariant (resets decisions on switch),
  decideStep (auto-APPROVES when the chosen variant's last step is decided) — approve mutation
  replaced. UI: three comparison cards (summary stats + narratives, ring on chosen), per-step
  אישור/דחייה with decision chips + progress counter, goal-impact line per step, legacy-plan
  rebuild prompt. Verified: engine 52 tests, api/web tsc, prisma valid, i18n parity.
  **Owner data task: map both employer pension+hishtalmut contribution flows (kinds
  PENSION_CONTRIBUTION / HISHTALMUT_CONTRIBUTION) so utilization tracking reflects payroll.**

## Current state (2026-07-18)

- **M25 (ALLOCATION — fifth workflow phase) code-complete — delivered as m25.patch on 599985b.**
  Owner decisions: formal phase between VERIFICATION and STRATEGY; deployable = cash beyond the
  emergency buffer; debt repayment math-driven (expensive_debt_rate_pct).
  (a) Pure engine `engine-strategy/src/deployment.ts`: computeDeploymentPlan waterfall — buffer
  (REFUSES when expenses unmapped: never guess the buffer; top-up step when cash < target) →
  expensive mortgage tracks by rate desc → unused hishtalmut/pension ceilings per adult (same
  contribution-flow accounting as tax-utilization) → invest split toward deriveTargetGrowthPct
  (new-money-only; unsplit + note when unknown mix > ceiling); all strings product-validated;
  6 new tests (engine-strategy 51 total).
  (b) State machine v2 (5 states): VERIFICATION→ALLOCATION carries the old verification gate;
  ALLOCATION→STRATEGY gated on ALLOCATION_PLAN_NOT_APPROVED; STRATEGY→ALLOCATION and
  MONITORING→ALLOCATION allowed; exhaustive 5×5 matrix tests updated (domain 34 green).
  (c) DB: WorkflowState + 'ALLOCATION' (PG12+ safe ADD VALUE), AllocationPlan model
  (snapshot-pinned, engineVersion, PROPOSED/APPROVED/SUPERSEDED) — migration 20260716090000.
  (d) API: allocation router (latest/generate/approve; generate supersedes proposed, AUTO-APPROVES
  empty plans); workflow + monitoring transitions feed the new fact.
  **(e) LATENT BUG FIX: strategy-service now loads ALL current assumptions (reg.all) — the old
  hard-coded subset silently ignored questionnaire/wizard overrides (risk_*, allocation_*) at run
  time while the UI displayed them. Engines now honor every override.**
  (f) UI: /allocation page (free-cash stats, numbered bilingual steps, approve-with-note, auto-approve
  notice), nav tab, 5-pill journey bar, gate panel rewired (VERIFICATION advances to ALLOCATION;
  back-transitions everywhere), dashboard ALLOCATION next-step, monitoring re-eval → ALLOCATION button.
  Verified: web/api/domain/registry/worker tsc exit 0, engine suites 51/34/21, prisma valid, i18n
  parity. Sandbox note: killed npm slices TRUNCATE package files (rolldown binding SIGBUS, @types/node,
  pdfjs-dist) — targeted reinstall fixes; check binaries when vitest bus-errors.
  **Prod flow after deploy: household sits in STRATEGY/MONITORING — use the gate/re-eval buttons to
  enter ALLOCATION, generate + approve the first plan, then advance back to STRATEGY.**

## Current state (2026-07-15)

- **M23 (wizard + action checklists + audit + trust ladder) code-complete — delivered as a GIT PATCH
  (m23.patch at repo root) because another session had uncommitted work in overlapping files; apply on
  the owner's machine with `git apply --check` first.** No conflicts possible: apply fails loudly.
- M23a audit: every M15–M21a/D5 claim verified against HEAD (all artifacts present; 89 engine tests
  green; tsc clean everywhere; 5 migrations sequenced; i18n 706-key parity). No contradictions.
- M23b wizard: `packages/registry/src/wizard.ts` pure mapper (10 plain-language answers → 15 threshold
  assumptions; market numbers stay system-owned; 6 unit tests incl. neutral-answers==defaults),
  `registry.applyWizard` mutation (writes only changed values), `/registry/wizard` page (he/en),
  changed-keys banner using registry.meta labels, CTA on the registry page.
- M23c action checklists: `engine-strategy/src/action-items.ts` — 22 builders (one per finding code,
  bilingual, amounts computed from finding metrics; missing code THROWS); composed centrally in
  generateRecommendations (generator bodies untouched); validator scans action items too;
  `Recommendation.actionItems Json?` ({en,he}; migration 20260715090000_m23_action_items — pre-M23
  rows null); strategy card renders numbered "צעדים לביצוע". Generators tests assert bilingual
  non-empty steps.
- M23d: docs/DATA-TRUST.md (4-tier trust ladder, bounds checks, estimate flags, suspense-first) +
  docs/M23-PLAN.md handoff spec — already on disk as untracked files (commit together with the patch).
- Option B (tax-sequenced execution plans) is the agreed NEXT milestone after checklists prove out.
- ⚠️ Coordination: mount view still shows 14 uncommitted modified files + phantom index deletions —
  owner to confirm on-machine `git status`; patch-based delivery sidesteps the ambiguity.

## Current state (2026-07-14, session 2)

- **⚠️ MOUNT CORRUPTION INCIDENT:** the Windows-mount working tree was found TRUNCATED mid-line on 14
  files (accounts.ts, allocation.ts, growth-heuristic.ts, …) while git HEAD was intact; `.git/index`
  also has damage (null-sha1 cache entry + stuck index.lock). Recovered by restoring /tmp copies from
  `git show HEAD:`. **Owner must repair the local clone before the next commit:** delete
  `.git\index.lock`, then `git checkout -- .` and `git reset` (see chat instructions). All syncing
  from the sandbox is now checksum-verified.
- **M22 (owner feedback round 3) code-complete, NOT yet deployed. No new migrations.**
  (a) Registry UX overhaul: 39 assumptions get Hebrew+English labels/descriptions/tuning guidance
  (i18n `registry.meta.*`, fallback to DB description), grouped into 7 categories
  (apps/web/src/lib/assumption-groups.ts), provenance badges ("נקבע על ידכם" vs "ברירת מחדל שמרנית").
  (b) Journey bar in the app layout: 4 clickable phase pills with the current phase highlighted +
  per-phase "עכשיו: …" one-liner (i18n `journey.*`); nav switched to a client NavLinks component with
  active-tab underline (aria-current).
  (c) Disability recommendation suppressed when the member has a mapped PENSION_COMPREHENSIVE (Israeli
  mekifa embeds א.כ.ע — owner decision 2026-07-14); new test.
  (d) Goals: plain-language guidance line per computable goal (amber "לחסוך כ-X בחודש" / green
  "בכיוון הנכון").
  (e) Monte Carlo: `runMonteCarlo` accepts optional `scenarioType` (canned overrides applied; named
  `MC · <TYPE>`); UI gains a simulated-path select + "המסלול שנמדד" label on results.
  (f) Risk questionnaire deepened 3→6 questions (drawdown reaction ±10/+5, experience ±5, spending
  flexibility ±5 in deriveTargetGrowthPct; new defaults seeded risk_drawdown_reaction /
  risk_investment_experience / risk_spending_flexibility, defaults=2 keep existing derivations
  unchanged); strategy card + saveRiskAction extended.
  Verified: engine-strategy 45 tests (insurance 9 incl. new pension-embeds case), api/web/registry
  tsc, prisma valid, i18n 706-key parity. **Deploys with the next push (seed adds 3 assumptions).**

## Previous state (2026-07-14)

- **D5 (tax-matrix owner sign-off) code-complete, NOT yet deployed.** New `TaxRuleSet.ownerReviewed` column
  (migration 20260714150000_m18_tax_owner_reviewed) — a real review flag, separate from the immutable versioned
  payload. `tax-registry.list()` returns it + a `review(ruleType)` method; new `registry.reviewTaxRule` mutation
  (audited via the mutation middleware). The registry page badge now reads the column, and each unreviewed matrix
  shows a "בדקתי ואישרתי" button that flips it + a confirmation banner. Verified: prisma valid, registry/api/web
  tsc clean, i18n 606-key parity. (Pulled out of M18; the alert-email half of M18 is backlogged.) **Deploys with
  the push (migrate adds the column).**

- **M21a (BOI rate feed + mortgage refinance signal, B6) code-complete, NOT yet deployed.** New `MarketIndicator`
  table (migration 20260714140000_m21_market_indicator) stores fetched indicators; `boi-rate-service` fetches the
  BOI policy rate from the verified PublicApi `GetInterest` endpoint (same family as the FX feed) and upserts
  key=BOI_RATE; the worker refreshes it daily (non-fatal, alongside FX). New assumptions
  `mortgage_prime_spread_pct` (1.5) + `mortgage_refinance_notice_spread_pct` (0.5). AnalyzerContext gains
  `marketRates.boiRatePct`; the debt analyzer flags a variable/PRIME mortgage track priced above the live prime
  benchmark (BOI + spread) → new bilingual `MORTGAGE_ABOVE_BENCHMARK` generator. FX page shows the current BOI
  rate + manual refresh; `networth.boiRate` / `refreshBoiRate`. Verified live against GetInterest (3.75%); prisma
  valid, api/web/worker/registry/engine tsc clean, engine-strategy 44 tests (4 new B6), i18n 604-key parity.
  **C5 (CPI) deferred** — BOI CPI lives only in the SDMX series DB (no clean endpoint verifiable from sandbox).
  C6 (custom scenario builder) remains for M21. **Deploys with the push (migrate creates MarketIndicator).**

- **M19a (fee benchmark by product type, B5) code-complete, NOT yet deployed.** The single global
  `management_fee_notice_pct` is now backed by a per-type map `management_fee_notice_by_type` (pension mekifa
  0.5, pension general 0.6, gemel lehashkaa 0.6, hishtalmut/kupat gemel/IRA 0.7), falling back to the global
  0.8. The fee analyzer flags managementFeePct above the per-type threshold; the HIGH_MANAGEMENT_FEE generator
  pins both keys. No migration (assumption seeded in preDeploy). Verified: registry/engine-strategy/api tsc
  clean, engine-strategy 40 tests (2 new B5). **C1 (real Gemel-Net/Pensia-Net data) deferred** — the CMA feed
  is XML/reverse-engineered, not sandbox-verifiable; needs a validated endpoint + a fund-number field (spike).
  **Deploys with the push.**

- **M17b (tax-aware drawdown, C4) code-complete, NOT yet deployed. M17 COMPLETE.** The projector splits
  investable into taxable / hishtalmut / pension sub-pools; on a net drawdown it pulls tax-efficiently
  (taxable → hishtalmut → pension), grossing each withdrawal up by that pool's effective tax rate so depletion
  years and net outcomes are more accurate. Tax is OPT-IN via `ProjectionParams.taxDrawdown` (undefined =
  untaxed v1 aggregate — so all existing projector + Monte Carlo tests stay byte-identical). Rates come from
  the registry: CGT (CAPITAL_GAINS 25%) × `taxable_gain_fraction` (new assumption, 0.5) for taxable; 0 for
  hishtalmut (exempt after vesting); `pension_withdrawal_effective_tax_pct` (new, 15) for pension.
  `scenarios.run` + `runMonteCarlo` pass taxDrawdown; the scenarios page notes it. No migration (assumptions
  seeded in preDeploy). Verified: engine-scenario 14 tests (2 new C4), registry/api/web tsc clean, i18n
  600-key parity. **Deploys with the push.**

- **M17a (Monte Carlo projector, C2) code-complete, NOT yet deployed.** The M8 projector was refactored to
  expose `projectPath(snapshot, params, annualRealReturns[])`; `project` is now a thin wrapper (constant
  returns) so deterministic behavior + all 8 projector tests are UNCHANGED. New `monte-carlo.ts`:
  `projectMonteCarlo` samples annual real returns ~ Normal(realReturnPct, volatilityPct) via a seeded
  mulberry32 PRNG (fixed seed → reproducible bands), 1000 runs, reporting P10/P50/P90 net-worth bands per
  year, per-goal success probabilities, and probability of depletion. New assumption `mc_return_volatility_pct`
  = 12 (seeded in preDeploy — NO migration). tRPC `scenarios.runMonteCarlo` persists a MONTE_CARLO Scenario
  row; the scenarios page gains a "מונטה קרלו" runner + a bands / goal-probability / depletion view. Verified:
  engine-scenario 12 tests (4 new MC), registry/api/web tsc clean, i18n 599-key parity. C4 (tax-aware
  drawdown) is the remaining M17 step. **Deploys with the push.**

- **M20b (earmark accounts to goals, B7) code-complete, NOT yet deployed.** New `LedgerItem.earmarkedGoalId`
  (nullable FK → Goal, ON DELETE SET NULL; migration 20260714130000_m20b_earmark_accounts_to_goals). The
  funding-gap engine reserves an earmarked account for its goal FIRST (owner intent overrides the
  priority-pool policy) and removes it from the shared LIQUID/RETIREMENT pools; `GoalGapResult` gains
  `earmarkedNowILS`. `goals.fundingGap` threads the field; new `goals.earmarkAccount` mutation
  (household-scoped, validated, audited). UI: earmark select on the account/other-asset edit form; the goals
  gap report shows the earmarked amount per goal. Verified: prisma valid, engine-goals 9 tests (2 new),
  api/web tsc clean, i18n 592-key parity. **Deploys with the push (migrate adds the column + FK).**

- **M20a (recommendation lifecycle, B4) code-complete, NOT yet deployed.** Closes the accept→implement
  loop. (1) "סמן כבוצע" (Mark done) on ACCEPTED cards → status IMPLEMENTED + records the actual outcome on
  the decision journal; the earlier "הסר מהרשימה" dismiss stays (→ SUPERSEDED). (2) New pure sweep
  `sweepRecommendationReviews` (engine-monitoring) wired into the monitoring cycle: an ACCEPTED rec whose
  implementation date has passed with no recorded outcome raises a LOW `RECOMMENDATION_REVIEW` alert
  (action REVIEW) — a gentle nudge below the MEDIUM+ email threshold. No migration (IMPLEMENTED status
  already existed). Verified: api/web tsc clean, engine-monitoring 21 tests (4 new), i18n 585-key parity.
  B7 (earmark accounts to goals) is the remaining M20 step. **Deploys with the push.**

- **M16 fixes round 2 (post-deploy) — NOT yet deployed.** (1) ACCEPTED recommendations had no way to be
  cleared once acted on (a resolved gap left a frozen accepted card). Added `strategy.dismiss` (sets
  SUPERSEDED; kept in history/journal) + a "הסר מהרשימה" button on ACCEPTED cards. (2) The mapping list
  showed "אין הערכת שווי" for INSURANCE/CASH_FLOW items, which carry no valuation by design; it now shows
  the coverage amount (insurance) / flow amount (cash flow) instead. New i18n: strategy.dismiss,
  mapping.coverage/noCoverage/flowAmount, ok.recDismissed. Verified: api/web tsc clean; i18n 581-key parity.

- **M16 fixes (post-deploy) — NOT yet deployed.** (1) Duplicate recommendations: rerunning strategy
  after ACCEPTING a rec kept the accepted copy AND created a fresh PROPOSED duplicate. strategy-service
  now skips generating a draft whose `type` already has an ACCEPTED recommendation, so a rerun
  supersedes the stale PROPOSED and no longer recreates it. (2) Actionability: each recommendation type
  that needs owner data now shows a bilingual "how to complete" hint on the strategy card (exact
  tab + field + value), driven by `strategy.resolve.<type>` i18n — covers the insurance + tax recs.
  Owner note: the mortgage-life gap counts only MORTGAGE_LIFE-typed policies; a policy typed "Property"
  is NOT counted — set the mortgage policy's type to "Mortgage life" (coverage ≥ balance) and rerun.
  Verified: api/web tsc clean; i18n he/en 576-key parity.

- **M16a (insurance-gap analyzer, B2) code-complete, NOT yet deployed.** New pure analyzer
  `analyzers/insurance.ts` on the M6 finding→generator pattern: flags survivor-income gap (life
  cover vs household expenses × `insurance_survivor_expense_months`, default 60 months), missing
  disability cover for an active earner, and mortgage-life cover below outstanding principal.
  SnapshotItem gains an additive OPTIONAL `insurance` object (policyType, coverageAmountBase,
  monthlyPremiumBase, throughPension, insuredMemberId, endDate) — NO migration; snapshot-service
  populates it from InsuranceDetail (base-currency converted). 3 bilingual generators
  (CLOSE_SURVIVOR_GAP / ADD_DISABILITY_COVER / CLOSE_MORTGAGE_LIFE_GAP), category-level only
  (passes the product-reference validator). New assumption `insurance_survivor_expense_months`=60,
  seeded idempotently in preDeploy (no migration). The insurance mapping form already captures
  policyType/coverage/insuredMember, so the analyzer fires on existing data. Verified in sandbox:
  domain/registry/engine-strategy/engine-scenario/engine-monitoring/api tsc clean; engine-strategy
  31 tests (7 new) + scenario 8 green. B3 (tax-year utilization) is the next M16 step (needs a
  contribution cash-flow type — schema migration). **Deploys with the pending push.**

- **M16b (tax-year utilization tracker, B3) code-complete, NOT yet deployed.** New pure analyzer
  `analyzers/tax-utilization.ts`: per adult member, compares mapped annual contributions to the
  registry ceilings (hishtalmut exempt annual deposit; pension = qualifiedIncome × maxBenefitPct)
  and flags unused headroom with months remaining in the tax year — deposits read from mapped
  contribution cash flows only (never inferred; a member with none is not assessed). Requires a
  MIGRATION: two new CashFlowType enum values `HISHTALMUT_CONTRIBUTION` / `PENSION_CONTRIBUTION`
  (migration 20260714120000_m16b_tax_contribution_flows, `ALTER TYPE ADD VALUE` — applies on PG17);
  cash-flow create/edit forms + router enum + forms.cashFlow labels (he/en) extended; direction
  auto-derives OUT. strategy-service now passes PENSION_CEILINGS into the analyzer context. 2
  bilingual NOTICE generators (MAXIMIZE_HISHTALMUT_HEADROOM / MAXIMIZE_PENSION_HEADROOM), ILS-only
  (ceilings are ILS). Verified in sandbox: prisma validate + schema valid, domain/registry/
  engine-strategy/api/web tsc clean, engine-strategy 38 tests (7 new B3) green, i18n he/en 569-key
  parity. **Deploys with the pending push (migrate applies the enum values).**

- **M15 (guided first-run & UX) code-complete, NOT yet deployed.** Web-only, no schema/engine change.
  A1: dashboard leads with a "מה עכשיו?" next-step card — current phase + blocking counts + one primary
  CTA — computed from `workflowState` + `verification.assessment` (+ `strategy.recommendations` in
  STRATEGY, `monitoring.alerts` in MONITORING). A7: goals + mapping empty states rewritten as onboarding
  (teaching copy + direct CTA: mapping → add first bank account `/mapping/new/ACCOUNT`, goals → anchor to
  the add form). A4: shared `SuccessBanner` + `?ok=<key>` convention wired on goal create/update/status,
  member add/update/archive, and all mapping mutations (`run()`); new top-level `ok` i18n namespace. A2:
  reusable `<Explainer>` `<details>` block added to verification/strategy/monitoring/journal (mirrors the
  ✅ scenarios/registry pattern). A3: `dir="auto"` on strategy rationale (RBlock/RList) + journal
  outcome/notes so mixed EN/HE resolves per paragraph. New i18n keys at exact he/en 567-key parity.
  Verified in sandbox: web `tsc` clean (only the documented sandbox-only pdfjs-dist noise), i18n parity.
  **Deploys with the pending push.**
- **Phase 0 (pre-M15):** CI actions bumped checkout/setup-node v4→v6 (D3); Postgres backup policy
  documented in docs/DEPLOY.md (D4). M10–M14 production deploy + Railway backup enablement remain the
  owner's credentialed action.

- **M10 (bilingual rationale) code-complete, NOT yet deployed.** All 11 strategy generators now carry a
  full Hebrew `rationaleHe` (same Rationale schema, same timeHorizon enums); product-reference validator
  scans the Hebrew text too; `Recommendation.rationaleHe Json?` added (migration
  20260713080000_m10_bilingual_rationale — pre-M10 rows stay null and the UI falls back to English);
  strategy page picks rationale by locale. Verified in sandbox: engine-strategy tsc + 16/16 tests
  (new assertions: rationaleHe parses, is actually Hebrew, horizon enums match), api tsc, web tsc,
  prisma validate. **Deploy pending: run migration on Railway PG + `railway up` (needs owner token).**
  NOTE: rerunning strategy after deploy regenerates recommendations WITH Hebrew; old PROPOSED rows
  will be superseded as usual.
- **M11 (edit everything) code-complete, NOT yet deployed.** New update mutations (all audited via the
  tRPC audit middleware): `accounts.update` (base + AccountDetail + institution re-upsert),
  `property.updateRealEstate`, `property.updateMortgage` (detail + full track-set replacement with the
  create-path validation, appends a CALCULATED valuation at the new total principal),
  `flows.updateCashFlow` (direction re-derived from flowType), `flows.updateInsurance`,
  `flows.updateLoan`; goals.update + household.updateMember already existed and are now exposed in UI.
  New UI: goal inline edit (name/type/priority/targetDate/requiredFunding/riskTolerance/dependencies —
  fixes the "לא הוגדר" goals), member inline edit, per-item edit link on mapping →
  `/mapping/edit/[id]` kind-specific prefilled form (OTHER_* get base-only form). Valuations remain
  append-only; currency intentionally not editable; ownership editing still deferred (M3 debt).
  Empty form fields mean "leave unchanged" (v1 semantics). i18n: forms.edit/editTitle added.
  Verified: api tsc, web tsc. No schema change.
- **M12 (allocation engine) + M13 (allocation drift) code-complete, NOT yet deployed.**
  M12: `AccountDetail.growthSharePct` (null = unknown; migration 20260713090000_m12_allocation);
  SnapshotItem gains additive defaulted `growthSharePct` (old payloads still parse, schemaVersion 1);
  7 new assumptions seeded (risk_loss_tolerance / risk_income_stability / risk_horizon_years,
  allocation_rebalance_band_pct, allocation_real_estate_max_pct, allocation_mix_unknown_max_pct,
  drift_allocation_pct). New pure analyzer `analyzers/allocation.ts`: target growth share derived
  deterministically from the 3 questionnaire assumptions (documented rule: base 30/50/70 by tolerance,
  ±10 horizon, ±5 stability, clamp [20,90] — `deriveTargetGrowthPct`, exported); whole-net-worth view;
  cash = defensive by definition; unknown-mix accounts EXCLUDED-AND-REPORTED, comparison REFUSED above
  allocation_mix_unknown_max_pct. 4 new bilingual generators (below/above target with shift amount in
  base currency, mix-unknown data-gap, real-estate-high structural — explicitly not a sell instruction).
  Risk questionnaire card on the strategy page (writes assumption overrides ONLY on change → no
  gratuitous invalidation); growthSharePct field in account create/edit forms. 8 new engine tests
  (24 total in engine-strategy).
  M13: HouseholdMetrics.growthSharePct (known-mix-only, mirrors M12 policy), ALLOCATION_DRIFT kind in
  DriftDetector (pp vs strategy baseline, RERUN_STRATEGY), drift_allocation_pct threshold wired in
  monitoring-service, i18n alert labels, 2 new drift tests (17 total in engine-monitoring).
  Verified in sandbox: domain/api/web/registry tsc, engine suites green, prisma validate.
  **Deploy pending (both migrations + seed): needs owner Railway token / git push.**
- **v1.1 deploy fixes (2026-07-13, post-deploy):** CI red on main — engine-scenario test fixture
  lacked the new required SnapshotItem.growthSharePct → added (test-only; engine-scenario 8 tests +
  tsc green; full package sweep now clean incl. worker). Questionnaire save gave zero feedback
  ("nothing happens") though overrides persisted (prod showed derived target 85%) → saveRiskAction
  now redirects with ?savedRisk=1 and the strategy page shows a green "answers saved" banner.
  Recommendations remain English until owner clicks הרצה (by design; old rows fall back to en).
- **M14 (owner requests batch) code-complete, NOT yet deployed.** (a) Income mode: Goal.targetMonthlyIncome
  (FI/RETIREMENT only, enforced create+update); effective requiredFunding DERIVED at read time from
  goal_projection_real_return_pct (perpetuity: monthly*12/rate) in BOTH the fundingGap route and the
  snapshot builder — tracks assumption changes with zero sync jobs; goal UI field + income badge.
  (b) Automatic FX: services/fx-service.ts fetches BOI PublicApi (USD/EUR/GBP/CHF→ILS, per-unit
  normalized, defensive parsing, upsert on [from,to,asOf,source="BOI"]); worker runs it daily before
  monitoring (non-fatal on failure); networth.refreshFxFromBoi mutation + FX-page button+banner.
  Verified live against the real BOI endpoint from the sandbox. (c) Growth-share auto-suggest:
  services/growth-heuristic.ts (Hebrew track-name keyword table + wrapper-type defaults; brokerage/IRA
  deliberately return null — never guess); accounts.suggestGrowthShares fills unknowns as
  growthShareEstimated=true; mapping-page bulk button + amber estimate badge + one-click confirm;
  manual entry clears the flag; SnapshotItem.growthShareEstimated (additive, defaulted);
  ALLOCATION_MIX_ESTIMATED INFO finding + bilingual generator (16 generators total).
  (d) Explainer <details> blocks on scenarios + registry pages (he/en); docs/IMPROVEMENTS.md added
  (prioritized owner-review backlog). Migration 20260713110000_m14_income_mode_fx_growth (Goal column +
  AccountDetail.growthShareEstimated). Verified: prisma validate, tsc (api/web/worker/domain/engines),
  engine tests 24+17+8. **Deploys with the same pending push.**
- Owner direction for v1.1 (recorded 2026-07-13): (1) all recommendations in Hebrew — M10;
  (2) edit everything (goals/accounts/members/RE/mortgages/flows) — M11; (3) asset-allocation
  strategy: risk questionnaire as versioned assumptions, whole-net-worth target model with
  rebalanceable-vs-structural gap split — M12; (4) allocation-drift monitoring — M13.
  Allocation stays asset-class level ONLY (never products/securities), per domain rules.

## Previous state (2026-07-06)

- **Milestone: M9 COMPLETE (Monitoring, Phase 4) — FINAL v1 milestone. Four-phase loop closed. Pending owner approval.**
- M9 delivered: new pure `engine-monitoring` (DriftDetector + staleness sweep, 15 tests) comparing the
  current SCHEDULED snapshot to the strategy baseline (net worth / liquid share / top concentration /
  goal coverage; thresholds registry-owned via 4 new `drift_*` assumptions; MEDIUM at threshold, HIGH
  at 2x; items added/removed); staleness sweep flips VERIFIED→STALE by `staleness_days_by_kind`;
  `runMonitoringCycle` service (snapshot→drift→staleness→MonitoringRun+MonitoringAlerts, audited)
  shared by `apps/worker` (one-shot Railway cron) and an in-app manual trigger; `monitoring` tRPC
  router (runNow/runs/snapshots/alerts/acknowledge/reevaluate) with the guarded re-evaluation bridge
  (MONITORING→VERIFICATION or →STRATEGY, facts computed in-tx, alerts resolved); bilingual monitoring
  UI (open alerts + severities, re-evaluate actions, run history, snapshot timeline, journal outcomes);
  new MonitoringRun/MonitoringAlert models + migration 20260706090000_m9_monitoring; monitoring
  integration test (cycle→drift→staleness→re-evaluation) in CI skipIf style. Docs: 06-monitoring.md,
  DEPLOY worker-cron section, README rewrite, docs/SMOKE-TEST.md (full M1–M9 walkthrough).
- M8 delivered: deterministic real-terms projector (annual steps; investable grows at assumption
  return; real estate flat in real terms; mortgage straight-line amortization with CPI-linked
  tracks responding to inflation SURPRISE; income/market shocks; goal outcomes; depletion year;
  documented v1 simplifications incl. payments-inside-expense-flows policy) — 8 tests;
  8 canned scenarios (retire earlier/later, job loss, market crash, high inflation, refinance,
  savings ±) behind workflowGuard(STRATEGY), persisted with baseline snapshot id; comparison UI
  (net-worth milestones + Δ row, lowest-investable point, depletion year, per-goal funded status
  baseline vs scenario). Monte Carlo explicitly deferred — same projector interface.
- M7 delivered: decide() captures expected outcome + implementation date; journal router works in
  ANY phase (recording actual outcomes is a MONITORING activity); bilingual journal history page
  with inline actual-outcome recording; outcome round-trip integration-tested.
- M6 delivered: versioned SnapshotPayload contract + builder (FX recorded, data-quality embedded);
  5 analyzers (liquidity/runway vs emergency target, single-asset + institution concentration,
  currency home-bias/excess, tax-advantaged structural headroom incl. fee drag, mortgage CPI mix +
  expensive tracks) — all pure, threshold-driven from AssumptionRegistry; 11 recommendation
  generators with FULL bilingual structured rationale (why/benefits/risks/tradeoffs/tax/liquidity/
  horizon/sensitivity/alternatives/impact); product-reference validator (Hebrew-aware — note: \b
  fails near Hebrew chars); priority scoring from priority_weights; data-quality gate that REFUSES
  below completeness/confidence thresholds and returns a data-gap report; guarded run pipeline
  (workflowGuard STRATEGY) with reproducibility pins (snapshot + engine version + assumption
  id@version + evidence + goal links), supersede-on-rerun keeping ACCEPTED; decisions journaled;
  strategy UI with full explainability cards. 2 end-to-end integration tests (refusal path +
  full run/decide/rerun path).
- M5 delivered: goal model (11 types, priorities, acyclic dependency validation in domain),
  funding-gap engine (documented pool policy: LIQUID for all goals, RETIREMENT reserved for
  retirement/FI goals; priority-ordered PV allocation; FV projection + annuity monthly-saving
  from the goal_projection_real_return_pct assumption (3% conservative default); verified
  ILS-converted assets only; incomputable goals reported with reasons — 7 engine tests),
  bilingual goal UI with gap dashboard.
- NOTE: tax matrices still PENDING OWNER REVIEW (M4) — owner approved proceeding but has not
  yet confirmed the figures; ownerReviewed stays false.
- M4 delivered: TaxRegistry (versioned, schema-validated, year-keyed accessor; throws on missing
  rules — engines can never guess), IL 2025+2026 matrices seeded with cited sources (income tax
  brackets incl. the March-2026 retroactive widening, credit points, capital gains, hishtalmut
  ceilings, pension ceilings 45a/47, bituach leumi thresholds, purchase tax), AssumptionRegistry
  (7 conservative defaults incl. staleness thresholds + M6 priority weights; household overrides
  create new versions), invalidation (new assumption version → pinned recommendations
  INVALIDATED, integration-tested), bilingual registry UI with sources + review badges.
- Bituach leumi employee RATES intentionally null (sources conflicted) — thresholds verified.
  All matrices flagged ownerReviewed=false until Eran signs off; production DB seeded.
- M3 delivered: verification engine (per-item issues: no/stale valuation by kind-specific
  thresholds, never-confirmed, low-confidence, rejected; household completeness+confidence
  scores; gate logic), missing-docs report derived from ledger composition (pension/hishtalmut/
  gemel/bank/brokerage/mortgage/106 expectations, present/stale/missing), review queue UI
  (verify / reject-with-note / correct-value-append), suspense resolution UI (discard / link to
  existing / create account with raw-data prefill), phase-gate UI with the only workflow
  transition controls, and a full-flow integration test: blocked by unverified item → blocked by
  suspense → resolve → STRATEGY reached, transitions audited.
- M2 delivered: adapter framework (versioned RawDataPayload, registry, Israeli normalization
  utils), deterministic LedgerFactory (canonical vs suspense, never guesses — 8 failure modes
  tested), content-addressed immutable document store on a Railway volume (created via API,
  mounted /data), atomic import orchestration with per-field provenance + re-import matching
  (externalRef+institution → valuation append, no dupes), Israeli account-summary CSV adapter
  (Hebrew header synonyms + product-type lexicon), synthetic fixture corpus (hishtalmut/bank/
  Mislaka-style CSVs + GENERATED visual-order Hebrew pension PDF), IL pension PDF adapter
  (pdfjs text matrix + empirical RTL repair: pdf.js renders visual-order PDFs as full char
  reversal — fixture-verified), bilingual import UI (upload → ownership → report → suspense
  list), and real-PostgreSQL integration tests + CI postgres service (clears M1 debt).
- Key M2 discovery: pdf.js bidi turns visual-order Hebrew PDFs into exact full-line char
  reversal (digits included) — the RTL repair is built and tested around that empirical fact.
- M1 delivered: boundary lint (verified catching violations), initial DB migration applied to
  Railway PG, household/member CRUD, workflow state machine (18 tests incl. exhaustive matrix),
  workflowGuard (blocking-matrix tested), full ledger (accounts w/ Israeli types, real estate,
  multi-track mortgages, cash flow, insurance, loans), append-only valuations, ownership=100%%
  invariant, audit events on every mutation (tested), conservative multi-currency net worth
  (exclusion reporting, never guesses), manual FX rates, full bilingual he/en manual-entry UI.
- M0 was: foundation shell (deployed + pushed).
- **Live:** https://wealthos-web-production-c1f7.up.railway.app — **M9 deployed** (migration
  20260706090000_m9_monitoring applied to prod; 4 drift assumptions seeded; monitoring UI + manual
  trigger live). Deployed via `railway up` from a clean /tmp checkout (the mount corrupted `.nvmrc`
  with null bytes on the first attempt → build failed → redeploy from /tmp succeeded).
- **NEW Railway service `wealthos-worker`** (cron `0 6 * * *` UTC, start `npm run monitor …`,
  DATABASE_URL→Postgres). Created via `railway up --service wealthos-worker` (project token can `up`
  + set vars but NOT `add`/`link`/`whoami`). Config recorded in apps/worker/railway.json. Idle until
  first scheduled run; identical code path to the in-app "Run monitoring now".
- **GitHub: PUSHED — main + all four feat/m9-* branches (owner-supplied PAT). CI GREEN on main
  (cfacbe8): typecheck, lint, prisma validate, and all DB-bound integration tests incl. the new
  monitoring loop (cycle→drift→staleness→re-evaluation) passed against CI Postgres.**
- Railway service `wealthos-web` (1fe5a904), Postgres provisioned, all env vars set.
  Deployed via `railway up` (project token). Empty `Family-Office` service exists — owner to
  either connect the GitHub repo to `wealthos-web` and delete it, or vice versa.
- Design package approved; owner decisions recorded in docs/architecture/00-README.md.
- Verified in sandbox: npm install clean, 13/13 domain tests pass, all packages typecheck,
  `next build` clean (no warnings), server smoke-tested (health, tRPC ping, auth redirect, RTL).
- GitHub: pushed (main + all branches). CI wired. PAT stored in /tmp/.git-credentials (session-only).
- Railway: owner to connect repo + set env vars per docs/DEPLOY.md. Not deployed yet.

## Known technical debt

- feat/m1-lint-boundaries: ESLint boundary rules deferred from M0 (first branch of M1).
- Auth reads env vars (AUTH_EMAIL/AUTH_PASSWORD_HASH); swaps to DB User row in M1.
- No `lint` task wired into turbo yet (comes with lint-boundaries branch).

## Session workflow warnings (Windows mount)

- The user folder mount silently corrupts git atomic writes (`.git/config` was zeroed once) and
  can truncate >250-line Edit-tool writes. **Work in /tmp/wealthos, rsync to the mount,
  never run git write-ops on the mount.** `core.fileMode false` is set on the mount repo.
- Sandbox bash: 45s hard timeout per call; background processes do not survive between calls;
  run npm installs as repeated `timeout 40 npm install` slices (cache resumes).

## Next up — v1 COMPLETE

All four phases shipped (M0–M9); the MAPPING→VERIFICATION→STRATEGY→MONITORING loop is closed.
Post-v1 backlog (architecture already accommodates): real-document adapters per institution, Monte
Carlo, AI copilot (read-only over canonical model), additional countries (registry keyed by country),
per-person auth, connectors (new ValuationSource), estate module deep-dive.

## M9 notes / technical debt

- Baseline = latest PRE_STRATEGY snapshot; goal-coverage drift is a coarse assets/Σrequired tripwire,
  not the M5 funding-gap engine (post-v1 refinement).
- Worker is one-shot (Railway cron model); sweeps all households (family scale: one). Railway cron
  service must be wired per docs/DEPLOY.md (start: monitor script; schedule e.g. `0 6 * * *`).
- `apps/worker` runs TS directly via `tsx` (consistent with the workspace's TS-source packages).
- Sandbox-only: a broken offline pdfjs-dist install (missing bundled types/) can make ingestion
  typecheck + the pension-PDF runtime test fail; a clean install resolves both (CI unaffected).

## M4 notes

- Registry seed runs in preDeploy (idempotent, never overwrites versions).
- Verification thresholds now read from AssumptionRegistry (M3 note resolved).

## M3 technical debt

- Suspense create-from-raw covers ACCOUNT only (matches factory v1 scope).
- Verification page loads full ledger twice (assessment + display) — fine at family scale.

## M2 technical debt (carried)

- Adapter version-bump discipline is convention, not yet CI-enforced.
- PDF adapter is fixture-grade: real institution PDFs will need adapter iterations (expected;
  suspense absorbs unknowns). Mislaka XML adapter awaits real documents.
- Import ownership defaults applied per import run; per-item ownership editing lands with M3
  verification UI. Bituach menahalim product type intentionally unsupported → suspense.
- fileParallelism disabled for DB-bound test suites (shared test DB).

## M1 technical debt (carried)

- Mortgage form supports up to 4 static track rows (no client-side dynamic rows yet).
- Auth still env-var based (swap to DB User row planned).
- next build skips its own TS pass; tsc --noEmit gates types via turbo/CI instead.
