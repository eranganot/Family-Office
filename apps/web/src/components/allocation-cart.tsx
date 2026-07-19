"use client";

import { useMemo, useState } from "react";
import { commitCartAction } from "../lib/actions/allocation-actions";

export interface CartCandidate {
  id: string; kind: string; editable: boolean; minAmount: number; maxAmount: number;
  suggestedAmount: number; ratePct: number | null; title: string; detail: string; goalImpact: string;
}
export interface ImpactBase {
  horizonYears: number; expectedReturnPct: number; inflationPct: number; targetGrowthPct: number;
  cashBase: number; totalDebt: number; annualInterest: number; currentGrowth: number;
  currentKnownMix: number; mixKnown: boolean; goalGapBase: number | null;
}
export interface CartLabels {
  catalog: string; myPlan: string; add: string; remove: string; empty: string;
  allocated: string; remaining: string; over: string; projected: string; inYears: string;
  interestSaved: string; liquidity: string; growthShare: string; debtLeft: string;
  approve: string; approveHint: string; note: string; verifyDone: string; perYear: string; amountLabel: string;
}
const KIND_REPAY = new Set(["REPAY_EXPENSIVE_DEBT", "REPAY_DEBT"]);
const KIND_INVEST = new Set(["INVEST_GROWTH", "INVEST_DEFENSIVE"]);

