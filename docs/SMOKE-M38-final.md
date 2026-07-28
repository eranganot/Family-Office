# Smoke test — M38n / M38o / M38p

Live: https://wealthos-web-production-c1f7.up.railway.app/he/operations
Time: ~7 minutes. **No migration, no lockfile change in any of the three.**

Apply in order: `m38n.patch` → `m38o.patch` → `m38p.patch`.

---

## 0. Regression

`/he` dashboard, `/he/strategy`, `/he/allocation` unchanged. `/he/operations` loads with the
month card, surplus ladder, transactions, suspense queue and import card.

---

## 1. Duplicates (M38p) — do this FIRST, it changes every figure

You reported two identical `פועלים-משכנתא ₪15,081.23` rows on 2026-07-10.

| Step | Expect |
|---|---|
| Open the **תנועות** card | An amber banner: *"נמצאו N שורות כפולות ב-M תנועות (₪X)"*. |
| Press **הסרת כפילויות** | *"הוסרו N שורות כפולות"*. The extra copies grey out with a **הוסרה** badge. |
| Press **סיווג וחישוב מחדש** | Expenses drop by the duplicated amount. |
| Check the mortgage | Only ONE `פועלים-משכנתא` row for 10/07 now counts. |

**Why they existed:** the import key format changed in m38l (from the statement's אסמכתא to a
content digest). Rows imported before and after that change cannot deduplicate against each
other, so the same transaction was stored twice. The finder matches on **date + amount +
description** rather than on the key, so it works regardless of which format a row was stored
with — and will survive any future key change too.

They are **voided, not deleted** — if a match was wrong, press **שחזור** on that row.

---

## 2. Filtering (M38p)

| Step | Expect |
|---|---|
| In **תנועות**, set **קטגוריה** = `משכנתא` → **סינון** | Only mortgage rows. |
| Set **התנהגות** = `דליפה פיננסית`, clear the category | Only bank fees / card fees / FX markup. |
| Note the URL | Carries `?cat=…&beh=…` — a filtered view is linkable and survives a refresh. |
| Press **ניקוי סינון** | Back to everything. |
| Combine with a month | Filters keep `?y=&m=` so you can filter *within* a chosen month. |

---

## 3. Month navigation (M38o)

| Step | Expect |
|---|---|
| Top of the month card | `← 06/2026`, **החודש הנוכחי**, `08/2026 →`, and a chip per month that has data with its row count. |
| Click `02/2026` | The whole card recomputes for February — surplus, dual-axis, diagnostics. |
| Check the URL | `?y=2026&m=2`. Refresh — you stay on February. |
| Click a month with no data | Refuses cleanly with a reason rather than showing zeros as if they were real. |

---

## 4. Pending charges are visible (M38n)

| Step | Expect |
|---|---|
| Under the surplus ladder | *"בתהליך קליטה, טרם חויב: ₪X (N תנועות כרטיס)"* when a month has in-process card charges. |
| Meaning | Still excluded from the settled totals — the money has not left your account — but no longer invisible, which is what prompted the question. |
| **בטוח להוצאה** | Now carries *"כבר הופחתו ₪X של חיובי כרטיס בתהליך"*. They ARE committed even though unsettled, so Safe-to-Spend subtracts them. |
| Cross-check in **אבחון** | Those rows show `לא — PENDING` in the last column. |

---

## 5. Lint warning (M38o)

Nothing to see in the app. On your next `npm run lint`, the
`[boundaries][warning]: Detected legacy selector syntax` line is gone.

> ⚠️ **Read the STATUS.md note on this.** While migrating I found that the boundary rules are
> **not actually enforcing cross-package imports** — a deliberate violation is not flagged, by
> either the old or new config. That is pre-existing, not caused by the migration, but
> `docs/architecture/04` claims CI fails on violation and it currently does not. The domain
> purity rule IS working (verified). Fixing it needs an import resolver + lockfile change and is
> queued as the next piece of work.

---

## 6. Bilingual

`/en/operations` — filter labels, duplicate banner, month navigation and the pending line are
all English, no raw keys.

---

## Report back

`M38 final OK`, or the section number. Section 1 is the one that changes your numbers —
worth confirming the mortgage counts once before moving on.
