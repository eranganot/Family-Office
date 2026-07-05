/**
 * Missing-documents report: derives which documents SHOULD exist from the
 * ledger's composition, and compares against uploaded documents.
 */

export interface LedgerItemDoc {
  id: string;
  name: string;
  kind: string;
  accountType?: string | undefined;
  hasSalaryFlow?: boolean | undefined;
}

export interface UploadedDoc {
  docType: string | null;
  uploadedAt: Date;
}

export interface DocExpectation {
  itemId: string;
  itemName: string;
  expectedDocType: string;
  status: "PRESENT" | "STALE" | "MISSING";
  newestUploadAgeDays?: number | undefined;
}

export interface MissingDocsReport {
  expectations: DocExpectation[];
  missingCount: number;
  staleCount: number;
}

/** accountType/kind → expected document type. */
export const EXPECTED_DOC_RULES: Array<{
  matches: (item: LedgerItemDoc) => boolean;
  docType: string;
  maxAgeDays: number;
}> = [
  {
    matches: (i) => i.kind === "ACCOUNT" && ["PENSION_COMPREHENSIVE", "PENSION_GENERAL"].includes(i.accountType ?? ""),
    docType: "PENSION_REPORT",
    maxAgeDays: 460,
  },
  {
    matches: (i) => i.kind === "ACCOUNT" && i.accountType === "KEREN_HISHTALMUT",
    docType: "HISHTALMUT_STATEMENT",
    maxAgeDays: 460,
  },
  {
    matches: (i) => i.kind === "ACCOUNT" && ["KUPAT_GEMEL", "GEMEL_LEHASHKAA", "IRA_GEMEL"].includes(i.accountType ?? ""),
    docType: "GEMEL_STATEMENT",
    maxAgeDays: 460,
  },
  {
    matches: (i) => i.kind === "ACCOUNT" && (i.accountType ?? "").startsWith("BANK"),
    docType: "BANK_STATEMENT",
    maxAgeDays: 200,
  },
  {
    matches: (i) => i.kind === "ACCOUNT" && (i.accountType ?? "").startsWith("BROKERAGE"),
    docType: "BROKERAGE_STATEMENT",
    maxAgeDays: 200,
  },
  { matches: (i) => i.kind === "MORTGAGE", docType: "MORTGAGE_SCHEDULE", maxAgeDays: 460 },
  { matches: (i) => i.kind === "CASH_FLOW" && i.hasSalaryFlow === true, docType: "TAX_106", maxAgeDays: 460 },
];

export function buildMissingDocsReport(
  items: LedgerItemDoc[],
  docs: UploadedDoc[],
  now: Date,
): MissingDocsReport {
  const expectations: DocExpectation[] = [];
  for (const item of items) {
    for (const rule of EXPECTED_DOC_RULES) {
      if (!rule.matches(item)) continue;
      const matching = docs.filter((d) => d.docType === rule.docType);
      if (matching.length === 0) {
        expectations.push({ itemId: item.id, itemName: item.name, expectedDocType: rule.docType, status: "MISSING" });
        continue;
      }
      const newest = matching.reduce((a, b) => (a.uploadedAt > b.uploadedAt ? a : b));
      const ageDays = Math.floor((now.getTime() - newest.uploadedAt.getTime()) / 86_400_000);
      expectations.push({
        itemId: item.id,
        itemName: item.name,
        expectedDocType: rule.docType,
        status: ageDays > rule.maxAgeDays ? "STALE" : "PRESENT",
        newestUploadAgeDays: ageDays,
      });
    }
  }
  return {
    expectations,
    missingCount: expectations.filter((e) => e.status === "MISSING").length,
    staleCount: expectations.filter((e) => e.status === "STALE").length,
  };
}
