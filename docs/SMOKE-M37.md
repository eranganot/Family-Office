# Smoke test — M37 (dual-axis engine, verified surplus)

Live: https://wealthos-web-production-c1f7.up.railway.app/he/operations
Time: ~8 minutes. **No migration in this phase** — the schema is unchanged since M36.

M36 gave you a place to put transactions. M37 makes them mean something: it classifies
them, computes a real monthly surplus, and tells you what is safe to spend.

---

## 0. Regression — nothing existing moved

| Step | Expect |
|---|---|
| `/he` dashboard, `/he/strategy`, `/he/allocation`, `/he/monitoring` | All load unchanged. |
| `/he/operations` | Your M36 transactions and category tree are still there. |
| Strategy recommendations | Unaffected — M37 adds no assumption versions, so nothing is invalidated this time. |

---

## 1. Classification actually fires

Add these four transactions (all outflows, today's date, ILS), leaving **category blank**
and behaviour on *ברירת המחדל של הקטגוריה*:

| Amount | Description | Should classify as |
|---|---|---|
| `33.90` | `SPOTIFY P43CD5B1CB` | מנויים דיגיטליים · קבועה / חוזית |
| `14.18` | `דמי כרטיס` | דמי כרטיס · **דליפה פיננסית** |
| `461.76` | `חשבון חשמל` | חשמל · קבועה / חוזית |
| `250` | `ZZQQ WIDGET EMPORIUM` | לא מסווג → **תור בירור** |

Then press **סיווג וחישוב מחדש**.

Expect: the first three are categorised automatically. The fourth lands in the
**תור בירור** (suspense queue) at 0% confidence.

**The one that proves the Hebrew handling:** add `למשח ןובשח` (that is `חשבון חשמל`
written backwards, exactly as the real PDFs store it). It must classify as **חשמל**,
identically to the forward version.

---

## 2. Suspense is non-blocking — the point of the whole design

| Step | Expect |
|---|---|
| Look at the month card after recomputing | An amber banner: *"מכיל תנועות לא מאומתות — 1 פריטים, ₪250"*. |
| Look at the surplus figure | It is **still computed**, and it **includes** the ₪250. |

That is the rule working: an unrecognised transaction never blocks your numbers, it only
marks them provisional. Confirming it removes the flag — it does not change the total.

---

## 3. Teaching the classifier (no model involved)

| Step | Expect |
|---|---|
| In **תור בירור**, set `ZZQQ WIDGET EMPORIUM` to `קניות מקוונות` and press **החל על בית העסק** | Queue empties; banner *"הסיווג עודכן."* |
| Add a **second** transaction with the same description but a different amount | — |
| Press **סיווג וחישוב מחדש** | The new one is categorised as `קניות מקוונות` **automatically**, at 100% confidence. It never reaches the queue. |

**Reference-code generalisation:** add `SPOTIFY Q99XX1A2BC`. Because merchant keys strip
per-transaction codes, your Spotify decision already covers it.

---

## 4. Surplus arithmetic — check it by hand

Add income: `28000`, direction **כסף נכנס**, description `משכורת`, category `משכורת`.
Recompute. In **עודף חודשי** the ladder should read:

```
הכנסה נטו            +28,000
קבועה / חוזית          − (electricity + spotify + any fixed)
משתנה / שיקולית        − (shopping etc.)
דליפה פיננסית          − 14.18
שירות חוב              − (from your mortgage/loan ledger items)
────────────────────────────
עודף מאומת             = the rest
```

Three things to verify deliberately:

1. **Add a `2000` outflow described `קרן השתלמות`.** Recompute. The surplus must **not**
   drop by 2,000 — hishtalmut is a savings flow, not an expense. A note appears below the
   ladder saying so.
2. **Add a `5611.17` outflow described `ישראכרט בעמ`.** It is classed **העברה (לא נספר)**
   and excluded from both sides, so the surplus is unchanged. This is the guard that stops
   your bank statement's aggregate card debit from double-counting the card statement's
   itemised rows.
3. **Debt service comes from the ledger**, not from transactions — so it appears even if
   you never enter a mortgage payment as a transaction.

---

## 5. Refusals — the engine says "I can't", never guesses

| Step | Expect |
|---|---|
| Add a transaction in **USD** with no FX rate set for today | Recompute. The month refuses: *"לתנועה במטבע חוץ אין שער חליפין..."* — the whole period, not a silently-zeroed row. |
| Set the USD rate under **מט״ח**, recompute | Figures return. |
| In a month with expenses but no income | Surplus refuses with *"לא מופתה הכנסה..."* rather than showing a negative number as if it were fact. |

A partial total is a wrong total — that is why it refuses rather than showing something plausible.

---

## 6. Safe-to-Spend and instalments

| Step | Expect |
|---|---|
| Look at **בטוח להוצאה** | A figure, plus *"מה שנותר אחרי הוצאות קבועות, חוב והתחייבויות ב-30 הימים הקרובים"*. |
| Sanity-check | It subtracts **fixed** costs but **not** discretionary spending — discretionary is what the number is a budget *for*. |
| Add a transaction with **תשלום מס׳ 1 מתוך 3**, amount `1603.59`, and recompute | A line appears: *"כולל ₪1,603.59 של תשלומים עתידיים..."* and Safe-to-Spend drops by that amount — the future instalment is committed, though it is **not** counted as this month's expense. |

---

## 7. Closing the month

| Step | Expect |
|---|---|
| Press **סגירת החודש** (optionally with a note) | Badge changes to **סגור**; banner *"החודש נסגר והוקפא."* |
| Meaning | `computed`, the assumption `pins` and the engine version are frozen, so this month stays reproducible even after rules or assumptions change later. |
| Closing while items are still unverified | **Allowed** — and the provisional flag is recorded with it. |
| Press **פתיחה מחדש** | Returns to open. |

---

## 8. Bilingual + RTL

`/en/operations` — every new string in English, no raw keys like `operations.surplusTitle`.
Back to Hebrew — the behavioural bars grow from the **right**.

---

## Report back

`M37 OK`, or the section number plus what you saw. If a figure looks wrong, the most useful
thing is the **surplus ladder numbers** plus what you expected — the arithmetic is
deliberately inspectable so a disagreement pins down the rule at fault.
