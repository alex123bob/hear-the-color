// How much of the sound layer is on. Remembered per device (localStorage), like the voice choice.
//   describe: spoken descriptions only (no tones)
//   both:     tones plus spoken descriptions
//   tones:    tones only (no AI calls, no speech)
export type SoundMode = 'describe' | 'both' | 'tones'

export const SOUND_DEFAULT: SoundMode = 'both'
const STORAGE_KEY = 'htc.soundMode'
const MODES: readonly string[] = ['describe', 'both', 'tones']

export function loadSoundMode(): SoundMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored && MODES.includes(stored) ? (stored as SoundMode) : SOUND_DEFAULT
  } catch {
    return SOUND_DEFAULT
  }
}

export function saveSoundMode(mode: SoundMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Private mode or blocked storage: the choice still applies for this session
  }
}

// Tones-only mode makes no AI calls and no speech
export function canDescribe(mode: SoundMode): boolean {
  return mode !== 'tones'
}
