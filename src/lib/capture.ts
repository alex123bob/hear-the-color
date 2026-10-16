// 从 video 截取一帧，返回不带 data:image/jpeg;base64, 前缀的 base64 字符串
const WIDTH = 640
const HEIGHT = 480

export function captureFrame(video: HTMLVideoElement): string | null {
  // 视频尚未有画面时不截取
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
