import styles from '../App.module.css'
import { unlockSpeech } from '../lib/speak'
import { t } from '../lib/i18n'

interface Props {
  isRunning: boolean
  onToggle: () => void
}

export default function ControlButton({ isRunning, onToggle }: Props) {
  const handleClick = () => {
    // Haptic feedback; navigator.vibrate is missing on iOS Safari, so guard it
    if ('vibrate' in navigator) navigator.vibrate(50)
    // Must happen inside this tap, or mobile browsers will block the spoken description later
    if (!isRunning) unlockSpeech()
    onToggle()
  }

  // The label changes with the state, so aria-pressed is omitted to avoid announcing the state twice
  return (
    <button
      type="button"
      className={`${styles.button} ${isRunning ? styles.buttonOn : ''}`}
      onClick={handleClick}
      aria-label={isRunning ? t.stopLabel : t.startLabel}
    >
      {isRunning ? (
        <>
          <span className={styles.bars} aria-hidden="true">
            <i /><i /><i /><i />
          </span>
          {t.stop}
        </>
      ) : (
        <>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
          {t.start}
        </>
      )}
    </button>
  )
}
