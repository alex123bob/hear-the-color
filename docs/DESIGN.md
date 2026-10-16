# Hear the Color: Design Reference

A web-based AI vision assistant for visually impaired users. The user raises their phone, the browser opens
the camera, a frame is captured every few seconds and sent to the backend, a multimodal LLM returns a warm,
specific one-sentence description, and the browser reads it aloud.

This document describes what is built and why. For setup see the [README](../README.md); for releasing see
[DEPLOYMENT.md](DEPLOYMENT.md).

## Architecture

```
Phone browser ──(camera frame, base64 JPEG)──▶ Nginx ──▶ PP-AI-Service (Flask)  POST /api/see
      ▲                                     (HTTPS)            │
      │                                                        ▼
      └────────── { "text": "..." } ◀──────────────  ai_svc.openai.vision()  ──▶ OpenAI / DeepSeek
      │
      ▼
 speechSynthesis (device TTS)
```

- **Frontend** (this repo): Vite + React 18 + TypeScript, plain CSS Modules, no UI library. Static build,
  served by the same Nginx as the backend under `/hear-the-color/`.
- **Backend** ([PP-AI-Service](../../PP-AI-Service)): the existing Flask app. No new service. All backend
  changes live in that repo (`app.py`, `ai_svc/openai.py`).
- **Voice** is produced entirely in the browser (Web Speech API). The backend only returns text.

## Backend

### `POST /api/see`

Request: `{ "image": "<base64 JPEG, WITHOUT the data:image/jpeg;base64, prefix>" }`

| Status | Body | When |
| --- | --- | --- |
| 200 | `{ "text": "..." }` | Description generated |
| 400 | `{ "error": "missing image" }` | `image` absent or empty |
| 429 | `{ "error": "too many requests" }` | More than 20 requests/minute from one IP |
| 500 | `{ "error": "<message>" }` | Model call failed (logged server-side) |

Behavior:
1. Validate `image`, then build `data:image/jpeg;base64,<image>`.
2. Call the existing `ai_svc.openai.vision(images=[data_url], prompt_text=SEE_PROMPT, max_tokens=200)`.
   The HTTP request is not reimplemented.
3. Rate limit: in-memory sliding window, keyed by `X-Real-IP` (set by Nginx), falling back to the socket
   address. Per process and reset on restart, which is fine for a demo.

Prompt (`SEE_PROMPT` in `app.py`):

> You are the AI eyes of a visually impaired person. Describe the scene in front of you in one warm, specific
> English sentence, no more than 25 words. Include: what objects are there, what colors, what mood. Do NOT
> start with "I see"; just describe directly. If the image is blurry or unclear, reply exactly: "The image is
> a bit blurry, please move closer." Output only the sentence.

### Provider switching

`ai_svc.openai.get_vision_provider()` returns `(base_url, api_key, model)` based on `AI_PROVIDER`:

| Variable | Default |
| --- | --- |
| `AI_PROVIDER` | `openai` (or `deepseek`) |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` (falls back to legacy `OPENAI_API_BASE`), `OPENAI_MODEL` | `gpt-4o-mini` |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` | `https://api.deepseek.com`, `deepseek-flash` |

Both providers speak the OpenAI chat-completions format, so only base URL, key and model differ.
Trailing slashes on base URLs are stripped. The `x-pp-token` header (for the OpenAI proxy) is sent only to
OpenAI.

Compatibility rules:
- `/api/image` and other existing routes are unchanged. `/api/image` is pinned to OpenAI
  (`provider='openai'`) and ignores `AI_PROVIDER`.
- The chosen model must accept image input, otherwise `/api/see` returns 500.

## Frontend

```
src/
├── main.tsx, App.tsx, App.module.css
├── components/  CameraView, ControlButton, Caption
├── hooks/       useVisionLoop.ts   (core loop)
└── lib/         capture.ts, speak.ts
```

`useVisionLoop({ videoRef, isRunning })`:
1. When `isRunning` becomes true: `getUserMedia({ video: { facingMode: 'environment' }, audio: false })`,
   attach the stream to the video, run one tick immediately, then every 4000 ms.
2. A tick captures a 640x480 JPEG (quality 0.7), strips the data-URL prefix, and POSTs it to
   `${VITE_API_BASE_URL}/api/see` inside try/catch.
3. Success: set the caption and speak it (cancelling any earlier speech). Failure: "Network seems to have an
   issue" (or "Too many requests..." on 429). While a request is in flight the caption shows "Looking...".
4. A tick is skipped while the previous request is still in flight, so requests never pile up.
5. When `isRunning` becomes false or on unmount: clear the interval, stop all tracks, cancel speech.
   Interval and stream live in refs to avoid stale closures.

`speak.ts`: `SpeechSynthesisUtterance`, `lang = 'en-US'`, `rate = 1.05`, cancelling before speaking.

### UI and accessibility

- Black background, white text, very high contrast; CSS Modules only.
- Controls at least 48px tall, text at least 22px. Button labels: "Start Listening" / "Stop".
- Fullscreen camera, control button top-right, caption fixed at the bottom on a semi-transparent black panel
  with 24px padding.
- The caption is an `aria-live="polite"` region so screen readers announce changes.
- Honest limitation: with a screen reader running, the caption may be announced twice (screen reader plus
  the app's own TTS).

### Build

`vite.config.ts`: `@vitejs/plugin-react`, `build.target: 'es2020'`, `minify: 'esbuild'`, no sourcemaps,
`base: './'` (works under any subpath). The dev server listens on `0.0.0.0` and proxies `/api` to the local
Flask app. Dependencies are limited to react, react-dom, vite, typescript and @vitejs/plugin-react (plus the
React type packages that `tsc` needs).

## Decisions and non-goals

- **Same origin, no CORS.** The frontend is served from the backend's own domain. Flask CORS is still
  enabled, so a separate static host (Vercel/Firebase with `VITE_API_BASE_URL`) remains possible.
- **No secrets in the frontend.** API keys exist only in the backend `.env`.
- **English throughout** (UI text, code comments, prompt, model output, TTS voice).
- **Non-goals:** user accounts, storing images, server-side TTS, streaming/continuous video, offline use.
  Images are sent per request and not stored by this project.

## Related files

- [`nginx.conf.example`](nginx.conf.example): reference copy of the production Nginx config.
- PP-AI-Service: [`docs/SEE_API.md`](../../PP-AI-Service/docs/SEE_API.md).
