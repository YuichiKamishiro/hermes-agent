import { describe, expect, it } from 'vitest'

import { shouldShowThinkingTrail } from '../components/messageLine.js'

describe('shouldShowThinkingTrail', () => {
  it('hides an ordinary reasoning trail when every section is hidden', () => {
    const msg = { role: 'system', text: '', thinking: 'plan' } as const
    expect(shouldShowThinkingTrail(msg, 'hidden', 'hidden', 'hidden')).toBe(false)
  })

  it('shows an ordinary reasoning trail when any section is visible', () => {
    const msg = { role: 'system', text: '', thinking: 'plan' } as const
    expect(shouldShowThinkingTrail(msg, 'collapsed', 'hidden', 'hidden')).toBe(true)
    expect(shouldShowThinkingTrail(msg, 'hidden', 'collapsed', 'hidden')).toBe(true)
    expect(shouldShowThinkingTrail(msg, 'hidden', 'hidden', 'expanded')).toBe(true)
  })

  it('keeps a MoA reference block visible even when every section is hidden (#64657)', () => {
    const msg = {
      role: 'system',
      text: '',
      thinking: '◇ Reference 1/2 — model-a\nadvice-a',
      isMoaReference: true
    } as const

    expect(shouldShowThinkingTrail(msg, 'hidden', 'hidden', 'hidden')).toBe(true)
  })
})
