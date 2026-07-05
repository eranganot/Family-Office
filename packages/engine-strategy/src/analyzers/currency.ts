import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";
import { isAssetKind, sum, valued } from "./pools";

export function analyzeCurrency(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  const findings: Finding[] = [];
  const minForeign = Number(ctx.assumptions["currency_foreign_min_pct"] ?? 10);
  const maxForeign = Number(ctx.assumptions["currency_foreign_max_pct"] ?? 50);

  const assets = valued(snapshot.items).filter(isAssetKind);
  const total = sum(assets);
  if (total <= 0) return findings;

  const foreign = assets.filter((i) => i.currency !== snapshot.baseCurrency);
  const foreignPct = (sum(foreign) / total) * 100;

  if (foreignPct < minForeign) {
    findings.push({
      code: "CURRENCY_HOME_BIAS",
      severity: "NOTICE",
      metrics: { foreignPct: Math.round(foreignPct), minPct: minForeign, baseCurrency: snapshot.baseCurrency },
      evidenceItemIds: assets.filter((i) => i.currency === snapshot.baseCurrency).map((i) => i.id),
    });
  } else if (foreignPct > maxForeign) {
    findings.push({
      code: "CURRENCY_FOREIGN_EXCESS",
      severity: "NOTICE",
      metrics: { foreignPct: Math.round(foreignPct), maxPct: maxForeign },
      evidenceItemIds: foreign.map((i) => i.id),
    });
  }
  return findings;
}
