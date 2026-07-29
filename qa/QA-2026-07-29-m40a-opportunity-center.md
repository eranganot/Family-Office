# QA — M40a Opportunity Center (2026-07-29)

Live: https://wealthos-web-production-c1f7.up.railway.app
**No migration in this milestone.** Nothing to run against the database.

⚠️ **I could not check the Railway deploy status myself this session** — the sandbox VM
died and never came back, so I have no CLI access. Section 0 is therefore *your* check,
not a confirmation I already made.

⚠️ This milestone did not get a full sandbox verification run (see STATUS.md). Every
package typechecked clean and 29/29 new tests passed, but the last web typecheck after a
small JSX fix never ran. `deploy-m40a.ps1` gates all of it before committing — if that
script went green, the code is verified. This QA covers behaviour, not compilation.

---

## 0. Pre-flight (2 min)

- [ ] Railway → `wealthos-web` → latest deployment is **Active**, not Crashed/Building.
  **Fail:** "upstream error" in the browser = the deploy crashed; stop here and send me
  the last ~20 log lines.
- [ ] Open `/he/operations` — page renders, no error boundary.

---

## 1. The Opportunity Center exists and is empty on arrival

Screen: `/he/operations#opportunities`

- [ ] A card titled **מרכז ההזדמנויות** appears above the calendar section.
- [ ] On first load it shows **"טרם חושב"** (not computed yet) and a
      **"חשב הזדמנויות מחדש"** button.
  **This is correct, not a bug** — opening a page must never write rows. Generation is an
  explicit action only.
  **Fail:** cards appear without you pressing anything, OR the section is missing entirely.

---

## 2. Recompute actually produces something

- [ ] Press **חשב הזדמנויות מחדש**. A green banner reports how many were proposed.
- [ ] At least one card appears **if** you have either (a) more than ₪40/month of fees
      classified as financial drag, or (b) any calendar event in the next 60 days.
  **If you have neither, zero cards is the correct answer** — check §2b instead.
- [ ] Each card shows: title, impact line, a Hebrew explanation paragraph, and a numbered
      list of concrete steps.
  **Fail:** a card with an empty body, or steps in English while the UI is Hebrew.

### 2b. If you got zero cards
- [ ] Go to `#calendar`, press **build calendar**, then return and recompute.
      Statutory dates inside 60 days should now produce a deadline card.
  **Fail:** calendar has events within 60 days but the Opportunity Center still says empty.

---

## 3. The numbers are grounded (do not skip this one)

- [ ] On a leakage card, the monthly figure is plausible against what you actually see in
      Operations → Transactions filtered to the financial-drag class. It should be the
      average over the trailing months, not a single month and not a total.
- [ ] The impact line reads `monthly · annual · by 31 December`, and **annual ≈ monthly × 12**,
      **end-of-year ≈ monthly × 6** (July → December inclusive).
  **Fail:** end-of-year equals the annual figure — that would mean it ignored the date.
- [ ] The totals line above the list equals the sum of the **proposed** cards only.
      Accepting a card should REMOVE it from that total.
  **Fail:** an accepted saving still counted in the headline = the same shekel claimed twice.

---

## 4. Running it twice does not double the list

- [ ] Press recompute a second time. The number of cards stays the same.
  **Fail:** the list doubles. That means superseding is not working and every import will
  silently pile up duplicates.
- [ ] Press recompute a third time. Still stable.

---

## 5. An accepted item does not come back

- [ ] Accept one card (**אישור**). It gets an "אושר" chip and its action buttons disappear.
- [ ] Press recompute. The accepted card **does not** reappear as a fresh proposed duplicate.
  **Fail:** two copies of the same item, one accepted and one proposed. This is the exact
  bug M25 fixed on the strategy side; if it is back here, the origin partition is wrong.
- [ ] Reject a different card (**לא בשבילנו**) — it disappears from the list.

---

## 6. Strategy inbox isolation ← the one that matters most

- [ ] Before recomputing, note how many recommendations you have at `/he/strategy`.
- [ ] Recompute opportunities.
- [ ] Return to `/he/strategy` — **the count and the cards are unchanged**.
  **Fail:** strategy recommendations vanished or changed status. That means an operations
  run is superseding strategic rows, i.e. importing a bank statement would wipe your
  strategy inbox. Report immediately; do not keep using the feature.

