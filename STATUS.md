# WealthOS — Session Status Log

> Read this first in any new session. Update after every meaningful change.

## Current state (2026-07-29, session 31) — M40c part 2 ⚠️ BUILT, GATE NOT YET RUN

- **M40c part 2 — cash-flow timing, dependency graph, Action Center.
  `deploy-m40c-part2.ps1`. ⚠️ CONTAINS A MIGRATION
  (`20260729120000_m40c_action_center`). NO LOCKFILE CHANGE.** Apply after part 1.
- **This completes M40.** Part 1 (un-accept + FX spread) passed its gate and is on main.
- **Cash-flow timing — the first analyzer here that finds no money.** It asks whether
  committed outflows CLUSTER into one month; a household can be solvent across the year
  and still be forced into an overdraft in September. **All three impact columns are
  null** — moving a payment changes *when* cash is needed, never *how much*, and putting
  the relieved amount in the savings headline would claim liquidity as income.
- **Its defining refusal: a statutory date does not move.** The spike is split into
  movable and immovable; **if the whole spike is statutory it emits NOTHING.** A card
  reporting an expensive month while offering no permitted action is how an inbox trains
  the owner to ignore it. Also refuses on thin coverage, on <3 complete months (two
  months give a bigger and a smaller, not a *typical* one), and drops the trailing
  partial month — it looks cheap only because it is short.
- **Dependency graph.** `RecommendationDependency` existed since M36 and was never
  written to. Edges are written in the SAME transaction as the cards, and only when
  **both ends were created in the same run** — a prerequisite that did not fire is a
  *resolved* dependency, not a missing one. **The map is deliberately sparse (one
  edge):** a dependency asserted for tidiness blocks real work for no reason. Blocking
  is **reported, never enforced** — the owner may know something the engine does not.
  **`MEET_STATUTORY_DEADLINE` can never be given a prerequisite** (pinned by a test); a
  lock that delayed one would cause the exact penalty the card prevents.
- **Action Center is defined by STATUS, not origin** — everything committed to, from
  BOTH engines, as one worklist. Not a third inbox: two proposal inboxes already exist
  and a third would just be somewhere else to not decide. Crossing the origin partition
  is deliberate — that partition stops one engine's run superseding the other's
  proposals; it was never about hiding accepted work. A household has one Saturday.
- **Migration `Recommendation.actionStartedAt` (nullable).** Three of the spec's four
  action states already existed (`ACCEPTED` / `IMPLEMENTED` / `REJECTED`) and dismissal
  reasons already had a home in `ActionEvent.dismissalReason`; only "started but not
  finished" had nowhere to live. **Not a new enum value — Postgres will not let a newly
  added enum value be USED in the transaction that adds it, which is exactly how Prisma
  runs a migration**, so it would pass locally and fail on the deploy box. The part-2
  gate now REFUSES any migration containing `ALTER TYPE` for that reason.
  `IN_PROGRESS` := `status = ACCEPTED AND actionStartedAt IS NOT NULL`.
- **A dismissal requires a reason.** Without one, "why did I skip this" has no answer
  six months later and the engine re-proposes the same card into the same silence.
- **NOT BUILT, on purpose:** doc 07 §8 wants a recomputed EOY trajectory in the same
  response as a status change. **That projection engine is M41.** `setStatus` returns the
  genuinely recomputed Opportunity Center totals plus
  `eoyUnavailableReason=EOY_PROJECTION_ARRIVES_IN_M41` rather than an approximation.
- **TWO NEW ASSUMPTION KEYS:** `cashflow_timing_horizon_days` (180) —
  deliberately longer than `calendar_upcoming_window_days`, since two months cannot
  establish a typical month — and `cashflow_peak_month_notice_pct` (40). A new
  assumption version **INVALIDATES pinned recommendations**; rerun the Opportunity
  Center once.
- **Calendar loading widened** to `max(calendarWindowDays, cashflowHorizonDays)`.
  Safe because `analyzeDeadlines` re-filters to its own window internally.
- **Tests:** new `cashflow-timing.test.ts` (13 cases — statutory-only spike refusal,
  movable/statutory split, <3-month refusal, null-amount coverage refusal, materiality
  floor); generator cases pinning null impact columns and the leave-statutory-alone
  action step; dependency-map cases including one asserting every type in the map is a
  type that is actually generated (a typo would enforce nothing — the M38q failure mode).

### Next up — M41
Surplus → deployment-engine hand-off; EOY projection (current vs optimised); monthly
review + close/reopen + `OPERATIONS_REVIEW` snapshot + drift alerts back to Strategy.
**The Action Center's `eoyUnavailableReason` is the seam M41 fills.**

## Current state (2026-07-29, session 31) — M40c part 1 ✅ GATE PASSED, ON MAIN

- **M40c — un-accept control + FX conversion-spread analyzer. `deploy-m40c.ps1`.
  ⚠️ CONTAINS A MIGRATION (`20260729090000_m40c_transaction_original_currency`).
  NO LOCKFILE CHANGE.** Apply after `m40b`.
- **✅ Gate passed and pushed.** The sandbox VM never started this session, so
  `deploy-m40c.ps1` was the only thing that ran the code — as designed, it caught a
  defect (below) and refused to commit until it was fixed.
- **Item 1 — un-accept.** `setStatus` always accepted `PROPOSED`; only the UI gated it,
  and because a run never re-proposes an ACCEPTED type, a mis-click could not correct
  itself either. ACCEPTED/IMPLEMENTED cards now render a revert. **The router now
  journals the revert as `DEFERRED` instead of writing nothing** — previously the
  journal's last word on a reverted item stayed "ACCEPTED", so the audit trail
  contradicted the card.
- **Item 2 — FX spread. The milestone plan's formula was wrong, and silently so.**
  M40 specified `implied rate = amountBase / amount`. The PDF adapter deliberately
  stores the CHARGE in `amount` ("the charge is what hits the account"), so on a
  foreign purchase `amount` and `amountBase` are both the ILS figure and their ratio
  is **always exactly 1.00**. The analyzer would have reported "no markup" forever, on
  every household, while looking like a working feature. The foreign side lives in
  `originalAmount` + `originalCurrency`.
- **Why M40c gained a migration.** `originalCurrency` was always PARSED by the adapter
  and dropped at persistence because nothing consumed it. It is load-bearing:
  `originalAmount` also carries an Israeli **instalment plan's** סכום עסקה, in ILS. A
  ₪1,200-over-12 purchase divides out to a **92% "conversion markup"** — the M40a
  defect shape exactly (correct arithmetic over the wrong input set). Pinned by a
  regression test. Nullable, no backfill: pre-existing rows genuinely do not record
  the fact, and asserting "ILS" for them would invent one.
- **Expect NO FX card after deploying.** Rows imported before the migration have no
  `originalCurrency` and are not conversion candidates. The card appears only after a
  statement with foreign purchases is re-imported AND BOI rates exist for those dates.
  **That silence is the coverage rule working.**
- **Refusals in `fx-markup.ts`** (each with its reason in the file): outflows only;
  no hindsight rates (only a rate published on or before `bookedAt`, max 7 days stale);
  refuse-and-report below `opportunity_min_coverage_pct`; `FINANCIAL_DRAG` excluded so
  a conversion fee is not counted on both this card and the leakage card; a row with no
  reference rate is unpriced, **never** zero markup.
- **`other.unclassified` trap does not bite here** — eligibility is currency and
  arithmetic, never `behavioral`. `behavioral` is read only to push `FINANCIAL_DRAG`
  rows OUT, a conservative exclusion that stays safe when the class is wrong.
- **NEW ASSUMPTION KEY `opportunity_min_coverage_pct` (70)** — generic on purpose, so
  the employer-benefit analyzer reuses the same floor. A new assumption version
  **INVALIDATES pinned recommendations**; rerun the Opportunity Center once.
  `leakage_fx_markup_notice_pct` (1.5) already existed and is unchanged.
- **Gate round 1 caught a wrong TEST, not wrong code** (`fx-markup` coverage-refusal
  case). It spaced four rows one day apart with a single day-1 rate and expected 25%
  coverage — but `RATE_STALENESS_DAYS = 7` deliberately carries a rate forward for a
  week, because BOI does not publish on weekends or holidays. All four priced, coverage
  was 100%, and the analyzer correctly emitted. Rows respaced past the window, and the
  carry-forward is now pinned by its own positive test.
- **Tests:** new `engine-operations/test/fx-markup.test.ts` (18 cases — instalment trap,
  coverage refusal, hindsight-rate refusal, BOI source preference, unclassified row
  still counted, value-weighting, materiality floor); FX generator cases including a
  **second deliberate product-reference violation that MUST throw**, proven per-card
  rather than assumed covered by another card's test; an ingestion test pinning that
  `originalCurrency` survives `pdfRowsToDrafts` — the seam that was dropping it.

### M40c item 3 — CLOSED WITHOUT CODE (owner decision, 2026-07-29)

**Item 3 will not be built. It duplicates an analyzer that already ships.**

- `engine-strategy/src/analyzers/tax-utilization.ts` **already does exactly what item 3
  describes**: per-adult-member `HISHTALMUT_CONTRIBUTION` / `PENSION_CONTRIBUTION`
  totals (via `CashFlowDetail` + `OwnershipShare` → `ownerMemberIds`) against the
  registry `HISHTALMUT_CEILINGS` / `PENSION_CEILINGS`, with months remaining in the tax
  year. It already refuses rather than guesses — a member with no mapped contribution
  flows is simply not assessed, and deposits are never inferred from salary.
- **Doc 07 contradicts itself.** Line 542 says Tax optimization and Pension come from
  *"Existing `engine-strategy/analyzers/*` — surfaced in the operational inbox, **not
  re-implemented**"*; line 547 then asks for a NEW analyzer described identically.
  Building line 547 would put the same unused headroom in BOTH inboxes and count it
  twice in the savings headline — the M40b subscriptions/renegotiation double-listing
  problem, repeated.
- **Correction to the session-31 note above:** it claimed no per-member contribution
  data exists. That was wrong — it checked `FamilyMember` and `Transaction` but not
  `CashFlowDetail` + `OwnershipShare`, which is how strategy already attributes them.
- **What WOULD be genuinely new, if ever wanted:** employer contribution *rate*
  compliance (is the employer paying the statutory rates, is the hishtalmut match being
  captured) — a different question from ceiling utilisation. Blocked on two things:
  `CashFlowDetail` carries ONE `amount` with **no employer/employee split** (needs a
  migration, and form 106 / `TAX_106` is the document that has the split), and the 2026
  rates are still `ownerReviewed=false` with **bituach leumi employee rates deliberately
  null** (sources conflicted). Do not start this without B3 signed off.

### Next up — M40c item 4

4. Cash-flow timing analyzer, dependency graph, Action Center. (`RecommendationDependency`
   already landed in `20260727090000_m36_operations_core` — no migration needed for the graph.)

**Owner decision (2026-07-29): REFUSE-AND-REPORT-COVERAGE** is now implemented generically
as `opportunity_min_coverage_pct` — reuse it in any new analyzer rather than adding a key.

### ⚠️ Lesson worth keeping from this session
A milestone plan written before the data was inspected specified a formula that would
have produced a permanently silent feature. **It failed the same way M40a did — the
arithmetic was fine, the input set was wrong** — but this time it would have failed
*quietly*, with no card to read and nothing to QA. Check the actual column semantics
before implementing a one-line spec.

## Current state (2026-07-29, session 30) — M40b part 1

- **M40b part 1 — commitment policy, renegotiation, materiality floor. `deploy-m40b.ps1`.
  NO MIGRATION. NEW ASSUMPTION KEY `opportunity_min_monthly_base` (25 ILS)** — seeded via
  the existing idempotent preDeploy path, but note a new assumption version **INVALIDATES
  pinned recommendations**; rerun the Opportunity Center once after deploying.
- **Why:** re-QA of `m40a-fix` returned a subscriptions card worth **₪6/month**. Every
  exclusion was individually right; together they gutted the feature. `utilities.subscriptions`
  — the literal *Subscriptions* category — is `FIXED_CONTRACTUAL`, as are `utilities.mobile`,
  `utilities.cloud_software` and `housing.internet_tv`. **Banning that behavioural class
  banned every real subscription the household has.**
- **THE root cause, now fixed properly.** `BehavioralClass` answers *"is this predictable
  enough to budget?"*; the analyzers were asking *"can the household get out of it?"*. Those
  are orthogonal. Using the first as a proxy for the second failed twice in ONE DAY, in
  opposite directions — first offering the **mortgage** for cancellation, then finding ₪6.
