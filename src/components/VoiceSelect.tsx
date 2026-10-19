import { useEffect, useState } from 'react'
import styles from '../App.module.css'
import { t } from '../lib/i18n'
import { AI_VOICE, isNaturalVoice, onVoicesReady, voicesForLanguage } from '../lib/voices'

interface Props {
  value: string
  onChange: (choice: string) => void
}

// Picks the voice: OpenAI's natural voice, or one of the device's built-in voices for the current language.
// A native <select> so screen readers and keyboards handle it without extra work.
export default function VoiceSelect({ value, onChange }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => onVoicesReady((all) => setVoices(voicesForLanguage(all))), [])

  // A remembered built-in voice that this device doesn't have (or doesn't have yet) shows as the AI voice
  const known = value === AI_VOICE || voices.some((v) => v.voiceURI === value)

  return (
    <label className={styles.voiceLabel}>
      <span className={styles.srOnly}>{t.voiceLabel}</span>
      <select
        className={styles.voiceSelect}
        value={known ? value : AI_VOICE}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t.voiceLabel}
      >
        <option value={AI_VOICE}>{t.voiceAi}</option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {isNaturalVoice(v) ? '★ ' : ''}
            {v.name}
            {/* Same name in another locale (e.g. en-GB and en-US): show the locale to tell them apart */}
            {voices.some((o) => o !== v && o.name === v.name) ? ` (${v.lang})` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
