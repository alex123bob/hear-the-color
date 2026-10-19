import styles from '../App.module.css'
import { t } from '../lib/i18n'
import type { SoundMode } from '../lib/soundMode'

interface Props {
  value: SoundMode
  onChange: (mode: SoundMode) => void
}

// Picks how much sound there is: voice only, voice and tones, or tones only.
// A native <select> so screen readers and keyboards handle it without extra work.
export default function SoundSelect({ value, onChange }: Props) {
  return (
    <label className={styles.voiceLabel}>
      <span className={styles.srOnly}>{t.soundLabel}</span>
      <select
        className={styles.voiceSelect}
        value={value}
        onChange={(e) => onChange(e.target.value as SoundMode)}
        aria-label={t.soundLabel}
      >
        <option value="describe">{t.soundDescribe}</option>
        <option value="both">{t.soundBoth}</option>
        <option value="tones">{t.soundTones}</option>
      </select>
    </label>
  )
}
