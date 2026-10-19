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
      └────────── { "text": "..." } ◀──────────────  ai_svc.see.SeeService   ──▶ OpenAI / DeepSeek
      │
      ▼
 speechSynthesis (device TTS)
```

- **Frontend** (this repo): Vite + React 18 + TypeScript, plain CSS Modules, no UI library. Static build,
  served by the same Nginx as the backend under `/hear-the-color/`.
- **Backend** ([PP-AI-Service](../../PP-AI-Service)): the existing Flask app. No new service. All backend
  changes live in that repo, in a self-contained module `ai_svc/see/` registered as a blueprint in `app.py`.
- **Voice** comes from OpenAI TTS through `POST /api/speak` (PP-AI-Service, `ai_svc/tts/`), played in an
  `<audio>` element. If that fails the browser's built-in voice (Web Speech API) is used instead.

## Backend

### `POST /api/see`

Request: `{ "image": "<base64 JPEG, WITHOUT the data:image/jpeg;base64, prefix>", "lang": "<optional BCP-47 tag, e.g. zh-CN>", "include_audio": <optional true> }`
(with `include_audio` the 200 body also carries `audio` (base64 MP3) and `audio_format`, or `audio_error`)

| Status | Body | When |
| --- | --- | --- |
| 200 | `{ "text": "..." }` | Description generated |
| 400 | `{ "error": "missing image" }` | `image` absent or empty |
| 429 | `{ "error": "too many requests" }` | More than 20 requests/minute from one IP |
| 500 | `{ "error": "<message>" }` | Model call failed (logged server-side) |

Behavior:
1. Validate `image`, then build `data:image/jpeg;base64,<image>`.
2. `SeeService.describe()` calls the provider's OpenAI-compatible chat-completions endpoint with the prompt
   and the image (`max_tokens=200`), using the official `openai` client already in the project.
3. Rate limit: in-memory sliding window, keyed by `X-Real-IP` (set by Nginx), falling back to the socket
   address. Per process and reset on restart, which is fine for a demo.

Prompt (`SEE_PROMPT_TEMPLATE` in `ai_svc/see/prompts.py`; `{language}` is filled with the language name, shown here for English):

> You are the AI eyes of a visually impaired person. Describe the scene in front of you in one warm, specific
> English sentence, no more than 25 words. Include: what objects are there and what colors they are; do not guess at mood or feelings. Do NOT
> start with "I see"; just describe directly. Always describe what is visible, even if the view is a close-up,
> dim or only partly clear. Only if it is almost entirely unreadable (e.g. a covered lens or pure blur), reply
> exactly: "The image is a bit blurry, please move closer." Output only the sentence.

### Provider switching

`ai_svc.see.provider.get_vision_provider()` returns `(base_url, api_key, model)` based on `AI_PROVIDER`:

| Variable | Default |
| --- | --- |
| `AI_PROVIDER` | `deepseek` (or `openai`) |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` (official endpoint if unset), `OPENAI_MODEL` | `gpt-4o-mini` |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` | `https://api.deepseek.com`, `deepseek-flash` |

Both providers speak the OpenAI chat-completions format, so only base URL, key and model differ.
Trailing slashes on base URLs are stripped. For DeepSeek, thinking is disabled in the request: its hidden
reasoning tokens count against `max_tokens` and previously left descriptions empty. The service sends no custom
headers and never reads `OPENAI_API_BASE` or `X-PP-TOKEN`: those belong to the proxy setup of other apps, and
`/api/see` talks directly to the provider. DeepSeek is the default because OpenAI is not reachable from the
server's region.

Compatibility rules:
- Existing routes and `ai_svc/openai.py` are untouched; `/api/image` keeps using OpenAI as before.
  `AI_PROVIDER` only affects `/api/see`.
- The chosen model must accept image input, otherwise `/api/see` returns 500.

## Frontend

```
src/
├── main.tsx, App.tsx, App.module.css
├── components/  CameraView, ControlButton, Caption
├── hooks/       useVisionLoop.ts   (core loop)
└── lib/         capture.ts, speak.ts
```

`useVisionLoop({ videoRef, isRunning })` runs a sequential loop, not a fixed timer:
1. When `isRunning` becomes true: `getUserMedia({ video: { facingMode: 'environment' }, audio: false })`,
   attach the stream to the video, then start the loop.
2. Loop: capture a JPEG (longest side 768px, original aspect ratio kept, quality 0.8) -> strip the data-URL prefix -> POST to
   `${VITE_API_BASE_URL}/api/see` with `include_audio: true` inside try/catch (staged status captions while in
   flight, see below) -> set the caption and start the returned audio together -> **wait until the speech has ended** -> 500 ms pause -> capture the next frame.
