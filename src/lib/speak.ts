import { language } from './i18n'

// Mobile browsers (iOS Safari especially) only allow speech that starts inside a user gesture. Our real
// speech happens seconds later, after a network call, so call this synchronously from the tap handler:
// a silent utterance there unlocks speechSynthesis for the rest of the page's life.
export function unlockSpeech() {
  if (!('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(' ')
  utterance.volume = 0
  window.speechSynthesis.speak(utterance)
}

// Prefer a voice for the detected language explicitly; some mobile browsers have no default for the
// requested lang. Some platforms report tags with underscores (e.g. zh_CN).
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const norm = (s: string) => s.replace('_', '-').toLowerCase()
  const want = norm(language)
  const primary = want.split('-')[0]
  return (
    voices.find((v) => norm(v.lang) === want) ?? voices.find((v) => norm(v.lang).split('-')[0] === primary)
  )
}

// Read text aloud with the browser TTS. Resolves when the speech has finished (or failed / was cancelled),
// so callers can wait for it before starting the next step.
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }
    // Cancel anything still playing before starting
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language
    utterance.rate = 1.05
    const voice = pickVoice()
    if (voice) utterance.voice = voice

    // Some browsers never fire onend; this length-based fallback keeps the caller from hanging forever
    const timer = window.setTimeout(done, Math.max(5000, text.length * 120 + 3000))
    function done() {
      window.clearTimeout(timer)
      resolve()
    }
    utterance.onend = done
    utterance.onerror = done

    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}
