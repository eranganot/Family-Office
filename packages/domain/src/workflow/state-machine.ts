/**
 * The four-phase product state machine. This is THE authority on phase transitions;
 * persistence and API layers may only execute what this module allows.
 */
export const WorkflowStates = ["MAPPING", "VERIFICATION", "STRATEGY", "MONITORING"] as const;
export type WorkflowState = (typeof WorkflowStates)[number];

/** Facts the caller must supply for guarded transitions. Computed from the ledger, never trusted from input. */
export interface TransitionFacts {
  verificationComplete: boolean;
  suspenseEmpty: boolean;
}

const LEGAL_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  MAPPING: ["VERIFICATION"],
  VERIFICATION: ["MAPPING", "STRATEGY"],
  STRATEGY: ["MONITORING"],
  MONITORING: ["VERIFICATION", "STRATEGY"],
};

export type TransitionDenialReason =
  | "ILLEGAL_TRANSITION"
  | "VERIFICATION_INCOMPLETE"
  | "SUSPENSE_NOT_EMPTY";

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
  // The gate into STRATEGY: only verified data may drive strategy (Phase 2 → Phase 3).
  if (to === "STRATEGY" && from === "VERIFICATION") {
    if (!facts.verificationComplete) return { allowed: false, reason: "VERIFICATION_INCOMPLETE" };
    if (!facts.suspenseEmpty) return { allowed: false, reason: "SUSPENSE_NOT_EMPTY" };
  }
  return { allowed: true };
}

export function legalTargets(from: WorkflowState): readonly WorkflowState[] {
  return LEGAL_TRANSITIONS[from];
}
