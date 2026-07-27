/**
 * PDF → text matrix → lines. Uses pdfjs text items with their transform matrices:
 * items sharing a y coordinate (within tolerance) form a line, sorted by x.
 */
export interface TextLine {
  page: number;
  y: number;
  text: string;
}

export async function extractPdfLines(bytes: Uint8Array): Promise<TextLine[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const lines: TextLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const positioned = content.items
      .flatMap((entry) => {
        if (!("str" in entry)) return [];
        const item = entry as { str: string; transform: number[] };
        if (item.str.trim() === "") return [];
        return [{ text: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 }];
      });
    // group by y with tolerance
    const groups = new Map<number, { x: number; text: string }[]>();
    for (const item of positioned) {
      const key = [...groups.keys()].find((y) => Math.abs(y - item.y) <= 2) ?? item.y;
      const group = groups.get(key) ?? [];
      group.push({ x: item.x, text: item.text });
      groups.set(key, group);
    }
    for (const [y, group] of groups) {
      const text = group.sort((a, b) => a.x - b.x).map((g) => g.text).join(" ").replace(/\s+/g, " ").trim();
      lines.push({ page: p, y, text });
    }
  }
  return lines.sort((a, b) => a.page - b.page || b.y - a.y);
}

/** A positioned text item; x is needed to reconstruct COLUMNS, not just lines. */
export interface TextCell {
  x: number;
  text: string;
}

export interface CellLine {
  page: number;
  y: number;
  cells: TextCell[];
}

/**
 * Like `extractPdfLines`, but KEEPS the x coordinate of every item.
 *
 * Bank statements are tables: date | ref | balance | debit | credit | description.
 * Flattening them to a string throws away the only signal that says which number is a
 * balance and which is a movement — and guessing "the first amount" silently imports
 * running balances as expenses. Columns must be reconstructed from x positions.
 */
export async function extractPdfCellLines(bytes: Uint8Array): Promise<CellLine[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const out: CellLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const positioned = content.items.flatMap((entry) => {
      if (!("str" in entry)) return [];
      const item = entry as { str: string; transform: number[] };
      if (item.str.trim() === "") return [];
      return [{ text: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 }];
    });
    const groups = new Map<number, TextCell[]>();
    for (const item of positioned) {
      const key = [...groups.keys()].find((y) => Math.abs(y - item.y) <= 2) ?? item.y;
      const group = groups.get(key) ?? [];
      group.push({ x: item.x, text: item.text });
      groups.set(key, group);
    }
    for (const [y, cells] of groups) {
      out.push({ page: p, y, cells: cells.sort((a, b) => a.x - b.x) });
    }
  }
  return out.sort((a, b) => a.page - b.page || b.y - a.y);
}
