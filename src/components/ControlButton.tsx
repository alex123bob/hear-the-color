import styles from '../App.module.css'

interface Props {
  isRunning: boolean
  onToggle: () => void
}

export default function ControlButton({ isRunning, onToggle }: Props) {
  const handleClick = () => {
    // Haptic feedback; navigator.vibrate is missing on iOS Safari, so guard it
    if ('vibrate' in navigator) navigator.vibrate(50)
    onToggle()
  }

  // The label changes with the state, so aria-pressed is omitted to avoid announcing the state twice
  return (
    <button
      type="button"
      className={styles.button}
      onClick={handleClick}
      aria-label={
        isRunning
          ? 'Stop listening. The phone will stop describing the scene in front of you.'
          : 'Start listening. The phone will describe the scene in front of you.'
      }
    >
      {isRunning ? 'Stop' : 'Start Listening'}
    </button>
  )
}
