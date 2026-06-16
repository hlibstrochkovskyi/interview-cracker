import { describe, it, expect } from 'vitest'
import { truncateToPlayed } from '@orchestrator/controller/bargeIn'

const FULL = 'Walk me through the rollback you mentioned earlier.'

describe('truncateToPlayed', () => {
  it('returns the full text when everything played', () => {
    expect(truncateToPlayed(FULL, FULL.length)).toBe(FULL)
    expect(truncateToPlayed(FULL, FULL.length + 50)).toBe(FULL)
  })

  it('returns empty when nothing played', () => {
    expect(truncateToPlayed(FULL, 0)).toBe('')
    expect(truncateToPlayed(FULL, -5)).toBe('')
  })

  it('never stores a half-spoken word (backs off to a word boundary)', () => {
    // "Walk me through the roll" — cut mid-word at "roll|back"
    const cut = truncateToPlayed(FULL, 24)
    expect(cut).toBe('Walk me through the')
    expect(FULL.startsWith(cut)).toBe(true)
  })

  it('keeps a whole word when the cut lands exactly on a boundary', () => {
    // 'Walk me through' is 15 chars; index 15 is the space after it.
    expect(truncateToPlayed(FULL, 15)).toBe('Walk me through')
  })

  it('the stored message is always a prefix of what was generated', () => {
    for (let i = 0; i <= FULL.length; i++) {
      const stored = truncateToPlayed(FULL, i)
      expect(FULL.startsWith(stored)).toBe(true)
    }
  })
})
