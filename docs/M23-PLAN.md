# M23 spec (owner decisions 2026-07-15) — build AFTER the other session commits

Owner picked: lifestyle-only wizard; action checklists now (A), tax-sequenced plan later (B);
trust ladder (see DATA-TRUST.md); consistency audit done (all M15–M21a/D5 claims verified green).

## M23b — Plain-language assumptions wizard

New page `strategy/assumptions-wizard` (or card on registry page). ~10 questions, no financial
knowledge needed; deterministic mapping to threshold assumptions; market numbers
(returns/inflation/volatility) stay system-owned. Writes overrides ONLY on change (no gratuitous
invalidation); shows a preview diff (assumption, old → new) before applying.

Questions → assumptions map (draft):
1. "אם ההכנסה תיעצר, כמה חודשים אתם צריכים כדי להתארגן בלי למכור השקעות?"
   (options 3/6/9/12) → `emergency_fund_months`.
2. "כמה מההוצאה החודשית שלכם קשיחה (שכירות/משכנתא/חינוך)?" (רוב/חצי/מעט)
   → adjusts `emergency_fund_months` +2/+0/−1 and `insurance_survivor_expense_months` (72/60/48).
3. "עד כמה תרצו שהמערכת 'תציק' על עדכון נתונים?" (הרבה/מאוזן/מעט)
   → `staleness_days_by_kind` scale (×0.5 / ×1 / ×1.5), `low_confidence_threshold` (60/50/40).
4. "כמה רגישים אתם לירידה של נכס בודד?" (מאוד/רגיל/לא)
   → `concentration_single_asset_max_pct` (20/30/40).
5. "כמה מהעתיד הכלכלי שלכם תלוי בישראל (קריירה, נדל\"ן, משפחה)?" (הכול/רוב/חלק)
   → `currency_foreign_min_pct` (25/15/10), `currency_foreign_max_pct` (60/50/40).
6. "מה מפריע יותr: לפספס עליות או לחוות ירידות?" (ירידות/מאוזן/פספוס)
   → `allocation_rebalance_band_pct` (7/10/15) — tighter band for the loss-averse.
7. "בית מגורים בעיניכם הוא:" (בית, לא השקעה / גם וגם / נכס לכל דבר)
   → `allocation_real_estate_max_pct` (70/60/50).
8. "כמה מהר תרצו לדעת שמשהו זז מהתוכנית?" (מיד/חודשי/רבעוני)
   → drift_* scale (×0.7 / ×1 / ×1.5).
9. "התראה על דמי ניהול היא:" (חשובה מאוד/רגילה)
   → per-type fee map ×0.85 / ×1 (`management_fee_notice_by_type`).
10. "עד איזה סכום הלוואה 'לא שווה דיון'?" (free number) → `large_loan_notice_base`.

Implementation: pure mapper `wizardAnswersToAssumptions(answers, currentDefaults)` in
packages/api (unit-tested); answers stored as an audit event; overrides via existing
`registry.setAssumption`. UI: one form, RTL-first, preview list, green success banner.

## M23c — Action checklists on every recommendation (option A)

- `RecommendationDraft` gains `actionItems: string[]` + `actionItemsHe: string[]` (schema-required,
  min 1); persisted inside the rationale JSON (no migration) or sibling column — prefer sibling
  Json for querying: `actionItems Json?` on Recommendation (nullable, old rows fall back to
  the how-to hint / nothing).
- Every generator computes concrete steps from finding metrics (amounts in base currency,
  counts, member names). Concentration example: excess ₪, staged-sale slice per tax year,
  new-savings-only alternative with months-to-target using mapped monthly savings flows.
  Currency example: amount to convert, which side (buy/sell foreign), hedging alternative.
- Product-reference validator runs over action items too (both languages).
- UI: "צעדים לביצוע" numbered block on the recommendation card, above the decide row.
- Tests: every generator emits ≥1 bilingual action item; amounts match metrics.

## M23d — deferred-feeds enablement (per DATA-TRUST.md)

- C5 CPI: tier 1; BOI SDMX complexity was the blocker — re-scope to yearly manual entry with
  the assumption as fallback + alert when actual (entered) diverges from `inflation_il_pct`.
- C1 fund data: tier 2; keyed by owner-entered מספר קופה per account; overwrites only
  unconfirmed heuristic estimates.
- Holdings CSV: tier 3; M2 adapter + suspense; new HoldingDetail table.
Each is its own milestone; this file + DATA-TRUST.md are the handoff spec for whichever
session picks them up.
