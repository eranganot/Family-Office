# Market Research — WealthOS × InvestWise Pro (Israel, 2026-07-19)

Companion to `PRODUCT-STRATEGY.md` v2 and `GAP-ANALYSIS.md`. All figures below are sourced
(§7); estimates are labeled as estimates with their assumptions stated. Currency ₪ unless noted.

---

## 1. Industry insights — the Israeli wealth & advice market in numbers

**The wealth pool.** Israeli households' financial-asset portfolio reached **₪6.9T at Q3 2025**
and grew another ₪287B (+4.2%) in Q4 — an all-time high (Bank of Israel). This excludes real
estate, which dominates most household balance sheets — the *whole* pool WealthOS models is
substantially larger than the financial portfolio alone.

**The advice channel is inverted.** At the end of 2021 Israel had **457 licensed pension
advisors (יועצים פנסיוניים) vs 10,310 pension insurance agents** plus 1,425 marketers — and the
objective-advice channel has *shrunk* (1,607 advice licensees in 2008). A Treasury-commissioned
survey found **74% of savers bought pension products through agents**. Total commissions paid
to license holders reached **₪10.9B in 2023**, with gemel+pension commissions growing 17% (2022)
and 10% (2023) (Capital Market Authority). Distribution, not advice, is the default — which is
precisely the market failure the strategy names.

**Fee-based planning is small but institutionalizing.** ~**750 CFP-certified planners** have
been trained in Israel, **300+ are listed as active** in the FPAI (לשכת המתכננים הפיננסיים)
index, FPAI reports a community of 320+ members, and **~150 more are in certification** — a
~20% pipeline on the existing base. The profession has an annual conference, a code of ethics,
and a growing academy. CFP is not legally required to practice, which means the practical
population of "planning-first" practitioners is somewhat larger than the certified count.

