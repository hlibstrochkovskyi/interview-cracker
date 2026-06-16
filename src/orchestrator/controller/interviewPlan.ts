/**
 * Interview plan as a flexible state machine.
 *
 * Phases are soft targets, not hard gates: we allow digression and follow-ups, and only
 * *nudge* toward the next phase. The controller advances when the phase's goals are met and
 * we're past the half-budget mark, or hard-advances once the time budget is exhausted. This is
 * pure and deterministic so it is fully unit-testable (see test/interviewPlan.test.ts).
 */
export type Phase =
  | 'intro'
  | 'background'
  | 'behavioral'
  | 'technical'
  | 'candidate_questions'
  | 'wrap'

export interface PhaseSpec {
  phase: Phase
  /** Soft target for how many candidate turns this phase wants. */
  goalTurns: number
  /** Time budget for the phase, in milliseconds. */
  budgetMs: number
}

export interface PlanState {
  phase: Phase
  index: number
  turnsInPhase: number
  elapsedInPhaseMs: number
}

export const DEFAULT_PLAN: readonly PhaseSpec[] = [
  { phase: 'intro', goalTurns: 1, budgetMs: 60_000 },
  { phase: 'background', goalTurns: 3, budgetMs: 300_000 },
  { phase: 'behavioral', goalTurns: 6, budgetMs: 900_000 },
  { phase: 'technical', goalTurns: 5, budgetMs: 600_000 },
  { phase: 'candidate_questions', goalTurns: 2, budgetMs: 180_000 },
  { phase: 'wrap', goalTurns: 1, budgetMs: 60_000 }
]

export class InterviewPlan {
  private readonly specs: readonly PhaseSpec[]

  constructor(specs: readonly PhaseSpec[] = DEFAULT_PLAN) {
    if (specs.length === 0) throw new Error('InterviewPlan requires at least one phase')
    this.specs = specs
  }

  initial(): PlanState {
    return { phase: this.specs[0].phase, index: 0, turnsInPhase: 0, elapsedInPhaseMs: 0 }
  }

  /** Record a completed candidate turn of `turnMs` duration. */
  recordTurn(state: PlanState, turnMs: number): PlanState {
    return {
      ...state,
      turnsInPhase: state.turnsInPhase + 1,
      elapsedInPhaseMs: state.elapsedInPhaseMs + Math.max(0, turnMs)
    }
  }

  /** Soft transition rule: goals met past the half-budget mark, or time fully spent. */
  shouldAdvance(state: PlanState): boolean {
    const spec = this.specs[state.index]
    const overBudget = state.elapsedInPhaseMs >= spec.budgetMs
    const goalsMet = state.turnsInPhase >= spec.goalTurns
    const pastHalf = state.elapsedInPhaseMs >= spec.budgetMs / 2
    return overBudget || (goalsMet && pastHalf)
  }

  /** Move to the next phase, resetting per-phase counters. Clamps at the final phase. */
  advance(state: PlanState): PlanState {
    const nextIndex = Math.min(state.index + 1, this.specs.length - 1)
    return {
      phase: this.specs[nextIndex].phase,
      index: nextIndex,
      turnsInPhase: 0,
      elapsedInPhaseMs: 0
    }
  }

  isLastPhase(state: PlanState): boolean {
    return state.index === this.specs.length - 1
  }

  /** The interview is done when the final phase has satisfied its advance condition. */
  isComplete(state: PlanState): boolean {
    return this.isLastPhase(state) && this.shouldAdvance(state)
  }
}
