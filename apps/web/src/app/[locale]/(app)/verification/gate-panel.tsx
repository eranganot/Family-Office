import { getTranslations } from "next-intl/server";
import { Card } from "../../../../components/fields";

/** Gate status display. Transition controls arrive with feat/m3-phase-gate. */
export async function GatePanel({
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
  return (
    <Card title={t("gate")}>
      <p className="mb-1 text-xs text-neutral-400">
        {tp("label")}: {tp(state)}
      </p>
      {canEnterStrategy ? (
        <p className="text-sm font-medium text-green-700">{t("gateOpen")}</p>
      ) : (
        <>
          <p className="mb-1 text-sm text-red-700">{t("gateBlocked")}</p>
          <ul className="text-xs text-neutral-500">
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
    </Card>
  );
}
