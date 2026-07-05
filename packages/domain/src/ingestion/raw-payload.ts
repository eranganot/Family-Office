import { z } from "zod";

/**
 * RawDataPayload v1 — the ONLY thing adapters may emit. Strict, versioned.
 * Adapters extract and normalize; they never touch the ledger. The domain
 * LedgerFactory converts payloads into canonical items or suspense entries.
 */
export const RawFieldSchema = z.object({
  /** Canonical target hint, e.g. "balance", "accountType", "managementFeePct". */
  path: z.string().min(1),
  /** Verbatim as extracted from the source — preserved for provenance forever. */
  rawValue: z.string(),
  /** Adapter-normalized value: decimal strings for numbers, ISO for dates. */
  normalizedValue: z.string().optional(),
  originalCurrency: z.string().length(3).optional(),
  confidence: z.number().int().min(0).max(100),
});

export const RawItemSchema = z.object({
  /** External reference (account number, policy number) when present. */
  externalRef: z.string().optional(),
  /** The adapter's mapping hint. The factory decides; the hint never forces. */
  suggestedKind: z
    .enum(["ACCOUNT", "REAL_ESTATE", "MORTGAGE", "LOAN", "CASH_FLOW", "INSURANCE", "OTHER_ASSET", "OTHER_LIABILITY", "UNKNOWN"])
    .default("UNKNOWN"),
  suggestedName: z.string().optional(),
  fields: z.array(RawFieldSchema).min(1),
});

export const RawDataPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  adapterId: z.string().min(1),
  adapterVersion: z.string().min(1),
  documentSha256: z.string().optional(),
  extractedAt: z.iso.datetime(),
  items: z.array(RawItemSchema),
  /** Non-fatal extraction warnings, reported to the user in the import report. */
  warnings: z.array(z.string()).default([]),
});

export type RawField = z.infer<typeof RawFieldSchema>;
export type RawItem = z.infer<typeof RawItemSchema>;
export type RawDataPayload = z.infer<typeof RawDataPayloadSchema>;