---

## 7. Hebrew / RTL

- [ ] Nowhere on the section does a raw key appear (`operations.oppsTitle`,
      `MISSING_MESSAGE`, `oppsCadence.MONTHLY`). Chips must read **חודשי / קל / פג בעוד N ימים**,
      not enum names.
- [ ] Text aligns right; the impact numbers stay readable and do not run into each other.
      (This is what broke in M39b — a date and a day-count shared one cell and read as one
      number.)
- [ ] Switch to `/en/operations#opportunities` — English strings, LTR, same cards.

---

## 8. The unreviewed-tax banner

- [ ] After recomputing, an **amber banner** appears saying some figures come from tax
      matrices you have not reviewed.
  **This is expected and correct** — IL 2026 is still `ownerReviewed=false`.
- [ ] It disappears only after you sign the figures off at `/he/registry`. It is not a code
      change and not a bug.
  **Fail:** no banner at all while `/registry` still shows unreviewed 2026 rows — that
  would mean an unverified number is being presented as verified.

---

## 9. Deadline cards behave differently from savings cards

- [ ] A deadline card shows an expiry chip (**פג בעוד N ימים**), amber when ≤14 days.
- [ ] A deadline card shows **"אין השפעה תזרימית חוזרת"** instead of a monthly/annual figure.
  **Correct** — the cost of missing a date is a penalty, not a recurring outflow.
- [ ] A statutory deadline sorts above a household review of similar size.

---

## 10. Safety (WealthOS house rules)

- [ ] No card names a fund, ETF, ticker, broker, or security — in either language.
      Watch for `קרן מחקה`, `תעודת סל`, `מניה`, `ETF`.
  **Fail:** any product name. The generator is supposed to throw before this can ship, so a
  sighting means the validator was bypassed. Report it as a defect, not a nitpick.
- [ ] No card offers to execute anything — every step is something *you* do at a bank or
      provider.
- [ ] Steps reference real screens that exist (Operations → Transactions, Operations →
      Calendar, Operations → Recurring).

---

## 11. Phase gate

- [ ] Operations is cross-phase from VERIFICATION onward. Confirm the Opportunity Center is
      reachable in your current phase without bouncing you to the phase gate.
  **Fail:** redirected to the phase-gate page — the guard is wrong (`operationsProcedure`
  should be `minPhaseGuard("VERIFICATION")`, not `workflowGuard`).

---

## 12. Desktop sanity (WealthOS is web-first)

- [ ] Same page on desktop: cards are readable, the expander (**סיכונים והתלבטויות**) opens
      and shows risks, trade-offs, and a confidence/priority line.

---

## "Looks bad but isn't"

| You'll see | Why it's correct |
|---|---|
| Empty on first load | Reading a page must never generate rows. Explicit action only. |
| Subscriptions say "confirm you still use this", not "cancel this" | WealthOS has no usage telemetry. Claiming a subscription is unused would be a guess dressed as a fact. |
| A subscription you cancelled months ago is NOT listed | Deliberate — cancelling it again saves nothing. |
| Leakage says "2 months observed" when you imported 3 | A month containing a row with no FX rate is EXCLUDED, not counted as zero. Counting it would show a fake falling trend. |
| Second run reports a superseded count > 0 | That's the previous run's proposals being retired. Correct. |
| Amber tax banner | IL 2026 is unreviewed. Yours to clear at `/registry`. |
| A large deadline ranks below a nearer small one | Deadline urgency is proximity, not amount. An unused ceiling does not carry forward. |

---

## Roll-up

```
✅/❌ 0. Pre-flight
✅/❌ 1. Empty on arrival
✅/❌ 2. Recompute produces cards
✅/❌ 3. Numbers grounded
✅/❌ 4. Twice ≠ double
✅/❌ 5. Accepted doesn't return
✅/❌ 6. Strategy isolation
✅/❌ 7. Hebrew / RTL
✅/❌ 8. Unreviewed-tax banner
✅/❌ 9. Deadline cards
✅/❌ 10. Safety
✅/❌ 11. Phase gate
✅/❌ 12. Desktop
```
For any ❌ — one line: what you saw.
