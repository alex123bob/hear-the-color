import { afterEach, describe, expect, it, vi } from 'vitest'
import { SOUND_DEFAULT, canDescribe, loadSoundMode, saveSoundMode } from './soundMode'

const stubStorage = (store: Record<string, string>) =>
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => void (store[k] = v),
  })

afterEach(() => vi.unstubAllGlobals())

describe('sound mode storage', () => {
  it('defaults to both', () => {
    expect(SOUND_DEFAULT).toBe('both')
  })

  it('returns the default when nothing is stored', () => {
    stubStorage({})
    expect(loadSoundMode()).toBe('both')
  })

  it('returns the default for an invalid stored value', () => {
    stubStorage({ 'htc.soundMode': 'loud' })
    expect(loadSoundMode()).toBe('both')
  })

  it('returns the default when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadSoundMode()).toBe('both')
    expect(() => saveSoundMode('tones')).not.toThrow()
  })

  it('round-trips a saved mode', () => {
    stubStorage({})
    saveSoundMode('tones')
    expect(loadSoundMode()).toBe('tones')
  })
})

describe('describing is allowed per mode', () => {
  it('is off only in tones mode', () => {
    expect(canDescribe('tones')).toBe(false)
    expect(canDescribe('both')).toBe(true)
    expect(canDescribe('describe')).toBe(true)
  })
})
