import type { RefObject } from 'react'
import styles from '../App.module.css'

export default function CameraView({ videoRef }: { videoRef: RefObject<HTMLVideoElement> }) {
  return (
    <video
      ref={videoRef}
      className={styles.video}
      autoPlay
      playsInline
      muted
      aria-hidden="true"
    />
  )
}
