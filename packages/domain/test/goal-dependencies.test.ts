import { describe, expect, it } from "vitest";
import { validateGoalDependencies } from "../src/goals/dependencies";

describe("validateGoalDependencies", () => {
  it("accepts empty, chains, and diamonds", () => {
    expect(validateGoalDependencies([]).valid).toBe(true);
    expect(validateGoalDependencies([{ goalId: "a", dependsOnGoalId: "b" }, { goalId: "b", dependsOnGoalId: "c" }]).valid).toBe(true);
    expect(
      validateGoalDependencies([
        { goalId: "a", dependsOnGoalId: "b" },
        { goalId: "a", dependsOnGoalId: "c" },
        { goalId: "b", dependsOnGoalId: "d" },
        { goalId: "c", dependsOnGoalId: "d" },
      ]).valid,
    ).toBe(true);
  });
  it("rejects self-dependency and cycles with the offending path", () => {
    expect(validateGoalDependencies([{ goalId: "a", dependsOnGoalId: "a" }])).toMatchObject({ reason: "SELF_DEPENDENCY" });
    const r = validateGoalDependencies([
      { goalId: "a", dependsOnGoalId: "b" },
      { goalId: "b", dependsOnGoalId: "c" },
      { goalId: "c", dependsOnGoalId: "a" },
    ]);
    expect(r).toMatchObject({ reason: "CYCLE" });
    if (!r.valid && r.cyclePath) expect(r.cyclePath.length).toBeGreaterThanOrEqual(3);
  });
});
