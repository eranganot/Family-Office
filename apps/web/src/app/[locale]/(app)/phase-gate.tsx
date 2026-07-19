import { getTranslations } from "next-intl/server";
import { transitionAction } from "../../../lib/actions/workflow-actions";

/** M33 — shared phase footer: shows the legal next step(s) for the current phase + what's blocking.
 *  Rendered on every phase page so you complete each phase from within it. */
export async function PhaseGate({ locale }: { locale: string }) {
  const t = await getTranslations("gate");
  const tp = await getTranslations("phase");
  const { serverCaller } = await import("../../../lib/trpc-server");
  const trpc = await serverCaller();
  const g = await trpc.workflow.gate();
  const state = g.state as "MAPPING" | "VERIFICATION" | "ALLOCATION" | "STRATEGY" | "MONITORING";

  const FORWARD: Record<string, string | null> = {
    MAPPING: "VERIFICATION", VERIFICATION: "ALLOCATION", ALLOCATION: "STRATEGY", STRATEGY: "MONITORING", MONITORING: null,
  };
  const forward = FORWARD[state];

  const forwardBlocked =
    (state === "VERIFICATION" && (!g.verificationComplete || !g.suspenseEmpty)) ||
    (state === "ALLOCATION" && !g.allocationPlanApproved);

  const blockers: string[] = [];
  if (state === "VERIFICATION") {
    if (g.unverifiedCount > 0) blockers.push(t("blockUnverified", { count: g.unverifiedCount }));
    if (g.pendingSuspense > 0) blockers.push(t("blockSuspense", { count: g.pendingSuspense }));
  }
  if (state === "ALLOCATION" && !g.allocationPlanApproved) blockers.push(t("blockAllocation"));

  const Btn = ({ to, label, primary }: { to: string; label: string; primary?: boolean }) => (
    <form action={transitionAction} className="inline">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="from" value={state} />
      <input type="hidden" name="to" value={to} />
      <button type="submit" className={primary ? "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" : "rounded-lg border border-neutral-300 px-3 py-2 text-sm"}>{label}</button>
    </form>
  );

  return (
    <div className="mt-2 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{t("footerTitle")}</div>
      {forward ? (
        forwardBlocked ? (
          <div>
            <p className="mb-1 text-sm text-amber-700">{t("blockedTo", { state: tp(forward) })}</p>
            <ul className="text-xs text-neutral-500">{blockers.map((b) => <li key={b}>• {b}</li>)}</ul>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="me-2 text-sm text-neutral-600">{t("readyTo", { state: tp(forward) })}</p>
            <Btn to={forward} label={t("advanceTo", { state: tp(forward) })} primary />
          </div>
        )
      ) : (
        <p className="text-sm text-neutral-600">{t("finalPhase")}</p>
      )}
      {g.legalTargets.filter((x) => x !== forward).length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3">
          <span className="text-xs text-neutral-400">{t("orGoBack")}:</span>
          {g.legalTargets.filter((x) => x !== forward).map((to) => (
            <Btn key={to} to={to} label={tp(to)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
