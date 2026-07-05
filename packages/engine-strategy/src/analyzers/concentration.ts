import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";
import { isAssetKind, sum, valued } from "./pools";

export function analyzeConcentration(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  const findings: Finding[] = [];
  const singleMax = Number(ctx.assumptions["concentration_single_asset_max_pct"] ?? 30);
  const institutionMax = Number(ctx.assumptions["concentration_institution_max_pct"] ?? 50);

  const assets = valued(snapshot.items).filter(isAssetKind);
  const total = sum(assets);
  if (total <= 0) return findings;

  for (const item of assets) {
    const sharePct = ((item.valueBase ?? 0) / total) * 100;
    // A primary residence is expectedly dominant; flag only non-real-estate concentration.
    if (item.kind !== "REAL_ESTATE" && sharePct > singleMax) {
      findings.push({
        code: "CONCENTRATION_SINGLE_ASSET",
        severity: "WARNING",
        metrics: { itemName: item.name, sharePct: Math.round(sharePct), thresholdPct: singleMax },
        evidenceItemIds: [item.id],
      });
    }
  }

  const byInstitution = new Map<string, { total: number; ids: string[] }>();
  for (const item of assets) {
    if (!item.institutionName) continue;
    const e = byInstitution.get(item.institutionName) ?? { total: 0, ids: [] };
    e.total += item.valueBase ?? 0;
    e.ids.push(item.id);
    byInstitution.set(item.institutionName, e);
  }
  for (const [name, e] of byInstitution) {
    const sharePct = (e.total / total) * 100;
    if (sharePct > institutionMax) {
      findings.push({
        code: "CONCENTRATION_INSTITUTION",
        severity: "NOTICE",
        metrics: { institution: name, sharePct: Math.round(sharePct), thresholdPct: institutionMax },
        evidenceItemIds: e.ids,
      });
    }
  }
  return findings;
}
