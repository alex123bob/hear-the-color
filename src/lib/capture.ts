// Grab one frame from the video and return base64 without the data:image/jpeg;base64, prefix.
// The longest side is scaled to MAX_SIDE and the video's own aspect ratio is kept, so a portrait phone
// video is not squashed into a landscape canvas.
const MAX_SIDE = 768
const QUALITY = 0.8

export function captureFrame(video: HTMLVideoElement): string | null {
  // Nothing to capture until the video has a frame
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null
  const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(video.videoWidth * scale)
  canvas.height = Math.round(video.videoHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
