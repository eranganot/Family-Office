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
  /**
   * Ledger items this document is actually linked to, via any of the three paths the
   * schema provides: a Valuation it produced, an ImportedField it populated, or a
   * Transaction booked from it. Omit (or leave empty) when the caller cannot determine
   * attribution — the report then reads the document as unattributed rather than
   * inventing a link.
   */
  linkedItemIds?: string[] | undefined;
}

/**
 * Document types that legitimately cover a PERSON or the whole household rather than one
 * ledger item, and therefore satisfy an expectation without any per-item link.
 *
 * A Mislaka pull covers every retirement product a person holds; a form 106 covers a
 * person's employment. Demanding that either be attributed to a specific account would
 * recreate, in a subtler form, exactly the bug that made MISLAKA unsatisfiable.
 *
 * Everything else is ITEM-scoped: a bank statement is a statement OF an account, and one
 * of them says nothing about a different account at a different institution.
 */
const HOUSEHOLD_SCOPED_DOC_TYPES = new Set(["MISLAKA", "TAX_106"]);

export interface DocExpectation {
  itemId: string;
  itemName: string;
  expectedDocType: string;
  /**
   * UNATTRIBUTED is the state this report was missing, and its absence was a defect.
   *
   * Matching used to be by TYPE across the whole household, so one bank statement marked
   * EVERY bank account present — including institutions it says nothing about. The naive
   * fix, requiring a per-item link, would have flipped those rows to MISSING and claimed
   * a document the household demonstrably holds does not exist. Both are false, in
   * opposite directions.
   *
   * So a document of the right type that is not linked to THIS item reads as neither. It
   * is the honest description of the position: the evidence exists, and nothing connects
   * it to this account. That is a fixable, nameable state, and the owner can act on it.
   */
  status: "PRESENT" | "STALE" | "MISSING" | "UNATTRIBUTED";
  newestUploadAgeDays?: number | undefined;
  /** Which uploaded docType actually satisfied this row — a MISLAKA answering a
   *  PENSION_REPORT expectation should say so, or the row looks wrong to the owner. */
  satisfiedByDocType?: string | undefined;
}

export interface MissingDocsReport {
  expectations: DocExpectation[];
  missingCount: number;
  staleCount: number;
  /** Rows where a document of the right type exists but is not linked to the item. */
  unattributedCount: number;
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
 * A document satisfies an item when it is of an accepted type AND either
 *  - it is HOUSEHOLD-scoped (a Mislaka, a 106 — it covers the person, not the account), or
 *  - it is linked to this specific item.
 *
 * `linkedItemIds` undefined means the caller could not determine attribution at all. In
 * that case attribution is not asserted either way, and the document is treated as
 * unattributed rather than as covering everything — the failure mode that made one bank
 * statement green every bank account.
 */
function satisfies(doc: UploadedDoc, accepted: string[], itemId: string): boolean {
  if (doc.docType === null || !accepted.includes(doc.docType)) return false;
  if (HOUSEHOLD_SCOPED_DOC_TYPES.has(doc.docType)) return true;
  return (doc.linkedItemIds ?? []).includes(itemId);
}

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

      const attributed = docs.filter((d) => satisfies(d, accepted, item.id));
      if (attributed.length > 0) {
        const newest = attributed.reduce((a, b) => (a.uploadedAt > b.uploadedAt ? a : b));
        const ageDays = Math.floor((now.getTime() - newest.uploadedAt.getTime()) / 86_400_000);
        expectations.push({
          itemId: item.id,
          itemName: item.name,
          expectedDocType: rule.docType,
          status: ageDays > rule.maxAgeDays ? "STALE" : "PRESENT",
          newestUploadAgeDays: ageDays,
          satisfiedByDocType: newest.docType ?? undefined,
        });
        continue;
      }

      // Right type, wrong item (or no link recorded). NOT missing — the household holds
      // it — and NOT present, because nothing ties it to this account.
      const ofType = docs.filter((d) => d.docType !== null && accepted.includes(d.docType));
      if (ofType.length > 0) {
        const newest = ofType.reduce((a, b) => (a.uploadedAt > b.uploadedAt ? a : b));
        expectations.push({
          itemId: item.id,
          itemName: item.name,
          expectedDocType: rule.docType,
          status: "UNATTRIBUTED",
          newestUploadAgeDays: Math.floor((now.getTime() - newest.uploadedAt.getTime()) / 86_400_000),
          satisfiedByDocType: newest.docType ?? undefined,
        });
        continue;
      }

      expectations.push({ itemId: item.id, itemName: item.name, expectedDocType: rule.docType, status: "MISSING" });
    }
  }
  return {
    expectations,
    missingCount: expectations.filter((e) => e.status === "MISSING").length,
    staleCount: expectations.filter((e) => e.status === "STALE").length,
    unattributedCount: expectations.filter((e) => e.status === "UNATTRIBUTED").length,
  };
}
