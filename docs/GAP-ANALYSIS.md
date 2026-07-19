# Gap Analysis — WealthOS & InvestWise Pro (2026-07-19)

Companion to `PRODUCT-STRATEGY.md` v2. For each product: where it is today (evidence from the
repos), where it must be to reach its **next level**, and the gap in between. "Next level" is
defined per product, not abstractly:

- **WealthOS next level = G1 pilot-ready:** 3–5 design-partner planners running real client
  households; 30+ HUM; time-to-first-plan < 2h.
- **InvestWise Pro next level = bundle-ready + B2C-hardened:** an app an advisor can hand to a
  client household (provisioned, plan-linked, Hebrew), and a standalone consumer app that is
  honest about real execution (broker staging, not simulated mutations).

---

## 1. WealthOS — from customer-zero tool to advisor pilot (G1)

**Where it is now.** Functionally deep, commercially pre-embryonic. M0–M25 shipped: five-phase
enforced workflow (MAPPING → VERIFICATION → ALLOCATION → STRATEGY → MONITORING), engines with
refusal semantics and reproducibility pins, versioned Assumption/Tax registries, bilingual
he/en throughout, scenario + Monte Carlo, monitoring cron with drift alerts, 15-question
wizard, deployed on Railway. But: **one household, one shared env-var login, no advisor
anywhere in the system** — the buyer the strategy names cannot log in. Recent milestones
(m23–m25) are patches on the mount, not yet committed/deployed. Ingestion is fixture-first;
the Mislaka adapter — the named commercial unlock — is not built. Tax matrices carry
`ownerReviewed=false`.

| # | Dimension | Today | Needed for G1 | Gap / action |
|---|-----------|-------|---------------|--------------|
| W1 | Tenancy & auth | Single household; shared `AUTH_EMAIL`/`AUTH_PASSWORD_HASH` login | Multi-tenant: advisor accounts, per-user auth, roles, hard per-advisor data isolation | **G0 — the largest engineering lift.** DB User/Advisor/Household models, session auth, isolation tests. Blocks everything commercial |
| W2 | Advisor console | Dashboard shows one household | Book-level view: N households, cross-book alert triage, per-household drill-in | New surface ("today's dashboard × N"); depends on W1 |
| W3 | Onboarding | Manual mapping (owner: "terrible"); adapters are fixture-first PDF/CSV | Mislaka XML import → verified pension/hishtalmut/gemel side in minutes; TTFP < 2h measured | Build the adapter on the M2 framework (fixtures exist). Confirm Mislaka file-format licensing. THE pilot unlock |
| W4 | Data trust | Tax matrices `ownerReviewed=false`; bituach leumi employee rates null | IL 2025/2026 figures owner-signed before advice reaches a paying advisor's client | Eran review session; keep nulls-with-reasons where sources conflict |
| W5 | Regulatory | Internal product-reference validator only | Written legal opinion: advisor decision-support line + the bundle question (does advisor-paid order-staging app = participating in execution?) | Engage counsel before first paying advisor; firewall design is the brief |
| W6 | Client artifact | In-app views only | White-label client report (plan + scenarios + monitoring + execution progress) as PDF | Roadmap item 6; needed for advisor perceived value |
| W7 | Integration (down) | None | v1a plan-export: signed JSON artifact (targets/caps/floor/ceilings, no products) + contract test proving zero product references | Small build; validator becomes a contract gate |
| W8 | Integration (up) | Ingestion = manual/CSV/fixtures | `BROKER_SYNC` trust-tier adapter consuming the consented InvestWise feed | Rides on IW4/IW5 below; suspense-first like every adapter |
| W9 | Commercial | No billing, no pricing, no contracts | Billing per household + pilot agreements; pricing test ₪30–60 + bundle uplift | G2 gate, but pilot agreements needed at G1 |
| W10 | KPI instrumentation | Data exists in tables (AuditEvent, MonitoringRun, AllocationPlan) | HUM / HUM-E / TTFP / plan-approval as a real report view | Reporting milestone, not new instrumentation |
| W11 | Ops & delivery | Patch-based delivery (mount corruption), deploy from /tmp, m23–m25 not committed/deployed; prod household not yet through ALLOCATION | Clean commit→CI→deploy cadence from Windows; prod runs the full 5-phase loop; observability fit for tenants | Commit + deploy backlog first; then pipeline hygiene before pilot |

**Bottom line:** WealthOS's gap is not product depth — it is that the *buyer doesn't exist in
the system yet*. G0 (W1–W2) + Mislaka (W3) + sign-offs (W4–W5) = pilot-ready.

---

## 2. InvestWise Pro — from personal PWA to bundle-ready companion + honest B2C

