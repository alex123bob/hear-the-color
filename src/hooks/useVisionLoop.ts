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
  // 上一次请求还没返回时跳过本次 tick，避免请求堆积
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!isRunning) return
    // 防止 effect 清理后异步回调还在改状态
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
          setCaption('请求太频繁，请稍等一下')
        } else {
          setCaption('网络好像出了点问题')
        }
      } catch {
        if (!cancelled) setCaption('网络好像出了点问题')
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
        void tick() // 启动后立即识别一次，不必等 4 秒
        timerRef.current = window.setInterval(tick, INTERVAL_MS)
      } catch {
        if (!cancelled) {
          setError('无法打开摄像头，请检查权限（手机需要 HTTPS）')
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
