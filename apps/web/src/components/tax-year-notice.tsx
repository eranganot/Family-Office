import { getTranslations } from "next-intl/server";
import { serverCaller } from "../lib/trpc-server";

/**
 * WO-1: shown on the pages whose numbers use tax rules (allocation, strategy,
 * scenarios) when the calendar year has no seeded rules and the registry falls
 * back to the latest earlier year. Renders nothing otherwise.
 */
export async function TaxYearNotice() {
  const trpc = await serverCaller();
  const status = await trpc.registry.taxYearStatus();
  if (!status.fallback || status.effectiveYear === null) return null;
  const t = await getTranslations("registry");
  return (
    <p role="status" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
      {t("taxYearFallback", { current: status.currentYear, effective: status.effectiveYear })}
    </p>
  );
}