- **`packages/domain/src/operations/commitment-policy.ts`** gives the second question its own
  answer, as data, with two independent flags per category prefix (longest wins):
  `cancellable` (stop paying, don't have it) and `renegotiable` (keep it, pay less).
  - **Insurance: renegotiable, NEVER cancellable.** Coverage level belongs to
    `engine-strategy/analyzers/insurance.ts`, which checks for GAPS on the same policy —
    operations proposing cancellation would put two engines in direct contradiction, and
    life cover is frequently irreversible (re-underwriting after aging or diagnosis).
  - **Mortgage: neither.** Refinancing is strategy's `MORTGAGE_ABOVE_BENCHMARK`.
  - Unknown / unlisted categories default to **neither** — never assumed actionable.
- **New `RENEGOTIATE_RECURRING_COMMITMENTS` analyzer** — telecom, mobile, energy, insurance.
  It **estimates no saving and leaves all three impact columns null**: WealthOS has no market
  rate for a mobile plan, and putting current spend into the savings headline would claim the
  whole bill as recoverable — the M40a mistake in a different costume. The card says on its
  face that the figure is spend, not saving.
- **Materiality floor** (`opportunity_min_monthly_base`, applied to a finding's TOTAL so small
  charges can still aggregate). M40a shipped a full bilingual card with three action steps for
  a ₪6 parking charge; reading it cost more than the saving.
- **Tests:** new `packages/domain/test/commitment-policy.test.ts` pins the rule that
  `housing.mortgage` and `utilities.subscriptions` land on OPPOSITE sides while both are
  `FIXED_CONTRACTUAL`; plus renegotiation analyzer tests, a materiality test, and a generator
  test asserting the word "cancel"/"לבטל" never appears on a renegotiation card.

## Next up — M40c (SUPERSEDED — see session 31 above)

> Items 1 and 2 are built (session 31, awaiting the deploy gate). **Item 2's formula
> below is WRONG** — `amountBase / amount` is always 1.00 for a foreign purchase; the
> real pair is `amountBase / originalAmount` guarded by `originalCurrency`. Kept for
> the record only.

M40b part 1 is verified live. **M40c is the remainder of M40**, in this order:

1. **Un-accept control** (small, closes a known gap). `operations.opportunities.setStatus`
   already accepts `PROPOSED`, but the UI only renders actions on PROPOSED cards, so accepting
   is one-way from the screen. Owner hit this during QA.
2. **FX markup analyzer** — implied rate (`amountBase / amount`) vs the `FxRate` on `bookedAt`,
   flagged above `leakage_fx_markup_notice_pct`.
3. **Employer-benefit analyzer** — contribution vs statutory ceiling **per employed member**
   (doc 07 §B.4: per-person, not per-household). Owner confirmed 2026-07-29: **no additional
   income sources beyond the two salaries.** Runs against seeded IL-2026 figures with the
   existing `usesUnreviewedTaxFigures` banner until B3 is signed off at `/registry`.
4. Cash-flow timing analyzer, dependency graph, Action Center.

**Owner decision, applies to 2 and 3 (2026-07-29): REFUSE-AND-REPORT-COVERAGE.** Both read
classifications, and this household's data is largely `FIXED_CONTRACTUAL` or unclassified. They
must state how many rows they could not use and **refuse to emit a figure when coverage is
thin**, rather than lowering a confidence score on a number built from a fraction of the data.
Same posture as the leakage month-exclusion rule.

### ⚠️ Read this before writing either analyzer
`other.unclassified` carries `defaultBehavioralClass: "VARIABLE_DISCRETIONARY"`, so **an
unclassified row is indistinguishable from a discretionary one if you only check `behavioral`**.
That single fact caused two production defects in one day. Any new analyzer must ask whether the
row was actually classified (`categoryKey` vs the suspense bucket), not just read `behavioral`.
And for "what can the household DO about it", use `domain/operations/commitment-policy`, never
`BehavioralClass` — see that file's header for why.

## Current state (2026-07-29, session 30) — M40a-fix

- **M40a-fix — the subscription analyzer offered the owner's MORTGAGE for cancellation.
  `deploy-m40a-fix.ps1`. NO MIGRATION, NO LOCKFILE CHANGE.** Apply after `m40a`.
- **What shipped and what it said.** QA §3 surfaced a card reading *"לבדוק 10 חיובים חוזרים
  בסך ₪16,794 לחודש"*, whose step 2 was *"start with פועלים_משכנתא at ₪15,072/month — the
  biggest decision here"* and step 3 *"cancel directly with the provider."* The mortgage was
  90% of the headline; life and dental insurance were next. The Opportunity Center was
  claiming ~₪201k/year of recoverable saving that does not exist.
- **Cause is structural, not a typo.** `eligible()` was a DENYLIST (excluded TRANSFER and
  SAVINGS_FLOW, passed everything else). `FIXED_CONTRACTUAL` is defined in the schema as
  *"mortgage, arnona, tuition, insurance premiums"* — obligations that are **by construction**
  a stable monthly amount from a consistent merchant, i.e. exactly the shape the clusterer
  hunts for. **A recurring-payment detector that does not exclude unstoppable recurring
  payments will always rank them first, because they are the largest and most regular.**
- **Fix:** eligibility is now an **ALLOWLIST** — only `VARIABLE_DISCRETIONARY` and
  `FINANCIAL_DRAG` can be a subscription. Plus `ledgerItemId === null`: a payment that is
  evidence for a mapped ledger stream is an obligation however regular it looks, and that
  check holds even when the behavioural class is wrong or missing (most likely on a fresh
  import). An **unclassified** row is refused outright — silence beats a confident wrong
  instruction.
- **Transparency half of the fix:** `excludedContractual` / `excludedUnclassified` counts are
  reported in the finding and stated in both rationales, so "why isn't my Netflix here" has a
  visible answer instead of looking like a broken feature.
- **6 new regression tests** pinned to the owner's real July data, including the exact
  ₪15,071.52 `פועלים_משכנתא` row: it must never cluster, and the mixed case must return
  ₪578/month from 2 merchants rather than ₪16,794 from 10.
- **Lesson worth keeping:** the analyzer's arithmetic was right the whole time (annual = ×12,
  EOY = ×6 both checked out in QA). The defect was entirely in *which rows were eligible*.
  A correct calculation over a wrong input set is the most convincing kind of wrong.

### Second defect — the one that SURVIVED the first fix (re-QA, same day)
The mortgage was gone, but the card then offered **`מגדל_מבטחים_חיים` (life insurance,
₪510.23/month)** as "the biggest decision here".

- **`other.unclassified` carries `defaultBehavioralClass: "VARIABLE_DISCRETIONARY"`.** So
  **"we do not know what this is" and "this is discretionary spending" are the same value**
  by the time an analyzer sees it. The `behavioral !== null` guard could therefore never
  fire — an unclassified row is not null, it is *discretionary*. The allowlist had a hole
  exactly the size of the suspense bucket.
- **Why that merchant specifically:** no merchant rule matched `מגדל`. The insurance rules
  key on `ביטוח`; `מבטחים` is the same root in a different form and matched nothing.
  `הראל_ביטוח_שיניים` was excluded in the same run only because `ins.harel` happened to hit.
- **Fixes:** (1) `isProtectedCategory` refuses null, `other.*`, and the `insurance.` /
  `debt.` / `taxes.` / `savings.` / mortgage / vehicle- and home-insurance subtrees
  regardless of behavioural class; (2) six Israeli insurers added to `merchant-rules`
  (`מבטחים`, `מגדל`, `מנורה`, `הפניקס`, `איילון`, `שירביט`) — a classification fix that
  helps every consumer, not just this analyzer.
- **Cross-engine contradiction avoided:** `engine-strategy/analyzers/insurance.ts` checks
  for coverage GAPS. An operations engine proposing cancellation of the same policy would
  put two engines in direct contradiction — and cancelling life cover is frequently
  irreversible, since re-underwriting after aging or a diagnosis is not guaranteed at the
  old rate. Insurance is strategy's territory; operations stays out of it.
- **Generalised lesson (applies to every future analyzer):** a default on the *suspense*
  category is not a neutral default. Any analyzer that reads `behavioral` must also ask
  whether the row was actually classified. Checking for `null` does not answer that question
  in this schema.
- 4 further regression tests, including the exact `מגדל_מבטחים_חיים` row arriving as
  VARIABLE_DISCRETIONARY from the suspense bucket.

## Current state (2026-07-29, session 30) — M40a

- **M40a — Opportunity Center: operational findings → Recommendations. `deploy-m40a.ps1`.
  NO MIGRATION, NO LOCKFILE CHANGE.** Every column M40a writes (`origin`, `cadence`,
  `difficulty`, `reversibility`, `impact*Base`, `expiresAt`) and the
  `RecommendationDependency` table already landed in `20260727090000_m36_operations_core`.
- **Scope decision (owner, this session):** M40 is split. **M40a = the pipeline + 3
  analyzers + Opportunity Center.** M40b = FX markup, employer benefits, cash-flow timing,
  the dependency graph and the Action Center.
- **Architecture decision — which direction the two engines point.** The operational
  analyzers live in `engine-operations/src/opportunities/`, but generation reuses
  `engine-strategy`'s `generators` → `rationale` → `validator` pipeline. To avoid a real
  package cycle, `OpportunityFinding` is **redeclared structurally** in `engine-operations`
  rather than imported from `engine-strategy`; doc 04 sanctions only the
  strategy → operations direction. Structural typing means the findings drop into the
  existing generator with no adapter — and, critically, **one** product-reference validator
  rather than a copy.
- **New files:** `engine-operations/src/opportunities/{types,leakage,subscriptions,deadlines,index}.ts`,
  `engine-strategy/src/generators-operational.ts`,
  `api/src/services/opportunity-service.ts`, `operations.opportunities.*` router,
  `runOpportunitiesAction` / `setOpportunityStatusAction`, Opportunity Center section on
  `/operations`, 40 new i18n keys (parity 1247/1247).
- **Isolation guarantee:** a run supersedes ONLY `origin=OPERATIONAL` proposals. Importing a
  bank statement can never wipe the strategy inbox, and running strategy can never wipe the
  operational one. ACCEPTED/IMPLEMENTED items are not re-proposed (the M25 duplicate-card rule).
- **Where the analyzers refuse rather than guess:**
  - Leakage EXCLUDES any month containing a row with no `amountBase`. Counting it as zero
    would report a *falling* trend on a month that was never measured.
  - Subscriptions are framed as "confirm you still use this", never "you do not use this" —
    WealthOS has no usage telemetry, so the stronger claim would be a guess dressed as a fact.
    A cluster that already stopped charging is NOT flagged; cancelling it would save nothing.
  - Deadline urgency is **proximity, not amount**: a small ceiling closing this week outranks
    a large one closing in two months.
- **B3 handling (owner choice):** the analyzers run against the seeded IL-2026 figures, and
  `usesUnreviewedTaxFigures` drives a visible amber banner whenever any current-year
  `TaxRuleSet` is still `ownerReviewed=false`. The opportunity is real; the amount says it is
  unverified. **Owner action still outstanding: verify IL 2025/2026 at `/registry`.**
- **29 new tests** (18 analyzer, 11 generator), including a **deliberate product-reference
  violation that MUST throw** — the M38q lesson that a rule never seen to fail is
  indistinguishable from one that does nothing.

### ⚠️ This milestone was built without a sandbox verification run
The sandbox VM died mid-session (after all packages had typechecked clean and 29/29 tests
had passed, but before the final web `tsc` following one small JSX fix). Files were written
directly to the mount. **`deploy-m40a.ps1` runs the full gate — typecheck, tests, lint,
i18n parity, `npm ci --dry-run` — and REFUSES to commit if anything fails.** Do not bypass it.

### QA status — M40a/M40a-fix/M40b: VERIFIED LIVE (2026-07-29)
`qa/QA-2026-07-29-m40a-opportunity-center.md`, 13 sections, all ✅ after two rounds of fixes.

- **§6 strategy isolation confirmed with real data:** 9 strategy recommendations before an
  operations run, 9 after. The `origin` partition holds.
- **§3 numbers grounded — FAILED first, and it is the reason both fix rounds exist.** The
  arithmetic was correct throughout (annual = ×12, EOY = ×6 both verified in the same pass);
  what was wrong was *which rows were eligible*. The owner caught it by READING the card, not
  by checking a number. Worth remembering: a correct calculation over a wrong input set is the
  most convincing kind of wrong, and a numbers-only check sails straight past it.
- **M40b verified live:** the renegotiation card returns ₪1,215/month over 5 commitments
  (INSURANCE 1,017.42 + TELECOM 198), shows **no saving figure**, states that the amount is
  current spend, and its insurance step says reprice-the-same-cover rather than cancel.
  Mortgage appears on neither card. Materiality floor suppressed the ₪6 parking card.

