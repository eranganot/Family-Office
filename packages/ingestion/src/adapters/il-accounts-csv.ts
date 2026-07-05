import type { RawDataPayload, RawField, RawItem } from "@wealthos/domain";
import Papa from "papaparse";
import type { DocumentMeta, IngestionAdapter } from "../adapter";
import { cleanHebrew, parseIsraeliDate, parseLocalizedDecimal } from "../normalize";

/**
 * Generic Israeli account-summary CSV adapter (v1): one row = one account/product.
 * Covers hishtalmut/gemel/pension statements, bank account summaries, and
 * Mislaka-style product exports via Hebrew header synonyms.
 * Transaction-level statements are NOT in scope here (later milestone).
 */

const HEADER_SYNONYMS: Record<string, string[]> = {
  name: ["שם קופה", "שם מוצר", "שם חשבון", "שם התכנית", "תיאור"],
  externalRef: ["מספר חשבון", "מספר קופה", "מספר פוליסה", "מספר עמית"],
  accountType: ["סוג מוצר", "סוג קופה", "סוג חשבון", "סוג תכנית"],
  institutionName: ["חברה מנהלת", "גוף מנהל", "בנק", "חברת ביטוח"],
  balance: ["יתרה", "יתרת צבירה", "סך צבירה", "שווי צבירה"],
  balanceAsOf: ["נכון לתאריך", "תאריך ערך", "תאריך נכונות", "תאריך"],
  managementFeePct: ["דמי ניהול מצבירה", "דמי ניהול (צבירה)"],
  depositFeePct: ["דמי ניהול מהפקדה", "דמי ניהול (הפקדה)"],
  trackName: ["מסלול", "מסלול השקעה"],
  currency: ["מטבע"],
};

import { ISRAELI_PRODUCT_TYPE_MAP as ACCOUNT_TYPE_MAP } from "../il-product-types";

function buildHeaderIndex(headers: string[]): Map<string, string> {
  const index = new Map<string, string>(); // canonical path -> actual header
  for (const [path, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    for (const header of headers) {
      if (synonyms.includes(cleanHebrew(header))) {
        index.set(path, header);
        break;
      }
    }
  }
  return index;
}

export const ilAccountsCsvAdapter: IngestionAdapter = {
  id: "il-accounts-csv",
  version: "1.0.0",

  accepts(meta: DocumentMeta): boolean {
    return meta.mimeType === "text/csv" || meta.filename.toLowerCase().endsWith(".csv");
  },

  async parse(bytes: Uint8Array, meta: DocumentMeta): Promise<RawDataPayload> {
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    const warnings: string[] = parsed.errors.slice(0, 5).map((e) => `CSV_ROW_${e.row}: ${e.code}`);
    const headers = parsed.meta.fields ?? [];
    const index = buildHeaderIndex(headers);
    if (!index.has("name")) warnings.push("NO_NAME_COLUMN_RECOGNIZED");

    const items: RawItem[] = [];
    for (const row of parsed.data) {
      const fields: RawField[] = [];
      const get = (path: string): string | undefined => {
        const header = index.get(path);
        const v = header ? row[header]?.trim() : undefined;
        return v === "" ? undefined : v;
      };

      const push = (path: string, raw: string | undefined, normalized?: string | undefined, confidence = 80) => {
        if (raw === undefined) return;
        fields.push({
          path,
          rawValue: raw,
          ...(normalized !== undefined ? { normalizedValue: normalized } : {}),
          confidence,
        });
      };

      const rawType = get("accountType");
      push("accountType", rawType, rawType ? ACCOUNT_TYPE_MAP[cleanHebrew(rawType)] : undefined, 85);
      push("institutionName", get("institutionName"), get("institutionName"), 90);

      const rawBalance = get("balance");
      if (rawBalance !== undefined) {
        const normalized = parseLocalizedDecimal(rawBalance);
        const currency = get("currency");
        fields.push({
          path: "balance",
          rawValue: rawBalance,
          ...(normalized !== undefined ? { normalizedValue: normalized } : {}),
          ...(currency && /^[A-Z]{3}$/.test(currency) ? { originalCurrency: currency } : { originalCurrency: "ILS" }),
          confidence: normalized !== undefined ? 85 : 20,
        });
      }
      push("balanceAsOf", get("balanceAsOf"), get("balanceAsOf") ? parseIsraeliDate(get("balanceAsOf")!) : undefined, 85);

      const fee = (raw: string | undefined) =>
        raw === undefined ? undefined : parseLocalizedDecimal(raw.replace(/%/g, ""));
      push("managementFeePct", get("managementFeePct"), fee(get("managementFeePct")), 80);
      push("depositFeePct", get("depositFeePct"), fee(get("depositFeePct")), 80);
      push("trackName", get("trackName"), get("trackName") ? cleanHebrew(get("trackName")!) : undefined, 80);

      if (fields.length === 0) continue; // blank-ish row

      items.push({
        suggestedKind: "ACCOUNT",
        ...(get("name") ? { suggestedName: cleanHebrew(get("name")!) } : {}),
        ...(get("externalRef") ? { externalRef: get("externalRef")! } : {}),
        fields,
      });
    }

    return {
      schemaVersion: 1,
      adapterId: this.id,
      adapterVersion: this.version,
      documentSha256: meta.sha256,
      extractedAt: new Date().toISOString(),
      items,
      warnings,
    };
  },
};
