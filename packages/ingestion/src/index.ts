export type { IngestionAdapter, DocumentMeta } from "./adapter";
export { registerAdapter, listAdapters, findAdapter } from "./registry";
export {
  fixVisualOrderLine,
  toggleVisualHebrewLine,
  IL_DOC_LEXICON,
  cleanHebrew,
  containsHebrew,
  parseIsraeliDate,
  parseLocalizedDecimal,
  reverseVisualHebrew,
} from "./normalize";
import { registerAdapter } from "./registry";
import { ilAccountsCsvAdapter } from "./adapters/il-accounts-csv";
import { ilPensionPdfAdapter } from "./adapters/il-pension-pdf";
export { ilAccountsCsvAdapter } from "./adapters/il-accounts-csv";
export { ilPensionPdfAdapter } from "./adapters/il-pension-pdf";
export { extractPdfLines } from "./pdf/extract";

// Register built-in adapters once at module load.
let registered = false;
export function registerBuiltinAdapters(): void {
  if (registered) return;
  registered = true;
  registerAdapter(ilAccountsCsvAdapter);
  registerAdapter(ilPensionPdfAdapter);
}
registerBuiltinAdapters();
export { redact, redactRow, isValidTeudatZehut, isLuhnValid, REDACTION_VERSION } from "./redact";
export type { RedactionResult, RedactionHit, RedactionKind } from "./redact";
export {
  sniffFormat, sniffEncoding, decodeBytes, parseCsvGrid, parseHtmlGrid,
  detectHeaderRow, normaliseGrid, toRecords, IL_STATEMENT_LEXICON,
} from "./tabular";
export type { TabularFormat, SniffResult, TableGrid, ParsedTable } from "./tabular";
export {
  applyMapping, guessMapping, parseInstalments, looksRecurring, normaliseMinus,
  buildExternalRef, HEADER_SYNONYMS, pdfRowsToDrafts,
} from "./statement-mapping";
export type {
  ColumnMapping, AmountMode, MappingProfile, MappingGuess, TransactionDraft, MappingIssue, MappedResult,
} from "./statement-mapping";
export { parsePdfStatement, parseStatementLines, guessIssuer, PDF_PROFILES } from "./pdf-statement";
export type { PdfStatementRow, PdfStatementResult, PdfIssuer, PdfProfile } from "./pdf-statement";
export { extractPdfCellLines } from "./pdf/extract";
export type { CellLine, TextCell } from "./pdf/extract";
export { parsePdfTable } from "./pdf-table";
export type { PdfTableRow, PdfTableResult, TableKind } from "./pdf-table";
export { parseSettlementLine, detectCardLast4 } from "./card-identity";
export type { SettlementRef } from "./card-identity";
