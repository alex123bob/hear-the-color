// Cheap color analysis of a camera frame, done in the browser so the tones can follow the camera ~10x a second.
// The frame is drawn onto a tiny canvas (never the 768px upload frame) and split into equal thirds of the
// width (full height): left, center, right.

export interface Zone {
  // 0-360
  hue: number
  // 0-1
  saturation: number
  // 0-1
  brightness: number
}

export interface Zones {
  left: Zone
  center: Zone
  right: Zone
}

// Below this saturation a zone counts as neutral (gray/black/white): its hue means nothing
export const NEUTRAL_SATURATION = 0.15
// The frame is sampled on a SAMPLE_SIZE x SAMPLE_SIZE canvas
const SAMPLE_SIZE = 32
const HUE_BINS = 12
const BIN_DEGREES = 360 / HUE_BINS

const NEUTRAL_ZONE: Zone = { hue: 0, saturation: 0, brightness: 0 }

// RGB 0-255 to HSV: hue 0-360, saturation and value 0-1
function toHsv(r: number, g: number, b: number): Zone {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let hue = 0
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6
    else if (max === g) hue = (b - r) / delta + 2
    else hue = (r - g) / delta + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  return { hue, saturation: max === 0 ? 0 : delta / max, brightness: max / 255 }
}

interface Accumulator {
  count: number
  saturation: number
  brightness: number
  // Per hue bin: total weight (saturation) and weight x hue. Hue is averaged inside one bin only, so the
  // 359 -> 0 wrap-around never produces a bogus mid-circle hue.
  weight: number[]
  hueSum: number[]
}

const newAccumulator = (): Accumulator => ({
  count: 0,
  saturation: 0,
  brightness: 0,
  weight: new Array<number>(HUE_BINS).fill(0),
  hueSum: new Array<number>(HUE_BINS).fill(0),
})

function summarize(acc: Accumulator): Zone {
  if (acc.count === 0) return { ...NEUTRAL_ZONE }
  let best = 0
  for (let i = 1; i < HUE_BINS; i++) if (acc.weight[i] > acc.weight[best]) best = i
  const hue = acc.weight[best] > 0 ? acc.hueSum[best] / acc.weight[best] : 0
  return { hue, saturation: acc.saturation / acc.count, brightness: acc.brightness / acc.count }
}

// Pure: RGBA pixels (row-major) to the three zones
export function analyzePixels(rgba: Uint8ClampedArray, width: number, height: number): Zones {
  const accs = [newAccumulator(), newAccumulator(), newAccumulator()]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const px = toHsv(rgba[i], rgba[i + 1], rgba[i + 2])
      const acc = accs[Math.min(2, Math.floor((x * 3) / width))]
      acc.count += 1
      acc.saturation += px.saturation
      acc.brightness += px.brightness
      const bin = Math.min(HUE_BINS - 1, Math.floor(px.hue / BIN_DEGREES))
      acc.weight[bin] += px.saturation
      acc.hueSum[bin] += px.saturation * px.hue
    }
  }
  return { left: summarize(accs[0]), center: summarize(accs[1]), right: summarize(accs[2]) }
}

// Mean absolute RGB difference between two frames of the same size, 0 (identical) to 1 (black vs white).
// Frames of different sizes count as completely different.
export function frameDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length || a.length === 0) return 1
  let total = 0
  let samples = 0
  for (let i = 0; i < a.length; i += 4) {
    total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    samples += 3
  }
  return total / (samples * 255)
}

// Mean absolute RGB difference per zone (equal thirds of a `width`-pixel-wide frame). A small object entering
// one side barely moves the whole-frame average but clearly changes its own third, and the zone tells where.
export function zoneDifference(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number): Record<keyof Zones, number> {
  if (a.length !== b.length || a.length === 0 || width <= 0) return { left: 1, center: 1, right: 1 }
  const sums = [0, 0, 0]
  const counts = [0, 0, 0]
  for (let i = 0; i < a.length; i += 4) {
    const zone = Math.min(2, Math.floor((((i / 4) % width) * 3) / width))
    sums[zone] += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    counts[zone] += 3
  }
  const mean = (z: number) => (counts[z] ? sums[z] / (counts[z] * 255) : 0)
  return { left: mean(0), center: mean(1), right: mean(2) }
}

// Width of the sampled frame, for zoneDifference
export const SAMPLE_WIDTH = SAMPLE_SIZE

let canvas: HTMLCanvasElement | null = null

// The current video frame as SAMPLE_SIZE x SAMPLE_SIZE RGBA pixels; null while there is no frame yet or
// when the browser won't let us read it
export function samplePixels(video: HTMLVideoElement): Uint8ClampedArray | null {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null
  try {
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.width = SAMPLE_SIZE
      canvas.height = SAMPLE_SIZE
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
    return ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
  } catch {
    return null
  }
}

export function sampleZones(video: HTMLVideoElement): Zones | null {
  const pixels = samplePixels(video)
  return pixels ? analyzePixels(pixels, SAMPLE_SIZE, SAMPLE_SIZE) : null
}
