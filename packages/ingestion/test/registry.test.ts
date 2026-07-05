import type { RawDataPayload } from "@wealthos/domain";
import { describe, expect, it } from "vitest";
import type { DocumentMeta, IngestionAdapter } from "../src/adapter";
import { findAdapter, listAdapters, registerAdapter } from "../src/registry";

const stub = (id: string, accept: boolean): IngestionAdapter => ({
  id,
  version: "1.0.0",
  accepts: () => accept,
  parse: async (): Promise<RawDataPayload> => ({
    schemaVersion: 1,
    adapterId: id,
    adapterVersion: "1.0.0",
    extractedAt: new Date().toISOString(),
    items: [],
    warnings: [],
  }),
});

const meta: DocumentMeta = { filename: "x.csv", mimeType: "text/csv", sha256: "abc" };

describe("adapter registry", () => {
  it("registers, lists, finds by id and by meta; rejects duplicates", () => {
    registerAdapter(stub("a", false));
    registerAdapter(stub("b", true));
    expect(listAdapters().length).toBeGreaterThanOrEqual(2);
    expect(findAdapter("a")?.id).toBe("a");
    expect(findAdapter(meta)?.id).toBe("b"); // first accepting adapter
    expect(() => registerAdapter(stub("a", false))).toThrow(/already registered/);
  });
});
