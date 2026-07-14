# WealthOS — Execution Plan (M15+)

> Derived from `docs/IMPROVEMENTS.md` (owner review 2026-07-13). Priority re-scored
> independently by value-to-owner × effort, with dependencies and a deploy/verify gate
> per milestone. Read `STATUS.md` first each session; end each milestone with a
> `chore: STATUS — MN complete` commit.

## How this plan was prioritized

Each backlog item scored **Value 1–5** (owner benefit for a single self-hosted family
office) and **Effort 1–5** (dev cost). `V/E` is the tie-breaker; dependencies and
subsystem coherence decide the actual sequence (cheap web-layer changes that *surface*
new engine output are pulled ahead of the engines they surface).

Items marked ✅ in IMPROVEMENTS.md are already shipped in M14 (income mode B1, the
explainer pattern A2, the saved-banner A4, the growth-share heuristic C1). This plan
covers the **remaining** work only.

### Score table

| ID | Item | Value | Effort | V/E | Milestone |
|----|------|:-----:|:------:|:---:|:---------:|
| D4 | Enable Railway Postgres backups | 4 | 1 | 4.0 | Phase 0 |
| A1 | Guided next-step on dashboard | 5 | 2 | 2.5 | M15 |
| D2 | Alert email notifications | 5 | 2 | 2.5 | M18 |
| A2 | Tab explainers (remaining 4 tabs) | 2 | 1 | 2.0 | M15 |
| A3 | `dir="auto"` on rationale blocks | 2 | 1 | 2.0 | M15 |
| B2 | Insurance-gap analyzer | 5 | 3 | 1.67 | M16 |
| B3 | Tax-year utilization tracker | 5 | 3 | 1.67 | M16 |
| C2 | Monte Carlo on the M8 projector | 5 | 3 | 1.67 | M17 |
| A7 | Empty states as onboarding | 3 | 2 | 1.5 | M15 |
| A4 | `?ok=` success-feedback convention | 3 | 2 | 1.5 | M15 |
| B5 | Fee benchmark by product type | 3 | 2 | 1.5 | M19 |
| C6 | Custom scenario builder | 3 | 2 | 1.5 | M21 |
| D5 | Owner sign-off screen (tax matrices) | 3 | 2 | 1.5 | M18 |
| C1 | Real track data (Gemel-Net/Pensia-Net) | 4 | 4 | 1.0 | M19 |
| D1 | Per-person auth + DB users | 4 | 4 | 1.0 | M23 |
| B4 | Recommendation → task lifecycle | 3 | 3 | 1.0 | M20 |
| B6 | Mortgage refinance signal (BOI rate feed) | 3 | 3 | 1.0 | M21 |
| B7 | Earmarking accounts to goals | 3 | 3 | 1.0 | M20 |
| C3 | Holdings-level ingestion (positions CSV) | 3 | 3 | 1.0 | M22 |
| C4 | Tax-aware withdrawal ordering | 3 | 3 | 1.0 | M17 |
| C5 | CPI feed (BOI) | 2 | 2 | 1.0 | M21 |
| D3 | CI: bump actions versions | 1 | 1 | 1.0 | Phase 0 |
| A6 | Mobile pass + PWA | 3 | 4 | 0.75 | M24 |
| A5 | Date inputs follow app locale | 1 | 2 | 0.5 | M24 |

### Where I deviate from the doc's "Suggested order"

- **D4 (DB backups) promoted to Phase 0.** Highest V/E on the board (data safety, ~1h)
  and you'll already have the Railway token open to deploy M10–M14. The ledger is the
  family's financial memory; it should not run one more day un-backed-up.
- **A1 first-run UX before B2/B3 engines.** The doc runs engines first. But A1 builds the
  dashboard CTA that insurance-gap and tax-utilization findings will *surface through* —
  doing it first means those engines light up the dashboard the day they ship, and it's
  cheap (web-only, no schema/engine risk). Engines follow immediately in M16.
- **C4 (tax-aware drawdown) paired with C2 (Monte Carlo)** — same projector/scenario code
  area, cheaper together than as separate milestones.
- **B6 + C5 grouped** — both are BOI `PublicApi`-family feed extensions (same infra as the
  ✅ FX feed); build the feed plumbing once.

---

## Phase 0 — Deploy gate (blocks all M15+ work)

**Not new features — this is the pending release + two cheap ops wins, done in one
Railway session.** M10–M14 are code-complete but undeployed; building M15 UI on top of
undeployed strategy-Hebrew/allocation code is a stale-clone hazard.

- **Deploy M10–M14.** Push `main` + `feat/m10..m14` branches; run pending migrations on
  Railway PG (`20260713080000_m10`, `..090000_m12`, `..110000_m14`) + seed (7 M12/M13
  assumptions); `railway up` from a clean `/tmp` checkout. Needs owner Railway token / PAT.
