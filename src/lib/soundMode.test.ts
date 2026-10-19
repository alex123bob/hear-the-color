import { afterEach, describe, expect, it, vi } from 'vitest'
import { SOUND_DEFAULT, loadSoundMode, saveSoundMode } from './soundMode'

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
