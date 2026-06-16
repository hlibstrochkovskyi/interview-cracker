import { describe, it, expect } from 'vitest'
import { InterviewPlan, DEFAULT_PLAN, type PlanState } from '@orchestrator/controller/interviewPlan'

describe('InterviewPlan', () => {
  it('starts in the intro phase with reset counters', () => {
    const plan = new InterviewPlan()
    const s = plan.initial()
    expect(s.phase).toBe('intro')
    expect(s.index).toBe(0)
    expect(s.turnsInPhase).toBe(0)
    expect(s.elapsedInPhaseMs).toBe(0)
  })

  it('records turns and accumulates elapsed time', () => {
    const plan = new InterviewPlan()
    let s = plan.initial()
    s = plan.recordTurn(s, 5_000)
    s = plan.recordTurn(s, 3_000)
    expect(s.turnsInPhase).toBe(2)
    expect(s.elapsedInPhaseMs).toBe(8_000)
  })

  it('does not advance early when goals are unmet and budget is fresh', () => {
    const plan = new InterviewPlan([{ phase: 'intro', goalTurns: 3, budgetMs: 100_000 }])
    let s = plan.initial()
    s = plan.recordTurn(s, 1_000)
    expect(plan.shouldAdvance(s)).toBe(false)
  })

  it('advances once goals are met past the half-budget mark', () => {
    const plan = new InterviewPlan([{ phase: 'intro', goalTurns: 2, budgetMs: 100_000 }])
    let s = plan.initial()
    s = plan.recordTurn(s, 60_000) // past half budget
    s = plan.recordTurn(s, 0) // goals met (2 turns)
    expect(plan.shouldAdvance(s)).toBe(true)
  })

  it('hard-advances when the time budget is exhausted regardless of goals', () => {
    const plan = new InterviewPlan([{ phase: 'intro', goalTurns: 99, budgetMs: 10_000 }])
    let s = plan.initial()
    s = plan.recordTurn(s, 10_000)
    expect(plan.shouldAdvance(s)).toBe(true)
  })

  it('advance moves to the next phase and resets per-phase counters', () => {
    const plan = new InterviewPlan()
    let s = plan.initial()
    s = plan.recordTurn(s, 9_999)
    s = plan.advance(s)
    expect(s.phase).toBe('background')
    expect(s.index).toBe(1)
    expect(s.turnsInPhase).toBe(0)
    expect(s.elapsedInPhaseMs).toBe(0)
  })

  it('clamps at the final phase and reports completion', () => {
    const plan = new InterviewPlan()
    let s: PlanState = {
      phase: 'wrap',
      index: DEFAULT_PLAN.length - 1,
      turnsInPhase: 0,
      elapsedInPhaseMs: 0
    }
    const clamped = plan.advance(s)
    expect(clamped.index).toBe(DEFAULT_PLAN.length - 1)
    expect(plan.isLastPhase(s)).toBe(true)

    s = plan.recordTurn(s, 60_000) // exhaust the wrap budget
    expect(plan.isComplete(s)).toBe(true)
  })

  it('progresses through every phase to wrap when driven hard', () => {
    const plan = new InterviewPlan()
    let s = plan.initial()
    const visited: string[] = [s.phase]
    for (let i = 0; i < 20 && !plan.isLastPhase(s); i++) {
      s = plan.recordTurn(s, 1_000_000) // blow past any budget
      if (plan.shouldAdvance(s)) {
        s = plan.advance(s)
        visited.push(s.phase)
      }
    }
    expect(visited).toEqual([
      'intro',
      'background',
      'behavioral',
      'technical',
      'candidate_questions',
      'wrap'
    ])
  })
})