### Concurrency hazard hit this session
A second session was working in `/tmp/wealthos` at the same time (the native-binaries
lockfile fix) and reinstalled `node_modules` underneath this one, emptying `.bin` mid-run.
**Two sessions must not share `/tmp/wealthos`.** This session used an isolated clone.

## Current state (2026-07-28, session 29)

- **M38q — the boundary rules actually enforce now. `m38q.patch`.
  NO MIGRATION. ⚠️ LOCKFILE CHANGES (one new devDependency).** Apply AFTER `m38p`.
  - **Root cause of the silent rules:** the plugin could not resolve `@wealthos/*` to a local
    element, because our workspace packages expose only an `exports` map (`"./src/index.ts"`)
    with no `main`, and the bundled `eslint-import-resolver-node@0.3.9` does not read `exports`.
    Unresolved imports are treated as EXTERNAL and skipped — so the entire dependency matrix
    enforced nothing, in either the v5 or v6 syntax.
  - **Fix:** added `eslint-import-resolver-typescript` (dev-only) + an `import/resolver` setting.
    Verified by asserting a deliberate violation IS reported — **a boundary rule that has never
    been seen to fail is indistinguishable from one that does nothing.**
  - **Turning it on surfaced four real violations** that had accumulated while it was silent:
    | Violation | Resolution |
    |---|---|
    | `web → db` ×2 (tRPC context) | `api` now exports the db handle. `Context` needed a PrismaClient but `api` offered no way to get one — the SEAM was missing, not the rule wrong. |
    | `web → engine` (strategy page) | `api` re-exports `deriveTargetGrowthPct`; `web → api → engine` is legal, and duplicating the formula in the UI would let it drift from the engine that produces the plan. |
    | `worker → api` | **Rule widened deliberately**, with the reason in the config: the worker is an application-level caller of the same services the web app uses. Doc 04 predates those services living in `api`. Moving them into an engine is the cleaner long-term option and is recorded as such. |
  - `docs/architecture/04` corrected: it claimed CI fails on violation while that was untrue.
  - **Verified:** full-repo `eslint --max-warnings 0` exit 0 with ZERO violations; deliberate
    violations in two different packages ARE reported; tsc clean (api / engine-operations / web /
    worker); `npm ci --dry-run` exit 0.

### ⚠️ Owner blocked on a stale `.git/rebase-apply`
`git am` left the directory behind after failing on an untracked `docs/SMOKE-M38-final.md`.
Every later `git am` then exits immediately, no commit is created, and `git push` reports
"Everything up-to-date" — which reads as "already deployed" but means "nothing to send".
**Sequence: `git am --abort` → `git am --3way <patch>` → CHECK `git log --oneline -1` → push.**
Deploy scripts already clear this in pre-flight; hand-run `git am` does not.

## Next up — M39 (financial calendar + recurring decisions)
Owner inputs needed: **B3** 2026 hishtalmut / gemel / pension ceilings and contribution rates,
**B4** IL Tax Authority + Bituach Leumi statutory dates. I draft both with sources into a new
registry seed; owner verifies at `/registry` and flips `ownerReviewed`. **B2 (IL 2025) is already
approved; IL 2026 remains unreviewed, including the null bituach-leumi employee rates.**

## Current state (2026-07-28, session 28)

- **M38p — duplicate finder + category/behaviour filters. `m38p.patch`.
  NO MIGRATION, NO LOCKFILE CHANGE.** Apply after `m38n` and `m38o`.
  - **Owner found the same mortgage row stored twice (₪15,081.23 on 2026-07-10).**
    **Cause is mine and structural:** M38l changed the import key format (from the statement's
    אסמכתא to a content digest). Rows imported BEFORE and AFTER that change carry different
    key shapes, so they cannot deduplicate against each other and the same transaction
    persists twice.
  - **`transactions.duplicates` matches on (date, amount, description), NOT on `externalRef`.**
    That is the point: a key-based check cannot find duplicates created BY a key change, and a
    content match survives any future key change too.
  - **`removeDuplicates` VOIDs the later copies, keeping the earliest.** Void rather than delete
    so a false positive is recoverable — a voided row is already excluded from every calculation,
    so deleting would buy nothing and cost the audit trail.
  - **Category + behaviour filters on the transaction list**, as GET params (`?cat=&beh=`) so a
    filtered view is linkable and composes with the month navigation (`?y=&m=`).
  - **Verified:** tsc clean, eslint clean (no warnings), i18n parity 1163/1163,
    `npm ci --dry-run` exit 0.
  - Smoke test for all three: `docs/SMOKE-M38-final.md`.

### Lesson: changing an idempotency key is a data migration
Swapping the `externalRef` format silently created duplicates for anyone who had already
imported. **A key change needs either a backfill of existing rows to the new format, or a
content-based duplicate sweep shipped alongside it.** The sweep now exists; remember the rule.

## Next up — M39 (financial calendar + recurring decisions)
Statutory figures still depend on owner verification of B3/B4 (2026 ceilings, IL tax and
bituach-leumi dates) at `/registry`. Also outstanding, in priority order:
1. **Boundary rules are not enforcing cross-package imports** (see session 27) — needs an import
   resolver; `docs/architecture/04` currently overstates what CI checks.
2. `us-bank-chase-csv` adapter when the Chase export arrives.
3. OZ re-export after the 30th will add the second July salary.

## Current state (2026-07-28, session 27)

- **M38o — month navigation + eslint-boundaries v6 migration. `m38o.patch`.
  NO MIGRATION, NO LOCKFILE CHANGE.**
  - **Month navigation (owner request).** `period.current` now takes an optional
    `{year, month}`; new `period.months` lists every month that actually holds
    transactions, with row counts. UI adds prev / "this month" / next plus one chip per
    month-with-data, so navigation offers real months rather than an unbounded calendar.
    Driven by `?y=&m=` so a month is linkable and survives a refresh.
  - **eslint-plugin-boundaries v6 object selectors (owner request).** The deprecation
    warning on every lint run is gone. Correct shape is
    `{ from: [{ type: "x" }], allow: [{ to: [{ type: [...] }] }] }` — note `type`, not
    `elementType`, and `allow` wraps a policy object around `to`.

### ⚠️ FINDING: the boundary rules are NOT actually enforcing cross-package imports
While verifying the migration hadn't weakened anything, I tested a deliberate violation
(`engine-operations` importing `ingestion`) and **neither the old nor the new config flags it** —
via the package name OR via a relative `../../ingestion/src/...` path. So this is a
**pre-existing gap, not a regression from the v6 migration**, but it matters:
`docs/architecture/04-module-decomposition.md` states "Enforcement: `eslint-plugin-boundaries`;
CI fails on violation", and **that is currently untrue.**

What still DOES work: the `no-restricted-imports` purity rule on `packages/domain` (verified —
it catches `@wealthos/db` from domain). So domain purity is enforced; the wider dependency
matrix is not.

Likely cause: the plugin cannot resolve `@wealthos/*` (or relative cross-package paths) to a
local element without an import resolver, so those imports are treated as external and skipped.
Probable fix: add `eslint-import-resolver-typescript` and point boundaries at it, or declare the
workspace packages via `boundaries/alias`. **Deliberately NOT attempted here** — it needs a new
dependency and a lockfile change, and shipping it untested alongside two other changes is how
the silent faults in this module happened. Treat as the next piece of work.

Every architectural decision made on the basis of these boundaries (moving the category tree and
the Hebrew primitives into `domain`, keeping `engine-operations` off `ingestion`) is still
correct by design — it simply was not machine-checked.

## Current state (2026-07-28, session 26)

- **M38n — pending card charges are reported, not hidden. `m38n.patch`.
  NO MIGRATION, NO LOCKFILE CHANGE.** Owner decision 2026-07-28.
  - **Owner asked why 3 pending transactions "are not calculated".** They were excluded by
    design (an in-process card charge has not settled, so counting it breaks reconciliation
    against the bank) — but they were also **invisible**, which is why it read as a bug.
  - **Resolution (owner chose): keep them out of the settled totals, but SHOW them.**
    `MonthlyCashFlow` gains `pendingCount` / `pendingAmountBase`; the surplus card renders
    "בתהליך קליטה, טרם חויב: ₪X (N תנועות)" explaining they will count when the issuer bills.
  - **Safe-to-Spend now SUBTRACTS them.** They are not in `expensesBase` (unsettled), but they
    are committed — the issuer will bill them — so leaving them out overstated genuinely free
    cash. This is the one place a pending charge must reduce a figure.
  - **Verified:** engine-operations 73 tests (3 new), tsc clean, eslint clean,
    i18n parity 1153/1153, `npm ci --dry-run` exit 0.

### ⚠️ STALE DATA IN THE OWNER'S DB — diagnosed from the new diagnostics panel
The panel showed July rows that the CURRENT code cannot produce:
`פיין מרקט 96.70` and `מינימרקט 130.85` stored **positive** (income) while `536.31-` from the
same CAL statement is correctly negative; and dates of **2026-07-01** where the CAL statement
bills 26–27/07. Parsed fresh, all three are negative and correctly dated. Two settlements of
card 6170 also carry opposite signs. **These are rows imported before the sign fixes; the reset
either predated the fix or that file was not re-imported.** Owner must run
`DELETE ALL` → re-upload everything on the current build before any figure can be trusted.

### The diagnostics panel worked
It ended a multi-round loop in one screenshot: the question stopped being "is the parser right"
(it is — every statement reconciles) and became "what is actually stored", which is answerable.
**Ask for that panel before changing code when a displayed figure is disputed.**

## Current state (2026-07-28, session 25)

- **M38m — read-only diagnostics panel. `m38m.patch`. NO MIGRATION, NO LOCKFILE CHANGE.**
  - **Why this exists.** The loop that kept repeating: fix the parser → owner re-imports →
    figures unchanged → and **no way to tell whether a row is missing, mis-signed,
    mis-classified, excluded as a TRANSFER, or excluded for a missing FX rate.** I was
    diagnosing from parser output while the owner was looking at database state, and those
    two had drifted apart repeatedly. Verifying the parser proves nothing about what is
    actually stored.
  - **`operations.diagnostics.month`** returns every transaction in the DB for a month with
    amount, status, source, behavioural class, category, classification method and confidence,
    plus counts for the four buckets that decide whether a row reaches the totals at all:
    booked / pending / voided, income rows, TRANSFER rows (excluded from BOTH sides),
    SAVINGS_FLOW rows, and rows with no `amountBase` (which make the whole period refuse).
  - **UI:** collapsible "אבחון" inside the month card. Excluded rows are greyed and the last
    column states WHY ("no — transfer", "no — missing FX rate", "no — PENDING"). One look
    answers "is the salary there, and if so why isn't it counted".
  - **Verified:** tsc clean, eslint clean, i18n parity 1151/1151, `npm ci --dry-run` exit 0.

### Standing instruction for this module
**Do not diagnose an Operations figure from parser output alone.** The parser is verified
against the real files (`/tmp/all.mts`, `/tmp/oz.mts`, `/tmp/e2e.mts` — all reconcile). When a
displayed figure disagrees, the question is what is IN the database, and the diagnostics panel
is the only thing that answers it. Ask the owner for that panel before changing any code.

## Current state (2026-07-28, session 24)

- **M38l — the import key silently discarded 73 of 111 bank rows. `m38l.patch`.
  NO MIGRATION, NO LOCKFILE CHANGE.**
  ⚠️ **Owner must UNDO the bank import and re-import** — the missing rows were never stored.
  - **THE BUG BEHIND "where is July's income".** `buildExternalRef` returned
    `ref:<אסמכתא>` whenever a reference existed. But **FIBI's אסמכתא is an OPERATION-TYPE
    code, not a transaction id**: `13795` appears on **41 different rows**, `99411` on 7.
    111 real transactions collapsed to **38 unique keys**, and the
    `@@unique([householdId, externalRef])` constraint discarded the other **73 as duplicates**.
    The app reported "38 כבר יובאו" — which matched exactly and was the clue.
    **July's salary (₪70,711.40, ref 99411) collided with January's (₪36,986.94, same ref);
    January won, July's salary was never stored.** No error, no suspense entry, nothing logged.
  - **Fix:** the key is a digest of **date + amount + description + reference**, never the
    reference alone. Stable across re-imports (overlapping ranges still deduplicate) and
    distinct per transaction. **111 rows now yield 111 distinct keys, 0 dropped.**
  - **`withOccurrences`** disambiguates genuinely identical rows — two identical coffees on
    one day are two transactions, not a duplicate — by position within the file, so a
    re-import of the same file produces identical keys.
  - **Two old tests asserted the broken behaviour** ("prefers the statement's own reference")
    and were rewritten to encode the correct rule, including the January-vs-July salary case.
  - **Verified:** ingestion 124 tests, engine-operations 70, tsc clean, eslint clean,
    `npm ci --dry-run` exit 0. Card statements still reconcile exactly
    (5,611.17 / 2,708.38 / 3,610.09); OZ CSV 27 rows; bank 111 rows.

