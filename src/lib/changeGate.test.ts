import { describe, expect, it } from 'vitest'
import {
  CHANGE_THRESHOLD,
  changedZone,
  maxZoneDifference,
  FORCE_REFRESH_MS,
  MIN_REQUEST_GAP_MS,
  isForcedRefresh,
  isSpeakable,
  msUntilNextRequest,
  shouldDescribe,
  updateScene,
} from './changeGate'

describe('shouldDescribe', () => {
  it('skips a barely changed scene', () => {
    expect(shouldDescribe(0.01, 1000)).toBe(false)
  })
  it('describes a changed scene', () => {
    expect(shouldDescribe(0.05, 1000)).toBe(true)
  })
  it('forces a description after 45 seconds even if nothing changed', () => {
    expect(FORCE_REFRESH_MS).toBe(45000)
    expect(shouldDescribe(0.01, 45000)).toBe(true)
  })
  it('describes when there is no earlier frame to compare with', () => {
    expect(shouldDescribe(1, 0)).toBe(true)
  })
  it('treats a difference exactly at the threshold as changed', () => {
    expect(shouldDescribe(CHANGE_THRESHOLD, 0)).toBe(true)
  })
})

describe('isSpeakable', () => {
  it('speaks a reply without a changed flag (older backend)', () => {
    expect(isSpeakable({ text: 'x' })).toBe(true)
  })
  it('speaks a changed reply', () => {
    expect(isSpeakable({ text: 'x', changed: true })).toBe(true)
  })
  it('does not speak an unchanged reply', () => {
    expect(isSpeakable({ text: '', changed: false })).toBe(false)
  })
})

describe('request pacing', () => {
  it('waits out the rest of the minimum gap between requests', () => {
    expect(MIN_REQUEST_GAP_MS).toBe(3000)
    expect(msUntilNextRequest(1000, 2000)).toBe(2000)
    expect(msUntilNextRequest(1000, 4000)).toBe(0)
    expect(msUntilNextRequest(1000, 9000)).toBe(0)
  })
})

describe('forced refresh', () => {
  it('is a refresh only once 45 seconds have passed', () => {
    expect(isForcedRefresh(44999)).toBe(false)
    expect(isForcedRefresh(45000)).toBe(true)
  })
})

describe('updateScene', () => {
  it('uses a full description as the scene', () => {
    expect(updateScene('', { text: 'A red mug on a desk.' })).toBe('A red mug on a desk.')
  })
  it('appends a change to the scene so earlier objects are remembered', () => {
    const scene = updateScene('A red mug on a desk.', { text: 'A person stands on your left.', changed: true })
    expect(scene).toContain('red mug')
    expect(scene).toContain('person')
  })
  it('keeps only the most recent 300 characters', () => {
    const scene = updateScene('a'.repeat(290), { text: 'b'.repeat(50), changed: true })
    expect(scene.length).toBe(300)
    expect(scene.endsWith('b'.repeat(50))).toBe(true)
  })
})

describe('changedZone', () => {
  it('is null when no zone changed enough', () => {
    expect(changedZone({ left: 0.01, center: 0.02, right: 0 })).toBeNull()
  })
  it('names the one zone that changed', () => {
    expect(changedZone({ left: 0.2, center: 0.01, right: 0 })).toBe('left')
    expect(changedZone({ left: 0, center: 0.01, right: 0.09 })).toBe('right')
  })
  it('says wide when several zones changed', () => {
    expect(changedZone({ left: 0.2, center: 0.2, right: 0 })).toBe('wide')
  })
  it('maxZoneDifference is the largest zone', () => {
    expect(maxZoneDifference({ left: 0.1, center: 0.3, right: 0.2 })).toBe(0.3)
  })
})
