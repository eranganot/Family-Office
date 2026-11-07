# Smoke test — M38a (transaction editing, provenance, guard tests)

Live: https://wealthos-web-production-c1f7.up.railway.app/he/operations
Time: ~5 minutes. **No migration, no lockfile change.**

This phase is the two things you asked for: being able to fix a row, and being able to
see *why* a row has the category it has.

---

## 0. Regression

| Step | Expect |
|---|---|
| `/he` dashboard, `/he/strategy`, `/he/allocation` | Unchanged. |
| `/he/operations` — month card, surplus ladder, suspense queue | All still there and computing as in M37. |

---

## 1. Provenance — the answer to "why is this電 electricity?"

The transactions list is now a card per row instead of a table. Under each description
there is a grey provenance line.

| Row | Provenance line should read |
|---|---|
| `SPOTIFY P43CD5B1CB` | *סווג על ידי: כלל בית עסק · 95% ביטחון · merchant-rules@1.0.0-m37* |
| `דמי כרטיס` | *כלל בית עסק · 97% ביטחון* |
| Anything you confirmed yourself | *החלטה שלכם · 100% ביטחון · <your email>* |
| `ZZQQ WIDGET EMPORIUM` (fresh, unclassified) | *לא נמצא כלל מתאים · 0% ביטחון* |

**This is the one to check on the row that surprised you.** If it says *החלטה שלכם*, the
category came from a form submission, not from the engine. If it says *כלל בית עסק* with a
rule version, a merchant rule fired and the rule is what needs fixing.

> For the record: I re-ran the classifier on `ZZQQ WIDGET EMPORIUM` — it returns
> `other.unclassified`, method FALLBACK, confidence 0. So the engine did not put it in
> חשמל. Now you can see that for yourself instead of taking my word for it.

---

## 2. Editing a row

| Step | Expect |
|---|---|
| Press **עריכה** on any row | An inline form opens with every field pre-filled. |
| Change the **amount** and save | Banner *"התנועה עודכנה."*; the amount updates. |
| Press **סיווג וחישוב מחדש** | The surplus ladder reflects the new amount. |
| Edit the row that was wrongly in חשמל → set the right category, save | Fixed. Provenance now reads *החלטה שלכם*. |
| Press **ביטול** while editing | Closes without saving. |

Things worth trying deliberately:

- **Change the description** from `SPOTIFY P43CD5B1CB` to something unrelated, save, then
  recompute. The merchant key is derived from the description, so it is recomputed — the row
  no longer groups with your other Spotify charges. (This is why edit had to recompute it
  rather than leave the old key in place.)
- **Change the currency to USD** with no FX rate for that date, then recompute. The month
  refuses with the missing-rate message rather than silently converting. Change it back to
  ILS and it recovers.
- **Set instalment 4 of 3** → rejected by validation.

---

## 3. Remove and restore

| Step | Expect |
|---|---|
| Press **הסרה** on a row | Banner *"התנועה הוסרה — היא אינה נספרת עוד באף נתון."* The card greys out with a **הוסרה** badge. |
| Press **סיווג וחישוב מחדש** | The surplus changes — the removed amount is gone from the totals. |
| Press **שחזור** on that row | It comes back, and recomputing restores the old figures exactly. |

Removal is a **void**, not a delete: the row and its classification history are kept, which
is why restore is possible and why the audit trail survives. Functionally it stops counting
the moment you remove it.

---

## 4. Bilingual

`/en/operations` — the new strings (Edit / Remove / Restore / "Categorised by: …") are all
English, no raw keys. Back in Hebrew the edit form lays out right-to-left.

---

## 5. Language switch stays put

| Step | Expect |
|---|---|
| Go to `/he/operations`, press the language link | You land on `/en/operations` — **the same page**, not the dashboard. |
| Do the same from `/he/strategy`, `/he/goals` | Same page each time. |
| Note | Query parameters are dropped on purpose (`?edit=…`, `?created=1` are transient UI state — carrying them across would re-fire success banners). |

---

## 6. CI — check the RIGHT run

**Do not press "Re-run jobs" on the failed run.** GitHub re-runs a workflow at its
*original commit*, and run #45 is pinned to `90a37bd` (M36), whose lockfile genuinely was
broken. It will fail every time, forever. That was bad advice from me last round.

Instead: **[Actions → branch `main`](https://github.com/eranganot/Family-Office/actions?query=branch%3Amain)**
and open the run for the **newest** commit. `d97799b` fixed the lockfile and `main` has been
correct since — I fresh-cloned `af17e2b` and `npm ci` resolves on it.

Pushing M38a triggers a fresh run, so the simplest check is: deploy this phase, then look at
the top run in that list. If it fails, the failing **step name** is the useful thing to send.

---

## Report back

`M38a OK`, or the section number and what you saw.
