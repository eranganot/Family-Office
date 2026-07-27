import { cleanHebrew, repairHebrewWords } from "@wealthos/domain";
import type { CellLine } from "./pdf/extract";
import { IL_STATEMENT_LEXICON } from "./tabular";
import { parseIsraeliDate, parseLocalizedDecimal } from "./normalize";
import { normaliseMinus } from "./statement-mapping";

/**
 * Column-aware parser for BANK statement PDFs.
 *
 * Why this exists separately from the card parser: a bank line is a table row —
 * `date | ref | balance | debit | credit | description` — and the numbers are only
 * distinguishable by their COLUMN. A line-token heuristic ("take the first amount")
 * cannot tell a running balance from a movement, and gets it wrong in the worst
 * possible way: balances import as expenses and real credits are discarded.
 *
 * The header row is located by its Hebrew labels (after RTL repair), each label's x
 * position defines a column centre, and every data cell is assigned to the nearest
 * column. No guessing about which number means what.
 */

export interface BankRow {
  bookedAt: string;
  descriptionRaw: string;
  /** Signed: debit negative, credit positive. */
  amount: string;
  balance?: string | undefined;
  reference?: string | undefined;
  page: number;
}

export interface BankTableResult {
  rows: BankRow[];
  unparsed: string[];
  /** False when the header could not be identified — caller MUST NOT fall back to guessing. */
  columnsFound: boolean;
  detectedColumns: string[];
}

type ColumnKey = "date" | "valueDate" | "reference" | "sopf" | "balance" | "debit" | "credit" | "description";

/** Header synonyms, in logical order. Matched after per-word RTL repair. */
const HEADER_LABELS: Array<{ key: ColumnKey; labels: string[] }> = [
  { key: "date", labels: ["תאריך"] },
  { key: "valueDate", labels: ["תאריך ערך", "ערך"] },
  { key: "reference", labels: ["אסמכתא"] },
  { key: "sopf", labels: ['סופ"פ', "סופפ"] },
  { key: "balance", labels: ["יתרה"] },
  { key: "debit", labels: ["חובה", "חיוב"] },
  { key: "credit", labels: ["זכות", "זיכוי"] },
  { key: "description", labels: ["תיאור", "פירוט"] },
];

interface Column {
  key: ColumnKey;
  x: number;
}

function repair(text: string): string {
  return repairHebrewWords(cleanHebrew(text), IL_STATEMENT_LEXICON);
}

/** Find the header row and the x centre of each recognised column. */
export function detectColumns(lines: CellLine[]): Column[] {
  let best: Column[] = [];
  for (const line of lines.slice(0, 40)) {
    const found: Column[] = [];
    for (const cell of line.cells) {
      const text = repair(cell.text);
      for (const { key, labels } of HEADER_LABELS) {
        if (found.some((f) => f.key === key)) continue;
        if (labels.some((l) => text === l || text.includes(l))) {
          found.push({ key, x: cell.x });
          break;
        }
      }
    }
    // A real header carries a date column, a description column and at least one
    // money column. Anything less is a title line that happens to contain a word.
    const hasMoney = found.some((f) => f.key === "debit" || f.key === "credit" || f.key === "balance");
    if (found.some((f) => f.key === "date") && found.some((f) => f.key === "description") && hasMoney) {
      if (found.length > best.length) best = found;
    }
  }
  return best;
}

function nearest(columns: Column[], x: number): ColumnKey | undefined {
  let bestKey: ColumnKey | undefined;
  let bestDist = Infinity;
  for (const c of columns) {
    const d = Math.abs(c.x - x);
    if (d < bestDist) {
      bestDist = d;
      bestKey = c.key;
    }
  }
  // Beyond this the cell belongs to no column we know about.
  return bestDist <= 60 ? bestKey : undefined;
}

export function parseBankTable(lines: CellLine[]): BankTableResult {
  const columns = detectColumns(lines);
  if (columns.length === 0) {
    return { rows: [], unparsed: [], columnsFound: false, detectedColumns: [] };
  }

  const rows: BankRow[] = [];
  const unparsed: string[] = [];

  for (const line of lines) {
    const bucket: Partial<Record<ColumnKey, string[]>> = {};
    for (const cell of line.cells) {
      const key = nearest(columns, cell.x);
      if (!key) continue;
      (bucket[key] ??= []).push(cell.text);
    }

    const rawDate = (bucket.date ?? []).join(" ").trim();
    const bookedAt = parseIsraeliDate(cleanHebrew(rawDate));
    if (!bookedAt) continue; // header, title and total lines land here

    const debit = parseLocalizedDecimal(normaliseMinus((bucket.debit ?? []).join("")));
    const credit = parseLocalizedDecimal(normaliseMinus((bucket.credit ?? []).join("")));
    const balance = parseLocalizedDecimal(normaliseMinus((bucket.balance ?? []).join("")));

    let amount: string | undefined;
    if (debit && Number(debit) !== 0) amount = String(-Math.abs(Number(debit)));
    else if (credit && Number(credit) !== 0) amount = String(Math.abs(Number(credit)));

    if (!amount) {
      unparsed.push(`${bookedAt} ${repair((bucket.description ?? []).join(" "))}`.slice(0, 160));
      continue;
    }

    rows.push({
      bookedAt,
      descriptionRaw: repair((bucket.description ?? []).join(" ")) || "(ללא תיאור)",
      amount,
      balance: balance ?? undefined,
      reference: (bucket.reference ?? []).join("").trim() || undefined,
      page: line.page,
    });
  }

  return {
    rows,
    unparsed,
    columnsFound: true,
    detectedColumns: columns.map((c) => c.key),
  };
}
