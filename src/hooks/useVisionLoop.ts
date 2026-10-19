import { useEffect, useRef, useState, type RefObject } from 'react'
import axios from 'axios'
import { captureFrame } from '../lib/capture'
import { audioFromBase64, speak, stopSpeaking } from '../lib/speak'
import { language, t } from '../lib/i18n'
import { API_BASE } from '../lib/api'
import { sampleZones } from '../lib/colorSense'
import type { SoundMode } from '../lib/soundMode'
import { duck, startTones, stopTones, updateTones } from '../lib/tones'

// Pause after the description has been spoken, before looking again
const PAUSE_AFTER_SPEECH_MS = 500
// Wait after a failed request so we don't hammer the backend
const RETRY_DELAY_MS = 4000
// The video may not have a frame yet right after the camera starts
const NO_FRAME_DELAY_MS = 300
// Shown if the AI is still working this long after the upload finished
const STILL_WORKING_AFTER_MS = 8000
// How often the camera colors are turned into tones
const TONE_UPDATE_MS = 100
// Idle check interval while in tones-only mode, so a switch to a describing mode is noticed quickly
const TONES_ONLY_IDLE_MS = 300
// Set once the spoken explanation of the tones has been heard on this device
const TONE_INTRO_KEY = 'htc.toneIntroSeen'

function toneIntroSeen(): boolean {
  try {
    return localStorage.getItem(TONE_INTRO_KEY) === '1'
  } catch {
    return false
  }
}

function markToneIntroSeen() {
  try {
    localStorage.setItem(TONE_INTRO_KEY, '1')
  } catch {
    // Blocked storage: it will be explained again next time
  }
}

export type CaptionKind = 'status' | 'result' | 'error'

interface Options {
  videoRef: RefObject<HTMLVideoElement>
  isRunning: boolean
  // Ask the backend for spoken audio along with the description (only needed for the AI voice)
  wantAudio: boolean
  soundMode: SoundMode
}

