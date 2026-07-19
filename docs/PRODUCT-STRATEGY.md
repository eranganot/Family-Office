# WealthOS × InvestWise Pro — Product Strategy v2 (owner decisions 2026-07-19)

Supersedes the 2026-07-18 strategy (that document's decisions remain locked unless restated here).

**New decisions locked (2026-07-19):** the two products connect into one household wealth loop.

- **WealthOS** = the strategy operating system. Advisor-facing, B2B2C, Israel-only. Never
  products, never execution.
- **InvestWise Pro** = the self-directed execution companion for the *liquid securities sleeve*.
  **Household-facing only** — the advisor never sees, relays, or operates product-level
  recommendations or orders.
- **The advisor is the buyer of both** — WealthOS per household, with InvestWise bundled as the
  client-side companion the advisor gives their households.
- **Integration v1 is two-way**: strategy artifacts flow down (WealthOS → InvestWise), execution
  facts flow up (InvestWise → WealthOS monitoring).

---

## 0. The combined thesis — and the firewall that makes it legal

WealthOS deliberately stops at strategy: allocation waterfall, tax ceilings, target mix, caps,
liquidity floor — but "buy ~7% international equity" is where its output ends. InvestWise Pro
starts exactly there: sized, funded, plan-checked buy/sell cards, discipline rules (stop-loss /
trailing / max-weight), broker integration (staged orders → Interactive Israel / IBI), and an
Accept that really executes. Today those are two disconnected products. Connected, they close
the only gap in the loop: **map → verify → allocate → strategize → EXECUTE → monitor.**

The regulatory line that makes the whole thing work — **the firewall**:

1. **WealthOS stays product-free and execution-free.** Nothing changes about the fee-based
   planner's license posture. The product-reference validator now guards this boundary
   contractually, not just internally.
2. **InvestWise Pro is self-directed.** The household operates it under the "order-entry
   assistant" model: every trade user-confirmed, no discretionary execution, hard
   `TRADING_ENABLED` gates and notional limits (see BROKER_INTEGRATION_PLAN.md).
3. **What crosses the wire is strategy down, facts up.** Down: target mix by asset class,
   single-name caps, liquidity floor, horizon, tax-ceiling reminders — no tickers, no products.
   Up: positions, cash, fills — as *data* into mapping/verification, exactly like a bank feed.
   InvestWise derives its own product-level cards locally from the imported targets; no product
   recommendation ever transits the advisor or WealthOS.
4. **The advisor sees execution only as aggregate progress** (drift closing, plan-execution %,
   ceilings captured) inside WealthOS monitoring — never as trades to approve or products to
   endorse.

## 1. The problem (concretized)

v1 framing was "nobody optimizes the whole." Sharper: **even when someone finally writes the
whole-household plan, it dies at execution.** Israeli household wealth fails in three distinct
loops, and existing players each break exactly one:

1. **Fragmentation → no plan (the mapping gap).** Pension + hishtalmut + gemel scattered across
   managing institutions, multi-track CPI-linked mortgages, RSU concentration, real-estate-heavy
   balance sheets, expiring tax ceilings (45a/47, hishtalmut exemption) that leak money unused.
   Data collection is weeks of client nagging into Excel.
2. **Plan → no execution (the execution gap).** The plan is a PDF. The client must translate
   "reduce single-name concentration, add international exposure, keep 6 months' buffer" into
   actual orders in a broker app that has never heard of the plan. Most don't; the rest do it
   once and never rebalance. There is no Israeli tool where *the plan and the portfolio are the
   same object*.
3. **Execution → no feedback (the monitoring gap).** The advisor discovers at the annual review
   that half the plan was never executed and the executed half has drifted. Value delivered
   between reviews is invisible, so fees look unjustified and churn follows.

An advisor with 80 households experiences all three at once: onboarding is weeks per household,
execution is out of their control (and must legally stay so), and monitoring runs on stale
statements. The combined product attacks all three loops without moving the advisor an inch
across the license line.

## 2. Segments — deep dive

### S1 — Independent fee-based financial planners (PRIMARY BUYER)
~750 CFP-certified planners have been trained in Israel, 300+ are listed as active by the FPAI,
and ~150 more are in certification (evidence: MARKET-RESEARCH.md §1, C1). Practice sizes of
30–150 client households are an **owner estimate to validate in the pilot** (C2). Two
sub-personas with different economics:

- **S1a — solo planner (30–60 households).** Runs on Excel + PowerPoint + Mislaka pulls + phone,
  or on agent-oriented CRM/report platforms (Plan-T is the closest incumbent — CRM/reporting
  DNA, no strategy engine, no monitoring loop, no execution link; see MARKET-RESEARCH.md §5).
  Bottleneck is their own hours: onboarding and re-modeling eat the time that should go to
  advice. Buys leverage (more households per week) and defensibility (audit trail).
- **S1b — small planning firm (2–5 planners, 150–400 households).** Adds a consistency problem:
  each planner models differently, juniors improvise. Buys the house view encoded in registries
  + versioned overrides, plus a client-facing artifact that looks like a firm, not a person.

Jobs-to-be-done: onboard a household in hours not weeks; arrive at every meeting with a
computed, ordered agenda (the ALLOCATION waterfall); prove value between reviews; keep every
recommendation defensible (reproducibility pins); **and now: get clients to actually execute
the plan without touching execution themselves.**

### S1-C — the planner's client household (PRIMARY END USER of InvestWise Pro) — NEW
The person the bundle must delight is not only the advisor. Profile A: dual-income tech family,
RSUs, mortgage, kids (customer-zero). Profile B: mass-affluent professionals with a managed
pension core and a self-directed brokerage sleeve. Their reality: advice arrives once a year;
their broker app knows nothing about the plan; discipline (stop-losses, rebalancing, deploying
idle cash) is entirely DIY. InvestWise Pro is *their* app: the plan their advisor built shows up
as live targets, every card is sized and funded from their actual portfolio, and one tap stages
the order at their own broker. The household never pays — the advisor bundles it.

### S2 — Boutique wealth managers / family-office-lite (₪5–50M households)
Unchanged pains (portfolio tools see securities, not pensions/RE/mortgage/tax; manual quarterly
reporting; junior inconsistency) — plus the bundle adds a white-label client app as a
differentiator. Note: even where S2 firms hold licenses, the firewall stands — product
recommendations stay out of WealthOS; a licensed firm that wants to advise on products does it
in its own capacity, not through the platform.

### S3 — Insurance/pension agents converting to planning (OPPORTUNISTIC — tension flagged)
Regulatory pressure on the commission model (uniform-commission legislation, distribution-fee
bans) plus a shrinking objective-advice channel (457 pension advisors vs 10,310 agents, 2021 —
commissions themselves actually grew 2021–2023; see C13) push סוכנים toward fee-based
credibility. The bundle *raises* the temptation:
a client-side app that stages orders is one soft push away from a product-distribution channel.
Explicitly forbidden — the firewall never softens for S3. Expansion segment only after S1
proves out.

### S4 — DIY sophisticated households (SERVED TODAY, standalone InvestWise Pro)
Upgraded from "future tier": InvestWise Pro already serves this segment as a standalone product
(journey J3 below). Strategically it is the wedge — the standalone user who hits the edge of
what a securities-only view can do ("your hishtalmut ceiling isn't visible here") becomes a
referral to a WealthOS planner, or, post-G2, a self-serve WealthOS-lite tier. Not the
go-to-market; the go-to-market stays S1.

## 3. Pain points — doubled down

| # | Who | Pain | Combined answer | Proof metric |
|---|-----|------|-----------------|--------------|
| P1 | S1 | Data collection = weeks of nagging + Excel | Mislaka XML import + mapping ledger; broker sync (via household's InvestWise) auto-refreshes the liquid sleeve | Time-to-first-plan < 2h |
| P2 | S1 | "Clients don't execute my plan" — and I legally can't do it for them | Plan flows into the client's own InvestWise as live targets; sized/funded cards + staged orders make execution one tap, self-directed | Plan-execution rate |
| P3 | S1 | Value invisible between reviews → churn | Monitoring on *real* positions (fills feed) + the client's app nudging daily; advisor arrives before the client notices a problem | Alert responsiveness; advisor retention |
| P4 | S1 | Fees vs "free" bank advice | Explainable bilingual rationale + measurable outcomes now including executed ₪ (fees cut, ceilings captured, drift closed) | Value-proof ₪ aggregate |
| P5 | S1 | Compliance burden | Reproducibility pins unchanged; execution stays provably outside the advisor (firewall is itself a compliance asset) | Audit trail per rec |
| P6 | S1-C | "The plan is a PDF; my broker app never heard of it" | Plan and portfolio are the same object in InvestWise; targets, caps and floors imported from the approved AllocationPlan | Connected-household share |
| P7 | S1-C | Advice isn't actionable — what, how much, paid how? | Funding engine: every buy sized to the plan, funded cash-first then worst-fit holding, with ₪, shares, est. CGT | Staged-order conversion |
| P8 | S1-C | No discipline between meetings | Trading rules armed from plan caps (stop-loss / trailing / max-weight), alerts + push | Rules armed per household |
| P9 | S2 | Tools see securities, not the whole | Whole-net-worth model + white-label client app | HUM per firm |
| P10 | S4 | Full loop but no whole-household view | Standalone InvestWise + upgrade path to a planner (J3 wedge) | Referral conversion |

## 4. Positioning

**For advisors:** "The family-office operating system for Israeli planners — with the
client-side execution companion." The leverage machine (one planner runs 3× the households,
arrives with a computed, ordered agenda) is now also a **retention machine**: the plan lives in
the client's pocket, executes at the client's broker, and reports progress back — so the
advisor's value is visible every week, not once a year.

**For households (bundled):** "The only app where your plan and your portfolio are the same
thing." Your advisor's strategy, your broker, your confirmation on every trade.

**For households (standalone InvestWise):** "A portfolio app that acts like it works for you" —
grounded signals, sized and funded cards, honest Accept, discipline rules — with an upgrade
path to whole-household strategy when you're ready.

## 5. The onboarding problem (kept, extended)

Manual mapping remains the worst experience and would be fatal at advisor scale. Fix ladder:

1. **Mislaka (מסלקה פנסיונית) XML adapter** — unchanged, THE commercial unlock;
   time-to-first-plan < 2h. Nuance (C7): pulls require a licensed בעל רישיון (one-time client
   authorization, 3-month validity); unlicensed planners have the client pull their own file —
   the adapter must accept both paths.
2. **Broker sync via InvestWise** (NEW at this rung): for connected households, the liquid
   securities sleeve auto-populates and auto-refreshes from the InvestWise feed — replacing the
   holdings-CSV rung for that slice. Trust-ladder tier `BROKER_SYNC`, above CSV; suspense-first
   like every adapter.
3. Holdings/bank CSV adapters (fallback and non-connected households).
4. Open-banking IL connectors (post-MVP); expense estimation from statement CSVs.

## 6. Integration architecture v1 (two-way)

**Down (plan → targets):** on AllocationPlan APPROVED, WealthOS emits a signed, versioned JSON
artifact: target mix by asset class, single-name cap, liquidity floor (months + % NAV),
horizon, and open tax-ceiling reminders. InvestWise imports it as its Plan (its funding engine,
caps and cash floor already key off exactly these). **No tickers, no products in the artifact**
— InvestWise derives product-level cards locally. Reproducibility: the artifact carries
snapshot id + engine version + assumption pins, so the household's app can show "why" in the
same bilingual terms as the advisor's screen.

**Up (facts → monitoring):** the household explicitly consents to share execution data with
their advisor. InvestWise pushes positions / cash / fills (from broker sync Phase 1+, or manual
holdings before that) to a WealthOS ingestion adapter — landing in mapping/verification like
any feed, never bypassing the trust ladder. Monitoring drift then runs on real executed
positions; the plan-execution KPI is computed here.

**Mechanics:** household-scoped API token; consent recorded and revocable; versioned JSON
contracts + webhooks between the two stacks (TS monorepo ↔ Python) — shared fixtures in both
repos, no shared code. Both sides are already ILS-normalized; align FX source and timing in the
contract. **Failure mode:** no feed → WealthOS behaves exactly as today (CSV/manual). The
bundle degrades gracefully to J1.

## 7. Business goals & KPIs (updated)

**North star stays HUM** (Households Under Monitoring: verified data + approved allocation plan
+ green monitoring run in 30 days). The bundle adds the quality cut that proves the new thesis:

**HUM-E — Households Under Monitoring that are Executing:** HUM with a connected InvestWise
household AND plan-execution rate ≥ 50% trailing 90 days. HUM proves the advisor loop; HUM-E
proves the loop closes.

Goals (sequenced):

- **G0 (readiness):** unchanged — multi-tenancy + per-user auth + advisor console. Plus
  **IW-G0**: plan-import endpoint + consented feed endpoint in InvestWise (broker Phase 0 mock
  is sufficient to build both).
- **G1 (validation, ~2 quarters):** 3–5 design-partner planners, 30+ HUM, **≥10 connected
  households (HUM-E > 0)**, time-to-first-plan < 2h with Mislaka, plan-execution baseline
  measured, "would churn hurt?" interviews.
- **G2 (fit):** 25 paying advisors, 750+ HUM, **≥30% of HUM connected**, logo churn < 10%/yr,
  pricing validated: ₪30–60/household/month to the advisor + **₪10–20/household/month bundle
  uplift** for the companion app (household never pays).
- **G3 (expansion optionality):** second-country registry spike only after G2.

New/changed KPIs (all others from v1 stand):

| KPI | Definition | Measured via |
|---|---|---|
| HUM-E | as above | WealthOS monitoring + feed presence |
| Plan-execution rate | strategy steps reflected in executed/staged InvestWise actions within 30 days of plan approval | plan artifact ↔ orders/fills join |
| Connected-household share | households with active consented feed / HUM | feed tokens |
| Drift half-life | median days from HIGH allocation-drift alert → back within band | MonitoringAlert + positions feed |
| Staged-order conversion | staged orders executed / staged | InvestWise orders table |

## 8. User journeys — the three options

### J1 — WealthOS only (advisor + household, no InvestWise)
Advisor onboards the household (Mislaka import → mapping → verification) → ALLOCATION waterfall
is the meeting agenda → strategy run produces the bilingual, pinned plan → household receives
the action checklist and executes manually at their bank/broker → advisor monitors on the next
statement/CSV upload; journal records outcomes. **Best for:** pension/RE/mortgage-heavy
households with little self-directed liquid activity; households that won't adopt another app.
**Honest weakness:** the execution gap (P2/P6) stays open — checklists, not orders; drift
detection lags the data-upload cadence. This journey must remain fully first-class: it is the
license-clean core, and every bundled household degrades gracefully to it.

### J2 — WealthOS + InvestWise Pro (the bundle — flagship)
Same onboarding, plus the household connects InvestWise (broker sync when available). Plan
approved in the advisor meeting → pushed to the household's InvestWise → the app now shows
*their advisor's* targets as its plan: cards are sized and funded against their real portfolio
("Buy ₪X of international exposure — funded: ₪Y cash, ₪Z from trimming the over-cap name, est.
CGT ₪W"), discipline rules are suggested from the plan's caps, and Accept stages an order at
their own broker for their confirmation. Fills flow back; WealthOS drift goes green; the
advisor's next touch is proactive: "you've executed 80% of the plan; two ceilings are still
open before Nov 30." The advisor sees progress percentages — never trades, never products.
**Best for:** S1-C profiles with a real brokerage sleeve; this is where HUM-E and the retention
story live.

### J3 — InvestWise Pro only (self-directed household, no advisor)
The standalone product as it ships today: the household sets objective + strategy profile in
InvestWise itself; gets grounded signals, the reconciled Today view, funded cards, trading
rules, broker staging — a real self-directed loop for the securities sleeve. **What it can't
see:** pensions, hishtalmut ceilings, the mortgage, real estate, the household tax picture.
The product says so honestly at the moments it matters ("this cash-floor suggestion ignores
your pension side — a whole-household plan would know") — making J3 the wedge: referral to a
WealthOS planner today, self-serve WealthOS-lite tier after G2. J3 also stays customer-zero's
daily driver, so every friction found here feeds the commercial backlog.

## 9. Personal KPIs (customer-zero — now runs the bundle)

Unchanged targets (allocation within band, 100% ceilings by Nov 30, fee drag ≤ benchmarks,
buffer integrity, no HIGH alert > 14 days, journal outcomes, trajectory ≥ MC P50) — with one
addition: **customer-zero runs J2 end-to-end** (own WealthOS household + own InvestWise) the
moment plan-import exists. If keeping the loop closed is annoying for Eran, it is fatal for an
advisor with 80 households; every friction goes straight to the backlog.

## 10. Risks & open questions (updated)

- **Regulation (both sides now).** Legal review before the first paying advisor must cover:
  (a) WealthOS's decision-support line (unchanged), (b) InvestWise's order-entry-assistant
  status under ISA rules, (c) whether *bundling* — advisor pays for a client app that stages
  orders — could be construed as the advisor participating in execution. The firewall design
  (self-directed, household-consented, no product transit) is the answer; get it opined.
- **Product temptation.** Bundling raises pressure to leak products into advisor-facing
  surfaces (especially for S3). The product-reference validator becomes a *contract* test on
  the integration artifact: the plan export must provably contain no product references.
- **Two stacks.** TS monorepo ↔ Python integrate via versioned JSON contracts + webhooks with
  shared fixtures in both repos — never shared code. Contract drift is the failure mode; pin
  contract versions like assumptions.
- **Consent & privacy.** The up-feed is opt-in per household and revocable; the advisor sees
  aggregates. Public-repo rule unchanged: no real household data, all fixtures synthetic.
- **Sequencing.** The bundle must not delay G0/G1. Integration v1a (plan export/import) is
  small and demo-critical; v1b (feed) rides on InvestWise broker Phases 0–1. If either slips,
  G1 proceeds on J1 alone.
- **Broker access.** InvestWise's open question stands: do inter-il / IBI expose APIs, or does
  Phase 1 start as secure statement/CSV import? The bundle inherits this dependency for v1b
  (manual holdings entry bridges the gap).
- **Mislaka file-format licensing** — unchanged, confirm.
- **Hebrew-first is a feature, not a bug** — unchanged; InvestWise UI is currently EN-leaning —
  bundled households need HE parity (add to IW backlog before pilot).

## 11. Commercial-track roadmap (resequenced)

1. **G0**: tenancy + auth + advisor console (unchanged, prereq for everything).
2. **Mislaka XML adapter** (+ expense CSV estimator) — onboarding unlock (unchanged).
3. **Integration v1a — plan export → InvestWise import.** Small build, outsized demo value:
   the pilot pitch becomes "your client opens their app and your plan is already there."
4. **InvestWise broker Phases 0–1** (mock + read-only sync) — prereq for v1b; valuable
   standalone regardless.
5. **Integration v1b — consented holdings/fills feed → WealthOS ingestion adapter**
   (`BROKER_SYNC` trust tier); HUM-E becomes measurable.
6. **White-label client report** — now includes execution progress, not just plan + scenarios.
7. **Design-partner pilot**: 3–5 planners *and their households* on the bundle; success = G1
   gates including ≥10 connected households.
8. **Billing + pricing test** (base + bundle uplift); then scale through the planners'
   association.

## 12. Operating model — how B2B2C and B2C live together

The two motions never merge; they share one asset. **InvestWise Pro is one codebase with two
SKUs; WealthOS is only ever B2B2C.**

- **Bundled seat (the B2B2C leg of InvestWise).** Provisioned by the advisor, paid by the
  advisor (the ₪10–20/hh/mo uplift), plan-linked (import + consented feed). Not a consumer
  sale — the advisor is the channel and the app is part of WealthOS's value proposition.
- **Standalone consumer (the B2C leg).** Self-serve household, self-owned plan, no advisor
  link. Pricing is an **open owner decision** (free / freemium / paid); until decided, the
  standalone motion stays organic — customer-zero + word of mouth, no paid acquisition.

**Two bridges connect the motions:**

1. **Down-bundle** — WealthOS advisors distribute InvestWise to their households: B2B2C
   distribution of the consumer product. This is the flagship J2 journey.
2. **Up-referral** — a standalone user hits the securities-only ceiling ("your hishtalmut
   ceiling isn't visible here") and is referred to a WealthOS planner: B2C as lead-gen for the
   advisor motion. Post-G2, self-serve WealthOS-lite becomes the second upgrade path.

**Fences that prevent channel conflict:**

- Plan-link features (plan import, consented feed, advisor progress view) exist **only** in
  bundled mode — a standalone subscription can never replicate the bundle.
- InvestWise never positions itself as an advisor replacement; it names what it cannot see
  (pension, hishtalmut, mortgage, tax picture) and refers. If planners suspect the app
  competes with them, they won't distribute it — the referral honesty is the distribution deal.
- Whole-household intelligence stays in WealthOS permanently.

**Sequencing rule (solo-founder guard):** one funded go-to-market at a time. Through G1–G2 the
paid motion is the advisor motion; consumer-only features are built only when the bundle also
needs them (e.g. Hebrew parity, broker staging serve both).

**The flywheel:** standalone users → planner referrals → advisors adopt WealthOS → advisors
bundle households into InvestWise → execution data flows back → monitoring proves value →
advisors retain and expand → more households in the app.

Current-state vs next-level gap analysis for both products: see `GAP-ANALYSIS.md`.

## 13. Mission & vision

**WealthOS**
- *Mission:* give every Israeli household the internal machinery of a family office — map,
  verify, and monitor the whole balance sheet, and turn Israel's tax and pension mechanics
  into explainable, auditable strategy — through the planners who serve them.
- *Vision:* every financial plan in Israel is a living system, not a PDF.

**InvestWise Pro**
- *Mission:* make self-directed investing honest and executable — grounded numbers, sized and
  funded actions, disciplined rules, and an Accept button that tells the truth.
- *Vision:* the portfolio app where the plan, the portfolio, and the next action are one thing.

**Combined**
- *Mission:* close the loop from strategy to execution for Israeli households — the advisor's
  plan and the household's portfolio operating as one system, with a firewall exactly where
  the law draws one.
- *Vision:* a family office in every pocket: strategy that watches daily, execution that
  follows the plan, and proof that it worked.

## 14. Evidence base

Every load-bearing claim in this document has been audited against sources — see
`MARKET-RESEARCH.md` §2 (claim-audit table C1–C14), with industry data, TAM/SAM/SOM,
competition, SWOTs, and trends. Two claims were corrected in place on 2026-07-19: the
"planners have no tooling" claim (C6 — Plan-T exists; differentiation restated) and the
"commission compression" claim (C13 — commissions grew; the pressure is regulatory).
