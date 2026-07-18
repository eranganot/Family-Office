import { describe, expect, it } from "vitest";
import {
  evaluateTransition,
  legalTargets,
  WorkflowStates,
  type TransitionFacts,
  type WorkflowState,
} from "../src/workflow/state-machine";

const OK: TransitionFacts = { verificationComplete: true, suspenseEmpty: true, allocationPlanApproved: true };

const LEGAL: Array<[WorkflowState, WorkflowState]> = [
  ["MAPPING", "VERIFICATION"],
  ["VERIFICATION", "MAPPING"],
  ["VERIFICATION", "ALLOCATION"],
  ["ALLOCATION", "VERIFICATION"],
  ["ALLOCATION", "STRATEGY"],
  ["STRATEGY", "ALLOCATION"],
  ["STRATEGY", "MONITORING"],
  ["MONITORING", "VERIFICATION"],
  ["MONITORING", "ALLOCATION"],
  ["MONITORING", "STRATEGY"],
];

describe("WorkflowStateMachine", () => {
  it("exhaustive 5x5 matrix: exactly the documented transitions are legal", () => {
    for (const from of WorkflowStates) {
      for (const to of WorkflowStates) {
        const expected = LEGAL.some(([f, t]) => f === from && t === to);
        const result = evaluateTransition(from, to, OK);
        expect(result.allowed, `${from} -> ${to}`).toBe(expected);
        if (!result.allowed && !expected) expect(result.reason).toBe("ILLEGAL_TRANSITION");
      }
    }
  });

  it("VERIFICATION -> ALLOCATION requires complete verification", () => {
    const r = evaluateTransition("VERIFICATION", "ALLOCATION", { ...OK, verificationComplete: false });
    expect(r).toEqual({ allowed: false, reason: "VERIFICATION_INCOMPLETE" });
  });

  it("VERIFICATION -> ALLOCATION requires an empty suspense account", () => {
    const r = evaluateTransition("VERIFICATION", "ALLOCATION", { ...OK, suspenseEmpty: false });
    expect(r).toEqual({ allowed: false, reason: "SUSPENSE_NOT_EMPTY" });
  });

  it("ALLOCATION -> STRATEGY requires an approved deployment plan", () => {
    const r = evaluateTransition("ALLOCATION", "STRATEGY", { ...OK, allocationPlanApproved: false });
    expect(r).toEqual({ allowed: false, reason: "ALLOCATION_PLAN_NOT_APPROVED" });
  });

  it("MONITORING -> STRATEGY re-evaluation is NOT gated on verification facts", () => {
    const r = evaluateTransition("MONITORING", "STRATEGY", {
      verificationComplete: false,
      suspenseEmpty: false,
      allocationPlanApproved: false,
    });
    expect(r.allowed).toBe(true); // re-evaluation of an accepted strategy; staleness handled by drift flow
  });

  it("legalTargets matches the matrix", () => {
    expect(legalTargets("MAPPING")).toEqual(["VERIFICATION"]);
    expect(legalTargets("ALLOCATION")).toEqual(["VERIFICATION", "STRATEGY"]);
    expect(legalTargets("STRATEGY")).toEqual(["ALLOCATION", "MONITORING"]);
  });
});
