import type { RawDataPayload, RawField } from "@wealthos/domain";
import type { DocumentMeta, IngestionAdapter } from "../adapter";
import { ISRAELI_PRODUCT_TYPE_MAP } from "../il-product-types";
import { cleanHebrew, fixVisualOrderLine, parseIsraeliDate, parseLocalizedDecimal } from "../normalize";
import { extractPdfLines } from "../pdf/extract";

/**
 * Israeli annual pension/savings report PDF adapter (v1, fixture-grade).
 * Pipeline: text matrix → per-line visual-order repair → "label: value" mapping.
 * One report = one account item. Anything unrecognized simply isn't emitted as a
 * field — the factory routes incomplete items to suspense.
 */

const LABEL_TO_PATH: Record<string, string> = {
  "מספר עמית": "externalRef",
  "מספר חשבון": "externalRef",
  "מספר פוליסה": "externalRef",
  "סוג מוצר": "accountType",
  "סוג קופה": "accountType",
  "יתרת צבירה": "balance",
  "סך צבירה": "balance",
  "נכון לתאריך": "balanceAsOf",
  "דמי ניהול מצבירה": "managementFeePct",
  "דמי ניהול מהפקדה": "depositFeePct",
  "מסלול השקעה": "trackName",
  "שם עמית": "memberName",
};

export const ilPensionPdfAdapter: IngestionAdapter = {
  id: "il-pension-pdf",
  version: "1.0.0",

  accepts(meta: DocumentMeta): boolean {
    const isPdf = meta.mimeType === "application/pdf" || meta.filename.toLowerCase().endsWith(".pdf");
    if (!isPdf) return false;
    return meta.docType === undefined || ["PENSION_REPORT", "HISHTALMUT_STATEMENT", "GEMEL_STATEMENT", "MISLAKA", "OTHER"].includes(meta.docType);
  },

  async parse(bytes: Uint8Array, meta: DocumentMeta): Promise<RawDataPayload> {
    const warnings: string[] = [];
    const rawLines = await extractPdfLines(bytes);
    const lines = rawLines.map((l) => cleanHebrew(fixVisualOrderLine(l.text)));

    const fields: RawField[] = [];
    let externalRef: string | undefined;
    let productLabel: string | undefined;
    let institutionFromDoc: string | undefined;

    // Header heuristic: "<institution> - <product>" line near the top.
    for (const line of lines.slice(0, 4)) {
      const m = /^(.+?)\s*[-–]\s*(.+)$/.exec(line);
      if (m && ISRAELI_PRODUCT_TYPE_MAP[cleanHebrew(m[2]!)] ) {
        institutionFromDoc = cleanHebrew(m[1]!);
        productLabel = cleanHebrew(m[2]!);
        break;
      }
    }

    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const label = cleanHebrew(line.slice(0, idx));
      const value = line.slice(idx + 1).trim();
      const path = LABEL_TO_PATH[label];
      if (!path || value === "") continue;

      if (path === "externalRef") { externalRef = value; continue; }
      if (path === "memberName") continue; // PII hint only; ownership is human-confirmed at import

      let normalized: string | undefined;
      let confidence = 75;
      if (path === "balance") {
        normalized = parseLocalizedDecimal(value.replace(/שח|ש"ח|₪/g, ""));
        confidence = normalized !== undefined ? 85 : 20;
      } else if (path === "balanceAsOf") {
        normalized = parseIsraeliDate(value);
      } else if (path === "managementFeePct" || path === "depositFeePct") {
        normalized = parseLocalizedDecimal(value.replace(/%/g, ""));
      } else if (path === "accountType") {
        normalized = ISRAELI_PRODUCT_TYPE_MAP[cleanHebrew(value)];
      } else {
        normalized = cleanHebrew(value);
      }

      fields.push({
        path,
        rawValue: value,
        ...(normalized !== undefined ? { normalizedValue: normalized } : {}),
        ...(path === "balance" ? { originalCurrency: "ILS" } : {}),
        confidence,
      });
    }

    // accountType fallback from the header product label
    if (!fields.some((f) => f.path === "accountType") && productLabel) {
      const mapped = ISRAELI_PRODUCT_TYPE_MAP[productLabel];
      fields.push({ path: "accountType", rawValue: productLabel, ...(mapped ? { normalizedValue: mapped } : {}), confidence: 70 });
    }
    const institutionName = meta.institutionName ?? institutionFromDoc;
    if (institutionName && !fields.some((f) => f.path === "institutionName")) {
      fields.push({ path: "institutionName", rawValue: institutionName, normalizedValue: institutionName, confidence: meta.institutionName ? 95 : 75 });
    }
    if (fields.length === 0) warnings.push("NO_RECOGNIZED_FIELDS");

    return {
      schemaVersion: 1,
      adapterId: this.id,
      adapterVersion: this.version,
      documentSha256: meta.sha256,
      extractedAt: new Date().toISOString(),
      items:
        fields.length === 0
          ? []
          : [{
              suggestedKind: "ACCOUNT" as const,
              suggestedName: productLabel && institutionName ? `${productLabel} — ${institutionName}` : (productLabel ?? meta.filename),
              ...(externalRef ? { externalRef } : {}),
              fields,
            }],
      warnings,
    };
  },
};