### The recurring shape of every fault in this module
Five now: RTL repair fixing a non-existent problem; balances imported as expenses; card
charges imported as income; a transfer rule swallowing a salary; and now an import key that
discarded two thirds of a file. **Every one was silent** — no exception, no log, a plausible
number on screen. The only things that have ever caught them are (a) reconciling against a
total the document states about itself, and (b) counting rows in vs rows out. Both are cheap.
**Prefer a check the data can fail over a check the code can pass.**

## Current state (2026-07-28, session 23)

- **M38k — classifier picks the HIGHEST-CONFIDENCE rule, not the first. `m38k.patch`.
  NO MIGRATION, NO LOCKFILE CHANGE.** ⚠️ **Run "סיווג וחישוב מחדש" after deploying** — it
  re-classifies existing rows.
  - **Owner-reported "where is the income?" — July showed ₪3.91.** Found a real fault while
    checking it: rule selection returned the FIRST matching rule, so a broad low-confidence
    rule could beat a specific high-confidence one purely by sitting earlier in the array.
    **`"העברה משכורת"` matched the generic transfer rule (0.6) before the salary rule (0.95)
    and was booked as a TRANSFER — and transfers are excluded from BOTH income and expenses,
    so an entire salary vanished from the month's totals with no error, no suspense entry and
    nothing in the logs.** That phrasing is common on Israeli bank statements.
  - **Fix:** highest confidence wins; ties keep array order so deliberate ordering still works.
    Confidence already encodes specificity, so this makes rule ORDER irrelevant and removes the
    whole class of silent mis-classification rather than reshuffling one rule.
  - **Why it is dangerous in this codebase specifically:** TRANSFER is the one class that is
    excluded from both sides of the ledger (it exists to stop card settlements double-counting).
    A wrong TRANSFER is therefore invisible — it does not overstate or understate a category, it
    removes the money entirely. Any future rule touching TRANSFER deserves the same scrutiny.
  - **Verified:** engine-operations 70 tests (4 new), tsc clean, eslint clean,
    `npm ci --dry-run` exit 0.

### Owner's remaining July gap is data, not code
The bank file's 111 rows were previewed but NOT imported ("38 כבר יובאו" of 111). Parsed
directly, that file shows **July income ₪90,920.86**. After deploying: import the previewed
bank file, then "סיווג וחישוב מחדש". The "מצרפי בלבד" banner means a card settlement had no
matching detailed statement yet — expected until the card statements for that period are in.

## Current state (2026-07-28, session 22)

- **M38j — re-uploading an existing file no longer reports a failure. `m38j.patch`.
  NO MIGRATION, NO LOCKFILE CHANGE.**
  - **Owner-reported "the upload failed" — but the parse was perfect.** The screenshot showed a
    red "השמירה נכשלה" banner sitting directly above a fully working preview: 113 rows read,
    111 usable, 88 expenses / 23 income, correct Hebrew, import button ready. The file was
    already stored (it was in the pending list), so `documents.upload` threw
    `CONFLICT: DUPLICATE_DOCUMENT` and the batch reported zero successes.
  - **Correct for storage, wrong as UX.** Never storing the same bytes twice is right;
    reporting it as a failure is not. `documents.upload` gains
    `onDuplicate: "ERROR" | "REUSE"` — **default "ERROR", so every existing caller is
    unchanged** — and the statement path passes "REUSE", returning the stored document with
    `duplicate: true`. The UI says "N of them were already stored — showing the existing copy"
    and opens its preview.
  - **Bonus fix in the same path:** a REUSE hit now stamps a `docType` that was missing.
    Files uploaded before the statement-type selector existed have none, and that field drives
    the card outflow-sign rule — so simply re-uploading them with the type chosen now repairs
    them, instead of failing.
  - **Verified:** api 12 tests, tsc clean, eslint clean, i18n parity 1142/1142,
    `npm ci --dry-run` exit 0.

### Pattern, now three times over
Three consecutive owner-reported "failures" were **generic error text hiding a benign or
one-line cause**: an unlisted docType, a validation rejection, and now a duplicate.
**A failure message that does not name its cause costs a full round-trip every time.**
Prefer: propagate the real reason, and prefer recovering over reporting when the situation is
benign.

## Current state (2026-07-28, session 21)

- **M38i — OneZero CSV + separate-settlement reconciliation. `m38i.patch`.
  NO MIGRATION, NO LOCKFILE CHANGE.** Both owner-reported, both diagnosed by running the
  actual files through the actual code path.
- **ALL FOUR CARD STATEMENTS NOW RECONCILE EXACTLY** to the totals their issuers print:
  1069/07 = 5,611.17 · 1069/02 = 2,708.38 · 7796/07 = 3,610.09 · CAL 1401 = 11,709.80.
  Bank: 111 rows. OneZero CSV: 27 rows, 0 issues, 7 income / 20 expenses.

  ### 1069_02 "does not reconcile" — the CHECK was wrong, not the parse
  Isracard splits a statement into the month's billing **and a trailing section of
  transactions settled straight to the bank on their own date**
  ("חיוב בחשבון הבנק ב-11.01.26 - עסקה אחת:"). A ₪247.26 refund sat there, deliberately
  OUTSIDE the ₪2,708.38 billed total. Reconciling the whole file therefore failed by exactly
  that row. Rows under that heading are now marked `separateSettlement` — **still imported**
  (they are real transactions on their own dates) but excluded from the monthly reconciliation.
  The 10 billed charges sum to 2,708.38 exactly.

  ### OneZero CSV "cannot read / cannot map" — three stacked faults
  1. **Month-first dates.** The file uses US `07/15/2026`. Parsed day-first, month 15 is
     invalid, EVERY row fails, and the import yields zero usable rows — which reads as
     "the tool cannot read this file". `detectDateOrder()` now settles the column from one
     unambiguous sample (a component > 12), defaulting to the Israeli DMY when ambiguous.
  2. **`חיוב/זיכוי` matched BOTH the debit and credit synonyms**, so the guesser chose
     DEBIT_CREDIT mode and looked for numbers in a column containing WORDS. One header
     matching both is now recognised as a **direction indicator**: mode stays SIGNED and the
     stated direction signs the amount (authoritative over the sign, which some exports omit).
  3. **The reference was folded into the description**, where `redact()` correctly but
     unhelpfully saw "25-21416640" as an account number and replaced the visible text with
     `[ACCT]`. The reference is kept for `externalRef` only.

  ### Third bidi lesson: `repairVisualOrderMixed`
  A cell like `13795992/1069/מ"עב טרכארשי` defeats BOTH earlier repairs — full character
  reversal fixes the Hebrew but reverses the digits ("1069" → "9601"), and whitespace-token
  reversal breaks a token containing both. The correct transform is **run-based**, which is
  what bidi reordering actually is: split into Hebrew and non-Hebrew runs, reverse the ORDER
  of runs, reverse characters only INSIDE Hebrew runs. Digits keep their internal order.
  This also restores the card number to a position where settlement dedup can find it —
  `parseSettlementLine` now accepts a mid-string card number (OneZero) as well as a trailing
  one (FIBI), still requiring an issuer name first so it can never suppress a real expense.

  - **Verified:** ingestion 121 tests, domain 52, api 12, tsc clean, eslint clean,
    i18n parity 1141/1141, `npm ci --dry-run` exit 0.

### Standing method
`/tmp/e2e.mts`, `/tmp/all.mts` and `/tmp/oz.mts` run the owner's real files through the real
code path and reconcile against the totals the documents state about themselves. **Every fault in
this module has been found that way and none by inspection.** Re-run them whenever the parser or
mapping changes.

## Current state (2026-07-28, session 20)

- **M38h — card-statement uploads were rejected by validation. `m38h.patch`.
  NO MIGRATION, NO LOCKFILE CHANGE.**
  - **ROOT CAUSE (owner-reported: "השמירה נכשלה" on every card file, bank files fine).**
    `DocTypeSchema` in `routers/documents.ts` lists `BANK_STATEMENT` but had **no
    `CARD_STATEMENT`**. The M38f statement-type selector sends `CARD_STATEMENT`, Zod rejected
    it, every file in the batch failed, and `uploadStatementAction` reported the generic
    "all failed" banner. Bank uploads worked because their value happened to be in the enum —
    which made it look like a problem with the card FILES rather than a one-word omission.
  - **The generic error banner was the second bug.** `uploadStatementAction` swallowed each
    per-file exception into a name list and surfaced only "save failed", so a plain validation
    rejection was indistinguishable from a parse failure or a size limit. It now carries the
    first real error message through to the UI ("None of the N files could be uploaded.
    Reason: …"). **A failure whose message hides its own cause costs a full round-trip.**
  - **Drift guard added** (`packages/api/test/doc-types.test.ts`, mock-free): asserts every
    statement kind offered by the Operations upload form parses under `DocTypeSchema`. This
    exact class of mismatch — UI offering a value the schema does not accept — is now caught
    by CI instead of by the owner.
  - **Verified:** api 12 tests (3 new), ingestion 116, tsc clean, eslint clean,
    i18n parity 1141/1141, `npm ci --dry-run` exit 0.

### Pattern worth remembering
Two consecutive faults now have had the same shape: **a value the UI sends that the backend
never accepted** (docType), and **a rule that depended on owner-declared metadata that did not
exist yet** (allOutflow). Both were invisible because the failure surfaced as a generic message.
Prefer deriving behaviour from the artefact's own content, and always propagate the underlying
error text.

## Current state (2026-07-28, session 19)

- **M38g — card-sign safety net + full import reset. `m38g.patch`. NO MIGRATION, NO LOCKFILE CHANGE.**
  - **ROOT CAUSE of "expenses still look like income".** `allOutflow` was applied ONLY when the
    owner *declared* the file a card statement — but the type selector shipped in M38f, AFTER
    those files were uploaded, so their `docType` was null and every charge imported positive.
    Two fixes: (a) **`looksLikeCardStatement()` detects a card file from its HEADERS** (a charge
    column + a merchant column, and crucially NO זכות/חובה pair) and forces outflow regardless of
    what was declared; (b) the same rule now runs in **preview as well as commit** — previously
    preview and commit could disagree, so the preview showed signs the import would not produce.
    **Proved on the real HTML: mis-declared as BANK → 70 income (wrong); with the net → 70
    expenses + 1 refund (right).**
  - **Direction summary in the preview**: "N expenses (₪X) · M income (₪Y)", with an explicit
    warning when EVERY row is income — which for a card statement always means an inverted sign.
    A sign error is now visible *before* importing rather than discovered in the ledger.
  - **Danger zone: `import.resetAll`** — deletes every imported transaction, import batch and
    uploaded statement document so importing can start clean. Requires typing `DELETE ALL`.
    **Manually-entered transactions are deliberately KEPT** (`source: "IMPORT"` filter): they were
    never part of an import and re-typing them would be real lost work. Operating periods are
    cleared too, since their frozen figures were computed from the deleted rows.
  - **Verified:** ingestion 116 tests (3 new), tsc clean, eslint clean, i18n parity 1140/1140,
    `npm ci --dry-run` exit 0.

### Owner workflow after deploying this
1. Import card → **אזור מסוכן** → type `DELETE ALL` → wipe.
2. Re-upload, choosing the statement type. Bank statements first, then cards.
3. Check the preview's **reconciliation line** (green = matches the issuer's printed total) and
   the **direction summary** before pressing import.
4. Recompute. Card settlements dedup automatically against the bank's aggregate lines.

### Why this kept recurring
The sign rule depended on owner-declared metadata that did not exist when the files were
uploaded, and preview did not share the commit path's logic. **Detection now derives from the
file's own content, and preview and commit run the same code.**

## Current state (2026-07-28, session 18)

- **M38f — statement import verified E2E against the REAL files. `m38f.patch`.
  NO MIGRATION, NO LOCKFILE CHANGE.** ⚠️ **Owner must UNDO all previous imports and re-import.**
