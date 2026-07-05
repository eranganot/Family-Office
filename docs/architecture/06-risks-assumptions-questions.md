# 06 — Risks, Assumptions & Open Questions

## 1. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Israeli institution PDF formats vary wildly and change without notice; fixture-first parsers may not survive contact with real documents | High | Adapter versioning; suspense routing absorbs unknowns instead of corrupting the ledger; golden-file tests per adapter; treat each real-document adapter as its own branch |
| R2 | Tax/regulatory matrices seeded incorrectly → wrong strategy output | High | Every TaxRuleSet row carries a cited source and requires **owner review before seeding**; registry versioned; recommendations pin the version used |
| R3 | Household financial data on Railway (cloud) | Medium-High | TLS everywhere, argon2 auth, no third-party egress, masked account numbers, minimal PII in DB; **open question Q3 on encryption-at-rest & backups** |
| R4 | CPI-linked mortgage/track math is subtle (linkage, early-repayment fees) | Medium | Multi-track model is first-class; linkage math isolated in domain services with exhaustive unit tests; conservative assumptions from registry |
| R5 | FX conversion correctness (ILS/USD/EUR) | Medium | FxRate table with source + date; manual rates in v1; no silent conversions |
| R6 | Hebrew RTL text extraction from PDFs (reversed strings, mixed-direction lines) | Medium | Dedicated RTL normalization layer in adapter framework, tested via fixture corpus before any real document |
| R7 | Bilingual UI doubles string surface; slows every milestone | Medium | Accepted by owner ("bilingual from day one"); mitigated by no-literal-strings lint + catalog-per-feature discipline |
| R8 | Single-developer bus factor; long build | Medium | This design package + decision journal + milestone summaries are the continuity mechanism; STATUS.md maintained per session |
| R9 | JSONB payloads (rationale, snapshots, tax matrices) drift without validation | Low-Med | Every JSONB field has a versioned zod schema in packages/domain; schemaVersion columns on snapshots |
| R10 | Scope creep toward product recommendations | Low | Hard validator: recommendation text/type rejected if it references securities/funds/tickers |

## 2. Working assumptions (correct if wrong)

| # | Assumption |
|---|---|
| A1 | Base currency is **ILS**; reporting consolidates to ILS with USD/EUR as foreign exposure |
| A2 | One household, one Postgres schema; multi-household is out of scope for v1 (model doesn't preclude it) |
| A3 | Conservative default assumptions (returns, inflation) are acceptable as system defaults with household overrides |
| A4 | v1 FX rates entered manually (no live feed; keeps zero-egress posture); Bank of Israel feed is a post-v1 connector |
| A5 | Documents you'll eventually upload: pension annual reports, keren hishtalmut/gemel statements, bank statements, brokerage statements, mortgage schedules, form 106, Mislaka exports |
| A6 | "Kupat Histalmut" in the brief = Keren Hishtalmut (modeled as `KEREN_HISHTALMUT`); Kupat Gemel and Gemel LeHashkaa modeled separately |
| A7 | The shared login is acceptable long-term for two adults; `decidedBy` on journal entries records the person by name |
| A8 | Hebrew is the default locale, English secondary |
| A9 | Estate/legacy in v1 = goals + beneficiary notes, not a full legal-document module |

## 3. Open questions for the owner

| # | Question | Why it matters | Blocking? |
|---|---|---|---|
| Q1 | Which institutions should the fixture corpus imitate first (e.g., Menora/Harel/Phoenix pension; Leumi/Hapoalim bank; IBI/Meitav)? | Fixture realism determines how little rework real documents cause | Before M2 |
| Q2 | Household composition (number of adults/children, ages) — needed to seed goals and retirement horizons realistically | Shapes goal-engine defaults and test data | Before M5 |
| Q3 | Backup & encryption requirements on Railway: is provider-level encryption at rest sufficient, or do you want application-level field encryption for account numbers/balances? | Security posture vs complexity | Before M0 deploy branch |
| Q4 | Approve the six package-level decisions in 00-README (tRPC, Turborepo, class-table ledger, Decimal money, ES-lite, deferred worker)? | Foundation of everything | **Yes — gates M0** |
| Q5 | Tax scope for v1 strategy math: income tax + CGT + hishtalmut/pension ceilings + purchase tax — anything else (e.g., US person / FATCA considerations, foreign tax credits)? | Registry seeding scope | Before M4 |
| Q6 | Retirement ages / target retirement scenario to treat as baseline? | Baseline projections | Before M6 |

## 4. Explicitly out of scope for v1 (restated)

Trade execution, brokerage/bank connectivity, real-time market data, security-level portfolio
optimization, autonomous AI decisions, legal/tax filing services.

<!-- END OF DOCUMENT 06 -->
