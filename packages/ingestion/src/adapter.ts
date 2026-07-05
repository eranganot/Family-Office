import type { RawDataPayload } from "@wealthos/domain";

export interface DocumentMeta {
  filename: string;
  mimeType: string;
  docType?: string | undefined;
  institutionName?: string | undefined;
  sha256: string;
}

/**
 * Ingestion Adapter Pattern: file bytes in, RawDataPayload out. Nothing else.
 * Adapters never import persistence; they are pure extract-and-normalize units.
 * `version` MUST be bumped on any mapping change (reproducibility).
 */
export interface IngestionAdapter {
  id: string;
  version: string;
  /** Whether this adapter believes it can parse the document. */
  accepts(meta: DocumentMeta): boolean;
  parse(bytes: Uint8Array, meta: DocumentMeta): Promise<RawDataPayload>;
}
