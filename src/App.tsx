import { useEffect, useRef, useState } from 'react'
import CameraView from './components/CameraView'
import ControlButton from './components/ControlButton'
import Caption from './components/Caption'
import VoiceSelect from './components/VoiceSelect'
import { useVisionLoop } from './hooks/useVisionLoop'
import { t } from './lib/i18n'
import { setVoiceChoice } from './lib/speak'
import { AI_VOICE, loadVoiceChoice, saveVoiceChoice } from './lib/voices'
import styles from './App.module.css'

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [voice, setVoice] = useState(loadVoiceChoice)
  const { caption, kind } = useVisionLoop({ videoRef, isRunning, wantAudio: voice === AI_VOICE })

  useEffect(() => {
    setVoiceChoice(voice)
    saveVoiceChoice(voice)
  }, [voice])

  return (
    <main role="main" className={styles.app}>
      <h1 className={styles.srOnly}>Hear the Color</h1>
      <p className={styles.srOnly}>{t.intro}</p>
      <CameraView videoRef={videoRef} />
      <div className={styles.top}>
        <ControlButton isRunning={isRunning} onToggle={() => setIsRunning((v) => !v)} />
      </div>
      <div className={styles.topLeft}>
        <VoiceSelect value={voice} onChange={setVoice} />
      </div>
      <Caption text={caption} kind={kind} />
    </main>
  )
}
