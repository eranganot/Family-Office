# Smoke test — M38c (PDF statements, multi-upload, category search)

Live: https://wealthos-web-production-c1f7.up.railway.app/he/operations
Time: ~8 minutes. **No migration, no lockfile change, no new dependencies.**

---

## 0. Regression

`/he` dashboard, `/he/strategy`, `/he/allocation` unchanged. `/he/operations` still shows the
month card, surplus ladder, editable rows and suspense queue.

---

## 1. The bug you reported — "החל על בית העסק"

| Step | Expect |
|---|---|
| Open the suspense queue | The button is now a **solid blue button**, not a dead grey link. |
| Press it on any row | The category applies to that merchant across all its transactions. |
| A row with no usable merchant name | Instead of a silently disabled control: *"אין שם בית עסק לקיבוץ"* plus a link to edit that single row. |

**What was actually wrong.** The button was `disabled` when a row had no `merchantKey` — and
**imported transactions never got one**, because the import path didn't set it. That's worse
than an un-clickable button: owner memory is keyed on `merchantKey`, so every imported row was
silently excluded from the learning loop. Confirming a merchant would never have applied to the
rows that came from your statements.

Press **סיווג וחישוב מחדש** once after deploying — it backfills merchant keys on rows imported
before this fix.

---

## 2. Type-to-search categories

| Step | Expect |
|---|---|
| Any category field (manual entry, edit form, suspense queue, add-category) | Now a text box with typeahead, not a 117-item dropdown. |
| Type `ארנ` | `דיור › ארנונה` appears. |
| Type `קפה` | `מזון › בתי קפה`. |
| Note the format | Each option shows its parent path, which is what makes repeated leaf names (e.g. "אחר") unambiguous. |
| Type nonsense and submit | The category is left unset rather than guessed at. |

No JavaScript involved — it's a native `<datalist>`, so it stays server-rendered and RTL-correct.

---

## 3. Multi-file upload

| Step | Expect |
|---|---|
| In **ייבוא דף חשבון**, select **several files at once** | *"N קבצים הועלו, M נדחו"*. Rejections are duplicates of files already stored — that's correct behaviour, not an error. |
| Below the form | **"הועלו, טרם יובאו"** lists every uploaded-but-unimported statement with a **תצוגה מקדימה** link. |
| Preview and import them one at a time | Each disappears from the pending list once imported. |

One bad file no longer aborts the whole batch.

---

## 4. PDF statements — the new one

Try the three PDFs you sent: `1069_07_2026.pdf`, `7796_07_2026.pdf` (Isracard), `1401_07.pdf` (CAL),
and `report__2026-01-01__2026-07-27.pdf` (FIBI bank).

| Step | Expect |
|---|---|
| Upload one → preview | *"מנפיק שזוהה: ISRACARD"* (or CAL / FIBI_BANK). **No column-mapping wizard** — PDFs have no columns; the layout is the format. |
| Sample rows | Dates, readable **logical-order** Hebrew merchant names, and amounts. |
| Isracard specifically | Where a row shows `$10.00 → ₪29.79`, the imported amount must be **₪29.79** (the charge), not the transaction amount. |
| CAL specifically | Rows under `עסקאות בתהליך קליטה` carry the **pending** badge and must not count in the month. |
| Voucher numbers | A 9-digit reference like `629076429` must **not** appear as an amount. |
| Expand *"N שורות דולגו"* | Lines the parser couldn't read. |

**Expect this one to need a tweak.** My fixtures reproduce the *shape* of your files, not the
files themselves — household data can't go in the repo. If rows come out wrong, the most useful
report is: which PDF, one example row as shown in the preview, and what it should have been.
The skipped-lines list is there precisely to make that diagnosable.

---

## 5. It still feeds the engine

Import a real month → **סיווג וחישוב מחדש** → the surplus ladder is built from it. Confirm one
merchant in the suspense queue and check that a second transaction from the same merchant is
auto-categorised.

---

## 6. Bilingual

`/en/operations` — all new strings in English, no raw keys. The picker's parent paths render in
English there too.

---

## Report back

`M38c OK`, or the section number and what you saw.
