import { describe, expect, it } from 'vitest'
import { hueToFrequency, zoneToTone } from './tones'

describe('hueToFrequency', () => {
  it('is monotonic non-decreasing and stays within 220-440 Hz', () => {
    let prev = 0
    for (let h = 0; h < 360; h += 5) {
      const f = hueToFrequency(h)
      expect(f).toBeGreaterThanOrEqual(220)
      expect(f).toBeLessThanOrEqual(440)
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
  })

  it('returns finite values at the edges and wraps negative hues', () => {
    for (const h of [0, 359.9, 360, -30, 720]) expect(Number.isFinite(hueToFrequency(h))).toBe(true)
    expect(hueToFrequency(360)).toBe(hueToFrequency(0))
    expect(hueToFrequency(-30)).toBe(hueToFrequency(330))
  })

  it('puts warm hues below cool hues', () => {
    expect(hueToFrequency(0)).toBeLessThan(hueToFrequency(240))
  })
})

describe('zoneToTone', () => {
  it('gives a neutral zone 110 Hz and at most 0.01 gain', () => {
    const t = zoneToTone({ hue: 200, saturation: 0.1, brightness: 1 })
    expect(t.frequency).toBe(110)
    expect(t.gain).toBeLessThanOrEqual(0.01)
  })

  it('is silent for black', () => {
    expect(zoneToTone({ hue: 0, saturation: 1, brightness: 0 }).gain).toBe(0)
  })

  it('keeps three maximum tones within the 0.15 master limit', () => {
    const max = zoneToTone({ hue: 0, saturation: 1, brightness: 1 }).gain
    expect(max * 3).toBeLessThanOrEqual(0.15 + 1e-9)
  })
})