- **ALL THREE CARD STATEMENTS NOW RECONCILE EXACTLY TO THE TOTAL THE ISSUER PRINTS ON THEM.**
  This is the headline: correctness is no longer asserted, it is *proved* by the issuer's own
  arithmetic. Measured: card 1069 −5,611.17 vs printed ₪5,611.17; card 7796 −3,610.09 vs
  ₪3,610.09; CAL 1401 −11,709.80 vs ₪11,709.80. Bank: 111 rows, 23 income / 88 expense,
  **7 monthly salaries recovered**, **0 direction conflicts** against the bank's own סו"פ codes.

  ### Owner-supplied domain facts (2026-07-28) — now encoded
  Two statement kinds only: **CARD** (charges; income only as a minus-signed refund) and
  **BANK** (both directions). Declared at upload, never inferred — sign conventions differ and a
  wrong guess flips every row. Card columns: סכום עסקה = full deal, **סכום חיוב = the charge for
  this period (already NET of any הנחה — owner-confirmed, so the discount is recorded but never
  subtracted)**, מס שובר = txn no, פירוט נוסף = metadata. Bank: זכות = income, חובה = expense,
  יתרה = balance, אסמכתא = txn no, תאריך ערך = actual date; **סו"פ 162 = expense, 222 = income,
  271 = ATM**, now used as an independent cross-check that FLAGS (never overrides) a disagreement.

  ### Four faults the reconciliation check exposed — each invisible to inspection
  1. **Refunds lost.** `−₪603.00` uses **U+2212**, not ASCII `-`; the sign test ran before
     normalisation, so every refund imported as another charge.
  2. **Whole rows dropped.** Merchant text at x≈474 sits nearer the *date* header (504) than the
     *description* header (438); pure geometry swallowed it, destroying the date and dropping the
     row. **₪1,798 missing from one card.** Fixed by making dates and money **content-identified**,
     with geometry only as a tiebreak.
  3. **Discount read as the charge.** A fully-discounted card fee (charge ₪0.00, הנחה ₪14.18 in
     the far-left zone) imported as a ₪14.18 expense. Money left of the reference column is
     metadata, never the charge.
  4. **Split amounts truncated.** CAL renders "₪130." + "85" as two items; the fragment is not
     money on its own, so the charge parsed as "130." and the row was lost. Adjacent numeric
     fragments are now absorbed.
  Also: the HTML grid repair used a **full character reversal**, which fixes Hebrew but reverses
  DIGITS — instalment "12 מתוך 12" became 21/21. Now token-order repair, which preserves numbers.

  ### Permanent safeguard
  **`findStatementTotal` + reconciliation is now part of every PDF import.** The preview shows
  green when the parsed rows match the issuer's printed total and RED with both figures when they
  do not, telling the owner not to import. It catches dropped, duplicated and sign-flipped rows
  without needing to know the cause — it found all four faults above.

  ### Also in this patch
  - **Card-settlement dedup wired** (`settlement-service.ts`): a bank aggregate card-bill line
    ("ישראכרט בע\"מ - 6170") becomes a TRANSFER **only** when itemised transactions for that
    card's last 4 exist and reconcile within tolerance; otherwise the aggregate STANDS, because
    suppressing it would silently delete real spending. Runs after every import and on recompute,
    so a card statement imported *after* its bank line still retro-actively suppresses it.
  - **Card CSV/HTML forced to outflow** — the "numbers are opposite" report. 71 HTML rows now all
    negative, instalments correct.
  - **No more scroll-jump**: every action redirects to an anchor (`#tx-<id>`, `#month`,
    `#suspense`, `#import`) instead of the top of the page.
  - **Verified:** ingestion 113 tests (7 new regressions carrying REAL cell coordinates), tsc
    clean, eslint clean, i18n parity 1134/1134, `npm ci --dry-run` exit 0.

### Method lesson (the important one)
Every earlier fault survived because tests used fixtures I wrote from my own *description* of the
files. **Run the real artefact through the real code path and reconcile against a number the
document states about itself.** `/tmp/e2e.mts` does exactly that and should be re-run whenever the
parser changes.

## Current state (2026-07-28, session 17)

- **M38e — PDF import rebuilt against the REAL files. `m38e.patch`. NO MIGRATION, NO LOCKFILE CHANGE.**
  **⚠️ Owner must UNDO all previous PDF imports and re-import.**
  - **METHOD CHANGE THAT MATTERS: the parser was finally run against the owner's actual PDFs**
    (`npx tsx` probe over the uploads, output inspected row by row). Three consecutive mis-parses
    shipped because every earlier test used SYNTHETIC fixtures built from my own *description* of
    the files rather than the files themselves. Fixtures now carry real cell coordinates.
  - **THE BIG ONE: pdfjs returns Hebrew in CORRECT LOGICAL ORDER.** All the "RTL repair"
    machinery (`repairVisualOrder`, per-word repair, orientation scoring, lexicon tie-breaks)
    was built to fix a reversal that came from **pdfplumber — the Python tool I analysed with —
    not from pdfjs, which is what actually runs.** It was corrupting text that was already
    correct. **No character reversal happens in the PDF path any more.**
  - **The real defect was WORD ORDER, not character order.** Cells were joined in ascending x,
    but Hebrew reads right-to-left: «בעמ-מ» «העתקות» «גרמושקה» became "בעמ-מ העתקות גרמושקה" —
    every word right, order reversed. Hebrew now joins DESCENDING x. Numbers stay ASCENDING and
    are joined with NO separator, because producers split them ("₪130." + "85"); joining those
    RTL yields "85 ₪130." and parses as 85.
  - **New `pdf-table.ts` replaces the line heuristic for all PDFs.** Header located by Hebrew
    labels, columns by x, cells assigned nearest-wins (a tight tolerance silently dropped the
    date column, which is what produced zero rows). Bank: debit→negative, credit→positive,
    balance never a movement. Card: charge column, always an outflow unless an explicit minus.
    Foreign originals captured ($10.00 → ₪29.79). Two-digit years accepted locally.
  - **Description assembly is layout-specific** (verified against the files): BANK takes the
    letters line ABOVE plus the numeric line BELOW ("משיכת שיק" + "1750400"); CARD takes the
    inline merchant only, with the lines beneath ("הוראת קבע", "הנחה") used as CONTEXT for
    recurring/instalment detection, not glued onto the name.
  - **Headerless statements (Visa CAL) derive columns from the data.** The description column is
    derived only from cells CONTAINING LETTERS — averaging all middles pulls it onto the
    split-amount fragment and drops most rows (41→13 in the real file).
  - **`allOutflow` added for tabular imports.** Card CSV/HTML lists charges as POSITIVE numbers,
    so every card expense was importing as income — the owner's "numbers are opposite" report.
  - **Measured against the real files:** FIBI bank 111 rows / 1 unparsed (salary +36,986.94 now
    correct); Isracard 1069 12 rows, 7796 18 rows; CAL 74 rows. Hebrew readable throughout.
  - **Verified:** ingestion 99 tests (14 new, real coordinates), tsc clean, eslint clean,
    i18n parity 1128/1128.

### Lesson recorded
**Never validate a parser against fixtures derived from a different tool's output.** The
pdfplumber-vs-pdfjs mismatch cost three shipped mis-parses. Run the real artefact through the
real code path and read the output.

## Current state (2026-07-27, session 16)

- **M38d — bank-PDF column parser + undo import. `m38d.patch`. NO MIGRATION, NO LOCKFILE CHANGE.**
  **⚠️ Owner must UNDO the earlier bank-PDF imports — those rows are wrong.**
  - **DATA-INTEGRITY BUG (owner-reported, worst so far).** The generic line parser took
    "the first amount" on a bank line. But a FIBI row is a TABLE:
    `תאריך | סופ"פ | אסמכתא | יתרה | חובה | זכות | תיאור`, e.g.
    `01/01/2026 | 222 | 99411 | 33001.18 (BALANCE) | — | 36986.94 (CREDIT) | משכורת`.
    The heuristic grabbed **33001.18, the running balance**, signed it negative, and
    **discarded the 36,986.94 salary credit entirely.** Symptoms the owner saw: income showing
    ₪2,108 (all real credits lost) and variable spend at −₪45,265 (balances imported as
    expenses), plus numeric-only descriptions (reference columns bled into the description).
  - **Fix: `pdf-bank-table.ts` — column-aware parsing.** New `extractPdfCellLines` keeps each
    text item's **x coordinate** (the old extractor threw it away, which is precisely why the
    numbers were indistinguishable). The header row is located by its Hebrew labels after RTL
    repair, each label's x defines a column centre, and every cell is assigned to its nearest
    column. Debit → negative, credit → positive, balance kept as metadata and **never** treated
    as a movement.
  - **It REFUSES rather than guesses.** If the columns cannot be identified, the bank path
    returns zero rows and says so — it does **not** fall back to the line heuristic. Importing
    plausible-but-wrong numbers into a household ledger is strictly worse than importing nothing.
  - **Undo import** (`import.undo` + history UI). A real DELETE, not a VOID: a bad import is not
    evidence of anything. Removing the batch returns the document to the pending list so it can
    be re-imported cleanly once the parser is right (dedupe is keyed on `externalRef`, which
    goes away with the rows).
  - **Verified:** ingestion 95 tests (10 new, covering exactly the balance-vs-credit bug),
    engine-operations 66, domain 49, tsc clean, eslint clean, i18n parity 1127/1127.

### Lesson recorded
Card statements are line-shaped; bank statements are table-shaped. A heuristic that reads
"an amount" from a line **cannot** be correct on a table with balance + debit + credit columns,
and its failure mode is silent and plausible. Column geometry must be reconstructed, or the
parser must refuse.

## Current state (2026-07-27, session 15)

- **M38c-fix3 — `m38c-fix3.patch`. NO MIGRATION, NO LOCKFILE CHANGE.** All owner-reported.
  - **"Import all" only saw SOME files.** `pending` listed the **newest 25** documents then
    filtered out imported ones; `commitAllPending` iterated the **oldest 25**. Opposite
    orderings, so the two operated on **different sets** — with older documents filling the
    window, the newly uploaded PDFs were never reached, which is why 14 files produced
    "0 imported, 6 need attention". Both now use one exact relation filter
    (`batches: { none: { status: "COMPLETED" } }`) with no pagination, so the list and the
    action are the same set by construction. Result also returns `considered`, so the numbers
    on screen reconcile (`considered = imported + skipped`).
  - **PDF descriptions carried debris.** Voucher/terminal numbers, leftover date fragments and
    orphaned punctuation were left in the merchant name — which read badly AND defeated
    merchant-key grouping. New `cleanDescription()` strips 4+ digit runs, date fragments and
    edge punctuation.
  - **Mixed-direction Hebrew.** Per-LINE orientation choice cannot fix a line where one word is
    reversed and the next is not. Added `repairHebrewWords()` in domain — per-word judgement
    using the final-letter invariant plus a lexicon. Merchant vocabulary added to
    `IL_STATEMENT_LEXICON` (מינימרקט, שוק, מסעדה, דלק…) because words with **no final form are
    orthographically undecidable** and the lexicon is the only available signal.
    **Residual limit, tested and documented:** on a mixed line, an unknown word with no final
    letter can still land reversed. Editing the row fixes it, and the merchant key stays stable
    either way, so grouping still works.
  - **Suspense queue rebuilt as cards.** Was a cramped table that clipped its text. Now shows
    **the amount** (it was missing entirely — the single most useful signal when deciding what
    a transaction was), date, current category and confidence, with a roomy form beneath.
  - **Category picker is ONE control again.** Its history: plain `<select>` (a wall of options)
    → search only (lost browsing) → search + select side by side (duplicated clutter, per owner)
    → **single `<input list>` + `<datalist>`**: typing filters, the arrow reveals the full list.
    Browse and search in one field, still no client JS. A hidden field preserves the current
    category when the box is left untouched.
  - **Verified:** ingestion 85 tests (7 new), engine-operations 66, domain 49, tsc clean, eslint
    clean, i18n parity 1121/1121.

### Standing note on patch delivery
The owner sometimes pushes a phase while the next fix is being prepared. **Always re-check
`origin/main` and rebase the fix as its own patch** rather than amending an already-pushed commit.

## Current state (2026-07-27, session 14)

