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
  /** Which uploaded docType actually satisfied this row — a MISLAKA answering a
   *  PENSION_REPORT expectation should say so, or the row looks wrong to the owner. */
  satisfiedByDocType?: string | undefined;
}

export interface MissingDocsReport {
  expectations: DocExpectation[];
  missingCount: number;
  staleCount: number;
}

/**
 * accountType/kind → expected document type.
 *
 * `docType` is what the row ASKS FOR (the clearest single instruction). `alsoAccepts`
 * lists other document types that genuinely satisfy the same expectation.
 *
 * ⚠️ **MISLAKA is why this list is not a single string.** The Israeli pension
 * clearinghouse (מסלקה פנסיונית) returns ONE report covering every pension, gemel and
 * hishtalmut product a person holds. It is a valid, selectable `docType` — and until
 * 2026-08-02 no rule accepted it, so an owner who uploaded the one document that
 * actually answers the question watched thirteen rows stay red forever. The document was
 * there; the checklist could not see it.
 *
 * That is the failure this module keeps repeating in different costumes: a check that is
 * individually defensible and, against the real world, unsatisfiable. Before adding an
 * expectation here, ask what document a person would actually be handed for it.
 */
export const EXPECTED_DOC_RULES: Array<{
  matches: (item: LedgerItemDoc) => boolean;
  docType: string;
  alsoAccepts?: string[];
  maxAgeDays: number;
}> = [
  {
    matches: (i) => i.kind === "ACCOUNT" && ["PENSION_COMPREHENSIVE", "PENSION_GENERAL"].includes(i.accountType ?? ""),
    docType: "PENSION_REPORT",
    alsoAccepts: ["MISLAKA"],
    maxAgeDays: 460,
  },
  {
    matches: (i) => i.kind === "ACCOUNT" && i.accountType === "KEREN_HISHTALMUT",
    docType: "HISHTALMUT_STATEMENT",
    alsoAccepts: ["MISLAKA"],
    maxAgeDays: 460,
  },
  {
    matches: (i) => i.kind === "ACCOUNT" && ["KUPAT_GEMEL", "GEMEL_LEHASHKAA", "IRA_GEMEL"].includes(i.accountType ?? ""),
    docType: "GEMEL_STATEMENT",
    alsoAccepts: ["MISLAKA"],
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

/**
 * ⚠️ KNOWN AND DELIBERATE: matching is by docTYPE across the whole household, not by
 * document-to-item attribution. One uploaded BANK_STATEMENT therefore marks EVERY bank
 * account present, including accounts at institutions that statement says nothing about.
 *
 * The link needed to fix this already exists — `Valuation` carries both `documentId` and
 * `ledgerItemId` — so a per-item version is buildable. It was NOT done in the same pass
 * as the MISLAKA fix on purpose: per-item attribution turns a large number of currently
 * green rows red at once (a statement imported for transactions often has no Valuation
 * at all), and shipping a mass-reddening alongside a mass-greening would make both
 * unreviewable. Ship it as its own QA-able increment, against real data.
 *
 * Until then, read a PRESENT here as "the household holds a document of this type",
 * NOT as "this item is evidenced".
 */
export function buildMissingDocsReport(
  items: LedgerItemDoc[],
  docs: UploadedDoc[],
  now: Date,
): MissingDocsReport {
  const expectations: DocExpectation[] = [];
  for (const item of items) {
    for (const rule of EXPECTED_DOC_RULES) {
      if (!rule.matches(item)) continue;
      const accepted = [rule.docType, ...(rule.alsoAccepts ?? [])];
      const matching = docs.filter((d) => d.docType !== null && accepted.includes(d.docType));
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
        satisfiedByDocType: newest.docType ?? undefined,
      });
    }
  }
  return {
    expectations,
    missingCount: expectations.filter((e) => e.status === "MISSING").length,
    staleCount: expectations.filter((e) => e.status === "STALE").length,
  };
}
