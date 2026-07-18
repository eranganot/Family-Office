import { getTranslations } from "next-intl/server";
import { transitionAction } from "../../../../lib/actions/workflow-actions";
import { Card } from "../../../../components/fields";

/** Gate status + the ONLY UI that moves the workflow state machine. */
export async function GatePanel({
  locale,
  state,
  canEnterStrategy,
  blockers,
}: {
  locale: string;
  state: string;
  canEnterStrategy: boolean;
  blockers: string[];
}) {
  const t = await getTranslations("verification");
  const tp = await getTranslations("phase");

  const TransitionButton = ({ to, label, primary }: { to: string; label: string; primary?: boolean }) => (
    <form action={transitionAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="to" value={to} />
      <button
        type="submit"
        className={
          primary
            ? "rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
            : "rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
        }
      >
        {label}
      </button>
    </form>
  );

  return (
    <Card title={t("gate")}>
      <p className="mb-1 text-xs text-neutral-400">
        {tp("label")}: {tp(state)}
      </p>
      {canEnterStrategy ? (
        <p className="mb-2 text-sm font-medium text-green-700">{t("gateOpen")}</p>
      ) : (
        <>
          <p className="mb-1 text-sm text-red-700">{t("gateBlocked")}</p>
          <ul className="mb-2 text-xs text-neutral-500">
            {blockers.map((b) => {
              const [code, count] = b.split(":");
              return (
                <li key={b}>
                  • {t(`blockers.${code}`)}{count ? `: ${count}` : ""}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {state === "MAPPING" ? (
          <TransitionButton to="VERIFICATION" label={t("advance", { state: tp("VERIFICATION") })} primary />
        ) : null}
        {state === "VERIFICATION" ? (
          <>
            <TransitionButton to="ALLOCATION" label={t("advance", { state: tp("ALLOCATION") })} primary={canEnterStrategy} />
            <TransitionButton to="MAPPING" label={t("backTo", { state: tp("MAPPING") })} />
          </>
        ) : null}
        {state === "ALLOCATION" ? (
          <>
            <TransitionButton to="STRATEGY" label={t("advance", { state: tp("STRATEGY") })} primary />
            <TransitionButton to="VERIFICATION" label={t("backTo", { state: tp("VERIFICATION") })} />
          </>
        ) : null}
        {state === "STRATEGY" ? (
          <>
            <TransitionButton to="MONITORING" label={t("advance", { state: tp("MONITORING") })} primary />
            <TransitionButton to="ALLOCATION" label={t("backTo", { state: tp("ALLOCATION") })} />
          </>
        ) : null}
        {state === "MONITORING" ? (
          <>
            <TransitionButton to="STRATEGY" label={t("advance", { state: tp("STRATEGY") })} primary />
            <TransitionButton to="ALLOCATION" label={t("backTo", { state: tp("ALLOCATION") })} />
            <TransitionButton to="VERIFICATION" label={t("backTo", { state: tp("VERIFICATION") })} />
          </>
        ) : null}
      </div>
    </Card>
  );
}
