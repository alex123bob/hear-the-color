import styles from '../App.module.css'

interface Props {
  isRunning: boolean
  onToggle: () => void
}

export default function ControlButton({ isRunning, onToggle }: Props) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onToggle}
      aria-pressed={isRunning}
    >
      {isRunning ? '停止' : '开始聆听'}
    </button>
  )
}