- **D4 — Enable Postgres backups.** Turn on Railway's automated backup policy; document
  cadence + restore steps in `docs/DEPLOY.md`.
- **D3 — Bump CI actions.** `checkout@v4`/`setup-node@v4` → current majors; clears the
  Node-20 deprecation warning. (Trivial; ride the same PR.)

**Gate:** CI green on `main`; prod smoke test (health, tRPC ping, strategy page renders
Hebrew rationale, allocation card present); one backup visible in Railway.

---

## M15 — Guided first-run & UX correctness  ·  `feat/m15-first-run`  ·  P1

Web-layer only, no engine/schema change → lowest-risk high-value milestone. Turns the
enforced four-phase loop into a *narrated* journey.

- **A1 — Guided next-step on dashboard.** Dashboard always answers "מה עכשיו?": current
  phase, blocking counts (unverified / suspense), one primary CTA linking to the action
  (e.g. "3 פריטים ממתינים לאימות → אימות"). Derives entirely from existing verification +
  monitoring reads.
- **A7 — Empty states as onboarding.** Empty goals/mapping pages teach the first action
  ("התחילו כאן: הוסיפו את חשבון הבנק הראשון" + direct button) instead of "אין פריטים".
- **A4 — `?ok=<key>` success convention.** Generalize the M14 saved-banner into one shared
  server-action pattern: goal saved, item updated, member archived, etc.
- **A2 — Tab explainers (remaining).** Extend the ✅ `<details>` pattern to אימות,
  אסטרטגיה, ניטור, יומן.
- **A3 — `dir="auto"` on rationale blocks.** Cheap RTL correctness for mixed EN/HE
  fragments in older/journal recommendation cards. Rides along.

**Gate:** web tsc; visual check of dashboard CTA in each phase (he + en); banner fires on
each server action.

---

## M16 — Protection & tax engines  ·  `feat/m16-protection-tax`  ·  P1

The two highest-value wealth-management features. Both are **pure analyzers** on the
proven M6 finding→generator pattern — no external data, no schema churn beyond findings.

- **B2 — Insurance-gap analyzer.** Reads existing policies/salaries/members/mortgages.
  Flags: survivor income below N months of expenses; no disability cover for an earner;
  mortgage-life cover missing vs outstanding principal. Strategy-level only. New bilingual
  generators; thresholds from AssumptionRegistry.
- **B3 — Tax-year utilization tracker.** TaxRegistry ceilings (hishtalmut/pension) vs
  ledger contribution cash-flows → yearly "מיצוי הטבות מס" card: deposited vs ceiling per
  member, months remaining in the tax year. Turns the registry into a yearly ritual.

**Gate:** new engine tests (finding + refusal-on-missing-data paths); registry throws on
missing rule (never guesses); strategy run surfaces new findings; M15 dashboard CTA picks
them up.

---

## M17 — Advice credibility: Monte Carlo + tax-aware drawdown  ·  `feat/m17-montecarlo`  ·  P1/P2

Same projector interface (M8 architecture is already MC-ready). Biggest single jump in
advice credibility.

- **C2 — Monte Carlo projector (P1).** Sampled returns → percentile bands (P10/P50/P90)
  and per-goal success probabilities instead of single deterministic paths. Scenario UI
  gains band chart + probability-of-success per goal.
- **C4 — Tax-aware withdrawal ordering (P2).** Drawdown order (taxable → hishtalmut →
  pension) using TaxRegistry rates → materially more accurate depletion years / net
  outcomes. Same code area as C2, so bundled.

**Gate:** deterministic path stays reproducible (pins unchanged); MC seed fixed in tests
for repeatability; depletion-year regression fixture.

---

## M18 — Monitoring notifications & owner controls  ·  `feat/m18-notify`  ·  P1/P2

Closes the "alerts are silent until someone opens the tab" gap and gives the owner the
last DB-only control as UI.

- **D2 — Alert email notifications (P1).** Worker already computes severity; send email
  (Resend or SES) on MEDIUM+ alerts. Natural follow-up: weekly digest. Non-fatal on send
  failure (mirrors the FX worker pattern).
- **D5 — Owner sign-off screen for tax matrices (P2).** Per-matrix "בדקתי ואישרתי" that
  flips `ownerReviewed=true` and records the audit event — currently DB-only. Unblocks the
  trust gate on the M4 tax figures.

**Gate:** email fires against a real Resend/SES sandbox key; sign-off writes an audit
event and flips the flag; worker still green when email disabled.

---

## M19 — Real allocation data & per-type fees  ·  `feat/m19-realdata`  ·  P2

Replaces heuristics with regulator-reported truth.

