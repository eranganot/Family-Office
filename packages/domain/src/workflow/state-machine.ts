/**
 * The five-phase product state machine. This is THE authority on phase transitions;
 * persistence and API layers may only execute what this module allows.
 * M25: ALLOCATION sits between VERIFICATION and STRATEGY — free cash gets a
 * deployment plan before strategy recommendations run.
 */
export const WorkflowStates = ["MAPPING", "VERIFICATION", "ALLOCATION", "STRATEGY", "MONITORING"] as const;
export type WorkflowState = (typeof WorkflowStates)[number];

/** Facts the caller must supply for guarded transitions. Computed from the ledger, never trusted from input. */
export interface TransitionFacts {
  verificationComplete: boolean;
  suspenseEmpty: boolean;
  /** Latest deployment plan approved (or auto-approved when there is nothing to deploy). */
  allocationPlanApproved: boolean;
}

const LEGAL_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  MAPPING: ["VERIFICATION"],
  VERIFICATION: ["MAPPING", "ALLOCATION"],
  ALLOCATION: ["VERIFICATION", "STRATEGY"],
  STRATEGY: ["ALLOCATION", "MONITORING"],
  MONITORING: ["VERIFICATION", "ALLOCATION", "STRATEGY"],
};

export type TransitionDenialReason =
  | "ILLEGAL_TRANSITION"
  | "VERIFICATION_INCOMPLETE"
  | "SUSPENSE_NOT_EMPTY"
  | "ALLOCATION_PLAN_NOT_APPROVED";

export type TransitionResult =
  | { allowed: true }
  | { allowed: false; reason: TransitionDenialReason };

export function evaluateTransition(
  from: WorkflowState,
  to: WorkflowState,
  facts: TransitionFacts,
): TransitionResult {
  if (!LEGAL_TRANSITIONS[from].includes(to)) {
    return { allowed: false, reason: "ILLEGAL_TRANSITION" };
  }
  // The gate out of VERIFICATION: only verified data may enter allocation/strategy.
  if (to === "ALLOCATION" && from === "VERIFICATION") {
    if (!facts.verificationComplete) return { allowed: false, reason: "VERIFICATION_INCOMPLETE" };
    if (!facts.suspenseEmpty) return { allowed: false, reason: "SUSPENSE_NOT_EMPTY" };
  }
  // The gate into STRATEGY: the free-cash deployment plan must be decided first.
  if (to === "STRATEGY" && from === "ALLOCATION") {
    if (!facts.allocationPlanApproved) return { allowed: false, reason: "ALLOCATION_PLAN_NOT_APPROVED" };
  }
  return { allowed: true };
}

export function legalTargets(from: WorkflowState): readonly WorkflowState[] {
  return LEGAL_TRANSITIONS[from];
}
