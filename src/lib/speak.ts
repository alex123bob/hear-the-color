import { API_BASE } from './api'
import { language } from './i18n'
import { AI_VOICE, voicesForLanguage } from './voices'

// Speech comes from the backend (OpenAI TTS, natural voice) and is played through one <audio> element.
// Normally the MP3 arrives together with the description (/api/see with include_audio), so the caption and
// the voice start at the same moment; /api/speak is only used when that audio is missing.
// The clip is downloaded with fetch() and then played from a blob URL. Pointing <audio src> straight at the
// streamed response was tried, but some browsers stayed silent with it, and it only saved ~0.3 s because
// OpenAI finishes the clip about a second after its first bytes.
// If that fails (no network, blocked region, quota, autoplay refusal) we fall back to the robotic but
// always-available browser voice, so the app never goes silent.

// Playback speed of the natural voice. preservesPitch (default true) keeps it from sounding chipmunky.
const PLAYBACK_RATE = 1.5
// Speed-up for the browser voice; its scale is not the same as playbackRate, 1.4 is roughly comparable
const BROWSER_RATE = 1.4
// How long we wait for the audio to be generated, downloaded and started before giving up on the server voice
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

// Current voice choice (see voices.ts): AI_VOICE, or the voiceURI of a built-in voice
let voiceChoice = AI_VOICE

export function setVoiceChoice(choice: string) {
  voiceChoice = choice
  // A fresh choice of the AI voice deserves a fresh try, even after earlier server failures
  if (choice === AI_VOICE) serverFailures = 0
}

// The chosen built-in voice, or else the most natural-sounding one for the detected language
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  return voices.find((v) => v.voiceURI === voiceChoice) ?? voicesForLanguage(voices)[0]
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

// Play an MP3 blob on the shared element. Resolves when it has finished (or was stopped); rejects if it can't
// start or fails before any audio played, so the caller can fall back.
function playBlob(blob: Blob, el: HTMLAudioElement, settle: Settle): void {
  if (audioUrl) URL.revokeObjectURL(audioUrl)
  audioUrl = URL.createObjectURL(blob)
  el.onplaying = settle.started
  el.onended = settle.finish
  el.onerror = () => settle.fail(new Error('audio playback failed'))
  // Loading a new source resets playbackRate to defaultPlaybackRate, so set both
  el.defaultPlaybackRate = PLAYBACK_RATE
  el.src = audioUrl
  el.playbackRate = PLAYBACK_RATE
  el.play().catch(settle.fail)
}

interface Settle {
  started: () => void
  finish: () => void
  fail: (err: unknown) => void
}

// Play speech on the shared element: from audio we already have (sent along with the description), or
// otherwise fetched from /api/speak. Resolves when finished or stopped; rejects if it never started.
function playFromServer(text: string, ready?: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!audio) audio = new Audio()
    const el = audio
    const ctrl = new AbortController()
    controller = ctrl
    let started = false
    let settled = false

    const cleanup = () => {
      settled = true
      window.clearTimeout(timer)
      el.onplaying = null
      el.onended = null
      el.onerror = null
      if (finishCurrent === finish) finishCurrent = null
      if (controller === ctrl) controller = null
    }
    function finish() {
      if (settled) return
      cleanup()
      resolve()
    }
    const fail = (err: unknown) => {
      if (settled) return
      cleanup()
      ctrl.abort()
      // Audio already played (e.g. it broke near the end): treat it as done, don't repeat it
      if (started) resolve()
      else reject(err)
    }
    const settle: Settle = {
      started: () => {
        started = true
        window.clearTimeout(timer)
      },
      finish,
      fail,
    }
    const timer = window.setTimeout(() => fail(new Error('speech did not start in time')), SERVER_TTS_TIMEOUT_MS)
    // stopSpeaking() calls this, which resolves quietly so a Stop never falls through to the browser voice
    finishCurrent = finish

    if (ready) {
      playBlob(ready, el, settle)
      return
    }
    fetch(`${API_BASE}/api/speak?text=${encodeURIComponent(text)}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`speak failed: ${res.status}`)
        return res.blob()
      })
      .then((blob) => {
        if (!settled) playBlob(blob, el, settle)
      })
      .catch(fail)
  })
}

// Speak text aloud and resolve when it has finished (or was stopped), so callers can wait for it.
// audio: the MP3 the backend already generated with the description (/api/see include_audio). Played
// immediately; without it we fetch /api/speak, and if the server voice fails we use the browser voice.
export async function speak(text: string, audio?: Blob): Promise<void> {
  stopSpeaking()

  // A built-in voice was chosen: speak it straight away, ignoring any server audio
  if (voiceChoice !== AI_VOICE) {
    await speakWithBrowser(text)
    return
  }

  if (audio || serverFailures < MAX_SERVER_FAILURES) {
    // stopSpeaking() resolves this promise, so a Stop never falls through to the browser voice
    try {
      await playFromServer(text, audio)
      serverFailures = 0
      return
    } catch {
      serverFailures += 1
    }
  }

  await speakWithBrowser(text)
}

// Decode base64 audio from a JSON response into a playable blob; undefined if absent or malformed
export function audioFromBase64(data: unknown, format: unknown = 'mp3'): Blob | undefined {
  if (typeof data !== 'string' || !data) return undefined
  try {
    const bin = atob(data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: format === 'mp3' ? 'audio/mpeg' : `audio/${String(format)}` })
  } catch {
    return undefined
  }
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
