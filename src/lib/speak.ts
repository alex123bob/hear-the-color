import { API_BASE } from './api'
import { language } from './i18n'

// Speech comes from the backend (OpenAI TTS, natural voice) and is played through one <audio> element.
// If that fails (no network, blocked region, quota, autoplay refusal) we fall back to the robotic but
// always-available browser voice, so the app never goes silent.

const SERVER_TTS_TIMEOUT_MS = 15000
// After this many failures in a row, skip the server for the rest of the session (re-armed on Start)
const MAX_SERVER_FAILURES = 2
// 44-byte silent WAV, played during the Start tap to unlock audio on mobile
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='

let audio: HTMLAudioElement | null = null
let audioUrl: string | null = null
let controller: AbortController | null = null
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
    utterance.rate = 1.05
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

// Play an MP3 on the shared element; rejects if playback cannot start or fails
function playAudio(blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!audio) audio = new Audio()
    const el = audio
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    audioUrl = URL.createObjectURL(blob)

    function done() {
      el.onended = null
      el.onerror = null
      if (finishCurrent === done) finishCurrent = null
      resolve()
    }
    finishCurrent = done
    el.onended = done
    el.onerror = () => {
      el.onended = null
      el.onerror = null
      if (finishCurrent === done) finishCurrent = null
      reject(new Error('audio playback failed'))
    }
    el.src = audioUrl
    el.play().catch((err) => {
      el.onended = null
      el.onerror = null
      if (finishCurrent === done) finishCurrent = null
      reject(err)
    })
  })
}

// Speak text aloud and resolve when it has finished (or was stopped), so callers can wait for it
export async function speak(text: string): Promise<void> {
  stopSpeaking()

  if (serverFailures < MAX_SERVER_FAILURES) {
    const ctrl = new AbortController()
    controller = ctrl
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      ctrl.abort()
    }, SERVER_TTS_TIMEOUT_MS)
    try {
      const res = await fetch(`${API_BASE}/api/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`speak failed: ${res.status}`)
      const blob = await res.blob()
      window.clearTimeout(timer)
      if (ctrl.signal.aborted) return
      await playAudio(blob)
      serverFailures = 0
      return
    } catch {
      window.clearTimeout(timer)
      // Stopped by the user (not by our timeout): stay silent
      if (ctrl.signal.aborted && !timedOut) return
      serverFailures += 1
    } finally {
      if (controller === ctrl) controller = null
    }
  }

  await speakWithBrowser(text)
}

export function stopSpeaking() {
  controller?.abort()
  controller = null
  if (audio) audio.pause()
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  // Release a pending speak() promise
  const finish = finishCurrent
  finishCurrent = null
  finish?.()
}
