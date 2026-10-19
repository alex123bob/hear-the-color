import { API_BASE } from './api'
import { language } from './i18n'

// Speech comes from the backend (OpenAI TTS, natural voice) and is played through one <audio> element.
// The element streams /api/speak directly (GET), so playback starts on the first chunk of audio instead of
// after the whole file has been generated and downloaded.
// If that fails (no network, blocked region, quota, autoplay refusal) we fall back to the robotic but
// always-available browser voice, so the app never goes silent.

// Playback speed of the natural voice. preservesPitch (default true) keeps it from sounding chipmunky.
const PLAYBACK_RATE = 1.2
// Same speed-up for the browser voice (its scale differs slightly, 1.0 is normal)
const BROWSER_RATE = 1.15
// How long we wait for audio to start playing before giving up on the server voice
const SERVER_TTS_TIMEOUT_MS = 15000
// After this many failures in a row, skip the server for the rest of the session (re-armed on Start)
const MAX_SERVER_FAILURES = 2
// 44-byte silent WAV, played during the Start tap to unlock audio on mobile
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='

let audio: HTMLAudioElement | null = null
let serverFailures = 0
// Resolves the speak() currently in progress, so stopSpeaking() can end it immediately
let finishCurrent: (() => void) | null = null

// Mobile browsers (iOS Safari especially) only allow audio/speech that starts inside a user gesture. Our real
// speech starts seconds later, after network calls, so call this synchronously from the tap handler:
// playing a silent clip on the shared <audio> element unlocks it for later plays, and a silent utterance
// unlocks the browser voice used as fallback.
export function unlockSpeech() {
  serverFailures = 0
  if (!audio) audio = new Audio()
  audio.src = SILENT_WAV
  void audio.play().catch(() => undefined)
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(' ')
    utterance.volume = 0
    window.speechSynthesis.speak(utterance)
  }
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

// Browser voice. Resolves when the speech has finished (or failed / was cancelled)
function speakWithBrowser(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language
    utterance.rate = BROWSER_RATE
    const voice = pickVoice()
    if (voice) utterance.voice = voice

    // Some browsers never fire onend; this length-based fallback keeps the caller from hanging forever
    const timer = window.setTimeout(done, Math.max(5000, text.length * 120 + 3000))
    function done() {
      window.clearTimeout(timer)
      if (finishCurrent === done) finishCurrent = null
      resolve()
    }
    finishCurrent = done
    utterance.onend = done
    utterance.onerror = done

    window.speechSynthesis.speak(utterance)
  })
}

// Stream speech from the server on the shared element. Resolves when it has finished (or was stopped);
// rejects if it can't start in time or fails before any audio played, so the caller can fall back.
function playFromServer(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!audio) audio = new Audio()
    const el = audio
    let started = false

    const cleanup = () => {
      window.clearTimeout(timer)
      el.onplaying = null
      el.onended = null
      el.onerror = null
      if (finishCurrent === finish) finishCurrent = null
    }
    function finish() {
      cleanup()
      resolve()
    }
    const fail = (err: unknown) => {
      cleanup()
      el.removeAttribute('src')
      el.load()
      // Audio already played (e.g. the stream broke near the end): treat it as done, don't repeat it
      if (started) resolve()
      else reject(err)
    }
    const timer = window.setTimeout(() => fail(new Error('speech did not start in time')), SERVER_TTS_TIMEOUT_MS)

    finishCurrent = finish
    el.onplaying = () => {
      started = true
      window.clearTimeout(timer)
    }
    el.onended = finish
    // Also fires for HTTP errors (e.g. 500/429), since the element can't decode a JSON error body
    el.onerror = () => fail(new Error('audio playback failed'))

    // Loading a new source resets playbackRate to defaultPlaybackRate, so set both
    el.defaultPlaybackRate = PLAYBACK_RATE
    el.src = `${API_BASE}/api/speak?text=${encodeURIComponent(text)}`
    el.playbackRate = PLAYBACK_RATE
    el.play().catch(fail)
  })
}

// Speak text aloud and resolve when it has finished (or was stopped), so callers can wait for it
export async function speak(text: string): Promise<void> {
  stopSpeaking()

  if (serverFailures < MAX_SERVER_FAILURES) {
    // stopSpeaking() resolves this promise, so a Stop never falls through to the browser voice
    try {
      await playFromServer(text)
      serverFailures = 0
      return
    } catch {
      serverFailures += 1
    }
  }

  await speakWithBrowser(text)
}

export function stopSpeaking() {
  if (audio) {
    audio.pause()
    // Dropping the source also closes the streaming request
    audio.removeAttribute('src')
    audio.load()
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  // Release a pending speak() promise
  const finish = finishCurrent
  finishCurrent = null
  finish?.()
}
