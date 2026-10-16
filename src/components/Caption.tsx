import styles from '../App.module.css'

interface Props {
  text: string
  isLoading: boolean
}

export default function Caption({ text, isLoading }: Props) {
  // aria-live makes screen readers announce the text whenever it changes
  return (
    <div className={styles.caption} role="status" aria-live="polite">
      {isLoading ? 'Looking...' : text || 'Tap "Start Listening" at the top right'}
    </div>
  )
}
