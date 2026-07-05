export type { IngestionAdapter, DocumentMeta } from "./adapter";
export { registerAdapter, listAdapters, findAdapter } from "./registry";
export {
  cleanHebrew,
  containsHebrew,
  parseIsraeliDate,
  parseLocalizedDecimal,
  reverseVisualHebrew,
} from "./normalize";
import { registerAdapter } from "./registry";
import { ilAccountsCsvAdapter } from "./adapters/il-accounts-csv";
export { ilAccountsCsvAdapter } from "./adapters/il-accounts-csv";

// Register built-in adapters once at module load.
let registered = false;
export function registerBuiltinAdapters(): void {
  if (registered) return;
  registered = true;
  registerAdapter(ilAccountsCsvAdapter);
}
registerBuiltinAdapters();