export function AllocationCart({
  planId, freeCash, candidates, base, initial, labels, locale,
}: {
  planId: string; freeCash: number; candidates: CartCandidate[]; base: ImpactBase;
  initial: Record<string, number>; labels: CartLabels; locale: string;
}) {
  const verifyCands = candidates.filter((c) => c.kind === "TAX_VERIFY_PAYROLL");
  const actionCands = candidates.filter((c) => c.kind !== "TAX_VERIFY_PAYROLL");
  const [sel, setSel] = useState<Record<string, number>>(initial);

  const nis = (n: number) => "₪" + Math.round(n).toLocaleString(locale === "he" ? "he-IL" : "en-US");
  const H = base.horizonYears, r = base.expectedReturnPct / 100, infl = base.inflationPct / 100;
  const grow = (amt: number, rate: number) => amt * (Math.pow(1 + rate, H) - 1);
  const candById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const perItem = (id: string, amount: number) => {
    const c = candById.get(id)!;
    if (KIND_REPAY.has(c.kind)) return { extra: grow(amount, Math.max(0, (c.ratePct ?? 0) / 100 - infl)), interest: (amount * (c.ratePct ?? 0)) / 100 };
    return { extra: grow(amount, r), interest: 0 };
  };

  const inCart = actionCands.filter((c) => sel[c.id] !== undefined);
  const inCatalog = actionCands.filter((c) => sel[c.id] === undefined);
  const allocated = Object.entries(sel).reduce((t, [, a]) => t + a, 0);
  const remaining = freeCash - allocated;
  const totalExtra = Object.entries(sel).reduce((t, [id, a]) => t + perItem(id, a).extra, 0);
  const investAdded = inCart.filter((c) => KIND_INVEST.has(c.kind)).reduce((t, c) => t + (sel[c.id] ?? 0), 0);
  const growthAdded = inCart.filter((c) => c.kind === "INVEST_GROWTH").reduce((t, c) => t + (sel[c.id] ?? 0), 0);
  const debtRepaid = inCart.filter((c) => KIND_REPAY.has(c.kind)).reduce((t, c) => t + (sel[c.id] ?? 0), 0);
  const growthAfter = base.mixKnown && base.currentKnownMix + investAdded > 0
    ? Math.round(((base.currentGrowth + growthAdded) / (base.currentKnownMix + investAdded)) * 1000) / 10 : null;

  const add = (id: string) => setSel((s) => ({ ...s, [id]: candById.get(id)!.suggestedAmount || Math.min(candById.get(id)!.maxAmount, remaining) }));
  const remove = (id: string) => setSel((s) => { const n = { ...s }; delete n[id]; return n; });
  const setAmt = (id: string, v: string) => {
    const c = candById.get(id)!;
    const amt = Math.min(Math.max(Number(v.replace(/[^\d.]/g, "")) || 0, c.minAmount), c.maxAmount);
    setSel((s) => ({ ...s, [id]: amt }));
  };

  const box: React.CSSProperties = { background: "var(--surface-2, #fff)", border: "0.5px solid var(--border, #e5e5e5)", borderRadius: 12, padding: "0.7rem 0.8rem", marginBottom: 8 };
  const selectionsJson = JSON.stringify(inCart.map((c) => ({ candidateId: c.id, amount: sel[c.id] })));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h4 className="mb-2 text-sm font-semibold text-neutral-600">{labels.catalog}</h4>
        {inCatalog.length === 0 ? <p className="text-xs text-neutral-400">{labels.empty}</p> : null}
        {inCatalog.map((c) => {
          const pi = perItem(c.id, c.suggestedAmount || Math.min(c.maxAmount, Math.max(0, remaining)));
          return (
            <div key={c.id} style={box}>
              <p className="text-sm font-semibold text-neutral-800" dir="auto">{c.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500" dir="auto">{c.detail}</p>
              <p className="mt-1.5 text-xs font-medium text-blue-700">📈 +{nis(pi.extra)} {labels.inYears}</p>
              <button type="button" onClick={() => add(c.id)} className="mt-2 w-full rounded-lg border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">+ {labels.add}</button>
            </div>
          );
        })}
      </div>

      <div style={{ background: "var(--surface-1, #f7f7f5)", borderRadius: 12, padding: "0.8rem 0.9rem" }}>
        <h4 className="mb-2 text-sm font-semibold">{labels.myPlan}</h4>
        {inCart.length === 0 && verifyCands.length === 0 ? <p className="text-xs text-neutral-400">{labels.empty}</p> : null}
        {inCart.map((c) => {
          const amt = sel[c.id] ?? 0; const pi = perItem(c.id, amt);
          return (
            <div key={c.id} style={box}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-neutral-800" dir="auto">{c.title}</span>
                <button type="button" onClick={() => remove(c.id)} aria-label={labels.remove} className="shrink-0 text-neutral-400 hover:text-red-500">✕</button>
              </div>
              {c.editable ? (
                <label className="mt-2 block">
                  <span className="text-xs text-neutral-500">{labels.amountLabel}</span>
                  <span className="mt-0.5 flex items-center rounded border border-neutral-300 focus-within:border-blue-500">
                    <span className="px-2 text-sm text-neutral-400">₪</span>
                    <input value={String(amt)} onChange={(e) => setAmt(c.id, e.target.value)} inputMode="numeric"
                      className="h-9 w-full rounded-l bg-transparent px-1 text-sm outline-none" />
                  </span>
                </label>
              ) : null}
              <p className="mt-1.5 text-xs font-medium text-blue-700">📈 +{nis(pi.extra)} {labels.inYears}{pi.interest > 0 ? ` · ${labels.interestSaved} ${nis(pi.interest)}/${labels.perYear}` : ""}</p>
            </div>
          );
        })}
        {verifyCands.map((c) => (
          <div key={c.id} style={{ ...box, opacity: 0.8 }}>
            <p className="text-xs text-neutral-600" dir="auto">{c.detail}</p>
            <span className="text-xs font-medium text-green-700">✓ {labels.verifyDone}</span>
          </div>
        ))}

        <div className="mt-2 border-t border-neutral-200 pt-2 text-sm">
          <Row label={labels.allocated} value={nis(allocated)} />
          <Row label={labels.remaining} value={nis(Math.max(0, remaining))} danger={remaining < -1} />
          <Row label={labels.liquidity} value={nis(base.cashBase - debtRepaid - investAdded - inCart.filter((c) => c.kind.startsWith("TAX_CEILING")).reduce((t, c) => t + (sel[c.id] ?? 0), 0))} />
          {base.totalDebt > 0 ? <Row label={labels.debtLeft} value={nis(base.totalDebt - debtRepaid)} /> : null}
          {growthAfter !== null ? <Row label={labels.growthShare} value={`${growthAfter}% / ${base.targetGrowthPct}%`} /> : null}
          <div className="mt-1 flex justify-between font-semibold text-green-700"><span>{labels.projected}</span><span>+{nis(totalExtra)}</span></div>
        </div>

        <form action={commitCartAction} className="mt-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="id" value={planId} />
          <input type="hidden" name="selections" value={selectionsJson} />
          <input name="note" placeholder={labels.note} className="mb-2 h-9 w-full rounded border border-neutral-300 px-2 text-sm" />
          <button type="submit" disabled={remaining < -1} className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white ${remaining < -1 ? "bg-neutral-300" : "bg-green-600"}`}>{labels.approve} →</button>
          <p className="mt-1.5 text-center text-xs text-neutral-400">{labels.approveHint}</p>
        </form>
      </div>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className="flex justify-between py-0.5"><span className="text-neutral-500">{label}</span><span className={`font-medium ${danger ? "text-red-600" : ""}`}>{value}</span></div>;
}
