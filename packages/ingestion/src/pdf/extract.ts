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
  const doc = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const lines: TextLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const positioned = content.items
      .filter((i): i is { str: string; transform: number[] } => "str" in i && i.str.trim() !== "")
      .map((i) => ({ text: i.str, x: i.transform[4] ?? 0, y: i.transform[5] ?? 0 }));
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
