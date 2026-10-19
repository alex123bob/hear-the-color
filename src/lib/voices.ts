import { language } from './i18n'

// Voice choice: 'ai' is OpenAI's natural voice through the backend; otherwise the voiceURI of a built-in
// browser voice. Remembered per device (localStorage), so a user picks it once.
export const AI_VOICE = 'ai'
const STORAGE_KEY = 'htc.voice'

export function loadVoiceChoice(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || AI_VOICE
  } catch {
    return AI_VOICE
  }
}

export function saveVoiceChoice(choice: string) {
  try {
    localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Private mode or blocked storage: the choice still applies for this session
  }
}

// Built-in voices that usually sound natural, guessed from their names. It is only a heuristic: browsers
// don't report quality, but these naming patterns are reliable on Apple, Chrome and Edge.
const NATURAL_HINTS = [
  /\b(enhanced|premium|natural|neural)\b/i, // Apple downloadable voices, Microsoft Edge online voices
  /^google\b/i, // Chrome's online voices
  /\b(samantha|ava|zoe|allison|susan|tom|evan|nathan|daniel|serena|karen|moira|tessa|kate|oliver|lee)\b/i,
  /\b(siri)\b/i,
]

export function isNaturalVoice(v: SpeechSynthesisVoice): boolean {
  return NATURAL_HINTS.some((re) => re.test(v.name))
}

const norm = (s: string) => s.replace('_', '-').toLowerCase()

// Voices for the detected language, natural-sounding ones first, then local before network voices
export function voicesForLanguage(all: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const primary = norm(language).split('-')[0]
  const want = norm(language)
  return all
    .filter((v) => norm(v.lang).split('-')[0] === primary)
    .sort(
      (a, b) =>
        Number(isNaturalVoice(b)) - Number(isNaturalVoice(a)) ||
        Number(norm(b.lang) === want) - Number(norm(a.lang) === want) ||
        a.name.localeCompare(b.name),
    )
}

// The browser loads its voice list asynchronously (Chrome returns [] at first), so wait for voiceschanged
export function onVoicesReady(cb: (voices: SpeechSynthesisVoice[]) => void): () => void {
  if (!('speechSynthesis' in window)) {
    cb([])
    return () => undefined
  }
  const update = () => cb(window.speechSynthesis.getVoices())
  update()
  window.speechSynthesis.addEventListener('voiceschanged', update)
  return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
}
