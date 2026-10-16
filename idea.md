# Project: Hear the Color

A web-based AI vision assistant for visually impaired users. The user raises their phone,
the browser accesses the camera, captures a frame every few seconds, sends it to the backend,
and the backend calls a multimodal LLM to return a warm, specific English scene description.
The frontend then speaks it out using browser TTS.

## Architecture

- Frontend: Vite + React 18 + TypeScript, standalone repo, statically hosted (Vercel / Firebase Hosting)
- Backend: Reuse my existing Flask app (deployed on GCP, Nginx reverse proxy with HTTPS)
  - Entry file: app.py
  - CORS(app) is already configured, no cross-origin handling needed
  - load_dotenv() is already set up, env vars come from .env
  - ai_svc.openai module already exists and already has a vision(images, prompt_text) wrapper
  - I need a new POST /api/see route dedicated to this demo

## Backend Changes (add to existing Flask app.py)

### New route: POST /api/see

Request body: { "image": "<base64 string, WITHOUT the data:image/jpeg;base64, prefix>" }

Response:
- Success: { "text": "AI-generated English description" }
- Failure: { "error": "error message" }, status 500
- Missing image: { "error": "missing image" }, status 400

Implementation logic:
1. Read image from request.get_json()
2. Validate it is not empty
3. Build the data URL: f"data:image/jpeg;base64,{image}"
4. Call ai_svc.openai.vision(images=[data_url], prompt_text=PROMPT)
   (Reuse my existing wrapper, do NOT rewrite the HTTP request)
5. Return { "text": result }
6. On error, log and return 500
7. Add a simple in-memory rate limit: max 20 requests per minute per IP

PROMPT constant (place at top of app.py or in a separate constants file):
"""
You are the AI eyes of a visually impaired person. Describe the scene in front of you
in one warm, specific English sentence, no more than 25 words. Include: what objects
are there, what colors, what mood. Do NOT start with "I see", just describe directly.
If the image is blurry or unclear, say "The image is a bit blurry, please move closer."
"""

### About Provider Switching

My existing ai_svc.openai wrapper defaults to OpenAI.
If I want to switch to DeepSeek, add a thin abstraction layer in ai_svc
that selects the provider via the AI_PROVIDER environment variable.

In .env:
- AI_PROVIDER = "openai" | "deepseek" (default: openai)
- OPENAI_API_KEY = sk-xxx
- OPENAI_BASE_URL = https://api.openai.com/v1 (optional)
- OPENAI_MODEL = gpt-4o-mini (optional)
- DEEPSEEK_API_KEY = sk-xxx
- DEEPSEEK_BASE_URL = https://api.deepseek.com (optional)
- DEEPSEEK_MODEL = deepseek-flash (optional)

Both providers use nearly identical API formats (both are OpenAI-compatible chat/completions).
The only differences are base_url, api_key, and model.

Write a get_vision_provider() function that returns (base_url, api_key, model),
so that ai_svc.openai.vision can select the config based on AI_PROVIDER.

Notes:
- If DeepSeek does not support certain OpenAI-specific params (e.g. detail field),
  filter them by provider
- Handle trailing slashes in base_url to avoid //chat/completions
- Do NOT break the existing /api/image route; it should continue using OpenAI by default

## Frontend Requirements (React)

### File structure

hear-color/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.example
├── README.md
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── App.module.css
│   ├── components/
│   │   ├── CameraView.tsx
│   │   ├── ControlButton.tsx
│   │   └── Caption.tsx
│   ├── hooks/
│   │   └── useVisionLoop.ts
│   └── lib/
│       ├── capture.ts
│       └── speak.ts

### Environment variables

.env.local:
VITE_API_BASE_URL=https://your-backend-domain

Frontend fetch:
fetch(`${import.meta.env.VITE_API_BASE_URL}/api/see`, { ... })

### App.tsx
- State: isRunning, caption, isLoading
- Layout: fullscreen CameraView + top-right ControlButton + bottom Caption

### useVisionLoop.ts (core hook)
Params: { videoRef, isRunning }
Behavior:
1. When isRunning becomes true:
   - getUserMedia({ video: { facingMode: 'environment' }, audio: false })
   - Attach stream to videoRef.current.srcObject
   - setInterval every 4000ms to run tick
2. tick:
   - Capture frame via canvas (640x480, jpeg 0.7)
   - Convert to base64 (strip prefix)
   - POST to /api/see
   - Success: setCaption(text) + speak(text)
   - Failure: setCaption('Network seems to have an issue')
   - In-flight: setIsLoading(true)
3. When isRunning becomes false or on unmount:
   - clearInterval
   - stream.getTracks().forEach(t => t.stop())
4. Use useRef to hold interval and stream, avoid closure issues
5. Call speechSynthesis.cancel() before speak

### speak.ts
- SpeechSynthesisUtterance, lang='en-US', rate=1.05
- Cancel before speak

### capture.ts
- Input: HTMLVideoElement, output: base64 string (no prefix)
- canvas 640x480, jpeg 0.7

### UI (accessible for visually impaired)
- Black background, white text, extremely high contrast
- Buttons at least 48px tall, font size at least 22px
- Button text: "Start Listening" / "Stop"
- Caption area fixed at bottom, semi-transparent black background, padding 24px
- While loading, show "Looking..."
- CSS Modules, no UI library

## Build config

vite.config.ts:
- @vitejs/plugin-react
- build.target: 'es2020'
- build.minify: 'esbuild'
- No sourcemap

package.json scripts:
- dev: vite
- build: tsc && vite build
- preview: vite preview

Dependencies only: react, react-dom, vite, typescript, @vitejs/plugin-react

## README.md

- Local run: npm install && npm run dev
- Configure VITE_API_BASE_URL to point to the backend
- Backend deploy: add the new route to app.py, restart Flask, no Nginx changes needed
- How to switch provider: change AI_PROVIDER in .env
- Frontend deploy: vercel --prod or firebase deploy
- Reminder: API keys live only in the backend .env, never touched by the frontend

## Notes
- Do NOT create a new backend service, reuse the existing Flask entirely
- Do NOT change the behavior of existing routes like /api/image
- Write code comments in English
- Add try/catch to frontend fetch
- Mobile access requires HTTPS (your Nginx already handles this)

## Deliverable
Generate all frontend files + backend changes (new route in app.py + provider switching in ai_svc) in one go.
I will run npm install and deploy myself.