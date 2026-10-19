import { describe, expect, it } from 'vitest'
import { NEUTRAL_SATURATION, analyzePixels, frameDifference, zoneDifference } from './colorSense'

// Build an RGBA buffer from [r, g, b] pixels
const rgba = (...pixels: number[][]) => new Uint8ClampedArray(pixels.flatMap(([r, g, b]) => [r, g, b, 255]))
const fill = (n: number, p: number[]) => rgba(...Array.from({ length: n }, () => p))

describe('analyzePixels', () => {
  it('reads red, green and blue thirds as left, center and right', () => {
    const z = analyzePixels(rgba([255, 0, 0], [0, 255, 0], [0, 0, 255]), 3, 1)
    expect(z.left.hue).toBeCloseTo(0, -1)
    expect(Math.abs(z.center.hue - 120)).toBeLessThan(15)
    expect(Math.abs(z.right.hue - 240)).toBeLessThan(15)
    for (const zone of [z.left, z.center, z.right]) expect(zone.saturation).toBeCloseTo(1)
  })

  it('treats uniform gray as neutral with mid brightness', () => {
    const z = analyzePixels(fill(9, [128, 128, 128]), 3, 3)
    for (const zone of [z.left, z.center, z.right]) {
      expect(zone.saturation).toBeLessThan(NEUTRAL_SATURATION)
      expect(zone.brightness).toBeCloseTo(0.5, 1)
    }
  })

  it('gives brightness 0 for black and 1 for white, with finite hue', () => {
    const black = analyzePixels(fill(9, [0, 0, 0]), 3, 3)
    const white = analyzePixels(fill(9, [255, 255, 255]), 3, 3)
    expect(black.center.brightness).toBe(0)
    expect(white.center.brightness).toBe(1)
    for (const z of [black, white]) for (const zone of [z.left, z.center, z.right]) expect(Number.isFinite(zone.hue)).toBe(true)
  })

  it('reports the dominant hue, not a mean across the wrap-around', () => {
    // 6 pixels near hue 5 and 4 near hue 355, all in one zone (width 1 puts every pixel in "left")
    const pixels = [
      ...Array.from({ length: 6 }, () => [255, 21, 0]),
      ...Array.from({ length: 4 }, () => [255, 0, 21]),
    ]
    const z = analyzePixels(rgba(...pixels), 1, 10)
    const h = z.left.hue
    expect(Math.min(h, 360 - h)).toBeLessThan(15)
  })
})

describe('frameDifference', () => {
  it('is 0 for identical frames', () => {
    expect(frameDifference(fill(4, [10, 20, 30]), fill(4, [10, 20, 30]))).toBe(0)
  })
  it('is 1 for black vs white', () => {
    expect(frameDifference(fill(4, [0, 0, 0]), fill(4, [255, 255, 255]))).toBe(1)
  })
  it('is 1 when the lengths differ', () => {
    expect(frameDifference(fill(4, [0, 0, 0]), fill(5, [0, 0, 0]))).toBe(1)
  })
})

describe('zoneDifference', () => {
  it('reports a change only in the zone where it happened', () => {
    const before = fill(9, [0, 0, 0])
    // 3x3 frame: change only the left column
    const after = rgba(
      [255, 255, 255], [0, 0, 0], [0, 0, 0],
      [255, 255, 255], [0, 0, 0], [0, 0, 0],
      [255, 255, 255], [0, 0, 0], [0, 0, 0],
    )
    const d = zoneDifference(before, after, 3)
    expect(d.left).toBe(1)
    expect(d.center).toBe(0)
    expect(d.right).toBe(0)
  })

  it('treats frames of different sizes as completely different', () => {
    const d = zoneDifference(fill(9, [0, 0, 0]), fill(4, [0, 0, 0]), 3)
    expect(d).toEqual({ left: 1, center: 1, right: 1 })
  })
})
