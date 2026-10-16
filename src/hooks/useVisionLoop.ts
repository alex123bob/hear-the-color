import { useEffect, useRef, useState, type RefObject } from 'react'
import { captureFrame } from '../lib/capture'
import { speak, stopSpeaking } from '../lib/speak'

// Pause after the description has been spoken, before looking again
const PAUSE_AFTER_SPEECH_MS = 500
// Wait after a failed request so we don't hammer the backend
const RETRY_DELAY_MS = 4000
// The video may not have a frame yet right after the camera starts
const NO_FRAME_DELAY_MS = 300
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

interface Options {
  videoRef: RefObject<HTMLVideoElement>
  isRunning: boolean
}

export function useVisionLoop({ videoRef, isRunning }: Options) {
  const [caption, setCaption] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!isRunning) return
    // Stops the loop and any async callbacks once the effect has been cleaned up
    let cancelled = false
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

    // Send one frame to the backend; returns the description, or null after showing an error caption
    const describe = async (image: string): Promise<string | null> => {
      setIsLoading(true)
      try {
        const res = await fetch(`${API_BASE}/api/see`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return null
        if (res.ok && data.text) return data.text as string
        setCaption(
          res.status === 429
            ? 'Too many requests, please wait a moment'
            : 'Network seems to have an issue',
        )
      } catch {
        if (!cancelled) setCaption('Network seems to have an issue')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
      return null
    }

    // Sequential loop: look -> describe -> speak until finished -> pause -> look again.
    // The next frame is only captured after the previous description has been read out.
    const loop = async () => {
      while (!cancelled) {
        const video = videoRef.current
        const image = video ? captureFrame(video) : null
        if (!image) {
          await sleep(NO_FRAME_DELAY_MS)
          continue
        }
        const text = await describe(image)
        if (cancelled) return
        if (text) {
          setCaption(text)
          await speak(text)
          await sleep(PAUSE_AFTER_SPEECH_MS)
        } else {
          await sleep(RETRY_DELAY_MS)
        }
      }
    }

    const start = async () => {
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
        setError('')
        void loop()
      } catch {
        if (!cancelled) {
          setError('Cannot open the camera. Check permissions (phones require HTTPS)')
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      wake?.()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      setIsLoading(false)
      // Cancelling also fires the pending speak() promise, so the loop can exit
      stopSpeaking()
    }
  }, [isRunning, videoRef])

  return { caption, isLoading, error }
}
