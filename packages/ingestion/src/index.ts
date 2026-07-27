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
  buildExternalRef, HEADER_SYNONYMS,
} from "./statement-mapping";
export type {
  ColumnMapping, AmountMode, MappingProfile, MappingGuess, TransactionDraft, MappingIssue, MappedResult,
} from "./statement-mapping";
