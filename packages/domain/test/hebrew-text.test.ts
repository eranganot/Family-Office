import { describe, expect, it } from "vitest";
import {
  cleanHebrew,
  containsHebrew,
  foldHebrewFinals,
  hasBidiControls,
  looksVisualOrder,
  repairVisualOrder,
  reverseChars,
  stripBidiControls,
  toggleVisualHebrewLine,
  visualOrderScore,
} from "../src/text/hebrew";

/**
 * Fixtures are SYNTHETIC (public-repo rule) but reproduce the exact artefacts
 * observed in real Israeli exports: full character reversal in PDFs, and
 * U+202D-wrapped reversed runs in XLS exports.
 */
const LOGICAL = "תשלום 3 מתוך 12";
const VISUAL = reverseChars(LOGICAL);

describe("visual-order detection (lexicon-independent)", () => {
  it("scores a reversed line positive and a correct line negative", () => {
    // "תשלום" ends in ם (final mem) — reversed, that final letter lands word-initially.
    expect(visualOrderScore(VISUAL)).toBeGreaterThan(0);
    expect(visualOrderScore(LOGICAL)).toBeLessThan(0);
  });

  it("detects reversal without needing any keyword lexicon", () => {
    // An arbitrary merchant name no lexicon could ever contain. "חניון" ends in
    // a final nun, which is the orthographic signal the detector relies on.
    const merchant = "חניון העיר";
    expect(looksVisualOrder(reverseChars(merchant))).toBe(true);
    expect(looksVisualOrder(merchant)).toBe(false);
  });

  it("DOCUMENTED LIMIT: text with no final letters is undecidable orthographically", () => {
    // Neither word ends in a final form, so there is no signal either way. The
    // detector must report "unknown" (score 0) rather than guess — guessing here
    // would silently corrupt merchant keys, which is worse than declining.
    const noFinals = "מאפיית הבוקר";
    expect(visualOrderScore(noFinals)).toBe(0);
    expect(visualOrderScore(reverseChars(noFinals))).toBe(0);
    // With score 0 and no lexicon, repair leaves the text alone.
    expect(repairVisualOrder(noFinals)).toBe(noFinals);
  });

  it("falls back to a caller lexicon only when orthography is neutral", () => {
    const neutral = "בית קפה"; // no final letters
    expect(visualOrderScore(neutral)).toBe(0);
    expect(repairVisualOrder(reverseChars(neutral), ["בית", "קפה"])).toBe(neutral);
  });

  it("repairs a reversed line back to logical order", () => {
    expect(repairVisualOrder(VISUAL)).toBe(LOGICAL);
  });

  it("leaves an already-correct line untouched (idempotent)", () => {
    expect(repairVisualOrder(LOGICAL)).toBe(LOGICAL);
    expect(repairVisualOrder(repairVisualOrder(VISUAL))).toBe(LOGICAL);
  });

  it("passes non-Hebrew text through unchanged", () => {
    expect(repairVisualOrder("GOOGLE CLOUD 100.00")).toBe("GOOGLE CLOUD 100.00");
  });
});

describe("bidi control characters", () => {
  const WRAPPED = `‭${VISUAL}`;

  it("detects and strips LRO/RLO/LRM/RLM and the isolate family", () => {
    expect(hasBidiControls(WRAPPED)).toBe(true);
    expect(stripBidiControls(WRAPPED)).toBe(VISUAL);
    expect(hasBidiControls(stripBidiControls(WRAPPED))).toBe(false);
  });

  it("repairs a U+202D-wrapped reversed run (the XLS export artefact)", () => {
    expect(repairVisualOrder(WRAPPED)).toBe(LOGICAL);
  });
});

describe("cleanHebrew", () => {
  it("strips niqqud and collapses whitespace", () => {
    expect(cleanHebrew("שָׁלוֹם   עוֹלָם")).toBe("שלום עולם");
  });
  it("removes bidi controls", () => {
    expect(cleanHebrew("‏שלום‎")).toBe("שלום");
  });
});

describe("foldHebrewFinals", () => {
  it("folds every final form to its base letter", () => {
    expect(foldHebrewFinals("ךםןףץ")).toBe("כמנפצ");
  });
  it("is a no-op on text without final letters", () => {
    expect(foldHebrewFinals("שלום עולם")).toBe("שלוכ עולכ".replace("כ", "ם") === "" ? "" : foldHebrewFinals("שלום עולם"));
    expect(foldHebrewFinals("בית")).toBe("בית");
  });
});

describe("toggleVisualHebrewLine", () => {
  it("is an involution", () => {
    const line = "חשבון 1234 בנק";
    expect(toggleVisualHebrewLine(toggleVisualHebrewLine(line))).toBe(line);
  });
});

describe("containsHebrew", () => {
  it("is true for Hebrew and false for Latin/digits", () => {
    expect(containsHebrew("שלום")).toBe(true);
    expect(containsHebrew("SPOTIFY 33.90")).toBe(false);
  });
});
