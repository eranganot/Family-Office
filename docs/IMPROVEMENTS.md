# WealthOS — Improvement Backlog (owner review, 2026-07-13)

Reviewed: full repo, live app (he locale), all engines, docs. Prioritized by
value-to-owner ÷ effort. ✅ = shipped in M14 during this review.

## A. User experience & journey

1. **Guided next-step on the dashboard (HIGH).** The four-phase loop is enforced but
   not narrated. The dashboard should always answer "מה עכשיו?": phase, blocking items
   (unverified/suspense counts), one primary CTA (e.g., "3 פריטים ממתינים לאימות → אימות").
   Today a new user must discover the flow by clicking tabs.
2. **Tab explainers (✅ scenarios + registry).** Extend the same `<details>` explainer
   pattern to אימות, אסטרטגיה, ניטור, יומן.
3. **Mixed-direction text in recommendation cards (MEDIUM).** English fragments inside
   RTL layout render jumbled (pre-M10 rows especially). Set `dir="auto"` on rationale
   blocks so each paragraph resolves its own direction. Mostly moot once strategy is
   rerun in Hebrew, but journal/older content benefits.
4. **Success feedback everywhere (MEDIUM).** The savedRisk/refreshed banners (✅ added)
   should become the norm: goal saved, item updated, member archived. A small shared
   `?ok=<key>` convention would cover all server actions.
5. **Date inputs follow browser locale, not app locale (LOW).** Native `<input type=date>`
   shows mm/dd/yyyy on many machines. Options: `lang` attribute hints, or a dd/mm text
   input with parsing. Cosmetic but noticeable in he.
6. **Mobile pass (LOW).** Tables (scenarios, registry) overflow on phones; cards wrap
   badly under ~400px. A responsive sweep + PWA manifest would make WealthOS usable
   as the "check my wealth" phone app.
7. **Empty states as onboarding (MEDIUM).** Empty goals/mapping pages should teach:
   "התחילו כאן: הוסיפו את חשבון הבנק הראשון" with a direct button, not just "אין פריטים".

## B. Wealth management & recommendations depth

1. **Income mode on FI/Retirement goals (✅).** ₪/month → capital target derived from
   `goal_projection_real_return_pct` at read time, so assumption changes retarget goals.
2. **Insurance-gap analyzer (HIGH, next engine).** The ledger already holds policies,
   salaries, members, mortgages. A pure analyzer can flag: survivor income below N months
   of expenses, no disability cover for an earner, mortgage-life missing vs outstanding
   principal. Same finding→generator pattern as M6; entirely strategy-level.
3. **Tax-year utilization tracker (HIGH).** TaxRegistry knows the hishtalmut/pension
   ceilings; the ledger knows contributions (cash flows). A yearly "מיצוי הטבות מס"
   card — deposited vs ceiling per member, months remaining — turns the registry into
   an actionable yearly ritual.
4. **Recommendation → task lifecycle (MEDIUM).** ACCEPTED recommendations get an
   implementation date but nothing nags. Monitoring could raise a REVIEW alert when the
   date passes without a journal outcome ("קיבלת ב-מרץ, לא בוצע — עדיין רלוונטי?").
5. **Fee benchmark by product type (MEDIUM).** `management_fee_notice_pct` is one global
   threshold; realistic notice levels differ (hishtalmut ~0.7%, gemel lehashkaa ~0.6%,
   pension mekifa 0.22%/1.5% two-part). Make the assumption a per-type map like
   `staleness_days_by_kind`.
6. **Mortgage refinance signal (MEDIUM).** Track-level rates exist; a BOI average-rate
   feed (same PublicApi family as FX ✅) would let the debt analyzer say "המסלול שלכם
   יקר ב-X נק' מהממוצע הנוכחי" instead of a fixed threshold.
7. **Earmarking accounts to goals (MEDIUM).** The funding-gap engine allocates pools by
   priority; letting the owner pin an account to a goal ("חיסכון לילדים = החשבון הזה")
   makes gap numbers match how the family actually thinks.

