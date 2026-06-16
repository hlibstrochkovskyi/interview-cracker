import { describe, it, expect } from 'vitest'
import { ClauseChunker } from '@orchestrator/chunker/clauseChunker'

describe('ClauseChunker', () => {
  it('emits a complete sentence once a boundary is seen past the min length', () => {
    const c = new ClauseChunker({ minLength: 8 })
    const out = c.push('Tell me about your last role.')
    expect(out).toEqual(['Tell me about your last role.'])
  })

  it('holds short fragments below the min-length floor', () => {
    const c = new ClauseChunker({ minLength: 16 })
    expect(c.push('So.')).toEqual([])
    expect(c.push(' Right.')).toEqual([]) // "So. Right." still under 16
    const out = c.push(' Now walk me through it.')
    expect(out).toEqual(['So. Right. Now walk me through it.'])
  })

  it('splits multiple sentences arriving in one push', () => {
    const c = new ClauseChunker({ minLength: 6 })
    const out = c.push('First point here. Second point here. Third!')
    expect(out).toEqual(['First point here.', 'Second point here.', 'Third!'])
  })

  it('does not split decimals or version numbers', () => {
    const c = new ClauseChunker({ minLength: 4 })
    const out = c.push('We scaled to 3.5x throughput.')
    expect(out).toEqual(['We scaled to 3.5x throughput.'])
  })

  it('accumulates across token-by-token streaming', () => {
    const c = new ClauseChunker({ minLength: 10 })
    const tokens = ['Th', 'at ', 'is ', 'a ', 'great ', 'point', '.']
    const emitted = tokens.flatMap((t) => c.push(t))
    expect(emitted).toEqual(['That is a great point.'])
  })

  it('flush returns the trailing remainder with no boundary', () => {
    const c = new ClauseChunker({ minLength: 4 })
    expect(c.push('and then the rollback')).toEqual([])
    expect(c.flush()).toBe('and then the rollback')
    expect(c.flush()).toBeNull()
  })
})
