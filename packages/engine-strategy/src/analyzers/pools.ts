import type { SnapshotItem } from "@wealthos/domain";

/** Shared classification (mirrors the goal engine's documented pool policy). */
const RETIREMENT_TYPES = new Set(["PENSION_COMPREHENSIVE", "PENSION_GENERAL", "KUPAT_GEMEL", "IRA_GEMEL", "FOREIGN_RETIREMENT"]);
const CASH_TYPES = new Set(["BANK_CHECKING", "BANK_SAVINGS", "BANK_DEPOSIT", "CASH_OTHER"]);

export const isAssetKind = (i: SnapshotItem) => ["ACCOUNT", "REAL_ESTATE", "OTHER_ASSET"].includes(i.kind);
export const isLiabilityKind = (i: SnapshotItem) => ["MORTGAGE", "LOAN", "OTHER_LIABILITY"].includes(i.kind);
export const isRetirement = (i: SnapshotItem) => i.kind === "ACCOUNT" && RETIREMENT_TYPES.has(i.accountType ?? "");
export const isCash = (i: SnapshotItem) => i.kind === "ACCOUNT" && CASH_TYPES.has(i.accountType ?? "");
export const isLiquid = (i: SnapshotItem) =>
  (i.kind === "ACCOUNT" && !isRetirement(i)) || i.kind === "OTHER_ASSET";

export const valued = (items: SnapshotItem[]) => items.filter((i) => i.valueBase !== null);
export const sum = (items: SnapshotItem[]) => items.reduce((s, i) => s + (i.valueBase ?? 0), 0);