- **M38c-fix2 (PDF preview blank + Import all) — `m38c-fix2.patch` on b1a032d.
  NO MIGRATION, NO LOCKFILE CHANGE.** Owner-reported: clicking Preview on an uploaded PDF
  showed nothing at all — no preview section, no import button.
  - **Root cause 1 — the failure was invisible by construction.** The page did
    `trpc.operations.import.preview(...).catch(() => null)`, so ANY error rendered an empty
    card, which looks exactly like "the feature does not exist". Now the error is caught,
    displayed, and the raw message shown verbatim so it can be reported. **Never swallow an
    error whose only visible effect is an empty UI.**
  - **Root cause 2 — pdfjs was being bundled.** `@wealthos/ingestion` is in `transpilePackages`,
    so Next follows its dynamic `import("pdfjs-dist/legacy/build/pdf.mjs")` into the server
    bundle, where pdfjs's worker / optional-canvas resolution breaks at runtime. Fixed with
    `serverExternalPackages: ["pdfjs-dist"]` so it loads as a plain Node module.
    **This also affects the pre-existing M2 pension-PDF import path**, which had the same latent
    problem and had probably never been exercised against a real PDF in production.
  - **"Import all" added** (owner friction: 5 monthly statements = 5 preview round-trips).
    `import.commitAllPending` commits every pending file that needs no mapping decision. A PDF
    has no columns to map, so the preview step is pure friction there; a CSV whose headers the
    guesser cannot resolve is **skipped and reported**, never guessed at. Runs `autoClassify`
    once at the end.
  - **Verified:** tsc clean, eslint clean, i18n parity 1121/1121.

### Standing note on patch delivery
The owner sometimes pushes a phase while the next fix is being prepared. **Always re-check
`origin/main` and rebase the fix as its own patch** rather than amending an already-pushed commit.

## Current state (2026-07-27, session 13)

- **M38c-fix (multi-upload 500 + picker browse) code-complete — `m38c-fix.patch` on f5128b5.
  NO MIGRATION, NO LOCKFILE CHANGE.** Both owner-reported.
  - **Multi-file upload returned an opaque "A server error occurred".** Root cause: **Next caps
    Server Action bodies at 1 MB by default** and none was configured. Statement upload sends
    files as base64 inside a Server Action (~34% inflation), so two PDFs alone exceed the cap and
    the request dies *before any application code runs* — which is why nothing appeared in the
    logs and why it looked like an app bug. `next.config.ts` now sets
    `experimental.serverActions.bodySizeLimit: "25mb"`; the action also pre-checks the batch size
    so an oversized upload gets a plain message rather than a platform 500.
  - Added the long-missing **`@wealthos/engine-operations` to `transpilePackages`** — an oversight
    since M36 that had not yet bitten, but would.
  - **Category picker now renders search AND the dropdown** (owner request), not search instead of
    it. Both fields submit; the typed label wins when present (the more deliberate act), otherwise
    the dropdown selection is used. Search alone had removed the ability to BROWSE the tree, which
    matters before you know what is in it. Parent-category picker uses "top level" as its empty
    label rather than "uncategorised".
  - **Verified:** tsc clean, eslint clean, i18n parity 1117/1117.

### Standing note on patch delivery
The owner sometimes pushes a phase while the next fix is being prepared. **Always re-check
`origin/main` and rebase the fix as its own patch** rather than amending an already-pushed commit —
amending produces a conflicting patch that cannot apply.

## Current state (2026-07-27, session 12)

- **M38c (PDF statements, multi-upload, searchable categories) code-complete — `m38c.patch`.
  NO MIGRATION, NO LOCKFILE CHANGE, NO NEW DEPENDENCIES.**
  - **PDF statement parser** (`packages/ingestion/src/pdf-statement.ts`, 17 tests). Reuses the
    existing `extractPdfLines` (pdfjs). Key empirical finding, verified against the real files:
    these PDFs reverse **token order + per-word characters**, NOT the whole line — digits and
    Latin survive intact — so `toggleVisualHebrewLine` is the correct transform, not a full
    character reversal (which is what the *pension* PDF needs; the two differ).
    **Each line is parsed in BOTH orientations and the one producing readable Hebrew wins**
    (scored by final-letter position), so a logical-order PDF parses with no configuration.
  - **One configurable parser, not three bespoke ones.** `PDF_PROFILES` covers ISRACARD
    (charge = the SECOND amount, since סכום עסקה precedes סכום חיוב), CAL (amount-first layout
    + `בתהליך קליטה` pending sections), FIBI_BANK. Issuer auto-detected in either orientation.
    A bare integer with no symbol and no decimals is **never** treated as money — otherwise
    voucher numbers like `629076429` become ₪629M.
  - **PDF rows go through the SAME `redact()` call** as the tabular path (`pdfRowsToDrafts`), so
    PDFs cannot become a back door that writes un-redacted text.
  - **Multi-file upload** (owner request): `<input multiple>`, uploads each independently so one
    rejected file (duplicate sha256 — correct behaviour) cannot abort the batch. New
    `import.pending` query lists uploaded-but-not-yet-imported statements, since without it the
    files after the first would be invisible.
  - **Searchable category picker** (owner request): the tree is ~117 entries and a flat `<select>`
    was a wall of options. Replaced with native `<input list>` + `<datalist>` — real typeahead,
    **no client JS**, stays a server component, RTL-correct, degrades to a text field. The
    submitted value is the display label with its parent path (`דיור › ארנונה`), which the server
    action resolves back to an id; the path makes labels unambiguous where leaf names repeat.
    An unrecognised label leaves the category unset rather than guessing. Replaced in all 4 places.
  - **BUG FIXED (owner-reported): "apply to this merchant" was dead on every imported row.**
    `commitStatement` never set `merchantKey`, so imported transactions had none — and the
    button was `disabled={!tx.merchantKey}`. Worse than a dead control: owner memory is keyed on
    `merchantKey`, so **imported rows were silently excluded from the entire learning loop**.
    Fixes: (1) `normalizeMerchantKey` moved to `domain` so `ingestion` can use it (boundaries
    forbid engine→ingestion — same pattern as the category tree and Hebrew primitives);
    (2) every draft now carries a `merchantKey` derived from the REDACTED text, so no PII can
    leak into it; (3) `autoClassify` backfills any row still missing one; (4) the UI no longer
    renders a silently-disabled control — it says why and links to the single-row edit.
    Also fixed the picker collapsing to the width of its dropdown arrow inside table cells
    (`w-full` needs a `min-w` there).
  - **Verified:** ingestion 78 tests (20 new), engine-operations 66, api 9, domain 49, tsc clean,
    eslint clean, i18n parity 1115/1115, `npm ci --dry-run` exit 0.

### Known blind spots
- No Postgres / no root in the sandbox: **DB-bound suites only run in CI.**
- The PDF parser is tested against synthetic lines reproducing the real files' SHAPE, not against
  the real PDFs (household data must not enter the repo). **Expect the first real import to need
  a tweak** — the unparsed-lines list in the preview is there to make that diagnosable.
- Legacy `.xls` still refused by design (unmaintained BIFF reader with open CVEs); re-export CSV.

## Next up

**M39 — financial calendar + recurring decisions.** Statutory figures still depend on owner
verification of B3/B4 (2026 ceilings + IL tax/bituach-leumi dates); I draft, owner approves at
`/registry`. Also pending: `us-bank-chase-csv` once the Chase export arrives.

## Current state (2026-07-27, session 11)

- **M38b (statement import) code-complete — `m38b.patch`. NO MIGRATION, NO LOCKFILE CHANGE,
  NO NEW DEPENDENCIES.** You can now import statements instead of typing transactions.
  - **`redact()` PII boundary** (`packages/ingestion/src/redact.ts`, 18 tests). Runs INSIDE
    `applyMapping`, so raw text cannot reach the DB on any route — there is no code path that
    persists an un-redacted description. Redacts: Teudat Zehut (**check-digit validated**, so
    9-digit voucher numbers and amounts survive — a naive rule would corrupt the import),
    card PANs (**Luhn-validated**), IL IBANs, bank/branch account numbers, and household member
    names (no `\b` — it fails next to Hebrew, a known sharp edge in this repo). Idempotent and
    version-stamped. Bias: false positives are cheap for account/card numbers, so those patterns
    are broad; the ID check is exact because over-matching there destroys real data.
  - **Generic tabular adapter**: CSV (papaparse, already a dep) + **HTML tables** (regex reader,
    no new dependency — picks the LARGEST table, since layout tables come first). Encoding
    sniffing (UTF-8 vs Windows-1255 via UTF-8 validity + CP1255 Hebrew range), **header-row
    detection** (statements carry title/account preamble above the real header, so assuming
    row 0 silently mis-parses the file), visual-order Hebrew repair across the grid.
  - **`IL_STATEMENT_LEXICON` added as a tie-breaker.** The lexicon-independent detector keys on
    Hebrew final letters, but "משכורת" has no final form and is therefore orthographically
    undecidable. Statement vocabulary is small and fixed, so a lexicon closes exactly that gap
    without weakening the general rule. (Caught by a test.)
  - **Mapping**: SIGNED or DEBIT_CREDIT mode, U+2212 minus normalisation (real refunds use it),
    instalment parsing (`תשלום N מתוך M`), `הוראת קבע` → recurring candidate, pending-marker →
    `status=PENDING`. Unusable rows are **reported, not silently dropped** — statements carry
    subtotal/footer rows, and a short total with no explanation is worse than a visible skip count.
  - **Idempotent re-import** via `externalRef`: the statement's own reference when present, else
    a stable digest of (date, amount, description). Bank exports are range-based, so overlapping
    re-imports are inevitable and must not duplicate.
  - **preview (persists NOTHING) → commit**: preview shows rows read / usable / already-imported /
    skipped, the detected date range, format+encoding, and **how many PII fields were removed**.
    Commit records an `ImportBatch` (payload = the redacted profile + row count, never the raw
    file) and auto-classifies what landed. Mappings saveable as `ImportMappingProfile`.
  - **Legacy `.xls` is deliberately NOT supported.** The only npm-published BIFF reader is
    SheetJS's `xlsx`, whose npm distribution is unmaintained and carries known prototype-pollution
    and ReDoS advisories. Pulling that into a household financial system to read a format the bank
    also exports as CSV is a bad trade — the UI says exactly that and asks for a CSV re-export.
    **This means the owner's OneZero `.xls` needs re-exporting as CSV; the Isracard HTML works as-is.**
  - **Verified:** ingestion 58 tests (39 new), engine-operations 66, api guard 9, domain 49,
    tsc clean, eslint clean, i18n parity 1106/1106, `prisma validate` OK, `npm ci --dry-run` exit 0.

### Known blind spot
No Postgres and no root in the sandbox, so **DB-bound suites (`packages/db`, `packages/api`
integration) only run in CI.** The statement-import service is DB-bound and therefore verified
by unit tests of its pure parts (parsing, mapping, redaction) plus type-checking, not end-to-end.

## Next up

**M38c — institution adapters:** FIBI PDF (`extract_tables`-friendly), Isracard PDF and CAL PDF
(bespoke line parsers), plus `us-bank-chase-csv` once the Chase export arrives. Then **M39**
(financial calendar + recurring decisions), whose statutory figures still depend on owner
verification of B3/B4.

## Current state (2026-07-27, session 10)

- **M38a (transaction editing + provenance + guard test) code-complete — `m38a.patch` on M37.
  NO MIGRATION, NO LOCKFILE CHANGE.** Owner-requested scope, ahead of the M38b ingestion work.
  - **Transaction edit.** Every row is now fully editable — date, direction, amount, currency,
    description, category, behaviour, instalments, recurring flag — via `transactions.update`.
    Changing the description **recomputes `merchantKey`** (it is derived; a stale key would
    mis-group the transaction and poison owner memory). Changing amount/currency resets
    `amountBase` to null unless it is the base currency, so the engine re-resolves FX rather
    than carrying a stale converted figure.
  - **Remove = VOID, not DELETE**, and reversible. A voided transaction is excluded from every
    calculation but keeps its append-only classification history. Destroying the row would only
    cost the audit trail — the maths is identical either way.
  - **Classification provenance.** Each row now shows HOW it got its category: method
    (your decision / merchant rule / no rule matched), confidence %, `decidedBy`, and the
    rules version. Raised because a row showed an unexpected category and nothing in the UI
    could explain it. (Investigated: the classifier was correct — `ZZQQ WIDGET EMPORIUM`
    resolves to `other.unclassified`, FALLBACK, confidence 0 — so the row had been changed by
    a form submission. Unexplainable state in a financial tool is a trust problem regardless.)
  - **`minPhaseGuard` test matrix added** (`packages/api/test/workflow-guard.test.ts`, mock-DB,
    no Postgres needed): every probe × every phase, plus the property that distinguishes it from
    `workflowGuard` — once reached, it STAYS open in later phases. This was a real coverage gap:
    M36 shipped the guard with no test at all.
  - **Locale switch now stays on the current page** (owner-reported). It hard-coded `href="/"`,
    so changing language always bounced you back to the dashboard mid-task. New client component
    `components/locale-switch.tsx` uses next-intl's `usePathname`, which returns the path WITHOUT
    the locale prefix — exactly what the localised `Link` re-prefixes for the target locale.
    Query params are deliberately dropped: they are transient UI state here (`?created=1`,
    `?edit=<id>`) and carrying them across would re-fire success banners.
  - **CI note (correcting my own bad advice):** do NOT press "Re-run jobs" on the failed run —
    GitHub re-runs a workflow at its ORIGINAL commit, so run #45 (pinned to `90a37bd`, M36,
    before the lockfix) will fail forever. Check the run for the NEWEST commit at
    Actions → branch `main` instead.
  - Dead single-row `classifyTransactionAction` removed (superseded by the edit form); the
    `transactions.classify` API procedure is retained.
  - **Verified:** api guard tests 9 (6 new), engine-operations 66, domain 49, tsc clean, eslint
    clean, i18n parity 1069/1069, `prisma validate` OK, `npm ci --dry-run` exit 0.

