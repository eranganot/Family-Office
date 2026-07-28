# Smoke test — M39 (Financial calendar + recurring decisions)

~5 minutes. Base URL: https://wealthos-web-production-c1f7.up.railway.app

## 0. Regression check (do this first)

1. Open `/he/operations`.
2. The month card, dual-axis breakdown, transactions list and import section must all
   look exactly as they did after M38p. **Safe-to-Spend must be unchanged** — M39 adds a
   term to it, but that term is 0 until a calendar event carries an amount.
3. Note the Safe-to-Spend figure. You will re-check it in step 4.

## 1. Build the calendar

1. Scroll to **לוח שנה פיננסי / Financial calendar** (above the suspense queue).
2. It should say "no upcoming events" — nothing is generated on page load, because a
   read must not write rows.
3. Press **בנה מחדש את הלוח / Rebuild calendar**.
4. Expect a green banner and a table. In a 120-day window you should see:
   - Israeli statutory deadlines that fall in the window (annual return, capital-gains
     reporting, year-end gemel/hishtalmut checks).
   - One row per remaining instalment on your cards, each with an amount.
5. Press it a second time. **The list must not double.** Regeneration replaces future
   scheduled rows rather than appending — if the count doubles, stop and tell me.

## 2. Owner decisions are preserved

1. Press **בוצע / Done** on any row. It disappears from the upcoming list.
2. Press **בנה מחדש את הלוח** again. The row you marked done must **not** come back.
   (Rule-generated future rows are rebuilt; your decisions and history are not touched.)

## 3. Recurring decisions — no invented dates

1. Under **החלטות חוזרות / Recurring decisions**, the template reviews that need *your*
   date (insurance renewal, mortgage review, …) ship **unchecked**. That is deliberate:
   WealthOS does not know when your policy renews, and a guessed date produces a
   confident, wrong calendar.
2. Pick one, set a real date, tick **פעיל / Active**, press save.
3. The calendar above rebuilds automatically and the item appears on your date.

## 4. Safe-to-Spend is not double-charged

1. Re-check the Safe-to-Spend figure from step 0. **It must be identical.**
2. Reason: instalment calendar events are *derived from* the transactions that already
   feed Safe-to-Spend. Only calendar events with no source transaction add to the
   committed total. If Safe-to-Spend dropped after building the calendar, that guard has
   failed — stop and tell me.

## 5. Registry (B3/B4 sign-off)

1. Open `/he/registry`.
2. Bituach leumi employee rates are populated for IL 2026, decomposed:
   - **1.04%** reduced / **7.00%** full — bituach leumi alone
   - **3.23%** reduced / **5.17%** full — health tax alone
   - **4.27%** / **12.17%** — the combined deduction (what a payslip withholds)
3. These were **corrected after reconciling against a real 2025 form 106**. The widely
   quoted `3.5% / 12.0%` pair is the *pre-2025 combined* rate, not bituach leumi alone;
   seeding it as BL-only overstated the reduced band 3.4x. A regression test now pins the
   decomposition and reproduces the payslip to within 5 ILS.
4. These matrices are still `ownerReviewed=false`. Flipping that flag is yours to do.

## Report back

One line: `M39 OK` or the step number that failed plus what you saw.