- **C1 — Real track compositions (Gemel-Net / Pensia-Net).** Fetch actual track
  allocations keyed by fund number → replaces the M14 growth-share heuristic with
  regulator data, and brings real fee data along.
- **B5 — Fee benchmark by product type.** Turn the single `management_fee_notice_pct` into
  a per-type map (hishtalmut ~0.7%, gemel lehashkaa ~0.6%, pension mekifa 0.22%/1.5%
  two-part), like `staleness_days_by_kind`. Consumes C1's real fee data.

**Gate:** real fund lookup falls back to heuristic (never blocks); estimated-badge clears
when real data lands; fee findings use per-type thresholds.

---

## M20 — Recommendation lifecycle & goal earmarking  ·  `feat/m20-lifecycle`  ·  P2

Connects recommendations and goals to how the family actually thinks.

- **B4 — Recommendation → task lifecycle.** Monitoring raises a REVIEW alert when an
  ACCEPTED recommendation's implementation date passes without a journal outcome
  ("קיבלת ב-מרץ, לא בוצע — עדיין רלוונטי?").
- **B7 — Earmarking accounts to goals.** Let the owner pin an account to a goal
  ("חיסכון לילדים = החשבון הזה") so funding-gap numbers match the family's mental model.

**Gate:** overdue-recommendation alert fires in the monitoring cycle test; earmark changes
gap allocation deterministically; migration additive/defaulted.

---

## M21 — Market-data feeds & custom scenarios  ·  `feat/m21-feeds`  ·  P2/P3

Build the BOI feed plumbing once; two features consume it.

- **B6 — Mortgage refinance signal.** BOI average-rate feed (same `PublicApi` family as
  ✅ FX) → debt analyzer says "המסלול שלכם יקר ב-X נק' מהממוצע הנוכחי" instead of a fixed
  threshold.
- **C5 — CPI feed.** Record BOI CPI actuals alongside the `inflation_il_pct` assumption →
  monitoring flags when reality diverges from plan.
- **C6 — Custom scenario builder.** Small form over existing scenario params (savings
  delta, shock year, rate change) — multiplies the value of the 8 canned scenarios with no
  engine work.

**Gate:** feed parsing verified against the live BOI endpoint from sandbox (as FX was);
worker fetches non-fatally; custom scenario runs behind `workflowGuard(STRATEGY)`.

---

## M22 — Holdings-level ingestion  ·  `feat/m22-holdings`  ·  P3

- **C3 — Positions CSV adapter.** New M2-framework adapter ingesting a brokerage positions
  CSV → computes exact growth share + concentration for accounts that are opaque today
  (heuristic returns null by design).

**Gate:** adapter version-bumped; suspense absorbs unknown position types; concentration
analyzer consumes real holdings.

---

## M23 — Per-person auth & multi-user  ·  `feat/m23-auth`  ·  P2 (larger)

- **D1 — Per-person auth + DB users.** Replace env-var single login (`AUTH_EMAIL`/
  `AUTH_PASSWORD_HASH`) with DB User rows; per-person sessions + audit attribution.

**Reprioritize trigger:** if a spouse/second family member needs their own login before
this slot, pull M23 forward — it's the only item whose value is gated on *who* uses the
app, not what it computes.

**Gate:** existing audit middleware attributes actions to the DB user; migration + seed of
the current owner user; no lockout on deploy.

---

## M24 — Mobile & locale polish  ·  `feat/m24-mobile`  ·  P3

- **A6 — Mobile pass + PWA.** Responsive sweep (scenario/registry tables, <400px card
  wrap) + PWA manifest → usable as the "check my wealth" phone app.
- **A5 — Date inputs follow app locale.** `lang` hints or dd/mm text input with parsing so
  native date pickers stop showing mm/dd/yyyy in he. Rides the mobile/i18n sweep.

**Gate:** manual check at 375px + PWA installable; date field shows dd/mm in he.

---

## Sequencing summary

```
Phase 0  deploy M10–M14 + D4 backups + D3 CI      ← blocks everything
  M15    A1 A7 A4 A2 A3      first-run UX          (P1, web-only)
  M16    B2 B3               protection + tax      (P1, pure engines)
  M17    C2 C4               Monte Carlo + drawdown(P1/P2, projector)
  M18    D2 D5               alert emails + sign-off(P1/P2, ops)
  M19    C1 B5               real fund data + fees (P2)
  M20    B4 B7               rec lifecycle + earmark(P2)
  M21    B6 C5 C6            BOI feeds + scenarios (P2/P3)
  M22    C3                  holdings ingestion    (P3)
  M23    D1                  per-person auth       (P2, pull fwd if needed)
  M24    A6 A5               mobile + PWA          (P3)
```

P1 (start now, after Phase 0): M15 → M16 → M17 → M18. That's the doc's "biggest value"
tier, resequenced so the dashboard narrates the engines the moment they ship.
