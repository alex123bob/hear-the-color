// Grab one frame from the video and return base64 without the data:image/jpeg;base64, prefix
const WIDTH = 640
const HEIGHT = 480

export function captureFrame(video: HTMLVideoElement): string | null {
  // Nothing to capture until the video has a frame
  if (video.readyState < 2 || !video.videoWidth) return null
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, WIDTH, HEIGHT)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
