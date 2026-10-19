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
    <main role="main" className={`${styles.app} ${isRunning ? styles.running : ''}`}>
      <div className={styles.backdrop} aria-hidden="true" />
      <CameraView videoRef={videoRef} />
      <div className={styles.scrim} aria-hidden="true" />
      <p className={styles.srOnly}>{t.intro}</p>
      {/* Start/Stop comes first in the DOM, so it is also first in Tab and screen-reader order;
          CSS places the bottom stack at the bottom of the screen */}
      <div className={styles.bottom}>
        <ControlButton isRunning={isRunning} onToggle={() => setIsRunning((v) => !v)} />
        <Caption text={caption} kind={kind} />
      </div>
      <header className={styles.topBar}>
        <h1 className={styles.brand}>Hear the Color</h1>
        <VoiceSelect value={voice} onChange={setVoice} />
      </header>
    </main>
  )
}