export function useVisionLoop({ videoRef, isRunning, wantAudio, soundMode }: Options) {
  // kind: 'result' is the AI description (spoken); 'status' and 'error' are shown only, never spoken
  const [caption, setCaptionState] = useState<{ text: string; kind: CaptionKind }>({
    text: '',
    kind: 'status',
  })
  const setCaption = (text: string, kind: CaptionKind = 'status') => setCaptionState({ text, kind })
  const streamRef = useRef<MediaStream | null>(null)
  // Read inside the loop, so changing the voice takes effect on the next frame without restarting the camera
  const wantAudioRef = useRef(wantAudio)
  wantAudioRef.current = wantAudio
  // Same for the sound mode: a live switch applies on the next loop pass
  const soundModeRef = useRef(soundMode)
  soundModeRef.current = soundMode
  const tonesOn = soundMode !== 'describe'

  // Color tones: sample the camera ~10x a second while running. A separate effect from the describe loop, so
  // switching the mode starts or stops the tones at once without restarting the camera.
  useEffect(() => {
    if (!isRunning || !tonesOn) return
    startTones()
    const timer = window.setInterval(() => {
      const video = videoRef.current
      const zones = video ? sampleZones(video) : null
      if (zones) updateTones(zones)
    }, TONE_UPDATE_MS)
    return () => {
      window.clearInterval(timer)
      stopTones()
    }
  }, [isRunning, tonesOn, videoRef])

  useEffect(() => {
    if (!isRunning) return
    // Stops the loop and any async callbacks once the effect has been cleaned up
    let cancelled = false
    // Lets cleanup cancel an in-flight upload/request
    let abort: AbortController | null = null
    // Lets cleanup wake a pending sleep so the loop exits immediately
    let wake: (() => void) | null = null

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, ms)
        wake = () => {
          window.clearTimeout(timer)
          resolve()
        }
      })

    // Send one frame to the backend; returns the description (and its speech when the server could make it),
    // or null after showing an error caption
    const describe = async (image: string): Promise<{ text: string; audio?: Blob } | null> => {
      // Status messages are shown but never spoken; only the AI description goes to speak()
      setCaption(t.sending)
      let stillWorkingTimer: number | undefined
      abort = new AbortController()
      try {
        const res = await axios.post(
          `${API_BASE}/api/see`,
          // include_audio: the backend speaks the description too, so text and voice arrive together
          { image, lang: language, include_audio: wantAudioRef.current },
          {
            signal: abort.signal,
            // Handle HTTP errors ourselves instead of having axios throw
            validateStatus: () => true,
            // Fires as the request body leaves the browser; 100% means every byte was handed to the network
            // (the server only confirms receipt with its response)
            onUploadProgress: (e) => {
              if (cancelled || !e.total || e.loaded < e.total || stillWorkingTimer !== undefined) return
              setCaption(t.analyzing)
              // Measured from the end of the upload, so it reflects how long the AI has taken
              stillWorkingTimer = window.setTimeout(
                () => !cancelled && setCaption(t.stillWorking),
                STILL_WORKING_AFTER_MS,
              )
            },
          },
        )
        if (cancelled) return null
        if (res.status >= 200 && res.status < 300 && res.data?.text) {
          return {
            text: res.data.text as string,
            // Missing when speech failed on the server (audio_error); speak() then falls back
            audio: audioFromBase64(res.data.audio, res.data.audio_format),
          }
        }
        setCaption(res.status === 429 ? t.tooMany : t.networkError, 'error')
      } catch (err) {
        // Aborted on Stop/unmount: stay quiet. Anything else is a network failure.
        if (!cancelled && !axios.isCancel(err)) setCaption(t.networkError, 'error')
      } finally {
        window.clearTimeout(stillWorkingTimer)
      }
      return null
    }

    // Once per device, in the mode that plays tones, say what the tones mean before the first description
    const explainTones = async () => {
      if (soundModeRef.current !== 'both' || toneIntroSeen()) return
      setCaption(t.toneIntro)
      duck(true)
      try {
        await speak(t.toneIntro)
      } finally {
        duck(false)
      }
      if (!cancelled) markToneIntroSeen()
    }

    // Sequential loop: look -> describe -> speak until finished -> pause -> look again.
    // The next frame is only captured after the previous description has been read out.
    const loop = async () => {
      // Tones-only mode shows the explanation once per pass in that mode
      let tonesCaptionShown = false
      while (!cancelled) {
        if (soundModeRef.current === 'tones') {
          // No AI calls and no speech: the tones are the whole experience
          if (!tonesCaptionShown) {
            setCaption(t.toneIntro)
            tonesCaptionShown = true
          }
          await sleep(TONES_ONLY_IDLE_MS)
          continue
        }
        tonesCaptionShown = false
        const video = videoRef.current
        const image = video ? captureFrame(video) : null
        if (!image) {
          await sleep(NO_FRAME_DELAY_MS)
          continue
        }
        await explainTones()
        if (cancelled) return
        const result = await describe(image)
        if (cancelled) return
        if (result) {
          // Caption and voice start together: the audio is already here, so playback begins right away
          setCaption(result.text, 'result')
          // Tones dip while the sentence is spoken; the finally means a cancelled speech can't leave them low
          duck(true)
          try {
            await speak(result.text, result.audio)
          } finally {
            duck(false)
          }
          await sleep(PAUSE_AFTER_SPEECH_MS)
        } else {
          await sleep(RETRY_DELAY_MS)
        }
      }
    }

    const start = async () => {
      setCaption(t.cameraStarting)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
        void loop()
      } catch {
        if (!cancelled) {
          setCaption(t.cameraError, 'error')
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      abort?.abort()
      wake?.()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      // Cancelling also fires the pending speak() promise, so the loop can exit
      stopSpeaking()
    }
  }, [isRunning, videoRef])

  return { caption: caption.text, kind: caption.kind }
}
