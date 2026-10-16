import { useRef, useState } from 'react'
import CameraView from './components/CameraView'
import ControlButton from './components/ControlButton'
import Caption from './components/Caption'
import { useVisionLoop } from './hooks/useVisionLoop'
import { t } from './lib/i18n'
import styles from './App.module.css'

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isRunning, setIsRunning] = useState(false)
  const { caption } = useVisionLoop({ videoRef, isRunning })

  return (
    <main role="main" className={styles.app}>
      <h1 className={styles.srOnly}>Hear the Color</h1>
      <p className={styles.srOnly}>{t.intro}</p>
      <CameraView videoRef={videoRef} />
      <div className={styles.top}>
        <ControlButton isRunning={isRunning} onToggle={() => setIsRunning((v) => !v)} />
      </div>
      <Caption text={caption} />
    </main>
  )
}
