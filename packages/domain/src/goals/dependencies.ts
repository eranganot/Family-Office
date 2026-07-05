/** Goal dependency graph must stay acyclic — pure validation, exhaustive over edges. */

export interface GoalEdge {
  goalId: string;
  dependsOnGoalId: string;
}

export type DependencyValidation =
  | { valid: true }
  | { valid: false; reason: "SELF_DEPENDENCY" | "CYCLE"; cyclePath?: string[] };

export function validateGoalDependencies(edges: GoalEdge[]): DependencyValidation {
  for (const e of edges) {
    if (e.goalId === e.dependsOnGoalId) return { valid: false, reason: "SELF_DEPENDENCY" };
  }
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    adjacency.set(e.goalId, [...(adjacency.get(e.goalId) ?? []), e.dependsOnGoalId]);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const path: string[] = [];

  const visit = (node: string): string[] | null => {
    color.set(node, GRAY);
    path.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) return [...path.slice(path.indexOf(next)), next];
      if (c === WHITE) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    color.set(node, BLACK);
    path.pop();
    return null;
  };

  for (const node of adjacency.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const cycle = visit(node);
      if (cycle) return { valid: false, reason: "CYCLE", cyclePath: cycle };
    }
  }
  return { valid: true };
}
