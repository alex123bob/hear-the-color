import styles from '../App.module.css'
import { t } from '../lib/i18n'
import type { CaptionKind } from '../hooks/useVisionLoop'

interface Props {
  text: string
  kind: CaptionKind
}

export default function Caption({ text, kind }: Props) {
  // role="status" with aria-live="off": the text is shown but NOT announced by screen readers.
  // The app speaks the AI description itself via TTS, so announcing it too would double-speak.
  // (role="status" is an implicit polite live region; aria-live="off" turns that off.)
  return (
    <div className={`${styles.caption} ${kind === 'result' ? '' : styles.statusText}`} role="status" aria-live="off">
      {text || t.idle}
    </div>
  )
}