- **CI failure explained, already fixed.** The failing run was on `90a37bd` (M36, before the
  lockfix) — `npm ci` rejected the lock/package.json mismatch. `d97799b` fixed it; `origin/main`
  (`af17e2b`) has a correct lockfile, verified by fresh clone. **Re-run the failed workflow.**
- **GitHub auto-deploy is now connected** (first "via GitHub" deploy: the M36 lockfix).
  `git push origin main` IS the deploy — do NOT also run `railway up`, that produces two
  redundant builds. `docs/DEPLOY.md` corrected accordingly; deploy scripts no longer call it.

### Known blind spot
The sandbox has no Postgres and no root, so **DB-bound suites (`packages/db`, `packages/api`
integration) only ever run in CI.** Everything else is verified locally before a patch is cut.

## Next up

**M38b — ingestion:** generic tabular adapter (CSV/XLSX, Windows-1255 + UTF-8 sniffing, header
detection, debit/credit vs signed), saved `ImportMappingProfile`s, statement-range detection,
`redact()` PII boundary, import preview/commit. Covers the OneZero XLS and Isracard HTML almost
unchanged. Then the institution adapters (FIBI PDF, Isracard PDF, CAL PDF) + `us-bank-chase-csv`.

## Current state (2026-07-27, session 9)

- **M37 (Financial Operations — dual-axis engine) code-complete — `m37.patch` on the M36 lockfix.
  NO MIGRATION** (M36's schema already carries everything M37 needs).
  - **Deterministic classifier (owner decision D3 — no LLM anywhere).** 103 versioned merchant
    rules in `packages/domain/src/operations/merchant-rules.ts`
    (`MERCHANT_RULES_VERSION`, stamped onto every classification). Precedence:
    **OWNER > RULE > FALLBACK.** Patterns are authored in natural Hebrew/Latin and compiled
    through the same uppercase + final-form folding as merchant keys, so visual-order Hebrew
    from real statements classifies identically to logical order.
  - **Owner memory IS the learning loop.** Built from CONFIRMED classifications keyed by
    `merchantKey`; because keys strip per-transaction reference codes, confirming
    "SPOTIFY P43CD5B1CB" also covers "SPOTIFY Q99XX1A2BC". One decision, applied past and
    future, via `transactions.bulkClassifyByMerchant`. Reproducible, auditable, reversible.
  - **`reconcileWithSign`:** a rule that disagrees with the amount's SIGN (a "משכורת" line that
    is an outflow) is demoted to Suspense instead of mis-booked. Owner decisions are exempt.
  - **Surplus (D7, net-of-payroll):** `surplus = netIncome − expenses − ledgerDebtService`.
    SAVINGS_FLOW and TRANSFER are excluded from expenses by construction, so pension/hishtalmut
    never reduce surplus. Debt service comes from the **ledger** (mortgage tracks + loans), not
    from transactions — the ledger is canonical, transactions are evidence.
  - **Refusals, not guesses:** a missing FX rate REFUSES the whole period rather than treating
    the row as zero; `normaliseToMonthly` refuses below `operations_normalisation_min_days`;
    `baselineFromMonths` never averages a missing month in as a zero.
  - **Non-blocking rule implemented literally:** sub-threshold rows are counted in the month
    inside Other/Unclassified, and the period is flagged provisional with count + amount.
  - **Settlement linking (Appendix B.3):** a bank-side card debit becomes TRANSFER only when a
    card statement reconciles within tolerance (max(₪1, 0.5%), ±3 days, same last-4); otherwise
    it stands as the expense and the period reports `AGGREGATE_ONLY`. Never silently erases spend.
  - **Instalments:** remaining תשלומים are projected as dated future claims and reduce
    Safe-to-Spend inside the window (not counted as this month's expense).
  - **Safe-to-Spend** subtracts fixed + debt + calendar commitments + buffer top-up, but
    deliberately NOT discretionary spend (that would be circular). Framed as a ceiling on
    choice, never as a limit the household has broken.
  - **API:** `cashflow.dualAxis`, `surplus.get`/`safeToSpend`, `period.current`/`recompute`/
    `close`/`reopen`, `suspense.queue`, `transactions.bulkClassifyByMerchant`. Closing a period
    freezes `computed` + `pins` + `engineVersion` (same reproducibility contract as StrategyPlan).
  - **UI:** surplus waterfall, behavioural bars, category totals, working capital, Safe-to-Spend,
    provisional/coverage banners, and a suspense queue whose confirm button teaches the classifier.
    Server-rendered CSS bars (no client bundle for five numbers); logical properties throughout.
  - **BUG CAUGHT BY TEST:** `byBehavioral` was accumulating income alongside expenses, so a salary
    tagged FIXED_CONTRACTUAL inflated the fixed bucket and drove Safe-to-Spend negative
    (−17,600 instead of +10,400). The behavioural axis is now **expense-side only**, documented
    on `BehavioralTotals`.
  - **Verified:** engine-operations 66 tests (49 new), domain 49, engine-strategy 61, ingestion 17,
    tsc clean (domain/db/registry/api/engine-operations/web), eslint clean, i18n parity 1053/1053,
    `prisma validate` OK, **`npm ci --dry-run` exit 0** (lockfile untouched by M37).

## Next up

**M38a — generic tabular adapter + `redact()`:** CSV/XLSX with saved column-mapping profiles
(encoding sniffing for Windows-1255, header detection, debit/credit vs signed), statement-range
detection, PII redaction at the persistence boundary, import preview/commit. Covers the OneZero
XLS and Isracard HTML almost unchanged. Then M38b: the five institution adapters
(FIBI PDF, OneZero XLS, Isracard PDF, Isracard HTML, CAL PDF) + `us-bank-chase-csv`.

## Current state (2026-07-27, session 8)

- **M36 (Financial Operations — core context) code-complete — `m36.patch` on 6961e95. HAS A MIGRATION.**
  First milestone of the Financial Operations & Cash Flow module (design package:
  `docs/architecture/07-financial-operations.md`, 955 lines, owner-approved 2026-07-27).
  **Nothing existing changes behaviour** — a household that never opens the Operations tab is
  served identically.
  - **Schema (+13 models/enums, migration `20260727090000_m36_operations_core`, additive only):**
    `CashFlowCategory` (configurable functional tree), `Transaction` (OBSERVATION layer — never read
    by NetWorthCalculator or the strategy analyzers; `CashFlowDetail` streams stay canonical),
    `TransactionClassification` (append-only decision history w/ rule provenance), `OperatingPeriod`
    (the household-month, freezes `computed` + pins at close), `CalendarEvent`, `RecurringDecision`,
    `ActionEvent` (append-only telemetry), `ImportMappingProfile`, `RecommendationDependency`.
    `Recommendation` gains 11 additive columns (`origin`, `cadence`, `dueDate`, `expiresAt`,
    `difficulty`, `reversibility`, impact×3, period/calendar links) — every pre-M36 row valid on
    landing, no data-migration script. **No new `WorkflowState`, no new `RecommendationStatus`.**
  - **Owner decisions locked (doc 07 §1):** D1 extend existing engines (no parallel allocation/action
    system); D2 operations is cross-phase via new `minPhaseGuard("VERIFICATION")`, NOT a 6th phase;
    D3 **no LLM anywhere** — deterministic classification only; D5 transactions are evidence, streams
    canonical; D7 surplus is net-of-payroll, pension/hishtalmut are SAVINGS_FLOW not expense.
  - **New package `packages/engine-operations`** (boundary-clean: engine→domain/db/registry only).
    `OPERATIONS_ENGINE_VERSION`, read-model contracts (`MonthlyCashFlow`, `VerifiedSurplus`, `Refusal`),
    deterministic `normalizeMerchantKey`.
  - **Hebrew/RTL primitives moved to `packages/domain/src/text/hebrew.ts`** and shared by BOTH
    `ingestion` and `engine-operations` (boundaries forbid engine→ingestion; duplicating was the
    alternative). New **lexicon-independent** visual-order detector using Hebrew final-letter
    position — works on arbitrary merchant names, unlike the pension doc's keyword lexicon.
    `ingestion/normalize.ts` re-exports from domain, so every existing adapter/test is untouched.
  - **11 new assumption keys** (classification confidence 0.85, normalisation min days, baseline
    months, working-capital months, leakage thresholds, safe-to-spend window, health-score weights).
    ⚠️ These are NEW assumption versions → **pinned pre-M36 recommendations are invalidated on deploy;
    rerun strategy once after M36** (existing, correct invalidation rule).
  - **API:** `operations` router (categories tree/upsert/archive, transactions list/createManual/
    classify) on `operationsProcedure`; Zod schemas in `schemas/operations.ts`. Cycle guard on
    category re-parent; fallback category cannot be archived.
  - **UI:** new cross-phase `/operations` tab (nav entry, NOT in the phase strip, no `phase-gate`),
    manual transaction entry with dual-axis tagging, transaction table with inline reclassify,
    category tree view + add-category form. Bilingual (i18n parity 1011/1011 keys).
  - **Verified:** domain 49 tests (15 new), engine-operations 17 (new), ingestion 17, engine-strategy 61,
    eslint boundaries clean, tsc clean (domain/db/registry/api/ingestion/engine-operations/web),
    `prisma validate` OK.
- **Real statement formats catalogued (doc 07 Appendix B)** from six owner-supplied exports.
  **Two banks (FIBI, OneZero) + two card issuers (Isracard ×3 cards, Visa CAL), five adapters.**
  Two findings that changed the design: (1) **card settlements double-count** — the bank carries the
  card bill as one aggregate debit while the card statement itemises it; bank-side settlement lines
  become `TRANSFER` only when a reconciling card statement exists, else `AGGREGATE_ONLY`;
  (2) **instalments (תשלומים) are committed FUTURE outflows** → `CalendarEvent(INSTALMENT)` feeding
  the liquidity forecast, plus 3 `Transaction` columns. Owner facts: **two earners** (per-member
  ceiling utilisation), a **US Chase account** pending (USD as a first-class account currency),
  history depth Jan–Jul 2026.
- **Owner sign-offs 2026-07-27:** B5 transactions may live in Railway Postgres — OK. B6 default
  category tree — OK. **B2: IL 2025 tax matrices APPROVED** (still to flip `ownerReviewed=true` at
  `/registry`; **2026 remains unreviewed**, incl. the null bituach-leumi employee rates).

## Next up

**M37 — dual-axis engine:** deterministic classification (merchant rules in the registry), monthly
normalisation (activeDays divisor), **verified surplus** (net-of-payroll), safe-to-spend, working
capital, suspense queue (non-blocking), leakage aggregation, settlement-linking + instalment→calendar.
Then M38a generic tabular adapter + `redact()`, M38b the five institution adapters.

## Current state (2026-07-20, session 8)

- **M34 (strategy synthesis, Variant A) + M35 (dashboard v2) code-complete — patch `m34-m35.patch`,
  one migration (20260720100000_m34_strategy_synthesis).** Owner picked the engine-pinned strategy card.
  M34: new pure `engine-strategy/src/synthesis.ts` `synthesizeStrategy()` — deterministic bilingual
  narrative (achieve / how / expected outcomes) + metrics (target vs current growth share from KNOWN-mix
  only, goals funded/total, actionsTotal) from the pinned snapshot + assumptions + APPROVED allocation
  plan; product-validated (throws on any product/security reference). New relation-free `StrategyPlan`
  model stores narrative+metrics+reproducibility pins (assumption key@version); `runStrategy` computes a
  funding summary (reuses engine-goals `computeFundingGaps` from the payload + earmarks) and persists the
  artifact in the run transaction. `strategy.plan` query added. Strategy page: engine-pinned synthesis
  card at top (4 sections + progress bar + pins/snapshot/engine-version footer) and a "Fine-tune your
  plan" card (risk+target inline, per-goal priority/target via `goals.update` + `updateGoalPlanAction`,
  link to the allocation cart for amounts); action-item cards unchanged.
  M35: dashboard v2 — goal progress bars (from `goals.fundingGap`), two recharts donuts (allocation by
  kind + liquids growth/defensive/unknown via new `networth.liquidBreakdown` query), FX+BOI panel,
  monitoring insights (open alerts by severity), scenarios summary (STRATEGY-gated → degrades gracefully).
  New client island `components/dashboard-charts.tsx` (recharts); `recharts@^2.15.0` added to apps/web.
  Verified in sandbox: tsc clean (engine-strategy/api/web), prisma validate, engine synthesis runtime-
  smoked (tsc-emit → node; both plan/no-plan branches), i18n he/en parity (1069/1069, +strategy.synthesis
  /finetune, +dashboard.goalsProgress/charts/fxPanel/scenariosPanel/monitoringPanel). vitest not run
  (documented sandbox rolldown SIGSEGV); CI runs the suite. **Deploys with the push (migrate creates
  StrategyPlan). Regenerate strategy after deploy to populate the first StrategyPlan.**


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

