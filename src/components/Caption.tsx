import styles from '../App.module.css'

interface Props {
  text: string
}

export default function Caption({ text }: Props) {
  // role="status" with aria-live="off": the text is shown but NOT announced by screen readers.
  // The app speaks the AI description itself via TTS, so announcing it too would double-speak.
  // (role="status" is an implicit polite live region; aria-live="off" turns that off.)
  return (
    <div className={styles.caption} role="status" aria-live="off">
      {text || 'Tap "Start Listening" at the top right'}
    </div>
  )
}