**The self-directed boom (InvestWise's market).** TASE data: **~161K new trading accounts
opened in 2024** (~70K of them independent accounts at investment houses — 3× 2023, 4.5× 2020),
and **another ~87K in H1 2025** (~33K at investment houses). Independent-trader account counts
are at an all-time high; banks still hold ~80% of retail securities activity, and bank
securities-fee income hit ₪1.67B in H1 2025 (+18% YoY) — a visible fee umbrella. Portfolio
composition has globalized (typical self-directed books now ~70% foreign).

**Infrastructure tailwinds.** The Mislaka (מסלקה פנסיונית, operated by Swiftness under
Ministry of Finance oversight) gives licensed advisors — via a one-time client authorization
valid 3 months — a full, structured snapshot of every pension/hishtalmut/gemel product across
all institutions; individuals can also pull their own report. Open-banking-style data sharing
is being institutionalized (Bank of Israel added "information-concentration services" to the
banking fee rules in April 2025). The rails WealthOS's onboarding ladder needs are regulatory
reality, not speculation.

## 2. Claim audit — every load-bearing strategy statement, checked

| # | Strategy claim | Verdict | Evidence / correction |
|---|---------------|---------|----------------------|
| C1 | "Hundreds of practitioners" (S1) | ✅ Verified | ~750 CFP-trained; 300+ FPAI-listed active; ~150 in certification |
| C2 | "30–150 client households each" | ⚠ Unverifiable publicly | No public data; kept as **owner estimate to validate in pilot** (strategy text now says so) |
| C3 | Planners are "the fastest-growing" advice segment | ⚠ Plausible, softened | ~20% certification pipeline + agent-conversion pressure support direction; no time series exists. Reworded to "small but institutionalizing, with a visible pipeline" |
| C4 | Banks/agents are product sellers; advice = distribution | ✅ Verified | 74% of savers buy via agents; 457 advisors vs 10,310 agents; ₪10.9B commissions (2023) |
| C5 | "Family offices start at $5M+" | ✅ Roughly right | US Advisers Act family-office floor is >$5M AUM; practical MFO minimums usually higher. Wording kept |
| C6 | Planners "have no operating system" / run on Excel | ✖ **Corrected** | **Plan-T exists** — an Israeli platform giving agents/planners a holistic client-asset view + CRM + reports + planning + allocation. Differentiation restated: existing tools are *CRM/reporting* platforms; none is a strategy **engine** with refusal semantics, enforced workflow, reproducibility pins, or a monitoring loop — and none links to execution |
| C7 | "Every advisor already pulls Mislaka per client" | ⚠ Nuanced | Mechanism verified (one-time authorization, 3-month validity, all institutions, paid per pull) — but pulls require a **licensed** בעל רישיון; an unlicensed fee-based planner has the client pull their own file. Adapter must accept both paths (strategy §5 updated) |
| C8 | Expiring annual tax ceilings quietly leak money | ✅ Verified | 2026: hishtalmut self-employed deduction cap ₪13,203 (income ceiling ₪293,397), CG-exempt deposit cap ₪20,566; employee 7.5%/2.5% to ₪15,712/mo salary; 45a/47 pension ceilings on הכנסה מזכה ₪232,800/yr. All year-bound |
| C9 | Multi-track CPI-linked mortgages | ✅ Standard market structure | IL mortgages are conventionally split across linked/unlinked, fixed/variable tracks; uncontroversial |
| C10 | RSU concentration in tech households | ✅ Supported | 400K+ hi-tech employees (~11.5% of employment, ~half in R&D roles); equity comp is standard |
| C11 | Pricing ₪30–60/hh/mo | ⚠ Hypothesis | No public Israeli per-household benchmark (Plan-T doesn't publish pricing). Remains a pilot-validated hypothesis |
| C12 | "No Israeli tool where the plan and the portfolio are the same object" | ✅ Survives (post-C6) | Plan-T is advisor-side with no execution link; trading apps are execution-side with no plan. The *combination* remains unclaimed territory |
| C13 | Commission compression pushes agents to fee-based work | ✖ **Corrected** | Commissions paid actually **grew** 2021–2023. The real drivers: regulatory pressure (uniform-commission legislation, distribution-fee bans e.g. the "צירוף לרבים" ruling), a shrinking objective-advice channel, and reputational shift. Strategy wording replaced |
| C14 | Self-directed retail is growing (IW's market) | ✅ Verified | 161K new accounts (2024), 87K (H1 2025); record independent-account counts |

## 3. User segments — with numbers

**S1 (planners, buyer):** ~300–750 practitioners today; realistic near-term practitioner pool
~1,000–1,500 including converting agents (from a 10,310-agent population). At the owner's
30–150-households estimate, the advisor-served planning population is roughly **25K–75K
households** today.

**S1-C (the planner's client household, end user):** two profiles. Tech: 400K+ employees →
roughly **~250K tech households** (est., co-working couples overlap), RSU-heavy, mortgage-carrying.
Mass-affluent non-tech: top two income deciles ≈ **~580K households** (est. from ~2.9M
households, CBS survey framework). The overlap of "would pay for planning" and "advisor-reachable"
is the S1 multiplication above.

**S3 (agents converting):** 10,310 pension agents — an order of magnitude larger than S1. The
opportunistic upside and the firewall risk both scale with it.

**S4 / InvestWise standalone:** independent trading accounts at record highs — est. **0.6–1M
self-directed accounts** (161K added in 2024 alone; banks ~80% of activity), growing
~90–160K/yr. Hebrew-first, plan-linked tooling for them is exactly the underserved niche.

## 4. TAM / SAM / SOM

All ARR figures are estimates; assumptions inline. Advisor-led pricing: ₪30–60/hh/mo (+₪10–20
bundle uplift) per the strategy hypothesis (C11).

**WealthOS (advisor-led B2B2C):**

| Layer | Definition | Size (est.) | ARR potential |
|---|---|---|---|
| TAM | All plausible IL planning practitioners (~1,500 incl. conversions) × 80 hh avg | ~120K households | **₪43–86M/yr** (₪30–60/hh/mo) |
| SAM | FPAI-orbit active planners (~300–400) × 30–150 hh | ~10K–48K households | **₪5–23M/yr** |
| SOM (=G2) | 25 paying advisors × ~30 hh | 750 HUM | **₪0.3–0.5M/yr** + uplift |

**InvestWise Pro (standalone B2C — unfunded motion until after G2):**

| Layer | Definition | Size (est.) | Notes |
|---|---|---|---|
| TAM | IL self-directed investors | 0.6–1M accounts | Monetization undecided (free/freemium/paid — open owner decision) |
| SAM | Hebrew-first, mobile-first, plan-seeking self-directed investors | ~200–300K | The segment the wedge speaks to |
| SOM | Organic-only reach by G2 | 1–3K users | Customer-zero + word of mouth; no paid acquisition per §12 |

**Combined bundle (advisor-led):** bundle uplift on HUM — at G2 (750 HUM, ≥30% connected):
**+₪27–54K/yr**; at SAM saturation (30% of 20K hh connected): **+₪0.7–1.4M/yr**. The bundle's
main value at this stage is **retention and differentiation**, not direct revenue — priced
accordingly.

## 5. Competition

| Player | What it is | vs the combined product |
|---|---|---|
| **Plan-T** | IL platform for agents/planners: holistic client view, CRM, reports, planning, asset allocation | Closest advisor-side competitor. CRM/reporting DNA; no evidence of strategy engines, versioned assumptions, enforced workflow, monitoring loop, or execution link. Must-watch; also validates the market |
| Excel + PowerPoint + מסלקה pulls | The actual incumbent | Still the dominant "tool"; switching cost is habit, not license fees |
| Planning-as-a-service firms (e.g. financialplanning.co.il, S.F.P) | CFP-led services, some with client dashboards | Compete for S1-C mindshare, not for the advisor-software budget; potential customers or partners |
| Bank advice / agents | "Free" advice as distribution | The strategy's named alternative; conflicted by design (C4) |
| Trading apps & brokers (IBI, Meitav, Excellence, Blink, banks) | Execution venues | InvestWise's substrate, not competitors — IW sits above them; Blink-style fintechs could move up-stack (threat) |
| Global planning software (eMoney/RightCapital class) | Mature US advisor OS | Not localized (Hebrew, Mislaka, IL tax); entry unlikely pre-market-proof; would be the serious threat if it happened |

## 6. SWOT analyses

### WealthOS

| | |
|---|---|
| **Strengths** | Only strategy-*engine* architecture aimed at this market (refusal semantics, versioned registries, reproducibility pins, enforced 5-phase loop); Hebrew-first bilingual by design; deep IL mechanics (Mislaka, ceilings, CPI-mortgage tracks) as first-class inputs; customer-zero validation loop |
| **Weaknesses** | The buyer can't log in yet (single household, no tenancy/console — GAP W1–W2); Mislaka adapter unbuilt (W3); tax matrices unsigned (W4); no billing or brand; solo founder |
| **Opportunities** | Shrinking objective-advice channel + professionalizing planner base (FPAI as channel); data-rails maturation (Mislaka, open banking); 10K+ agents converting (S3); white-label reports; Plan-T's existence proves an advisor software budget exists |
| **Threats** | Plan-T moving up-stack from CRM into engines; a global player (eMoney class) localizing; regulatory shift in the advisor line; Mislaka format/licensing surprises; planner adoption culture (Excel inertia) |

### InvestWise Pro

| | |
|---|---|
| **Strengths** | Honest, grounded recommendations as product DNA (no invented numbers, truthful Accept); sized+funded actionability; trading rules with vol-derived levels; PWA+push; live pricing pipeline; CI-hardened (~259 tests) |
| **Weaknesses** | Single-user; execution still simulated (no broker); EN-leaning UI; no entitlements/billing; unfunded GTM by design until after G2 (GAP IW1–IW9) |
| **Opportunities** | Record self-directed growth (161K new accounts 2024, 87K H1-2025); fee-flight from banks (₪1.67B/H1 fee umbrella); the Hebrew-first, plan-linked niche is unclaimed (C12); broker partnerships as distribution |
| **Threats** | IL broker API access uncertainty (inter-il/IBI); investment-adviser regulatory exposure for sized recommendations; brokers/fintechs (Blink class) adding advice layers on top of execution; dependence on external price providers |

### The bundle (combined)

| | |
|---|---|
| **Strengths** | The closed strategy→execution loop is unclaimed in Israel (C12); the firewall doubles as a regulatory asset; retention economics for the advisor (plan lives in the client's pocket); two-door flywheel (§12 of the strategy) |
| **Weaknesses** | Two stacks and two brands to run solo; integration contract not yet built (seam gaps S1–S5); bundle value depends on both products maturing in step |
| **Opportunities** | "Your client opens their app and your plan is already there" as the pilot pitch; execution-progress data is advisor value no competitor has; HUM-E as a fundable, compounding metric |
| **Threats** | Bundling construed as advisor participation in execution (legal opinion pending — W5/IW6); S3 product-temptation reputational risk; sequencing risk — integration work delaying G0/G1 |

## 7. Market trends

1. **Retail participation surge** — record account openings, retail flows moving indices
   (TA-125 net retail inflows since H2 2024); a durable behavioral shift post-2020.
2. **Objective advice shrinking / distribution consolidating** — the vacuum WealthOS's buyer
   fills; regulation (uniform commissions bill) keeps pressuring the agent model toward
   fee-based credibility (C13).
3. **Professionalization of planning** — FPAI standards, ~150/yr certification pipeline,
   annual conference: a coalescing channel to market through.
4. **Data-rails maturation** — Mislaka ubiquity, open-banking fee rules (Apr 2025), digital
   ID: onboarding friction is falling industry-wide; WealthOS should ride this, not fight it.
5. **Fee awareness** — public campaigns against bank securities fees (₪1.67B/H1) push
   self-directed migration to investment houses — InvestWise's user inflow.
6. **AI-native expectations** — clients will increasingly expect explainable, always-on
   monitoring rather than annual PDFs; incumbent tools built as CRMs will struggle to retrofit
   engines; this is the architectural bet both products already made.
7. **Geopolitical volatility** — war-period drawdowns and recoveries (2023–2025) demonstrated
   both the fragility of set-and-forget plans and the value of disciplined rules — supportive
   of the monitoring + rules narrative in both products.

## 8. Sources

- Bank of Israel — public financial-assets portfolio, Q3 2025 (boi.org.il/publications/pressreleases/28-12-25) and Q4 2025 (29-3-26)
- Knesset bill file 25_ls_bk_2169304.pdf — pension advisors vs agents counts, 74% survey, uniform-commission rationale
- Capital Market Authority — Commissioner's Report ch. 6 (commissions by branch, 2020–2023)
- BDO Academy CFP program page (lp.bdo-academy.co.il/cfp) — ~750 trained CFPs, ~150 in certification
- FPAI — fpai.co.il (300+ active planners index; 320+ member community; 2026 annual conference)
- Kol Zchut — Mislaka operations page; hishtalmut self-employed page (2026 ceilings)
- Harel / Clal 2026 ceilings PDFs — full 2026 deposit-ceiling tables (₪13,203 / ₪20,566 / ₪15,712 / ₪232,800 / ₪293,397)
- Harel/Mizrahi/Amitim — one-time authorization (הרשאה חד פעמית) forms: licensed-holder requirement, 3-month validity
- ynet capital (sj8k00lthgg) — TASE new-account data: 161K (2024), 87K (H1 2025), investment-house breakdown
- Calcalist (rkxbtd1jy) — independent-trader accounts at all-time high; banks ~80% share
- Supermarker/TheMarker — bank securities-fee income ₪1.67B H1 2025 (+18%), from BoI banking survey
- Bank of Israel banking-system survey H1 2025 (26lm5626.pdf) — fee framework, information-concentration services (Apr 2025)
- Israel Innovation Authority — 400K+ hi-tech employees (2025); Employment Service hi-tech report — ~435K salaried, ~11.5% of employment
- Westlaw Practical Law — US family-office definition (>$5M AUM)
- Plan-T (plan-t.org.il) — competitor capabilities; financialplanning.co.il, sfp.org.il — planning-as-a-service
- Reichman University (RUNI) — Israeli capital market 2025 annual summary

**Confidence notes:** planner-count figures mix "trained" (BDO, cumulative) with "active"
(FPAI) — treat 300–750 as the honest range. Household counts and tech-household estimates are
derivations, not census figures. TASE account counts count *accounts*, not unique people
(multi-account holders inflate the base). All TAM/SAM/SOM math inherits the C11 pricing
hypothesis.