## Current state (2026-07-20, session 7)

- **M33 (journey audit: per-page phase gate + allocation review/edit + auto-rerun) code-complete —
  m33.patch. No migration.** Root cause found: the workflow-transition control (GatePanel) lived ONLY
  on the verification page, so completing STRATEGY→MONITORING etc. sent users "back to the phase gate";
  and leaving ALLOCATION made the approved plan unreachable.
  Fix (both owner-recommended): (1) shared `(app)/phase-gate.tsx` server component rendered on EVERY
  phase page (mapping/verification/allocation/strategy/monitoring) — shows the legal forward step +
  what's blocking it (unverified count, suspense, "approve your plan") + back-transitions, driven by
  new `workflow.gate` query. Old GatePanel + gate-panel.tsx removed (dedup). transitionAction now
  redirects to the TARGET phase's page (was hard-coded to /verification).
  (2) Allocation review always available: when not in ALLOCATION phase, the הקצאה tab shows the
  approved plan READ-ONLY (chosen actions + amounts + per-item and total projected impact via
  approvedReview query) with an "עריכת התוכנית" button → reopenForEdit mutation (steps back to
  ALLOCATION + flips the plan to PROPOSED, preserving tuned amounts) → cart. (3) commitAndApprove now
  AUTO-RERUNS runStrategy after advancing to STRATEGY (non-fatal) so recommendations realign with the
  approved plan automatically. Verified: engine 61, eslint clean, api/web/domain tsc, prisma valid,
  i18n parity (+gate.*).

## Current state (2026-07-20, session 6)

- **M32 (cart title fallback for pre-M31 plans) code-complete — m32.patch on M31. No migration.**
  Root cause of "empty titles": the AllocationPlan JSON in the DB was generated before M31, so its
  stored candidates carry no title/titleHe — the cart rendered blank headers. Fix: page derives a
  fallback title when the stored candidate lacks one — `${t(kinds.<KIND>)} · <rate>%` (kind label +
  rate for debt, kind label otherwise) — so existing plans are readable immediately; regenerating gives
  the full M31 titles (property name + Hebrew track type). Page Candidate.title/titleHe made optional;
  amber "rebuild for full titles" hint shown when any candidate lacks a rich title. Verified: web tsc,
  eslint clean, i18n parity (+rebuildForTitles).

## Current state (2026-07-20, session 5)

- **M31 (readable cart labels) code-complete — m31.patch on M30. No migration.** Fix: cart rows showed
  the long detail sentence truncated ("…FIXED_UNLIN…") — unreadable. DeploymentCandidate now carries a
  short bilingual `title`/`titleHe` (Hebrew track-type names via TRACK_HE: FIXED_UNLINKED→"קבועה לא
  צמודה" etc.) per kind — "פירעון משכנתא · <נכס> · <מסלול> · <ריבית>%", "השקעה · אפיקי צמיחה (יעד N%)",
  "הפקדה · קרן השתלמות · <בן/בת בית>", "בדיקת תלוש · <שם>", "השלמת כרית החירום". Cart + catalog render
  the full title (no slice, wraps), catalog shows the long detail as secondary text, cart shows a
  labeled ₪ amount field. engine 61 tests (candidates gain title; no test breakage), eslint clean,
  api/web tsc, i18n parity (+amountLabel).

## Current state (2026-07-20, session 4)

- **M30 (allocation page redesign C + strategy alignment) code-complete — m30.patch. No migration.**
  Owner picked cart/checkout, client-interactive, and the approved plan must feed strategy.
  UI: new `apps/web/src/components/allocation-cart.tsx` ("use client") — catalog of recommended
  actions (add to plan) + editable cart with live per-item AND total impact computed IN THE BROWSER
  (mirrors impact.ts: real-rate debt, expected-return invest/tax, growth-share-after), running
  allocated/remaining/liquidity/debt-left/growth totals, over-allocation block. Amount edits recompute
  instantly (no reload) — fixes the M29 submit-button bug by removing the two-submit form entirely.
  Approve = `allocation.commitAndApprove` (writes selections→workingPlan, status APPROVED, AND runs the
  ALLOCATION→STRATEGY workflow transition in one tx) → `commitCartAction` redirects to /strategy. Presets
  still seed via applyPreset. ALIGNMENT: AnalyzerContext gains `committedPlan`; strategy-service
  `buildCommittedPlan` summarizes the latest APPROVED plan (deploysIdleCash / investsGrowth /
  repaidTrackItemIds / taxDeposited); analyzers suppress the overlaps — EXCESS_IDLE_CASH,
  ALLOCATION_GROWTH_BELOW_TARGET, MORTGAGE_EXPENSIVE_TRACK + MORTGAGE_ABOVE_BENCHMARK (per repaid track),
  TAX_*_UNDERUTILIZED — so strategy never re-litigates decided actions. Strategy page shows a
  "מבוסס על תוכנית ההקצאה המאושרת מ-<date>" banner. New router: impactBase (client projection inputs),
  commitAndApprove. 2 alignment tests (engine-strategy 61). Verified: engine 61, eslint clean,
  api/web/domain/registry tsc, prisma valid, i18n parity.

## Current state (2026-07-20, session 3)

- **M29 (per-action impact + responsive simulation) code-complete — m29.patch on M28. No schema/migration.**
  Owner: wanted impact per action item (not only total) and re-runnable on amount change.
  Router `allocation.impact` → `allocation.simulate`: returns `{ aggregate, perCandidate }` — aggregate
  is the enabled-plan impact (as M28); perCandidate maps every non-verify candidate → its OWN
  contribution (projectedExtraNetWorth over horizon, interest saved/yr, resulting growth share)
  computed via computePlanImpact([that one selection]) at the candidate's working-or-suggested amount,
  over the pinned snapshot. UI: each action row now shows a 📈 per-action line ("בסכום X: +Y בעוד N שנים
  · ריבית שנחסכת …/שנה · רכיב צמיחה → Z%"); editable rows get a "סמלץ" button (stores the typed amount
  with enabled=0) so you preview any amount WITHOUT adding it to the plan, and "עדכן/הוסף" (enabled=1)
  adds it — either way the server recomputes, so changing an amount + submitting re-runs the sim
  (per-action + total). Verified: engine 59 tests, eslint clean, api/web tsc, prisma valid, i18n parity.

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

## M39d — save had no visible effect (owner-reported)

The dates were saving correctly the whole time. The failure was that nothing said so.

- **The calendar rendered a fixed 120-day window.** Today being 29 Jul 2026, that hid the
  provident deposit (15 Dec, 139d), the year-end tax review (1 Dec, 125d), the hishtalmut
  ceiling check (30 Nov, **124d — missed by four days**), and every annual rule whose next
  occurrence is in 2027. So saving an annual date wrote the right row and changed nothing
  on screen. Window is now selectable (60 / 120 / 400) and defaults to 400.
- **Each recurring row now shows its own next occurrence** (`nextOccurrenceForDecision`).
  This is the actual fix: feedback for a save must not depend on whether the result happens
  to land inside the current view.
- Empty state now distinguishes "no events generated yet" from "nothing in THIS window",
  which are different problems with different actions.

3 new tests, 23 in the calendar suite.


## M39c — suggested dates you can actually apply

Owner report: the improved dates from M39b never reached the UI, and every save button
read `forms.save`.

- **`forms.save` / `forms.saved` did not exist.** The `forms` namespace had `submit` but no
  `save`, so next-intl rendered the key path. Both added.
- **The suggestions could not reach an already-seeded household.**
  `ensureRecurringDecisions` never overwrites an existing row — right, because the owner's
  date must beat a template — but that also froze five reviews on 1 January permanently.
  Silently overwriting would have been the wrong fix: it cannot tell a date the owner chose
  from one the old fallback invented.
  So applying a suggestion is now an **explicit owner action**: `recurring.applySuggested`
  takes an optional key (one rule) or none (all), skips rows already matching, and
  regenerates the forward window only if something changed.
- UI shows each rule's suggested date inline with a **"use this date"** button, an
  **"apply all suggested dates"** button above the list, and a green "matches our
  suggestion" note where the date already agrees — so it is visible which dates are ours
  and which are his.

`suggestedAnchorDate` returns null for rules only the owner can date (home insurance,
vehicle, arnona, mortgage reset), so those never get a fabricated one-click value.
4 new tests, 20 in the calendar suite.


## M39b — calendar display + suggested dates (owner-reported)

Three bugs the owner caught in one screenshot pass:

1. **Date and days-away shared one cell.** In RTL "312 ימים" ran into "2026-07-31" and read
   as a single number. Split into its own column with an `ltr` date cell and a coloured
   chip, plus proper past/today/future wording.
2. **`operations.calendarKind.REVIEW` rendered raw.** The i18n map used invented kind names
   (`CONTRIBUTION_WINDOW`, `POLICY_REVIEW`, `RATE_RESET`, `REBALANCE`) instead of the actual
   `CalendarEventKind` enum, so every real kind fell through. All 18 enum members now
   mapped. `colAmount` / `colActions` were missing outright.
3. **Five household reviews all sat on 01/01/2026.** Those rules declared no `month`, so
   `ensureRecurringDecisions` fell back to January. This directly contradicted the M39 claim
   that nothing ships on a date we invented — the fallback WAS an invented date, just a
   quieter one. Every default-on rule now declares a month and carries a stated reason
   (`SUGGESTED_DATE_RATIONALE`) shown in the UI, and `gemel.year_end_deposit` moved 25 Dec →
   15 Dec because the deposit must be *credited* by 31 Dec and funds take days to clear.

Three regression tests pin it: every default-on non-monthly rule declares a month, no two
share a slot, and every default-on household review explains its date.


## M39 — Financial calendar + recurring decisions

**Shipped.** Forward-looking calendar over three sources: Israeli statutory deadlines,
household recurring reviews the owner has dated, and instalments already committed on
card statements.

- `packages/domain/src/operations/calendar-rules.ts` — 6 IL statutory rules + 11 household
  templates. `nextOccurrence` is UTC and **clamps to month length**, so a "31st" rule lands
  on 28 Feb instead of rolling into March. 13 tests.
- `packages/api/src/services/calendar-service.ts` — `regenerateCalendar` deletes only
  **future, SCHEDULED, rule-generated** events before rebuilding. History and owner
  decisions (DONE/SKIPPED) survive, and pressing rebuild twice does not double the list.
- Templates that need the owner's own date ship `defaultEnabled: false`. WealthOS does not
  know when his insurance renews; a guessed date makes a confident, wrong calendar.
- Safe-to-Spend now adds cash-impacting calendar events — filtered on `transactionId: null`.
  That filter is load-bearing: instalment events are *derived from* the transactions
  already projected into `committedInstalmentsBase`, so without it every instalment would
  be charged twice.
- `il-2026` bituach leumi employee rates resolved **and then corrected**. First pass seeded
  `3.5 / 12.0` as "bituach leumi alone" — wrong. That pair is the **pre-2025 combined**
  BL + health rate (BL reduced was 0.40% before Jan 2025). The real decomposition is
  BL **1.04 / 7.00** + health **3.23 / 5.17** = combined **4.27 / 12.17**. Seeding the
  wrong pair overstated the reduced band 3.4x and would have propagated silently into
  every net-income projection.
  Caught by reconciling against a real form 106: the corrected rates predict the two
  withheld totals to within 4 ILS on a 608,338 base. `packages/registry/test/
  bituach-leumi-rates.test.ts` pins the identity so it cannot regress.

**Also included:** the M38q boundaries fix (delivered but never pushed) — the ESLint
boundary rules were matching nothing because the TS import resolver was missing, so they
silently enforced zero architecture. Now real, plus the violations that surfaced.

Owner action outstanding: verify the IL 2025/2026 tax matrices at `/registry` and flip
`ownerReviewed`.

