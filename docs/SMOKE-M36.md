# Smoke test — M36 (Financial Operations, core context)

Live: https://wealthos-web-production-c1f7.up.railway.app
Time: ~6 minutes. **Test 0 and Test 6 are the ones that matter most** — they prove M36
changed nothing that already worked.

---

## 0. Regression first — nothing existing moved

| Step | Expect |
|---|---|
| Open `/he` (dashboard) | Loads exactly as before. Same M35 cards, same numbers, same phase strip. |
| Open `/he/strategy` | Recommendations still listed. |
| Open `/he/allocation` | Approved plan / cart renders as before. |
| Open `/he/verification`, `/he/monitoring` | Unchanged; phase gate still shown on each. |

> ⚠️ **Expected, not a bug:** M36 seeds 11 new assumption keys, and the existing rule is that a
> new assumption version **invalidates pinned recommendations**. If strategy recommendations show
> as invalidated, that is correct behaviour — **rerun strategy once** and they come back.

---

## 1. The Operations tab exists and is cross-phase

| Step | Expect |
|---|---|
| Look at the nav row | A new **תפעול** (Operations) link, between הקצאה and יעדים. |
| Confirm it is NOT in the numbered phase strip | The 1..5 phase strip below is unchanged — Operations is deliberately outside it. |
| Open `/he/operations` | Page loads. **No phase-gate panel** appears (Operations never blocks or gets blocked). |
| Note the current phase badge in the header | Whatever phase you are in, the tab works. That is the D2 decision made visible. |

---

## 2. Category tree seeded itself

| Step | Expect |
|---|---|
| Scroll to **עץ הקטגוריות** | Two columns: הוצאה (Expense) and הכנסה (Income). |
| Count | Hint line reads roughly **"117 קטגוריות נטענו"**. |
| Check indentation | `דיור` has children `משכנתא`, `ארנונה`, `חשמל`, `מים`, `אינטרנט…`; `מזון` has `סופרמרקט`, `מסעדות`, `בתי קפה`, `משלוחים`. |
| Check the right-hand behaviour labels | `ארנונה` → **קבועה / חוזית**. `מסעדות` → **משתנה / שיקולית**. `עמלות בנק` → **דליפה פיננסית**. `קרן השתלמות` → **זרם חיסכון**. `חיוב כרטיס אשראי` → **העברה (לא נספר)**. |
| Reload the page | Count stays the same — seeding is idempotent, it does not duplicate. |

*The last two rows are the design in miniature: hishtalmut is savings, not an expense (D7), and a
card settlement is a transfer, so it can never double-count the itemised card statement.*

---

## 3. Add a transaction (dual-axis tagging)

| Step | Expect |
|---|---|
| In **הוספת תנועה**: date = today, direction = **כסף יוצא**, amount `250`, currency ILS, description `סופר יוחננוף 4471`, category `סופרמרקט`, behaviour = leave on *ברירת המחדל של הקטגוריה* | — |
| Submit | Green banner **"התנועה נשמרה."** |
| Look at the **תנועות** table | Row appears. Amount shows `₪250.00` in dark text (outflow). |
| Add a second one: direction = **כסף נכנס**, amount `28,000`, description `משכורת`, category `משכורת` | Amount renders **green** (inflow). |

**Merchant-key check (the deterministic classifier's foundation):** add two transactions with
descriptions `SPOTIFY P43CD5B1CB` and `SPOTIFY Q99XX1A2BC`. They are different strings but the
reference codes are stripped, so both resolve to the same merchant key — which is what will let
M37 auto-classify the second one from your decision on the first.

---

## 4. Instalments and recurring markers

| Step | Expect |
|---|---|
| Add a transaction, amount `1603.59`, description `עיריית ר״ג`, and set **תשלום מס׳** = `1`, **מתוך** = `3` | Saves. |
| Look at the row | An amber badge **"תשלום 1 מתוך 3"**. |
| Add another with the **הוראת קבע** checkbox ticked | A blue badge **"הוראת קבע"**. |
| Try instalment number `4` of `3` | **Rejected** (validation: number may not exceed total). |
| Try leaving **מתוך** empty while **תשלום מס׳** is filled | **Rejected** (they must be provided together). |

*Those two badges are not cosmetic — in M37 the instalment badge becomes a committed future outflow
in the liquidity forecast, and the recurring badge is a free, high-confidence recurring signal
lifted straight from your real card statements.*

---

## 5. Reclassify, and the unclassified path

| Step | Expect |
|---|---|
| Add a transaction with **no category** (leave *להשאיר ללא סיווג*) | Row shows an amber **"לא מסווג"** badge. |
| In its **סיווג מחדש** cell pick `בתי קפה` + **משתנה / שיקולית**, press **החל** | Banner **"הסיווג עודכן."**; the badge is replaced by the category name. |
| Reclassify the same row again to something else | Works. (Each change supersedes the previous classification rather than overwriting it — the history is auditable.) |

---

## 6. Add your own category

| Step | Expect |
|---|---|
| Bottom form: axis `הוצאה`, parent `מזון`, key `food.bakery`, EN `Bakery`, HE `מאפייה`, behaviour `משתנה / שיקולית` | Banner **"הקטגוריה נשמרה."** and it appears nested under מזון. |
| Try key `Food Bakery` (spaces/caps) | **Rejected** — keys must be dot-separated lowercase slugs. |
| Try the key `food.bakery` a second time | **Rejected** — keys are unique per household. |

---

## 7. Bilingual + RTL

| Step | Expect |
|---|---|
| Switch to English via the locale link | Every string on `/en/operations` is English — no Hebrew leakage, no raw keys like `operations.addTransaction`. |
| Switch back to Hebrew | Layout is right-to-left; the indented category tree indents from the **right**. |

---

## Report back

One line is enough, e.g. `M36 OK` — or the section number plus what you saw if something is off.
If a step fails, the useful details are: the section number, the URL, and whether the browser
console shows a tRPC error code (`FORBIDDEN`, `BAD_REQUEST`, `NOT_FOUND`).