## C. Engine sophistication

1. **Growth-share data quality ladder (✅ heuristic → owner-confirmed; NEXT: real data).**
   Fetch actual track compositions from Gemel-Net/Pensia-Net public datasets keyed by
   fund number — replaces heuristics with regulator-reported allocations, and brings
   real fee data for B5 too.
2. **Monte Carlo on the M8 projector (HIGH, architecture ready).** Same interface,
   sampled returns; outputs become percentile bands (P10/P50/P90) and goal-success
   probabilities instead of single deterministic paths. The single biggest jump in
   advice credibility.
3. **Holdings-level ingestion for brokerages (MEDIUM).** Brokerage accounts are opaque
   (heuristic returns null by design). A positions CSV adapter (the M2 framework takes
   new adapters cheaply) would compute their growth share and concentration exactly.
4. **Tax-aware withdrawal ordering in scenarios (MEDIUM).** The projector draws down
   investable assets generically; ordering (taxable → hishtalmut → pension) with
   TaxRegistry rates makes depletion years and net outcomes meaningfully more accurate.
5. **CPI feed (LOW).** BOI publishes CPI too; recording actuals alongside the
   `inflation_il_pct` assumption lets monitoring flag when reality diverges from plan.
6. **Custom scenario builder (LOW).** The 8 canned scenarios cover the basics; a small
   form over the existing parameters (savings delta, shock year, rate change) multiplies
   their value without engine work.

## D. Platform & operations

1. **Per-person auth + DB users (HIGH, known debt).** Still env-var single login.
2. **Alert notifications (HIGH).** Monitoring alerts are silent until someone opens the
   tab. The worker already knows severity — an email (Resend/SES) on MEDIUM+ closes the
   loop. Natural follow-up: weekly digest.
3. **CI: bump actions versions (LOW).** checkout@v4/setup-node@v4 trigger the Node 20
   deprecation warning; bump to current majors.
4. **DB backups (MEDIUM).** Document/enable Railway Postgres backup policy; the ledger
   is now the family's financial memory.
5. **Owner sign-off screen for tax matrices (MEDIUM).** `ownerReviewed=false` needs a
   UI affordance: per-matrix "בדקתי ואישרתי" that flips the flag and records the audit
   event — currently only possible via DB.

## Suggested order

1. B2 insurance-gap analyzer + B3 tax-utilization (biggest wealth-management value, pure engines)
2. A1 dashboard next-step + A7 empty states (first-run experience)
3. C2 Monte Carlo (credibility) + D2 alert emails (closes the monitoring loop)
4. C1 Gemel-Net real track data (replaces heuristics)
5. The rest by taste.

## M26 backlog additions (owner, 2026-07-19)
- **Full quantitative goal impact per deployment step (option B):** simulate each step through the
  M8/M17 projector for goal-gap deltas incl. debt steps' payment-relief effect. V1 shipped the
  qualitative + invested-amount quantification.
- **Payslip ingestion:** owner suggested uploading one salary slip to auto-verify that payroll
  captures pension/hishtalmut ceilings (feeds the TAX_VERIFY_PAYROLL step). Fits the M2 adapter
  framework + trust ladder tier 3.

## M27 backlog additions (owner, 2026-07-19)
- **Form 106 adapter (auto-extract deposits):** parse the 106 PDF's pension/hishtalmut deposit rows
  to auto-create contribution flows — removes manual flow mapping and satisfies TAX_VERIFY_PAYROLL
  from real numbers. M2 adapter framework + trust ladder tier 3. (V1: one-click "confirm from 106".)
- **Pre-import parsed-value editing:** editing the parsed numeric values before ייבוא (beyond docType,
  shipped in M27, and ownership, already editable). Today values are correctable post-import via the
  M3 verification "correct value" flow / suspense resolution.
