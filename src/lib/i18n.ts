// UI language: detected from the browser, with a ?lang=xx override for testing.
// Supported UI languages have hand-written strings; any other language falls back to English text
// (the AI description is still requested in the detected language).

export interface Messages {
  start: string
  stop: string
  startLabel: string
  stopLabel: string
  idle: string
  cameraStarting: string
  sending: string
  analyzing: string
  stillWorking: string
  networkError: string
  tooMany: string
  cameraError: string
  intro: string
  voiceLabel: string
  voiceAi: string
}

const en: Messages = {
  start: 'Start Listening',
  stop: 'Stop',
  startLabel: 'Start listening. The phone will describe the scene in front of you.',
  stopLabel: 'Stop listening. The phone will stop describing the scene in front of you.',
  idle: 'Tap "Start Listening" at the top right',
  voiceLabel: 'Voice',
  voiceAi: 'Natural voice (AI)',
  cameraStarting: 'Starting the camera...',
  sending: 'Sending the photo...',
  analyzing: 'The AI is looking at the scene...',
  stillWorking: 'Still working on it, almost there...',
  networkError: 'Network seems to have an issue',
  tooMany: 'Too many requests, please wait a moment',
  cameraError: 'Cannot open the camera. Check permissions (phones require HTTPS)',
  intro:
    'An assistant that describes the scene in front of your phone camera and reads it aloud. Use the Start Listening button to begin.',
}

const MESSAGES: Record<string, Messages> = {
  en,
  zh: {
    start: '开始聆听',
    stop: '停止',
    startLabel: '开始聆听，点击后手机会描述眼前的场景',
    stopLabel: '停止聆听，点击后手机将不再描述眼前的场景',
    idle: '点击右上角“开始聆听”',
    voiceLabel: '声音',
    voiceAi: '自然人声（AI）',
    cameraStarting: '正在打开摄像头……',
    sending: '正在发送照片……',
    analyzing: 'AI 正在观察场景……',
    stillWorking: '还在处理中，马上就好……',
    networkError: '网络好像出了点问题',
    tooMany: '请求太频繁，请稍等一下',
    cameraError: '无法打开摄像头，请检查权限（手机需要 HTTPS）',
    intro: '一个描述手机摄像头前的场景并朗读出来的助手。点击“开始聆听”按钮开始。',
  },
  es: {
    start: 'Empezar a escuchar',
    stop: 'Detener',
    startLabel: 'Empezar a escuchar. El teléfono describirá la escena que tienes delante.',
    stopLabel: 'Dejar de escuchar. El teléfono dejará de describir la escena que tienes delante.',
    idle: 'Toca "Empezar a escuchar" arriba a la derecha',
    voiceLabel: 'Voz',
    voiceAi: 'Voz natural (IA)',
    cameraStarting: 'Iniciando la cámara...',
    sending: 'Enviando la foto...',
    analyzing: 'La IA está mirando la escena...',
    stillWorking: 'Todavía trabajando, ya casi...',
    networkError: 'Parece que hay un problema de red',
    tooMany: 'Demasiadas solicitudes, espera un momento',
    cameraError: 'No se puede abrir la cámara. Revisa los permisos (el teléfono requiere HTTPS)',
    intro:
      'Un asistente que describe la escena frente a la cámara del teléfono y la lee en voz alta. Usa el botón Empezar a escuchar para comenzar.',
  },
  fr: {
    start: 'Commencer à écouter',
    stop: 'Arrêter',
    startLabel: 'Commencer à écouter. Le téléphone décrira la scène devant vous.',
    stopLabel: 'Arrêter l’écoute. Le téléphone cessera de décrire la scène devant vous.',
    idle: 'Touchez « Commencer à écouter » en haut à droite',
    voiceLabel: 'Voix',
    voiceAi: 'Voix naturelle (IA)',
    cameraStarting: 'Démarrage de la caméra...',
    sending: 'Envoi de la photo...',
    analyzing: 'L’IA observe la scène...',
    stillWorking: 'Toujours en cours, presque terminé...',
    networkError: 'Le réseau semble avoir un problème',
    tooMany: 'Trop de requêtes, patientez un instant',
    cameraError: 'Impossible d’ouvrir la caméra. Vérifiez les autorisations (HTTPS requis sur téléphone)',
    intro:
      'Un assistant qui décrit la scène devant la caméra du téléphone et la lit à voix haute. Utilisez le bouton Commencer à écouter pour démarrer.',
  },
  ja: {
    start: '聞き始める',
    stop: '停止',
    startLabel: '聞き始める。スマートフォンが目の前の情景を説明します。',
    stopLabel: '聞くのを止める。スマートフォンは目の前の情景の説明をやめます。',
    idle: '右上の「聞き始める」をタップしてください',
    voiceLabel: '音声',
    voiceAi: '自然な声（AI）',
    cameraStarting: 'カメラを起動しています……',
    sending: '写真を送信しています……',
    analyzing: 'AIが情景を見ています……',
    stillWorking: 'まだ処理中です。もう少しお待ちください……',
    networkError: 'ネットワークに問題があるようです',
    tooMany: 'リクエストが多すぎます。しばらくお待ちください',
    cameraError: 'カメラを開けません。権限を確認してください（スマートフォンではHTTPSが必要です）',
    intro:
      'スマートフォンのカメラの前の情景を説明し、読み上げるアシスタントです。「聞き始める」ボタンで開始します。',
  },
}

// Well-formed BCP-47 tag check, mirrors the backend; anything else is ignored
const TAG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/

function detectLanguage(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('lang')
  const candidates = [fromUrl, ...(navigator.languages ?? []), navigator.language]
  for (const c of candidates) {
    if (c && TAG_RE.test(c)) return c
  }
  return 'en'
}

// BCP-47 tag used for the AI description and the speech voice, e.g. "zh-CN"
export const language = detectLanguage()

// UI strings for the detected language, English when we have no translation
export const t: Messages = MESSAGES[language.split('-')[0].toLowerCase()] ?? en

// Keep the document language in sync so screen readers pick the right pronunciation
document.documentElement.lang = language