3. Because the next frame is only taken after the previous description has been spoken, speech never overlaps
   and requests never pile up. The cycle time is therefore model latency plus speaking time (no fixed 4 s).
4. Status shown while waiting (all translated, shown in italics, never spoken):
   "Starting the camera..." -> "Sending the photo..." -> (upload finished) "The AI is looking at the scene..." ->
   8 s after the upload finished "Still working on it, almost there...". The request is made with axios (XHR under the hood), whose
   `onUploadProgress` reports when the whole body has left the browser, so "analyzing" is a real signal. It
   means the bytes were handed to the network, not that the server has them (only the response confirms that);
   for a ~100 KB frame there may be just one or two progress events. The last stage is a reassurance for slow
   responses and is timed from the end of the upload. No stage is a time-based guess. Stop or unmount aborts a request that is still in flight. The hook exposes a caption `kind` (`status`, `result`, `error`)
   so the UI can style the AI description differently from progress messages.
5. Failure: caption "Network seems to have an issue" (or "Too many requests..." on 429), then retry after 4 s.
6. When `isRunning` becomes false or on unmount: the loop is cancelled (a pending wait is woken so it exits
   immediately), all tracks are stopped and speech is cancelled. A `cancelled` flag guards async callbacks.

**Voice picker** (top bar, `VoiceSelect.tsx` + `lib/voices.ts`): "Natural voice (AI)" (OpenAI, the default) or
any built-in voice the device has for the current language. Built-in voices that usually sound natural are
starred and listed first, guessed from their names (Apple "Enhanced/Premium" and voices like Samantha, Chrome's
"Google ..." online voices, Edge "Natural/Neural"); browsers don't report quality, so it's a heuristic. The
choice is remembered per device in `localStorage` and applies from the next frame without restarting the
camera. With a built-in voice the frontend sends `include_audio: false`, so no OpenAI speech is generated and
speech starts instantly (about 2 s faster, at the cost of a less natural voice).

`speak.ts`: `speak(text)` returns a Promise that resolves when playback has finished or was stopped.
1. The frontend sends `include_audio: true` with every frame, so `/api/see` returns the description **and** its
   MP3 in one response. The caption is shown and playback starts at the same moment (measured: ~30 ms apart),
   with no second round trip. Only if that audio is missing (`audio_error`) does `speak()` download it from
   `GET /api/speak?text=...`. Either way the MP3 is played from a blob URL on one shared `<audio>` element. (Pointing `<audio src>` straight at the streamed response was tried; some browsers stayed
   silent with it, and it only saved ~0.3-1 s because OpenAI finishes a one-sentence clip about a second after
   its first bytes.) MP3 is kept on purpose: WAV/PCM are 5-10x larger, so they download more slowly.
2. The AI voice plays at 1.5x (`PLAYBACK_RATE`, pitch preserved). Speeding it up in the browser rather than
   with OpenAI's `speed` parameter is deliberate: generation is no faster either way (measured), and the rate
   stays adjustable. Built-in voices play at normal speed (`BROWSER_RATE = 1.0`); they sound distorted sped up.
3. If audio hasn't started within 15 s, or the request fails (network, OpenAI unreachable, quota, playback
   refused), it speaks with the browser voice instead (`SpeechSynthesisUtterance`, detected language,
   length-based timeout as a safety net). After 2 failures in a row it stops trying the server until the next
   Start, so the loop isn't slowed down.
4. `stopSpeaking()` aborts the download, pauses the audio, cancels browser speech and releases the waiting loop.

Mobile autoplay: browsers only allow audio started from a user gesture, but the first description arrives
after network calls. `unlockSpeech()` therefore plays a silent clip on the shared `<audio>` element and a
silent utterance synchronously inside the Start tap. On iOS the ringer (silent) switch also mutes audio.

### UI and accessibility

- Pure black background, pure white text (21:1). The caption panel is 75% black over the camera; even over a
  pure-white scene that is about 10:1, still above WCAG AAA (7:1). The caption is deliberately compact (18px) so the live camera view gets the screen; the app speaks every description aloud, so reading the caption is secondary.
- The button is 64px tall (controls never go below 56px). Labels: "Start Listening" / "Stop". Its `aria-label` describes function and
  result, e.g. "Start listening. The phone will describe the scene in front of you."
- Layout: fullscreen camera, a top bar and the caption fixed at the bottom with 24px padding. On phones (up to
  560px wide) the top bar stacks Start/Stop full-width on the first row with the voice picker below it; on wider
  screens Start/Stop sits top-right and the picker top-left. Start/Stop comes first in the DOM, so it is also
  first in Tab and screen-reader order.
- Structure for screen readers: `<html lang="en">`, content in `<main role="main">`, a visually hidden `<h1>`
  and a one-line intro (`.srOnly`). The `<video>` is `aria-hidden` because it is purely visual.
