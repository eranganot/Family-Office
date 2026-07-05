import type { DocumentMeta, IngestionAdapter } from "./adapter";

const adapters: IngestionAdapter[] = [];

export function registerAdapter(adapter: IngestionAdapter): void {
  if (adapters.some((a) => a.id === adapter.id)) {
    throw new Error(`Adapter already registered: ${adapter.id}`);
  }
  adapters.push(adapter);
}

export function listAdapters(): ReadonlyArray<IngestionAdapter> {
  return adapters;
}

export function findAdapter(idOrMeta: string | DocumentMeta): IngestionAdapter | undefined {
  if (typeof idOrMeta === "string") return adapters.find((a) => a.id === idOrMeta);
  return adapters.find((a) => a.accepts(idOrMeta));
}
