import { useEffect, useRef, useState, type RefObject } from 'react'
import { captureFrame } from '../lib/capture'
import { speak, stopSpeaking } from '../lib/speak'

const INTERVAL_MS = 4000
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

interface Options {
  videoRef: RefObject<HTMLVideoElement>
  isRunning: boolean
}

export function useVisionLoop({ videoRef, isRunning }: Options) {
  const [caption, setCaption] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  // Skip a tick while the previous request is still in flight, so requests don't pile up
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!isRunning) return
    // Stops async callbacks from touching state after the effect has been cleaned up
    let cancelled = false

    const tick = async () => {
      const video = videoRef.current
      if (!video || inFlightRef.current) return
      const image = captureFrame(video)
      if (!image) return
      inFlightRef.current = true
      setIsLoading(true)
      try {
        const res = await fetch(`${API_BASE}/api/see`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image }),
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && data.text) {
          setCaption(data.text)
          speak(data.text)
        } else if (res.status === 429) {
          setCaption('Too many requests, please wait a moment')
        } else {
          setCaption('Network seems to have an issue')
        }
      } catch {
        if (!cancelled) setCaption('Network seems to have an issue')
      } finally {
        inFlightRef.current = false
        if (!cancelled) setIsLoading(false)
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
        void tick() // Run once right away instead of waiting 4 seconds
        timerRef.current = window.setInterval(tick, INTERVAL_MS)
      } catch {
        if (!cancelled) {
          setError('Cannot open the camera. Check permissions (phones require HTTPS)')
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      inFlightRef.current = false
      setIsLoading(false)
      stopSpeaking()
    }
  }, [isRunning, videoRef])

  return { caption, isLoading, error }
}
