# Smoke test — M38b (statement import + PII redaction)

Live: https://wealthos-web-production-c1f7.up.railway.app/he/operations
Time: ~8 minutes. **No migration, no lockfile change, no new dependencies.**

This is the phase where you stop typing transactions.

---

## 0. Regression

| Step | Expect |
|---|---|
| `/he` dashboard, `/he/strategy`, `/he/allocation` | Unchanged. |
| `/he/operations` | Month card, surplus ladder, editable rows, suspense queue — all as in M38a. |
| Language link | Still keeps you on the same page (the M38a fix). |

---

## 1. Import the Isracard HTML — this one works as-is

Use the file you sent me: `FibiSave1785144922378.html`.

| Step | Expect |
|---|---|
| **ייבוא דף חשבון** → choose the file → **העלאה ותצוגה מקדימה** | A preview appears. **Nothing has been saved yet** — the heading says so. |
| Summary line | Something like *"73 שורות נקראו · N שמישות · 0 כבר יובאו · M דולגו"*, plus the detected date range and *HTML, utf-8*. |
| Green security line | *"N שדות מידע אישי הוסרו לפני שנשמר משהו"* — the account-holder name in that file is redacted before anything is stored. |
| Column mapping below | Pre-guessed from the Hebrew headers: תאריך עסקה / שם העסק / סכום חיוב. |
| Sample rows | Instalment badges (e.g. `1/3`) appear where the statement says `תשלום 1 מתוך 3`. |

Then press **ייבוא התנועות**. Expect *"יובאו N תנועות (0 כבר היו קיימות ודולגו)"*, and the rows
appear in the transaction list already categorised.

**Re-import the exact same file.** Expect *"יובאו 0 תנועות (N כבר היו קיימות ודולגו)"* — imports
are idempotent, which matters because bank exports are date-range based and overlaps are
inevitable.

---

## 2. The OneZero `.xls` — expected to be refused, on purpose

Upload `OZ_Movements_ILS….xls`.

Expect an amber message explaining that legacy binary `.xls` is not read here, and asking you
to re-export as CSV.

**Why I made that call:** the only npm-published library that reads legacy BIFF `.xls` is
SheetJS's `xlsx`, whose npm distribution is unmaintained and carries known prototype-pollution
and ReDoS advisories. Adding an unmaintained parser with open CVEs to a system holding your
household's financial data — to read a format OneZero will also export as CSV — is a bad trade.
If you'd rather I took the dependency, say so and I will; it's your risk to weigh, not mine.

**Then:** re-export that OneZero range as CSV and import it. It should map with
`חובה`/`זכות` auto-detected as **חובה / זכות בנפרד** (debit/credit mode).

---

## 3. Redaction — verify it yourself

The point of this feature is that you don't have to trust me. After importing:

| Check | Expect |
|---|---|
| Look at any imported description containing an account or card number | It shows `[ACCT]` / `[CARD]`, never the digits. |
| The account-holder name from the card statement header | Shows `[NAME]`. |
| A voucher/reference number like `629076429` | **Still intact** — 9 digits alone are not an ID unless the check digit validates, and shredding them would corrupt your data. |
| Amounts and dates | Untouched. |

The original file is still stored complete and access-controlled under Documents; only the
transaction table holds the redacted form.

---

## 4. Column mapping when the guess is wrong

| Step | Expect |
|---|---|
| Upload a CSV whose headers the guesser doesn't recognise | Preview shows *"אין שורות שמישות עם מיפוי העמודות הנוכחי"*. |
| Set the date/description/amount columns by hand from the dropdowns | — |
| Fill **שמירת המיפוי בשם** (e.g. `עו״ש הבינלאומי`) and import | The mapping is saved for reuse. |
| Expand *"N שורות דולגו — למה?"* | Reasons per row: no readable date / no readable amount / zero amount. Subtotal and footer rows land here legitimately — they're shown rather than silently dropped so the totals are never mysteriously short. |

---

## 5. It feeds the engine

After importing a real month:

| Step | Expect |
|---|---|
| Press **סיווג וחישוב מחדש** | Imported rows are auto-classified by the M37 merchant rules. |
| Surplus ladder | Now built from real data. |
| Suspense queue | Unrecognised merchants land here — confirm one and every past and future transaction from that merchant follows. |
| Card settlements | If you import both a bank statement and its card statement for the same period, the bank-side aggregate should be classed **העברה (לא נספר)** so the card spend isn't counted twice. Worth checking on a month where you have both. |

---

## 6. Bilingual

`/en/operations` — all import strings in English, no raw keys.

---

## Report back

`M38b OK`, or the section number and what you saw. If a real file parses badly, the useful
things are: which file, what the preview summary said, and one example row that came out wrong.
That's expected at least once — the fixtures are synthetic, built from your files' *structure*.
