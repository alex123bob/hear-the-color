import { describe, expect, it } from 'vitest'
import { CHANGE_THRESHOLD, FORCE_REFRESH_MS, isSpeakable, shouldDescribe } from './changeGate'

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
