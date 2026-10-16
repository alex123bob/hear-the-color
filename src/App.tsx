import { useRef, useState } from 'react'
import CameraView from './components/CameraView'
import ControlButton from './components/ControlButton'
import Caption from './components/Caption'
import { useVisionLoop } from './hooks/useVisionLoop'
import styles from './App.module.css'

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isRunning, setIsRunning] = useState(false)
  const { caption, isLoading, error } = useVisionLoop({ videoRef, isRunning })

  return (
    <div className={styles.app}>
      <CameraView videoRef={videoRef} />
      <div className={styles.top}>
        <ControlButton isRunning={isRunning} onToggle={() => setIsRunning((v) => !v)} />
      </div>
      <Caption text={error || caption} isLoading={isLoading && !error} />
    </div>
  )
}
