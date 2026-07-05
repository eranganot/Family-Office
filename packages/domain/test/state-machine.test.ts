import { describe, expect, it } from "vitest";
import {
  evaluateTransition,
  legalTargets,
  WorkflowStates,
  type TransitionFacts,
  type WorkflowState,
} from "../src/workflow/state-machine";

const OK: TransitionFacts = { verificationComplete: true, suspenseEmpty: true };

const LEGAL: Array<[WorkflowState, WorkflowState]> = [
  ["MAPPING", "VERIFICATION"],
  ["VERIFICATION", "MAPPING"],
  ["VERIFICATION", "STRATEGY"],
  ["STRATEGY", "MONITORING"],
  ["MONITORING", "VERIFICATION"],
  ["MONITORING", "STRATEGY"],
];

describe("WorkflowStateMachine", () => {
  it("exhaustive 4x4 matrix: exactly the documented transitions are legal", () => {
    for (const from of WorkflowStates) {
      for (const to of WorkflowStates) {
        const expected = LEGAL.some(([f, t]) => f === from && t === to);
        const result = evaluateTransition(from, to, OK);
        expect(result.allowed, `${from} -> ${to}`).toBe(expected);
        if (!result.allowed && !expected) expect(result.reason).toBe("ILLEGAL_TRANSITION");
      }
    }
  });

  it("VERIFICATION -> STRATEGY requires complete verification", () => {
    const r = evaluateTransition("VERIFICATION", "STRATEGY", { ...OK, verificationComplete: false });
    expect(r).toEqual({ allowed: false, reason: "VERIFICATION_INCOMPLETE" });
  });

  it("VERIFICATION -> STRATEGY requires an empty suspense account", () => {
    const r = evaluateTransition("VERIFICATION", "STRATEGY", { ...OK, suspenseEmpty: false });
    expect(r).toEqual({ allowed: false, reason: "SUSPENSE_NOT_EMPTY" });
  });

  it("MONITORING -> STRATEGY re-evaluation is NOT gated on verification facts", () => {
    const r = evaluateTransition("MONITORING", "STRATEGY", {
      verificationComplete: false,
      suspenseEmpty: false,
    });
    expect(r.allowed).toBe(true); // re-evaluation of an accepted strategy; staleness handled by drift flow
  });

  it("legalTargets matches the matrix", () => {
    expect(legalTargets("MAPPING")).toEqual(["VERIFICATION"]);
    expect(legalTargets("STRATEGY")).toEqual(["MONITORING"]);
  });
});
