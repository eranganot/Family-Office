# WealthOS — Session Status Log

> Read this first in any new session. Update after every meaningful change.

> _Weekly status review **2026-11-16**: `origin/main` = `40c11eb` (PR #15, merged 2026-11-16). Since 11-02: WO-2 (`43d9ce3`, 11-07) squashed the migration branch onto `main` — `e2e.yml` (now signs in; skipped without `E2E_EMAIL`/`E2E_PASSWORD` secrets), the SMOKE runbooks and CLAUDE.md are on `main`; Dependabot minor/patch config (11-09); Railway deploy settings moved to `.railway/railway.ts` (11-09/11-16). ⚠️ **2026-11-15 incident:** the AdaptiveFit `railway.ts` was applied to this project and deleted `wealthos-web`, `wealthos-worker` and `function-bun` with their variables (Postgres and both volumes survived); `f981710` is the rebuild config. **Prod `/api/health` 200 on `40c11eb`, db ok (checked 2026-11-16).** The Mac checkout is on `fix/wo-8-railway-iac` (`d224e9d`, WO-8 cutover prep, pushed only to `origin/fix/wo-8-railway-iac`), 4 behind `origin/main`; this file's 11-02 + 11-16 review edits are uncommitted. "Current state" date not bumped (no commits today)._
>
> _(2026-11-02 review:) Weekly status review **2026-11-02** (first on the Mac): HEAD is `7abc389` "wip: back up uncommitted work before PC to Mac migration" (2026-10-18) on branch `wip/pc-migration-2026-10-18` (pushed); **`main` is still `8b93845` (2026-08-02) — 13 weeks with no product commit** ("Current state" date not bumped). The WIP commit swept the CRLF noise and committed `e2e.yml` + the four SMOKE docs, so the tree is now clean — but only on the `wip/` branch. Ops aged +3 weeks; the tax-matrix row CLOSED as already done since 2026-07-29 (`17408df`). July session log ("Current state … 2026-07-29" and older) moved to STATUS-ARCHIVE.md._
>
> _(2026-10-12 review:) Weekly status review **2026-10-12**: **no commits since `8b93845` (2026-08-02) — 71 days / ten weeks quiet** ("Current state" date not bumped). ✅ The `.git/index.lock` the 10-05 run left is **gone** (checked 10-12; this run used only `--no-optional-locks`). Ops table aged +1 week; nothing closed. e2e.yml + SMOKE-M37/38a/38b/38c.md still untracked. Same finding: sessions 32-33 are "unverified and kept" by default._
>
> _(2026-08-03 → 10-05 reviews, collapsed 2026-11-02: nine staleness reviews, same finding each week — sessions 32-33 unverified, CRLF noise, untracked e2e.yml + SMOKE docs; the 09-14 and 09-21 runs left `.git/index.lock`, which produced the permanent `--no-optional-locks` rule. Full text in git history.)_

## 🔴 OPS ACTIONS (Eran only) — with age

_Dates are when the item was FIRST flagged, carried forward, never reset._

| first flagged | age | item |
|---|---|---|
| 2026-08-02 | **15 weeks — BLOCKING** | 🔴 **Owner QA on sessions 32–33 has not happened.** ~40 commits — M41 #6 surplus→deployment, phase-gate alignment, verification honesty, per-item document attribution, goals in the health score, the M43 Hebrew audit — are all built, gated, committed and **unverified on live for seven weeks**. This is the single item blocking the repo; nothing else can be sequenced behind an unvalidated batch this size. Start with the M41 #6 check below, because **its expected answer is a REFUSAL** and a "success" reading of it is the likeliest way this QA goes wrong. |
| 2026-08-02 | **15 weeks — BLOCKING** | 🔴 **`runAllocation`'s month-selection and ready gate are still uncovered by tests** — named in STATUS as "the single biggest test gap in the session-32 work" and untouched since. It is DB-bound, the engine half is covered, and the service half is guarded only by a deploy script's source assertions. Seven weeks on, it is a deliberate gap, not a pending one — close it, or write down here that it stays open and why. A test gap you have declined to close twice is a decision; record it as one. |
| 2026-08-03 | **CLOSED 2026-11-16 — on `main` via WO-2 `43d9ce3` (2026-11-07)** | ✅ e2e.yml + the four SMOKE docs are on `origin/main`; WO-2 also fixed its sign-in. _Original row:_ ⚠️ **`.github/workflows/e2e.yml` is not on `main`.** (Was untracked until `7abc389`.) Merge the WIP branch to `main` (mind the shared GitHub Actions minutes), or delete the workflow. An e2e workflow that is not committed is not running — CI has no e2e coverage and the file's presence in the tree makes it look like it does. Commit it or delete it. Same for the four untracked `docs/SMOKE-M37/38a/38b/38c.md`. |
| 2026-08-03 | **15 weeks — BLOCKING** | ⚠️ Four commits (`ce40f8e` → `5c0741a`) still carry the **identical message** *"fix: phase locks, document honesty, goals in the health score, per-item attribution"* — almost certainly one gate script re-run four times. Harmless to the tree; a history where four commits claim the same work cannot be read later. (InvestWise shipped 48 commits this week with **no** duplicate-message pair — the first clean week for that artefact in five reviews, which suggests its ship script was fixed and WealthOS's was not. Since WealthOS has not committed since 08-02 the bug here is untested rather than absent; it will reappear on the next gated batch unless the script is checked first.) |
| 2026-07-28 | **CLOSED 2026-11-02 — it was never open** | ✅ **IL 2025/2026 tax matrices are owner-reviewed.** `17408df` (2026-07-29, "chore(registry): owner-reviewed IL 2025/2026 …") sets `ownerReviewed: true` on all 7 seed entries in `packages/registry/src/seed-data/il-2025.ts` / `il-2026.ts` (0 remain `false`); "Tax figures signed off (owner, 2026-07-29)" says the same. The line at the bottom of the M39 entry predated that commit and was never cleared. Verify on production if wanted: `/registry` shows no "unverified figures" banner. |
| 2026-11-02 | **CLOSED 2026-11-16 — merged by WO-2 `43d9ce3` (2026-11-07)** | ✅ _Original row:_ ⚠️ **The PC→Mac migration WIP was never sorted out** — see the review note at the top. Merge `wip/pc-migration-2026-10-18` into `main` or drop it. Verify by: `git --no-optional-locks -C ~/Dev/Family-Office rev-parse --abbrev-ref HEAD` prints `main` and `git … status --porcelain` is empty. |
| 2026-11-16 | **new** | ⚠️ **Confirm `wealthos-worker` came back after the 2026-11-15 wrong-project apply.** The web service is back (health 200 on `40c11eb`), but the worker has no public endpoint, so its recovery is unverified. Verify by: Railway → project `vivacious-presence` → production → `wealthos-worker` exists, Settings → Cron Schedule = `0 6 * * *`, restart policy Never, variable `DATABASE_URL` present, and Deployments shows a run at 06:00 UTC. If missing, recreate from `.railway/railway.ts` (`railway status` must name vivacious-presence before `railway config apply`). |
| 2026-10-05 | **CLOSED 2026-10-12** | ✅ `.git/index.lock` is gone (verified 10-12). |

---

# 🚀 START HERE — sessions 32–33 ALL GATED AND ON MAIN. NEXT = OWNER QA.

**Run `session-kickoff` first.** Everything the block below describes as "BUILT, gate not
run" **has since been gated and committed** — ~40 commits landed 2026-08-02, ending at
`8b93845` (M43 Hebrew phrasing audit). Nothing on 2026-08-03. The narrative below is kept
because it records the reasoning, but the *state* is: **built, gated, committed, awaiting
the owner's QA on live.**

| Section below | Landed as |
|---|---|
| M41 #6 surplus → deployment | `c90298a` |
| Phase-gate misalignment | `d78d59d`, `826ebad` |
| Verification honesty + operations loop | `826ebad` |
| Per-item document attribution | `789e06e` |
| Tier 3 #2 — goals in the health score | `b72b35e` |
| Tier 3 #4 — Hebrew phrasing audit | `8b93845` |
| Combined re-runs of the four above | `ce40f8e`, `180d159`, `4f48a9f`, `5c0741a` |

⚠️ **Four commits carry the identical message** *"fix: phase locks, document honesty,
goals in the health score, per-item attribution"* (`ce40f8e` → `5c0741a`). Almost
certainly a gate script re-run four times rather than four distinct changes — but a
history where four commits claim the same work cannot be read later. Worth a look;
harmless to the tree either way.

### ⚠️ THE QA THAT MATTERS MOST — M41 #6's expected answer is a REFUSAL
Re-stated here because it is the one result that is easy to misread as success: on this
household every closed month is provisional, so `allocationHandoffReadiness` returns
`SURPLUS_PROVISIONAL` and **zero surplus is deployed.** If "Free to deploy" GROWS on the
first regenerate, **the ready gate leaked** — `verifiedSurplusBase` is populated on
refusals too, so the number's presence must never be the gate.

### ⚠️ STILL UNCOVERED BY TESTS (unchanged by the commits)
No test covers `runAllocation`'s month-selection or the ready gate — it is DB-bound and
those suites need the shared test DB. The engine half is covered; the service half is
guarded only by the deploy script's source assertions. **This is the single biggest test
gap in the session-32 work.**

### ✅ M41 #6 — surplus → deployment engine. Committed `c90298a`; owner QA pending.
The last genuinely unfinished M41 item, and the only one that changes how much money the
app proposes deploying. Nine files, no migration, no lockfile change, **no new assumption
key** (pins stay valid, no recompute).

| File | Change |
|---|---|
| `engine-strategy/src/findings.ts` | `AnalyzerContext.deployableSurplusBase?: number \| undefined` |
| `engine-strategy/src/deployment.ts` | `idleCashBase` + `surplusBase` on `DeploymentPlans`; 3 new notes; `DeploymentSurplusHandoff` |
| `engine-strategy/src/index.ts` | exports the new type |
| `engine-strategy/test/deployment.test.ts` | 9 new tests incl. a regression pin |
| `api/services/allocation-service.ts` | resolves latest CLOSED month → readiness → passes surplus only if `ready` |
| `allocation/page.tsx` + `en/he.json` | renders the inclusion **or the refusal reason** |

**The expected QA result today is a REFUSAL, not a bigger number.** Every closed month in
this household is provisional, so `allocationHandoffReadiness` returns
`SURPLUS_PROVISIONAL` and **zero surplus is deployed**. That is correct. If "Free to
deploy" grows on the first regenerate, **the ready gate leaked** — `verifiedSurplusBase`
is populated on refusals too, so the number's presence must never be the gate.

Decisions encoded (do not silently undo any of these):
- **ONE month, never annualised.** Twelve times a forecast is not cash.
- **Negative surplus contributes ZERO**, never shrinks the deployable amount.
- **Surplus does NOT jump the buffer** and is not netted off the shortfall — a buffer must
  be spendable the day a shock lands; a surplus has not arrived.
- **`idleCashBase` and `surplusBase` reported separately**, reconciling to `freeCashBase`.
- **The refusal is rendered, with its reason and the refused figure.** This is the
  seventh instance of the six-times pattern below, and the first one designed against it
  up front rather than after QA found it.

**Not done:** no test covers `runAllocation`'s month-selection or the ready gate (it is
DB-bound; those suites need the shared test DB). The engine half is covered; the
service half is currently guarded only by the deploy script's source assertions.

### ✅ PHASE-GATE MISALIGNMENT — found in QA 2026-08-02, fixed, gated, committed
`deploy-2026-08-02-phase-gate-alignment.ps1`. No migration, no lockfile, no assumption key.

**Owner report:** allocation plan approved, page says *"מוכן להמשך → המשך לאסטרטגיה"*, but
`/strategy` answers *"נעולה עד להשלמת האימות"* and links to Verification — a page whose
queue is empty. A dead end built from three individually correct pieces.

**Root cause, and it is a documentation bug:** M25 inserted **ALLOCATION between
VERIFICATION and STRATEGY**, making the machine five-phase. `CLAUDE.md` kept saying
*"four-phase (MAPPING → VERIFICATION → STRATEGY → MONITORING)"* — omitting ALLOCATION
entirely — and that is the file every session reads first. Four locked pages were written
against the stale model and all four named VERIFICATION as STRATEGY's prerequisite.
**`domain/src/workflow/state-machine.ts` is the only authority.** CLAUDE.md now says so.

| Surface | Was | Now |
|---|---|---|
| `/strategy` lock | "complete verification" → `/verification` | names the ACTUAL current phase, links there, **renders PhaseGate** so it can be unlocked from the page that refused |
| `/allocation` "מעבר לאסטרטגיה →" | plain `<Link>` — navigated to a locked page | performs the transition, like PhaseGate's button |
| `/allocation` lock | → `/verification` (wrong from STRATEGY/MONITORING, both legal origins) | names current phase, links there |
| `/scenarios` lock | label built by `t("wrongPhase").split(".")[0]` — rendered a whole sentence on a button | proper key, links to current phase |
| `monitoring.wrongPhase` | "the fourth phase" | "the fifth and final phase" |

**What was already correct and stays untouched:** the state machine, `PhaseGate`, the
top-nav journey strip, and the dashboard next-step router all encode five phases properly.
Only static copy and one link were stale — which is why this survived so long: every
*dynamic* surface was right.

Stale keys `strategy.wrongPhase`, `strategy.goToVerification`, `allocation.wrongPhase`,
`allocation.goToGate`, `scenarios.wrongPhase` were **deleted, not left orphaned** — a key
that still states the wrong rule is an invitation to re-wire to it.

**Lesson to keep:** the approved plan does NOT advance the phase, and that is correct
(approval and transition are separate decisions). But then no button may say "go to
strategy" unless it performs the transition. *A control that names a destination must be
able to reach it.*

#### ⚠️ GUARDS THAT MATCH THEIR OWN DOCUMENTATION — second occurrence
The first run of this script **refused a correct commit**: the assertion *"the allocation
page must no longer link to /strategy"* matched the **JSX comment explaining what the old
link was**. The code was right; the prose describing the fix tripped the check.

This is the same failure as the M40c migration guard matching `IS NOT NULL` inside a
comment (which is why that one now strips `--` lines). **Twice now, a guard has read prose
as code and blocked the very fix it was written to protect.**

Two fixes applied, deliberately both:
1. **`Get-CodeOnly`** strips `/* … */` (which covers JSX `{/* … */}`) before every source
   assertion in section 2. This is the general cure — use it in future deploy scripts.
   ⚠️ Truncation length is still measured on the **raw** file; a comment is still bytes,
   and the mount silently truncating a write is what that check exists to catch.
2. The comment no longer contains the old markup literally, and says why.

Also worth copying: **CLAUDE.md is asserted POSITIVELY** (`**ALLOCATION**` must appear).
A negative check for the old "four-phase" wording is fragile the moment the file starts
*discussing* the old error — a naive substring match would flag the correction as the
mistake. And deploy scripts are ASCII-only, so the arrows in that line can never be
matched; the bolded phase name can.

### ✅ VERIFICATION HONESTY + OPERATIONS VISIBILITY — QA 2026-08-02, fixed, gated, committed
`deploy-2026-08-02-verification-honesty.ps1`. No migration, no lockfile, no assumption key.
Run AFTER the phase-gate script.

**Owner report:** *"if you have all the relevant files you need, mark them present"* — 18
red rows while the review queue said *"כל הפריטים מאומתים. אין מה לבדוק"*. Owner confirmed
he HAD uploaded some of those documents.

**Root cause — `MISLAKA` was unsatisfiable.** The Israeli pension clearinghouse returns
**ONE** report covering every pension / gemel / hishtalmut product a person holds. It is a
valid, selectable `docType` (`DocTypeSchema` line 17) and **no rule in
`EXPECTED_DOC_RULES` ever accepted it.** So uploading the one document that actually
answers the question left thirteen rows red forever. Rules now carry `alsoAccepts`, and
the row reports **which** docType satisfied it — a MISLAKA answering a `PENSION_REPORT`
row looks like a bug unless it says so.

⚠️ **If a document still shows red, check its `docType` on `/documents`.** `docType` is
nullable and the selector defaults to `OTHER`; an untyped or `OTHER`-typed file matches
nothing. `documents.setDocType` fixes it in place. **A null docType is deliberately still
evidence of nothing** — pinned by a test.

**Second fix — the queue stopped claiming completeness it cannot see.** `queueEmpty` was
an unqualified clean bill of health rendered directly *below* the missing-documents list.
Neither card was broken; they measure different things (owner attestation vs primary
source), and the queue never said so. It now states what it checked and names what it did
not. Same shape as the review-pinned chip and the drift load-failure.

**Third — Operations is now an ALWAYS-ON LOOP band, deliberately outside the numbered strip.**
Owner: *"mapping/verification/allocation are one-time, strategy is quarterly, operations
is daily/monthly — I'd expect operations after strategy."* The observation is right, the
placement isn't: **phases are gated, and daily work must never be.** Operations is
cross-phase by owner decision D2; making it phase six would gate month-close behind a
state machine and give a MAPPING household a back door into allocation. It renders as a
parallel band — the numbered strip answers *"how far through setup am I"*, the band
answers *"what does this household need from me this week"*.

**Also fixed:** `journey.VERIFICATION` said verification opens "the gate to strategy" —
it opens the gate to **allocation**. Same pre-M25 stale-copy family as the phase locks.

### ✅ PER-ITEM DOCUMENT ATTRIBUTION — BUILT 2026-08-02, gated, committed `789e06e`
`deploy-2026-08-02-doc-attribution.ps1`. No migration, no lockfile, no assumption key.

Matching was by TYPE across the household, so **one bank statement marked every bank
account present** — including institutions it says nothing about.

**The naive fix would have been the opposite error.** Demanding a per-item link flips
those rows to MISSING and claims a document the household demonstrably holds does not
exist. Both are false, in opposite directions. Hence a **fourth state, `UNATTRIBUTED`**
("לא משויך", amber): the evidence is real and nothing connects it to this account. That
is the true position, it is nameable, and the owner can act on it.

**Three link paths, all counted** — using only the first one that came to mind is how a
correct-looking fix creates the opposite bug:

| Path | Why it counts |
|---|---|
| `Valuation.documentId` | the document produced a value for the item |
| `ImportedField` → `batch.documentId` | it populated a field on the item |
| `Transaction.importBatchId` → `documentId` | transactions booked from it are evidence |

⚠️ **Path 3 is what prevents a mass-reddening.** A bank statement imported for its
transactions usually produces **no Valuation at all**, so attributing via Valuation alone
would have declared every such account undocumented.

**`HOUSEHOLD_SCOPED_DOC_TYPES = { MISLAKA, TAX_106 }` need no link.** A Mislaka covers
every retirement product a *person* holds; a 106 covers a person's employment. Requiring
per-item attribution for either would recreate the unsatisfiable-MISLAKA bug in a subtler
form.

**Absent attribution is treated as unattributed, never as "covers everything"** — pinned
by a test, because that default *is* the original bug.

### 🟡 NOT SCOPED ON PURPOSE — `suspenseItem.count` is household-wide
`SuspenseItem` has no `householdId`; it reaches one only via `batch.document.householdId`,
and `ImportBatch.documentId` is **nullable** (manual imports). The obvious scoping would
silently drop every manually-created suspense row — and an under-counted suspense queue
reads as a clean one, unblocking the VERIFICATION gate and making closed months look less
provisional than they are. Proper fix needs `householdId` denormalised onto `ImportBatch`
(a migration). The document query beside it **was** scoped; only this one was left, with
the reason in source.

### ❓ STRATEGY → MONITORING IS UNGATED — is that intended?
`evaluateTransition` imposes **no facts** on `STRATEGY → MONITORING` (only
VERIFICATION→ALLOCATION and ALLOCATION→STRATEGY carry conditions). So the answer to
*"what do I need to do to reach monitoring"* is: run the analysis, decide on the
recommendations, press the button — nothing blocks it. But the monitoring copy claims you
reach it *"once recommendations are in place"*, and nothing enforces that; a household can
enter monitoring with zero recommendations and nothing to monitor. Copy now matches the
behaviour. **Whether the behaviour should change is an owner decision, not taken here.**

### ✅ TIER 3 #2 — goals wired into the health score. Committed `b72b35e`
`deploy-2026-08-02-goals-health.ps1`. No migration, no lockfile, **no new assumption key**.

**⚠️ THE RECORDED BLOCKER WAS FALSE.** M42 left goals unmeasured and wrote down the
reason: *"the funding figures live in engine-goals and need a snapshot `health-service`
does not build."* They do not. `goals.fundingGap` has always computed the report from the
**LIVE ledger with no snapshot at all**. Fifteen points of coverage were lost for a
milestone to a belief that cost less to check than to write down.

**Worth generalising:** a note explaining why something is hard is itself an assumption,
and it never gets re-tested because it reads like a conclusion. This is the second
false-blocker this session — the other was CLAUDE.md's four-phase model.

| Change | |
|---|---|
| `services/goals-service.ts` (NEW) | `householdFundingGaps` extracted from the router; `goalFundingTotals` collapses it to two numbers |
| `routers/goals.ts` | `fundingGap` is now a pass-through — two callers producing two disagreeing funding figures is worse than either being slightly wrong |
| `engine-operations/health-score.ts` | optional `goalsComputable` / `goalsTotal`, reported in the component detail |
| `services/health-service.ts` | goals actually measured; failure degrades to a REFUSAL, not a zero and not an error page |

**Two rules that carry the risk here, both pinned by tests:**
1. **Funding is CAPPED PER GOAL** (`min(projected, required)`). An uncapped sum lets an
   over-funded retirement lend its excess to an unfunded education goal and report 100%
   while a child's education has nothing behind it. *Aggregation is where a per-item
   finding goes to die.*
2. **Non-computable goals are EXCLUDED, not scored unfunded** — a missing target date is a
   data gap, not a financial failure — **but the count travels with the percentage**.
   "80% (3/5 goals)" and "80%" are different claims. Same rule the composite already
   applies to itself by publishing weight coverage beside the score.

**Deliberately NOT deduplicated:** `strategy-service.buildFundingSummary` still runs the
same engine against the **pinned snapshot**. A recommendation must be reproducible from
the snapshot it cites; reading live values there would let a pinned recommendation change
meaning silently. Live for a dashboard reading, pinned for a recommendation — the
difference is the point, not duplication to tidy away.

**Expected effect:** weight coverage rises 85% → 100% once goals have target dates and
required amounts. If it stays at 85%, the goals component is refusing — check whether the
active goals have both fields, and whether `goal_projection_real_return_pct` is positive.

### ✅ TIER 3 #4 — Hebrew phrasing audit. Committed `8b93845` — Tier 3 #4 is DONE.
`deploy-2026-08-02-bilingual-audit.ps1`. Key parity always held; the phrasing had never
been read *as Hebrew*, which catches a different class of fault.

1. **Grammar, ×3.** `בשלב {phase}` interpolates a bare noun into a construct needing the
   definite article — "בשלב הקצאה" for "בשלב ההקצאה". The names can't carry the article
   because `מעבר ל{phase}` needs them bare. **Cure: put the interpolated noun after a
   copula — `השלב הנוכחי הוא {phase}`.** Remember this for any interpolated Hebrew noun.
2. `אף אחד אינו מיושן` — animate form; items take `אף פריט`.
3. `מה דורש אותי` — calque of "what needs me". → `מה דורש טיפול`.
4. `מורכב מ-{idle}` — mem-prefix against an interpolated currency string.

**New gate check: PLACEHOLDER PARITY.** A translation that drops or invents a
`{placeholder}` throws at render in next-intl, and neither key parity nor tsc sees it.
Key parity alone was never sufficient.

### ⚠️ CORRECTIONS — three assertions made without tracing, 2026-08-02
Recorded so the next session doesn't inherit them:
1. **"54 suspense rows → provisional → surplus refused" was WRONG.** Ingestion
   `SuspenseItem` (`/documents`) gates `suspenseEmpty` on the VERIFICATION→ALLOCATION
   transition. `surplusIsProvisional` comes from `computePeriod().surplus.provisional`,
   documented as *"true when the month still contains unreviewed classifications"* —
   i.e. unverified TRANSACTIONS on `/transactions`. **Three different queues share the
   word "suspense".**
2. **The MISLAKA fix was built on the owner's report that documents were uploaded**,
   without checking what the DB held. The fix is still correct; it wasn't his bug.
3. **Owner confirmed allocation works** — approved plan, ₪5.56M free to deploy, four
   deployment steps, phase advanced to STRATEGY. The surplus refusal is not an allocation
   defect.

**Process note:** five rounds went into the expected-documents card *after* proving it
gates nothing. When a surface is confirmed non-blocking, stop working on it and say so.

### Tier 3 — remaining

**3. Telemetry projection (M42) — the ONLY Tier 3 item left.** Acceptance %,
   completion %, time-to-complete, dismissal histogram — `ActionEvent` already records
   every transition, so the data exists. **Owner deferred the dashboard**, so build the
   endpoint, not the charts.

~~4. Bilingual audit~~ — ✅ **done**, shipped as `8b93845` (2026-08-02). See the Tier 3 #4
section above; it also added a **placeholder-parity** gate check, since key parity alone
never caught a dropped `{placeholder}`.

**Then: the form-106 + mortgage-schedule parsers**, which are blocked on the ledger
factory (see the 🔵 NEXT section below) — not on anything Tier 3.

### ⚠️ ONE GATE PER SESSION-BATCH — a lesson from session 32
Four deploy scripts were written back-to-back, **each assuming the previous had been
committed. None was.** `missing-docs.ts`, `verification.ts`, `verification/page.tsx` and
both locale files ended up carrying changes from two or three scripts at once. Since
`git add <file>` stages a WHOLE file, whichever ran first would have swept in the others'
work — and would then have been refused by its own unstaged-files guard, because sibling
changes sat in files outside its `$Files`. One assertion had also gone stale between
scripts (`d.docType !== null` → `doc.docType === null`).

**Rule: do not write deploy script N+1 until script N has actually been run.** If more
work happens first, fold it into the pending script rather than stacking a new one.
Consolidated into `deploy-2026-08-02-session32.ps1`; the five superseded scripts are
deleted by step 7 of that script.

### 🔴 `NO_ADAPTER_FOUND` on every document — owner QA 2026-08-02, FIXED
Owner tried to assign ownership and every document failed with a bare
`NO_ADAPTER_FOUND`, rendered under the **upload** heading — so it read as *"your file was
not saved"*. **The file had been saved every time.** Upload and import are separate
actions; only the import threw.

**Cause:** exactly **two** adapters exist — `il-pension-pdf` (PDF + PENSION_REPORT /
HISHTALMUT_STATEMENT / GEMEL_STATEMENT / MISLAKA / OTHER) and `il-accounts-csv`. A PDF
typed `MORTGAGE_SCHEDULE`, `TAX_106`, `BANK_STATEMENT`, `CARD_STATEMENT` or
`BROKERAGE_STATEMENT` matches neither, so the import correctly refused. (Bank/card
statements go through `statement-import-service`, a **different** pipeline this page does
not use.)

**Why it matters more now than it did before:** since per-item attribution landed, a
document is **evidence whether or not anything can parse it** — a mortgage schedule
nobody can read still proves the mortgage. Offering "import" as the action, and
hard-failing it, told the owner his filing had failed when the filing was the part that
worked.

- `imports.importableIds` — one query; the UI offers the ownership/import form **only**
  where an adapter can succeed, and otherwise says the document is stored and counts.
- `NO_ADAPTER_FOUND` now renders as a sentence stating the file **was** saved and which
  formats have parsers. Unknown codes still show verbatim — a code I cannot explain beats
  a generic apology.
- **`CARD_STATEMENT` was missing from the documents page `DOC_TYPES`** while present in
  `DocTypeSchema`, so a card statement could only be typed from the Operations form.
  Same one-word omission that once rejected every card upload outright. Now asserted.

### 🔴 54 ORPHANED SUSPENSE ROWS — one misrouted file was blocking M41 #6
**`OZ_Movements_ILS ….csv` (a One Zero MOVEMENTS export) was run through the ACCOUNTS
adapter.** Each transaction was treated as an account, none had a recognisable product
type, so all 54 rows landed in suspense as `UNKNOWN_ACCOUNT_TYPE`.

**The chain that made this expensive:** 54 pending suspense rows → every closed month
stays `provisional` → `allocationHandoffReadiness` refuses → the verified surplus never
reaches the deployment engine. **One misrouted file silently disabled a feature three
layers away.** The provisional refusal the owner has been seeing on `/allocation` all
session traces back to this import.

**Root cause, and it is the purest instance of this codebase's recurring pattern:**
`il-accounts-csv`'s module comment has said *"Transaction-level statements are NOT in
scope here"* since v1, and `accepts()` asked only **"is it a CSV?"**. *A boundary
documented in a comment and not enforced in code is not a boundary.*

- `accepts()` now refuses `BANK_STATEMENT` / `CARD_STATEMENT` — they have their own
  pipeline (`statement-import-service`, via Operations → Transactions).
- `parse()` refuses a movements file by header signature (`זכות`, `חובה`, `אסמכתא`, …)
  with `TRANSACTIONS_CSV_NOT_ACCOUNTS`, which the UI renders as a sentence pointing at
  the right importer. ⚠️ It cannot live in `accepts()` — that only receives
  `DocumentMeta`, never the bytes.
- **`suspenseResolution.discardBatch`** — the queue could only be cleared 54 times by
  hand. *A queue that cannot be cleared in proportion to how it filled is one the owner
  learns to ignore.* Scoped to ONE batch deliberately: a global "discard all pending"
  would sweep away genuine suspense from unrelated imports.
- Suspense is **grouped by file** and each row **previews its raw data**. Fifty-four rows
  reading `Reason: UNKNOWN_ACCOUNT_TYPE` over one filename told the owner nothing — his
  question was *"what am I looking at, and where do I map it?"*, and the list could not
  answer it.

**Discarding these 54 is correct, not data loss** — they were never accounts, and the CSV
is still stored for a proper transactions re-import.

### 🔵 NEXT — form 106 + mortgage-schedule parsers. ⚠️ BLOCKED ON THE LEDGER FACTORY.
Owner asked for both (2026-08-02). **Neither is "just write an adapter."**

`domain/ingestion/ledger-factory.buildFromPayload` handles **`ACCOUNT` and nothing else**:
```ts
if (item.suggestedKind !== "ACCOUNT") { suspense.push(toSuspense(item, "UNSUPPORTED_KIND")); continue; }
```
- A **mortgage schedule** yields a `MORTGAGE` item with **tracks** (type, rate, principal
  remaining, end date, CPI-linked).
- A **106** yields `CASH_FLOW` items (salary, pension/hishtalmut deductions).

Both are non-ACCOUNT, so a naive adapter would send **every row to suspense** — recreating
the exact 54-orphan bug this gate just fixed, with a friendlier filename. **Do not ship
the adapters before the factory supports the kinds.**

Order (each its own gate):
1. **`ledger-factory` accepts `MORTGAGE`** + a `mortgageTracks` field shape, with its own
   suspense reasons (`UNPARSEABLE_RATE`, `UNKNOWN_TRACK_TYPE`). Persist `MortgageTrack`
   rows in `import-service`. Fixture-tested, no adapter yet.
2. **`il-mortgage-schedule-pdf`** adapter against a real לוח סילוקין. Highest value: track
   rate + principal drive every repayment candidate and the debt analyzers.
3. **`ledger-factory` accepts `CASH_FLOW`**, then **`il-tax-106-pdf`**. Feeds the
   tax-ceiling candidates and lets `TAX_VERIFY_PAYROLL` resolve itself.

⚠️ Same trap as `il-accounts-csv`: `accepts()` must gate on `docType`
(`MORTGAGE_SCHEDULE`, `TAX_106`) **and** the parse must refuse a file whose headers say
otherwise. A boundary in a comment is not a boundary.

### 🔴 "ALL MY DOCS ARE THERE AND CORRECTLY TYPED" vs "חסר" — both were true
Owner, 2026-08-02, losing trust: the documents page listed his files with the right types
selected, and the verification card said every retirement row was **MISSING**.

**The report was right and so was he.** The page had two independent ways to show a type
that was not actually stored:
1. The row printed the saved `docType` as small grey text — and **nothing at all** when
   it was `null`. An untyped document looked identical to a typed one.
2. The selector did `defaultValue={doc.docType ?? "OTHER"}` — it **asserted a value the
   database did not hold**, and `OTHER` satisfies no expectation rule. A dropdown he had
   changed but not SUBMITTED looked exactly like a saved one, because nothing indicated
   the change was unsaved.

So a document could look correctly typed from three different angles and count for
nothing. Now: the **stored** type renders as a chip, an unset one says *"לא נקבע סוג — לא
נספר לשום דבר"* in red, the dropdown offers an explicit *"— בחרו סוג —"* placeholder
instead of defaulting, and the save button says it is the save button.

**Diagnostic worth keeping:** `חסר` means *no document of that type exists*;
`לא משויך` means *one exists but is not linked to this item*. A row showing `חסר` while
the owner insists the file is uploaded is a **typing** problem, never a linking one.

### ⚠️ The document checklist gates NOTHING — verified, 2026-08-02
`missingDocs` has exactly **one** consumer: the verification page display. Not strategy,
not allocation, not operations, not the health score, not `evaluateTransition`. Red rows
there block nothing. What actually gates: item verification + `suspenseEmpty` (into
ALLOCATION), `allocationPlanApproved` (into STRATEGY), and `surplusIsProvisional` for the
deployment hand-off. **Say this before letting an owner re-upload anything.**

### 🔴 WHY SO MANY GATES FAILED THIS SESSION — the real cause
Four scripts failed on first run: a guard matching its own comment, `trpc.suspenseResolution`
(wrong mount name), Hebrew in a `.ps1`, and four scripts that couldn't run in sequence.

**Common cause: there was no sandbox.** The Linux VM never started, so nothing was ever
executed before Eran ran it — the deploy script *was* the first execution. Every one of
those four would have been caught by running the thing once. This is structural, not
carelessness, and it changes what a session without a sandbox should do:

- **Prefer checks that run in `node`** over PowerShell regex — node is exercised by the
  parity checks already, PowerShell string handling is not.
- **Never put non-ASCII in a `.ps1`.** The bilingual script now self-checks its own bytes
  and refuses. Hebrew assertions live in node with `\uXXXX` escapes: ASCII **by
  construction**, not by discipline. (The rule was already in CLAUDE.md and was broken
  anyway — that is the tell that a rule needs a mechanism.)
- **Assert against the current form of the code**, not a form remembered from an earlier
  edit (`d.docType !== null` → `doc.docType === null` broke a gate this way).
- **Verify router mount names** in `api/src/index.ts` before calling them from the web
  app — export name and mount name differ (`suspenseResolutionRouter` → `suspense`).

### Working rules that cost a gate run each when forgotten
- Deploy scripts: **ASCII only**, comments are `#` not `//`, `-LiteralPath` for any path
  containing `[locale]` or `(app)`.
- `$Files` must **cover everything changed** — the unstaged guard catches it, keep it.
- `typecheck -- --force`: turbo cached a stale pass and let a broken commit through.
- Optional props: `?: T | undefined`, never `?: T | null` (`exactOptionalPropertyTypes`).
- After extracting anything, **grep for dead imports** — ESLint only catches them at the
  very end of the gate.
- Name scripts `deploy-<yyyy-mm-dd>-<subject>.ps1`. Milestone names go stale.

### The pattern to watch for — it recurred SIX times
A refusal that is individually correct and collectively disables the feature:
M40a (banned `FIXED_CONTRACTUAL` → banned every subscription), M40b (₪6 card), M41c
(provisional excluded → excluded every month), M41d (empty list for a failed load), EOY
(same provisional bug again), health score (measured the empty in-progress month).
**Before adding any exclusion, ask what it looks like against THIS household's real
data** — every month is provisional, most of the ledger is unmapped, and the tax matrices
were only signed off on 2026-07-29.

### Owner preferences learned
Wants **visible change per gate** — three invisible refactor commits in a row was a
complaint. Wants the **QA doc updated whenever the thing it tests changes**. Reviews
carefully and finds real defects, so ship QA-able increments rather than big batches.

---

## 📌 CONVENTION — deploy script naming (owner, 2026-07-29)

**`deploy-<yyyy-mm-dd>-<subject>.ps1`**, not `deploy-m<N><letter>.ps1`.

The M42b script began as *"step 1: extract the Action Center"* and ended up carrying the
whole four-gate IA rebuild, the health score, nine QA fixes and the nav grouping. The
name went stale while the content grew — and in a repo where these scripts are the record
of what shipped, a misleading filename is worse than a verbose one. A date cannot go
stale; the subject describes the deploy rather than the milestone it started inside.
Milestone numbers belong in the commit message and here, where they can be corrected.

Rename in place when a script outgrows its name — they are gitignored scaffolding, so a
rename costs nothing:
```powershell
Rename-Item deploy-m42b.ps1 deploy-2026-07-29-ops-rebuild.ps1
```

## ✅ DONE — top navigation grouped (M42, was a backlog item)

Fourteen flat links → **Dashboard + four groups**, ordered by what the owner is doing and
mirroring the phase model the app already teaches:

| Group | Contains |
|---|---|
| **The picture** | mapping, documents, verification, household |
| **Decide** | strategy, goals, allocation, scenarios |
| **Run** | operations, journal, monitoring |
| **Reference** | registry, fx |

Native `<details>`, not a JS dropdown — works without client state, keyboard accessible
for free, and correct in RTL, three things a hand-rolled menu gets wrong first. The group
containing the current page opens on arrival. Transactions stays in the Operations
sub-nav, so this is still 14 destinations, not 15.

### 🔴 P0 CLOSED — identical previews across three cards
**Owner found and fixed it himself (2026-07-29).** ⚠️ **The cause was never recorded** —
if it was a parser/table-selection issue, add a fixture per card so it cannot regress
silently. My ruled-out list (distinct ids/sha/storageKey, `loadFile` correct) is above and
was accurate; the fault was downstream of it.

## (historical) BACKLOG — top navigation had 14 entries

**Owner, 2026-07-29:** the top nav has grown to 14 items and M42b adds a 15th. It needs
grouping, not another entry. **Explicitly deferred — finish M42 end-to-end first.**

Same accretion as `/operations`, one level up: every milestone added a destination and
none were ever grouped. Worth noting the pattern is now visible in three places (the
operations page, the top nav, and the analyzer exclusions) — the common cause is that
adding is always locally reasonable and nobody owns the total.

## 🔖 BACKLOG — `/operations` needs an information-architecture rebuild

**Owner feedback, 2026-07-29 (M41d QA):** the page is *"overloaded with a lot of
information, cards, actions."* It is now one scrolling column carrying: period nav +
close/reopen, monthly summary, dual-axis breakdown, safe-to-spend, categories,
transactions, suspense queue, **Monthly review + EOY**, **Action Center**, Opportunity
Center, calendar, recurring, import. Each section was defensible when added; together
they are a wall.

This is the same additive drift the analyzers kept hitting, in UI form — nobody ever
decided to build this page, it accreted one milestone at a time.

Not a restyle. It needs a decision about **what this page is for** before more is added:
- Doc 07 §9.1 already specifies **separate sections** (`actions/`, `opportunities/`,
  `projection/`, `calendar/` …) — the current single page never implemented that split.
- Candidate: tabs or routes per section, with a genuine landing view that answers "what
  needs me today" rather than showing everything at once.
- **M42's "dashboard extensions" should not be built on top of this page as-is** —
  that would add a twelfth section to a page already flagged as unreadable.

⚠️ **Do not add another Card to `/operations` before this is resolved.**

### Step 1 SHIPPED (M42a) — sticky section nav + anchor fix
Additive only, no restructuring: a sticky nav ordered by *"what needs me today"* (actions
→ opportunities → review → month → calendar → transactions → categories → suspense →
import), which is deliberately the reverse of build order. Also fixed a real bug: the
`#suspense` anchor sat ~500 lines above its own Card, next to the review section, so
every link to it scrolled to the wrong place.

### Step 2 — DECIDED with the owner (2026-07-29). Build as M42b.

**Real ROUTES, not `?tab=`** (owner decision). Each view then fetches only its own data:
today `/operations` currently computes the period, opportunities, actions, EOY, drift,
suspense, calendar, categories AND transactions on every load, so `computePeriod` runs
even when you only wanted to see action items. Routes also give deep links and a working
back button.

Grouped by **cadence** — how often the owner is in that mode — not by data type:

| Route | Contains | Cadence |
|---|---|---|
| `/operations` (**Today**, default) | Action Center, Opportunity Center, open drift alerts, calendar items due inside the window, **suspense count** | daily / weekly |
| `/operations/month` | month overview, close/reopen, monthly review, EOY projection | monthly ritual |
| `/operations/calendar` | forward commitments, recurring decisions | as needed |
| **`/transactions` (NEW TOP-LEVEL)** | transaction list, manual add, suspense queue, category tree, import | as needed |

**Transactions is top-level, not under Operations** (owner decision). Those four are one
thing: transactions are the raw rows, the category tree is the scheme that classifies
them, suspense is the rows the scheme could not classify, and import is what feeds all
three. You go there for a different reason than running the month. This deviates from
doc 07 §9.1, which specced them as sections under `operations/` — recorded deliberately.

**Owner decisions:**
1. **Import is not a section.** It is an action, not a place, and it is the least
   frequent thing on the busiest page. Move it to a button on Transactions **and** onto
   the Mapping page, where it belongs alongside the rest of ingestion.
2. **Suspense is promoted, and the drift bug is why.** Every closed month is
   `provisional` because of unverified rows — that is what caveats the surplus, what
   makes `allocationHandoffReadiness` refuse, and what weakens everything downstream.
   Clearing suspense is the household's highest-value recurring action. The QUEUE lives
   under Transactions; the **COUNT is an action item on Today.**
3. **Today shows COMPACT ROWS with counts** that link into the other routes — not full
   cards. Full cards mean you never leave Today, and Today re-accretes into exactly the
   page this rebuild exists to undo. Owner will report anything missing from the rows.

### Step 2 execution notes — do this with a WORKING SANDBOX.
`page.tsx` is ~1,550 lines of nested JSX with 10 top-level `<Card>` blocks. Splitting it
means ~20 paired JSX edits, and **the mount silently truncates >250-line writes** while a
single unbalanced paren breaks the build. Attempting it blind, with no `tsc` and no
tests, is the highest-risk edit in this codebase — which is exactly why step 1 stopped
where it did rather than pressing on.

**Steps 1–2 BUILT (`deploy-m42b.ps1`, gate not yet green).** Six sections extracted to
`operations/sections/*.tsx`, and **the routes now exist**:

| Route | Contains |
|---|---|
| `/operations` (Today) | Action Center, Opportunity Center, suspense, import, manual add, transaction list, categories |
| `/operations/month` | month overview + monthly review |
| `/operations/calendar` | calendar + recurring |

**page.tsx: ~1,550 → 768 lines.** `/operations` no longer runs `period.current`
(computePeriod — the most expensive call in the module), `diagnostics.month`,
`period.months`, `projection.eoy`, `review.driftAlerts`, `calendar.upcoming` or
`recurring.list`. All seven moved to the route that needs them.

Sections are MOVED, not copied, and every affected server action redirects to the route
that shows its result — landing the owner where his change isn't rendered is its own bug.

### Gate 3 — `/transactions` top-level. ✅ BUILT (in `deploy-m42b.ps1`).

Nine sections now live outside `page.tsx`. **Today: ~1,550 → 443 lines**, and down from
**eleven** round-trips per load to three.

| Route | Contains |
|---|---|
| `/operations` (Today) | nav, import, Action Center, Opportunity Center |
| `/operations/month` | month overview + monthly review |
| `/operations/calendar` | calendar + recurring |
| **`/transactions`** (top-level) | suspense queue (first), list, manual add, category tree |

Suspense is placed FIRST on `/transactions` deliberately — every closed month is
provisional until it is cleared. `/transactions` has its own **main-nav** entry, making
15 top-nav items: the grouping backlog above is now load-bearing.

**Owner revisions applied after first QA of gate 3:**
- **Transactions moved from the MAIN nav to the Operations sub-nav**, alongside
  Today / Month / Calendar. URL stays top-level `/transactions`; only the entry point
  changed. Main nav is back to 14 — the 15th entry never shipped.
- **Calendar defaults to 60 days, not 400.** A year of statutory dates on arrival buries
  the handful that are imminent, and proximity is the entire point of that view.
- **Calendar done/skip no longer jumps to the top.** The redirect now carries
  `#ev-<id>` and the active window, so marking five events done no longer means scrolling
  back down five times. Rows carry `id` + `scroll-mt-24` so the anchor lands below the
  heading.

### ✅ Import moved too — gate 3 is COMPLETE
All ten sections are out. **`operations/page.tsx`: ~1,550 → ~105 lines.** Owner,
2026-07-29: *"today should include only action center + opportunity center"* — **the
Explainer stays** (owner corrected this immediately after; it is orientation, not a
section).

Import leads on `/transactions` because it FEEDS everything below it — a row it creates
lands in the list, under the tree, and possibly in the suspense queue.

**Per-route explainers** (owner, 2026-07-29): each route now carries its own, describing
that page's job. One shared paragraph about "the operational workspace" stopped being
useful the moment the workspace became four pages with four different jobs. Keys:
`explainer` (Today), `monthExplainer`, `calendarExplainer`, `transactionsExplainer`.

⚠️ **`exactOptionalPropertyTypes: true` is on.** An optional prop typed `string | null`
will NOT accept an actual `string | undefined` — they are distinct, and tsc rejected
exactly that on the import section's `unsupportedReason`. When writing props for an
extracted section, mirror optionals as `?: T | undefined`, not `?: T | null`.

**~30 redirects repointed in total** across the three gates. The rule that keeps costing
a QA round when missed: *a redirect must land on the page that shows the result.*

### (historical) the import block, before it moved
Still on Today. Owner wants it under `/transactions` (and earlier said Mapping would also
be reasonable — Mapping already owns ingestion, so either is defensible; **`/transactions`
is the current instruction**).

Not attempted at the end of session 31 by choice: it is the largest single remaining
block, and a half-finished move would leave Today broken rather than merely untidy.
Follow the extraction template. Its orphans will be `uploadStatementAction`,
`commitAllPendingAction`, `commitStatementAction`, `undoImportAction`,
`resetAllImportsAction`, plus `preview` / `pending` / `batches` / `previewError` and the
`preview` / `imported` / `uploaded` / `failed` / `reset` / `undone` / `docs` search
params. After it moves, Today is **just** nav + Action Center + Opportunity Center —
which is exactly the surface gate 4 turns into compact rows.

### Superseded plan (kept for the block map only)

The largest single move left, and the reason it was not attempted at the end of session
31: four sections plus a redirect map, where a half-finished state leaves transactions
rendered in two places with no way to tell which is authoritative.

**Current `operations/page.tsx` (768 lines) block map:**

| Lines | Block | Destination |
|---|---|---|
| 128–~405 | Import (`importTitle`) | `/transactions` — **or the Mapping page** (owner said either; Mapping owns the rest of ingestion) |
| 443–477 | Action Center, Opportunity Center, Suspense | Action + Opportunity **stay** on Today; Suspense → `/transactions` |
| 478–529 | Manual add (`addTransaction`) | `/transactions` |
| 531–713 | Transaction list (`transactions`) | `/transactions` |
| 714–~765 | Category tree (`categories`) | `/transactions` |

**After this gate, Today is only:** `OperationsNav` + error/success banners +
`ActionCenterSection` + `OpportunityCenterSection`. Roughly 90 lines.

**Redirects that must move** (same trap as the calendar and month actions — landing the
owner where his change is not rendered is its own bug). Grep
`operations-actions.ts` for `/operations?` and move these to `/transactions?`:
`created`, `classified`, `categorySaved`, `updated`, `removed`, `restored`, `undone`,
`dupesRemoved`, `reset`, `imported`, `uploaded`, `preview`, `failed`, `edit`, `cat`,
`beh`. The gate already asserts no *moved* action still points at `/operations` — extend
that list when they move.

**`/transactions` is TOP-LEVEL**, not `/operations/transactions`, and therefore does NOT
appear in `OperationsNav`. It needs an entry in the app's main navigation instead — which
runs straight into the 14-item top-nav backlog above, so expect to touch that.

**Follow the extraction template** (below) — it has held for six sections. The two
recurring costs, both cheap to avoid: dead imports (ESLint catches them at the END of the
gate, after typecheck and tests) and gate assertions that contradict each other
(`MonthlyReviewSection` was in both the must-be-gone and must-be-rendered lists, which no
code could satisfy).

### Gate 4 — Today as compact rows. ✅ BUILT (in `deploy-m42b.ps1`).

Three count rows at the top of Today — **transactions waiting to be classified**, open
drift alerts, committed work. The first two **link out** rather than rendering the thing;
embedding them is how this page re-accretes.

- **Suspense leads.** It is the real blocker: every closed month is provisional while
  unverified rows exist. Counted via a capped probe read (`50+` at the cap) because there
  is no count endpoint and the lightest page must not do the heaviest read.
- **A failed count renders "could not load", never 0. A zero renders as 0**, muted, not
  hidden — the M41c lesson: silence must not read as a clean bill of health.
- **Opportunity cards collapsed** to title / impact / badges / buttons, with rationale,
  steps and risks behind a disclosure. Content unchanged and one click away — removing it
  would mean taking recommendations on trust, the opposite of this engine's posture.

### 🎉 M42b IA REBUILD COMPLETE — all four gates
`operations/page.tsx`: **~1,550 → ~120 lines**, ten sections extracted, four routes,
~30 redirects repointed, per-route explainers, eleven round-trips on Today down to four.

### ✅ Duplicate opportunity cards — FIXED (QA, 2026-07-29)
The same "5 scheduled reviews" card rendered twice. `supersede → create` closed neither
route: two drafts sharing a type in one run, or two runs racing on a double-click. Both
guards now sit inside the transaction — open PROPOSED types are re-read **after** the
supersede, and the type map is authoritative. **Existing duplicates self-heal on the
next recompute.** Third occurrence of this shape (ACCEPTED-type skip → M41d drift alerts
→ here): *an inbox that shows one finding twice trains the owner to ignore both.*

### ✅ Health score BUILT (engine + tests + `operations.health.score`)
`health_score_weights` seeded since M36, consumed by nothing — now consumed. Constraints,
because a composite out of 100 names nothing and reads as a verdict:
- **An unmeasured component is REFUSED, not scored 0.** An unmapped household must not
  read as a reckless one.
- **The composite refuses below the weight-coverage floor**, and coverage travels with
  the score — an 88 over 60% of the weight is never shown as just "88".
- **Nothing downstream may branch on it.**
- **Goals is deliberately unwired** and reported as unmeasured (costs 15 pts of
  coverage) rather than approximated; its figures live in engine-goals and need a
  snapshot this service does not build.
- Reuses `opportunity_min_coverage_pct` — no new assumption key, so **pins stay valid**.
- **No UI yet** — it is API-only, and belongs with the dashboard, which should come
  *after* the top-nav grouping.

### QA round 2 (2026-07-29) — nine defects found, eight fixed

**⚠️ The M42b commit `95a5d66` FAILED CI and three files never shipped** —
`engine-operations/src/index.ts`, `api/routers/operations.ts` and
`api/services/opportunity-service.ts` were missing from `$Files`. The local gate passed
because **turbo replayed a cached typecheck**. Two structural fixes: `typecheck --force`,
and a guard that refuses to commit when any tracked file has unstaged modifications —
nothing previously checked that `$Files` COVERED what changed, and a bug fix was silently
dropped from a commit.

| QA | Defect | Fix |
|---|---|---|
| 6.2 | **EOY refused with 5 closed months.** `!isProvisional` excluded every month the household has — **the M41c bug, third occurrence** | Provisional months INCLUDED and reported. Deploying cash still refuses them; a projection informs and moves no money. |
| 5.3 / 5.5 | Recompute/close/reopen jumped to the CURRENT month | `y`/`m` carried through every month redirect |
| 4.2 | "Mark done" made the action vanish — undo vanished with it | Closed items shown by default, open sorted first. Same one-way door M40c's un-accept removed, reintroduced a layer up. |
| 3.3 | Duplicate opportunity cards (ACCEPTED + IMPLEMENTED) | `listOpportunities` shows **newest per type** — it is a view of the current position, not a ledger of every row |
| 7.3 | Calendar window switch jumped to top | Links carried `#calendar`, an id that no longer exists on that route |
| 8.6 | Same mortgage row twice in filtered list | VOID rows hidden by default with a count + toggle. Voided ≠ deleted, so they stay recoverable. |
| 8.x | Clicking edit cleared the active filter | Filters carried through edit/cancel; anchors to the row |
| 5.8 | Drift alert stated a fact, no action | Renders `recommendedAction` — it was in the record and never displayed |

### 🔴 OPEN P0 — three DIFFERENT card statements produce an IDENTICAL preview

**Owner correction, and it overturns my first read:** the three FIBI files are **three
different credit cards**, not one page saved three times. Identical previews are
therefore a **real defect**, not correct behaviour.

What is already ruled out:
- Distinct `Document.id`, distinct `sha256`, distinct `?preview=` in the URL ✅
- `storageKey = fileStore().put(sha256, …)` — keyed by content hash, so **no file
  collision** ✅
- `loadFile()` reads `document.storageKey` by id — **no id mix-up in the service** ✅

So the bytes reaching the parser are almost certainly different, and the PARSER is
collapsing them. Leading hypothesis: **`parseHtmlGrid` picks the wrong table.** A
saved FIBI page contains more than one — an account-level summary that is identical
across all three cards, plus the card-specific detail. If the parser takes the first
table, or the largest, every card yields the same 72 rows.

**Decisive next step (needs the files, cannot be done from a session without them):**
1. Open two of the three HTML files directly in a browser. If they show *different* card
   transactions, the files are fine and the parser is at fault.
2. Count `<table>` elements in each: `grep -c "<table" FibiSave*.html`.
3. If >1, make the adapter select the table by header signature (date / description /
   amount columns) rather than by position, and pin it with a fixture per card.

⚠️ **Do not import these three until this is resolved** — committing them would write one
card's rows three times, and the duplicate finder matches on (date, amount, description),
so it would then "helpfully" void two thirds of a legitimate import.

**The UI half is fixed regardless:** the preview now names the file and shows a short
document id, so a repeated preview is at least *visible* as repeated.

But the owner's objection stands and was the real defect: **the preview never named the
file it came from.** Three identical-looking tables with no attribution meant he could
not tell whether the page had updated, whether he had clicked the right link, or whether
two files genuinely hold the same rows. *A preview you cannot attribute is not a check.*
It now shows the filename and a short document id, and says outright that two exports
saved moments apart are different files with identical rows.

Worth keeping as a general lesson: **"correct but unverifiable" is a defect.** The same
shape as the review-pinned chip and the drift load-failure — the system was right and had
no way to show it.

### QA round 3 — remaining
- **Duplicate transaction rows are REAL DATA, not a display bug.** The pair in the
  screenshot are both BOOKED (neither tagged "הוסרה"), so the VOID-hiding fix does not
  touch them. This is the **M38l key-format change**: rows imported before and after it
  carry different `externalRef` shapes and cannot deduplicate against each other. The
  cure already exists — press **הסרת כפילויות** in the transactions card, which VOIDs the
  later copies and keeps the earliest. Action for the owner, not a code change.
- **Suspense "edit instead" pointed at `/operations?edit=`** — a route that has had no
  transaction list since the split. Now `/transactions?edit=…#tx-…`. **This is the most
  likely explanation for "edit still clears the filter"**: that link never carried one.
  The list's own edit link does carry `cat`/`beh` (verified in source).
- **Empty-filter state** said "no transactions yet — add one above", which reads as "this
  household has no data". Filtered-empty is now distinct from genuinely-empty.

### ✅ Tax figures signed off (owner, 2026-07-29)
Owner approved IL 2025/2026. **Validate with the query below before assuming the amber
banner is gone.** Note what sign-off does NOT change: **bituach-leumi employee rates are
`null` in the payload** — they were never wrong, they were absent because sources
conflicted. `ownerReviewed=true` removes the "unverified figures" banner while a missing
input stays missing; anything depending on those rates is still unavailable, not verified.

### ✅ Health score is now VISIBLE (Tier 2 #4)
A fourth compact row on Today: `{score}/100 · from {coverage}% of the household`, linking
to `/operations/month`. **The coverage figure is part of the value, not a footnote** — 72
and "72, from 60% of the household" are different claims, and only one is honest while
goals are unwired. A refusal renders as *"not enough measured to score"*, never as a low
number: too little measured is not the same as doing badly.

### 🎨 POLISH BACKLOG — the grouped nav looks rough
Owner, 2026-07-29: *"not the best UI and doesn't look that good but for now it's ok"*.
Functional and accessible; visually unresolved. Native `<details>` gives open/closed
disclosure with no hover affordance and inconsistent spacing when several groups are
open at once. Worth a proper menu component when the dashboard work lands — not before,
since that is when the nav gets exercised hardest.

### ✅ Playwright smoke BUILT (Tier 2 #5) — ⚠️ FIRST LOCKFILE CHANGE IN A WHILE
`@playwright/test` added as a root devDependency, plus `playwright.config.ts`,
`e2e/operations-routing.spec.ts` and an `npm run e2e` script. **Dependency and suite ship
together** — a lockfile carrying a runner with no tests, or specs with no runner, is a
half-change either way.

**Scope is routing and redirects ONLY**, not business logic. Every assertion maps to a
defect a human found by clicking, and none of which tsc, vitest or eslint could catch:
duplicate cards, doubled drift alerts, the calendar scroll jump, month actions landing on
the wrong month, the filter clearing on edit, a suspense link pointing at a page with no
transaction list. All are wiring faults *between* correct units.

**Runs against a DEPLOYED instance**, not a dev server — the faults only exist once the
app is served, and a suite needing seeded fixtures drifts out of date faster than the code
it guards:
```powershell
npx playwright install chromium          # once per machine
$env:E2E_BASE_URL='https://wealthos-web-production-c1f7.up.railway.app'
npm run e2e
```
**Not wired into CI yet** — it needs a post-deploy job, since pre-deploy CI has nothing to
point at. That is the next piece.

### 🛡️ The unstaged-files guard earned its place immediately
Added after a commit silently dropped the duplicate-card fix; on its very first run it
caught `package.json` + `package-lock.json` left out of `$Files` after the Playwright
install. Keep it in every future deploy script.

### ✅ E2E wired into CI (`.github/workflows/e2e.yml`)
Separate workflow, because it runs against the DEPLOYED app — `ci.yml` runs before
anything is deployed and has nothing to point at. Triggers: after CI succeeds on main
(and **only** if it succeeded — smoke-testing a failed build reports routing failures for
an upstream cause), daily on a schedule (catches breakage arriving *without* a deploy:
expired session, out-of-band migration, lost env var), and manually. Polls
`/api/health` for up to 5 minutes rather than guessing a sleep. Chromium only.

### ✅ M41 #6 — surplus → deployment engine. BUILT 2026-08-02 (design below, followed).
> Built exactly as designed, with two additions the design did not spell out:
> the **buffer precedence** (surplus does not jump or offset the emergency buffer) and
> the **rendered refusal** (`DeploymentSurplusHandoff` on the plan + the allocation-page
> line), because a silent zero here is the six-times pattern in its seventh costume.
> The original design is kept below verbatim — it is what the code implements.

### 🔴 (original design) M41 #6 — surplus → deployment engine.
**Deliberately not started at the end of session 31.** It is the only remaining item that
changes how much money the app proposes deploying, and a half-finished signature change
there yields a *plausible wrong number* rather than a visible break. It also sits on the
advice/execution boundary, where this project's rules are strictest.

**The problem:** `computeDeploymentPlans(snapshot, ctx)` derives deployable cash from
snapshot CASH minus the emergency buffer. It has no notion of monthly surplus, so the
verified surplus M37 computes never reaches the allocation engine — which is the entire
point of M41's hand-off.

**Design:**
1. Add `deployableSurplusBase?: number` to `AnalyzerContext` (optional, so every existing
   caller keeps working and the change is additive).
2. In `computeDeploymentPlans`, add it to `freeCashBase` — and **carry it separately in
   the returned notes**, so a plan can say "₪X of this is this month's surplus, ₪Y is idle
   cash". Those are different kinds of money: idle cash is already banked, surplus is a
   forecast that recurs. Merging them into one figure loses that.
3. `allocation-service` reads it from `allocationHandoffReadiness`, which **already
   refuses a PROVISIONAL surplus** — that refusal must stay, and is why the readiness
   query was built first.
4. Test that a provisional or negative surplus contributes ZERO, and that a plan built
   with surplus names it separately from cash.

⚠️ Do not let surplus flow in without the provisional check. Every closed month in this
household is currently provisional, so a naive wiring would deploy against unverified
figures on day one.

### Next: M42 proper
Health score (`health_score_weights` is seeded and consumed by nothing), telemetry
projection, dashboard extensions, full bilingual pass, Playwright smoke. **Do the top-nav
grouping backlog BEFORE dashboard extensions** — it is the same accretion one level up,
and adding a dashboard to a 14-item nav repeats the mistake this milestone just undid.

**Extraction template** (follow exactly — it has now survived four sections):
1. Read the block. Create `sections/<name>.tsx`: `getTranslations("operations")` inside,
   data as props, same JSX verbatim.
2. Replace the inline block with the component in ONE edit. ⚠️ **Do not** wrap the old
   block in `{false ? (` as an interim step. It leaves the file syntactically unbalanced
   until a second edit lands, and if that second edit ever fails you have a broken page
   with no obvious cause. **I did this three times across five extractions, including
   once immediately after writing this line** — it is a genuinely sticky habit, so check
   the diff rather than trusting intent.
3. Grep `page.tsx` for every import the section used; delete the orphans. Verify shared
   ones (`BEHAVIORAL`, `CategoryPicker`, `Field`, `Select`, `formatMoney`) are still used
   before removing.
4. Confirm the file still ends with a single `}` at top level, then lower the gate's line
   floor to match.

Order — **extract first, restructure second.** Extraction is behaviour-preserving, so
any breakage is localised and obvious; a single 10-section rewrite is not.
1. Extract each Card into `operations/sections/<name>.tsx` as a server component taking
   its already-computed props. No moves, no restyling, no data changes.
2. Create the routes and move each extracted section under the right one, narrowing each
   route's data fetch to only what it renders.
3. Build **Today** last, from compact rows over the counts the other routes already
   expose.
4. Only then, M42's dashboard extensions and health score.

⚠️ **PowerShell pathing:** every path containing `[locale]` or `(app)` needs
`-LiteralPath`. PowerShell reads `[...]` as a wildcard character class, so a bare
`Get-Content` on the page silently returns nothing — this cost a gate run on M42a, where
the truncation guard read 0 lines and correctly refused to commit.

⚠️ **Every extraction leaves DEAD IMPORTS in `page.tsx`.** A section takes its server
actions and components with it, so whatever only it used becomes unused. `tsc` does NOT
catch this; `eslint --max-warnings 0` does, at the END of the gate — after typecheck and
the full test suite have already run. It cost a gate run on the Action Center extraction
(`setActionStatusAction`). **After each extraction, grep `page.tsx` for every import the
moved section used and delete the orphans before running the gate.** Candidates for the
remaining sections: `setOpportunityStatusAction` / `runOpportunitiesAction`
(opportunities), `setCalendarStatusAction` / `regenerateCalendarAction` /
`applySuggestedDateAction` / `upsertRecurringAction` (calendar), `uploadStatementAction`
/ `commitStatementAction` / `undoImportAction` / `resetAllImportsAction` (import),
`upsertCategoryAction` / `CategoryPicker` (categories), `BehavioralBars` /
`SurplusWaterfall` / `CategoryTable` (month).

## Older history

Session log for 2026-07-06 → 2026-07-29 (sessions 1–31, M1–M41d, M39 notes, carried technical debt) moved to [STATUS-ARCHIVE.md](STATUS-ARCHIVE.md) on 2026-11-02 — not deleted.
