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
