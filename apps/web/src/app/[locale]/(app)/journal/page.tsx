import { formatDate, type Locale } from "@wealthos/i18n";
import { getTranslations } from "next-intl/server";
import { recordOutcomeAction } from "../../../../lib/actions/journal-actions";
import { Card, SubmitButton, TextInput } from "../../../../components/fields";
import { serverCaller } from "../../../../lib/trpc-server";

export default async function JournalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("journal");
  const trpc = await serverCaller();
  const household = await trpc.household.get();
  if (!household) return null;
  const entries = await trpc.journal.list();
  const l = locale as Locale;

  return (
    <div className="flex flex-col gap-6">
      <Card title={t("title")}>
        <p className="text-xs text-neutral-500">{t("hint")}</p>
      </Card>
      {entries.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-500">{t("empty")}</p>
        </Card>
      ) : (
        entries.map((e) => {
          const title = locale === "he" && e.recommendation.titleHe ? e.recommendation.titleHe : e.recommendation.title;
          return (
            <Card key={e.id}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{title}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${e.decision === "ACCEPTED" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                >
                  {t(`decision.${e.decision}`)} · {formatDate(e.decidedAt, l)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-neutral-400">{t("decidedBy")}</div>
                  <p>{e.decidedBy}</p>
                </div>
                {e.implementationDate ? (
                  <div>
                    <div className="text-xs text-neutral-400">{t("implementation")}</div>
                    <p>{formatDate(e.implementationDate, l)}</p>
                  </div>
                ) : null}
                {e.expectedOutcome ? (
                  <div>
                    <div className="text-xs text-neutral-400">{t("expected")}</div>
                    <p>{e.expectedOutcome}</p>
                  </div>
                ) : null}
                {e.notes ? (
                  <div>
                    <div className="text-xs text-neutral-400">{t("note")}</div>
                    <p>{e.notes}</p>
                  </div>
                ) : null}
              </div>
              <div className="mt-3">
                <div className="text-xs text-neutral-400">{t("actual")}</div>
                {e.actualOutcome ? (
                  <p className="text-sm text-neutral-700">{e.actualOutcome}</p>
                ) : (
                  <form action={recordOutcomeAction} className="mt-1 flex items-end gap-2">
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="entryId" value={e.id} />
                    <TextInput name="actualOutcome" placeholder={t("recordActual")} required />
                    <SubmitButton label={t("save")} />
                  </form>
                )}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
