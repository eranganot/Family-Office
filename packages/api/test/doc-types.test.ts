import { describe, expect, it } from "vitest";
import { DocTypeSchema } from "../src/routers/documents";

/**
 * The Operations upload form offers exactly these two statement kinds. They MUST be
 * accepted by the document schema.
 *
 * Regression: `CARD_STATEMENT` was missing from the enum while `BANK_STATEMENT` was
 * present, so every card-statement upload was rejected by validation and surfaced only
 * as a generic "save failed" — bank uploads worked, which made it look like a problem
 * with the files rather than a one-word omission.
 */
const OFFERED_IN_UI = ["BANK_STATEMENT", "CARD_STATEMENT"] as const;

describe("document types offered by the Operations upload form", () => {
  it.each(OFFERED_IN_UI)("accepts %s", (value) => {
    expect(DocTypeSchema.safeParse(value).success).toBe(true);
  });

  it("rejects an unknown type rather than storing it", () => {
    expect(DocTypeSchema.safeParse("NOT_A_REAL_TYPE").success).toBe(false);
  });
});
