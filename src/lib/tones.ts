import { NEUTRAL_SATURATION, type Zone, type Zones } from './colorSense'

// Color as sound: hue sets pitch, brightness sets loudness, left/center/right pans the three zones.
// Warm hues sit low and cool hues high, within one octave of a pentatonic scale so mixed colors stay consonant.

// Master volume cap: three zones at full brightness add up to this
const MASTER_GAIN = 0.15
const ZONE_GAIN = MASTER_GAIN / 3
// Neutral zones (gray, black, white) hum low and almost silent instead of droning
const NEUTRAL_FREQUENCY = 110
const NEUTRAL_MAX_GAIN = 0.01
// Pentatonic degrees over one octave starting at 220 Hz (A3): A C D E G, then back to A at 440 Hz
const SCALE_RATIOS = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5]
const BASE_FREQUENCY = 220
// While speech plays the tones dip to this fraction of their volume (not silent)
const DUCK_LEVEL = 0.15
const DUCK_DOWN_SECONDS = 0.15
const DUCK_UP_SECONDS = 0.3
// Time constant for smoothing frequency/gain changes, so updates don't click
const SMOOTHING_SECONDS = 0.08

// Hue in degrees (any value; wraps) to a frequency between 220 and 440 Hz
export function hueToFrequency(hue: number): number {
  const wrapped = ((hue % 360) + 360) % 360
  const step = Math.floor((wrapped / 360) * SCALE_RATIOS.length)
  return BASE_FREQUENCY * SCALE_RATIOS[step]
}

export function zoneToTone(z: Zone): { frequency: number; gain: number } {
  if (z.saturation < NEUTRAL_SATURATION) {
    return { frequency: NEUTRAL_FREQUENCY, gain: Math.min(NEUTRAL_MAX_GAIN, z.brightness * NEUTRAL_MAX_GAIN) }
  }
  return { frequency: hueToFrequency(z.hue), gain: z.brightness * ZONE_GAIN }
}

// ---- Web Audio engine. Every function is a no-op when Web Audio is missing or throws. ----

const PANS = [-1, 0, 1] as const

interface Voice {
  osc: OscillatorNode
  gain: GainNode
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let voices: Voice[] = []

function getContext(): AudioContext | null {
  if (ctx) return ctx
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor) ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

// Mobile browsers (iOS especially) only start audio inside a user gesture: call this synchronously from the
// Start tap, like unlockSpeech() does for speech.
export function unlockTones() {
  try {
    void getContext()?.resume()
  } catch {
    // Not supported: tones stay off
  }
}

export function startTones() {
  const c = getContext()
  if (!c || voices.length) return
  try {
    void c.resume()
    master = c.createGain()
    master.gain.value = 1
    master.connect(c.destination)
    voices = PANS.map((pan) => {
      const osc = c.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = NEUTRAL_FREQUENCY
      const gain = c.createGain()
      gain.gain.value = 0
      const panner = c.createStereoPanner()
      panner.pan.value = pan
      osc.connect(gain).connect(panner).connect(master as GainNode)
      osc.start()
      return { osc, gain }
    })
  } catch {
    stopTones()
  }
}

export function updateTones(zones: Zones) {
  if (!ctx || !voices.length) return
  const now = ctx.currentTime
  ;[zones.left, zones.center, zones.right].forEach((zone, i) => {
    const tone = zoneToTone(zone)
    voices[i].osc.frequency.setTargetAtTime(tone.frequency, now, SMOOTHING_SECONDS)
    voices[i].gain.gain.setTargetAtTime(tone.gain, now, SMOOTHING_SECONDS)
  })
}

// Dip the tones while a sentence is spoken, bring them back afterwards
export function duck(on: boolean) {
  if (!ctx || !master) return
  const now = ctx.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setTargetAtTime(on ? DUCK_LEVEL : 1, now, (on ? DUCK_DOWN_SECONDS : DUCK_UP_SECONDS) / 3)
}

// Silence everything and reset ducking; safe to call twice
export function stopTones() {
  voices.forEach(({ osc, gain }) => {
    try {
      gain.gain.cancelScheduledValues(0)
      gain.gain.value = 0
      osc.stop()
      osc.disconnect()
      gain.disconnect()
    } catch {
      // Already stopped
    }
  })
  voices = []
  try {
    master?.disconnect()
  } catch {
    // Already disconnected
  }
  master = null
}