- Keyboard: the button is a native `<button>`, so it is Tab-reachable and works with Enter/Space; the default
  focus behavior is kept and `:focus-visible` adds a 3px gold outline.
- Touch: `navigator.vibrate(50)` on press (where supported; iOS Safari has no vibration API) plus a visible
  `:active` state (gold background, slight scale-down).
- **Caption vs speech:** the caption is `role="status"` with `aria-live="off"`, so screen readers do not
  announce it. The app speaks only the AI description (via TTS); every other message (progress status, network
  errors, camera errors) is shown with `setCaption()` but never spoken. This avoids double-speaking. All user
  feedback goes through the caption; there is no `alert()` or toast.

### Build

`vite.config.ts`: `@vitejs/plugin-react`, `build.target: 'es2020'`, `minify: 'esbuild'`, no sourcemaps,
`base: './'` (works under any subpath). The dev server listens on `0.0.0.0` and proxies `/api` to the local
Flask app. Runtime dependencies: react, react-dom and axios (used for upload-progress events). Dev: vite,
typescript, @vitejs/plugin-react, @vitejs/plugin-basic-ssl (HTTPS dev mode) and the React type packages.

## Sound layer

Spec: [superpowers/specs/2026-10-19-sound-layer-design.md](superpowers/specs/2026-10-19-sound-layer-design.md).
On top of the spoken description the app plays live tones, so the user hears color as they sweep the camera.

- **Tones** (`lib/colorSense.ts`, `lib/tones.ts`): about 10 times a second the video is drawn onto a 32x32
  canvas, split into equal thirds of the width (left, center, right) and each third reduced to hue,
  saturation and brightness. Each zone drives one sine oscillator through its own stereo panner (-1, 0, +1):
  hue sets pitch (one octave, 220-440 Hz, pentatonic, warm low and cool high), brightness sets loudness
  (master cap 0.15). Zones with saturation below 0.15 hum at 110 Hz, almost silent. This is local sampling:
  nothing extra is uploaded. Headphones give the best left/right effect. There is no distance estimate
  (a phone browser has no reliable depth); the description may still say "close" or "far".
- **Ducking:** while a sentence is spoken the tones dip to 15% (150 ms down, 300 ms back). The un-duck is in a
  `finally` and Stop silences everything, so it can't stay low.
- **Modes** (`lib/soundMode.ts`, `SoundSelect`, key `htc.soundMode`): *Voice only* (`describe`), *Voice and
  tones* (`both`, default), *Tones only* (`tones`: no `/api/see` calls, no speech). A switch applies live.
  The first time tones are on, a one-line explanation is spoken once per device (`htc.toneIntroSeen`); in
  *Tones only* it is shown as a caption.
- **Change-only narration** (`lib/changeGate.ts`): the loop compares the current 32x32 frame with the last
  *described* one and skips the request below a mean RGB difference of 0.04 (slow drift accumulates against
  the reference). After 45 s without a description it asks anyway. The last spoken sentence is sent as
  `previous`; the backend answers with `changed: true|false`. `changed: false` is neither spoken nor shown, and
  the reply from an older backend (no `changed`) is treated as a normal description.
- **iOS:** Web Audio is unlocked in the Start tap next to `unlockSpeech()`. The ringer switch mutes it, and
  tones plus speech playing together are worth a check on a real device; the fallback is *Voice only*.

## Decisions and non-goals

- **Same origin, no CORS.** The frontend is served from the backend's own domain. Flask CORS is still
  enabled, so a separate static host (Vercel/Firebase with `VITE_API_BASE_URL`) remains possible.
- **No secrets in the frontend.** API keys exist only in the backend `.env`.
- **Language follows the user; English is the fallback.** The frontend reads `navigator.languages[0]` (with a
  `?lang=xx` URL override for testing) and uses it for three things: UI text (`src/lib/i18n.ts`, hand-written for
  English, Chinese, Spanish, French and Japanese; other languages get English text), the `lang` field sent to
  `/api/see` so the description is written in that language, and the TTS voice. Code, comments, docs and the
  backend's error codes stay English.
- **`lang` is untrusted input that reaches an LLM prompt**, so the backend (`ai_svc/see/language.py`) accepts only
  well-formed BCP-47 tags (letters and digits, short subtags) and maps the primary subtag to a language name;
  anything else becomes English. Spoken output needs a device voice for that language; if none exists, the
  browser falls back to its default voice, which may read the text poorly.
- **Non-goals:** user accounts, storing images, streaming/continuous video, offline use.
  Images are sent per request and not stored by this project.

## Related files

- [`nginx.conf.example`](nginx.conf.example): reference copy of the production Nginx config.
- PP-AI-Service: [`docs/SEE_API.md`](../../PP-AI-Service/docs/SEE_API.md).