**Where it is now.** A rich, opinionated single-user product: grounded signals (war room ↔
Today unified), sized-and-funded recommendations with an Accept that really mutates the
portfolio, first-class cash, strategy profiles with honest risk numbers, trading rules with
suggested levels, 30-min repricing, markets/AI layer, PWA + push, ~259 tests, CI green.
But: **one user (Eran), no household accounts**; execution is *simulated* (Accept edits
holdings — no broker, plan exists only on paper in `BROKER_INTEGRATION_PLAN.md`); the plan is
self-owned (its own objectives/strategies — no external-plan concept); UI is EN-leaning;
Phase 1–5 work sits uncommitted on disk pending a Windows commit.

| # | Dimension | Today | Needed for next level | Gap / action |
|---|-----------|-------|----------------------|--------------|
| IW1 | Accounts & auth | Effectively single-user; `REQUIRE_AUTH` gates the legacy dashboard only | Household accounts, auth on by default, advisor-invite provisioning for bundled seats | Tenancy-lite. Blocks distribution of any kind (bundle **and** real B2C) |
| IW2 | Execution honesty | Accept simulates: sells/buys edit local holdings at live prices | Broker Phase 0: `BrokerProvider` + mock + Orders screen + staged-order flow (Accept → STAGED → user Executes); then Phase 1 read-only sync | Phase 0 buildable now, zero credentials needed. Phase 1 blocked on the open broker-API question (inter-il / IBI — or statement-import fallback) |
| IW3 | Plan model | Self-owned objective + strategy profiles | **External-plan mode**: import the WealthOS artifact (targets, caps, floor, provenance + bilingual why) alongside self-owned mode; funding engine keys off whichever is active | IW-G0. The funding engine already consumes exactly these inputs — this is plumbing + provenance UI, not a rebuild |
| IW4 | Feed out | None | Consented, revocable positions/cash/fills push to WealthOS (household-scoped token) | Pairs with W8; consent UX is the design work |
| IW5 | Language | EN-leaning UI | Hebrew parity + RTL | Required before any bundled Israeli household; also widens standalone B2C |
| IW6 | Regulatory & security | No broker, so untested; credentials policy undecided | Order-entry-assistant posture opined; `TRADING_ENABLED` + notional limits implemented; secrets vault; auth ON before any broker connect | Gating items from BROKER_INTEGRATION_PLAN §4 — sequence before Phase 1, not after |
| IW7 | Entitlements & billing | None | SKU split: bundled seat (advisor-paid, plan-linked) vs standalone consumer; **standalone pricing = open owner decision** (free / freemium / paid) | Entitlement flags first (cheap), billing later |
| IW8 | Quality & ops | Phase 1–5 uncommitted on disk (stale `.git/index.lock`); Pixel 9 QA backlog (notification alignment, accept-executes, reprice labels) | Clean tree; live QA pass green | Windows commit first (`git commit -F COMMIT_MSG.txt`, never `git add -A`); run the QA files |
| IW9 | Distribution | Personal PWA install | Onboarding a stranger can survive: invite link, empty-state flow, no Eran-specific assumptions | Audit for customer-zero hardcoding; part of IW1 |

**Bottom line:** InvestWise's gap is the mirror image — the *product experience* is ahead, but
it's built for one person and pretends to execute. IW1 (accounts) + IW2 (broker staging) +
IW3 (external plan) make it bundle-ready; IW5 makes it Israeli; IW2 alone already upgrades the
standalone B2C story from simulation to real staging.

---

## 3. Shared seam gaps (belong to both, owned jointly)

| # | Gap | Action |
|---|-----|--------|
| S1 | No integration contract | Versioned JSON contract (plan-down, facts-up) + fixtures vendored in **both** repos; contract-drift tests; no shared code across the TS/Python boundary |
| S2 | FX conventions | Both are ILS-normalized but independently; contract pins FX source + timing |
| S3 | Consent model | One consent object (who sees what, revocation) referenced by both sides |
| S4 | Brand | One family vs two brands — open owner decision; affects app-store presence and the advisor pitch |
| S5 | Support model | Bundled household has a problem: who answers — advisor or product? Define before pilot |

---

## 4. Sequencing — what actually blocks what

1. **Parallel critical paths:** WealthOS G0 (W1–W2) and InvestWise accounts (IW1) — neither
   blocks the other; both block their pilots.
2. **Pilot demo = Mislaka (W3) + plan-export/import (W7+IW3).** This pair is the "your client
   opens their app and your plan is already there" moment — highest demo value per unit build.
3. **Broker Phase 0 (IW2) before the feed (IW4/W8)** — the up-feed is only interesting when
   positions are real or at least staged.
4. **Sign-offs (W4, W5, IW6) before the first paying advisor** — not before building, but
   before charging.
5. **Hygiene now, cheaply:** commit m23–m25 (WealthOS) and Phase 1–5 (InvestWise) from
   Windows; both repos currently carry shipped-but-uncommitted work — everything above builds
   on those trees.
