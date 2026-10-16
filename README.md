# Hear the Color

A web-based AI vision assistant for visually impaired users. Raise your phone, the browser opens the
camera, a frame is captured every 4 seconds and sent to the backend, which asks a multimodal LLM for a
warm, specific one-sentence Chinese description. The frontend reads it aloud with browser TTS.

- Frontend: Vite + React 18 + TypeScript (this repo, statically hosted)
- Backend: the existing `PP-AI-Service` Flask app, with a new `POST /api/see` route.
  **All backend changes live in PP-AI-Service.**

## Run locally

1. Start the backend (other repo):

   ```bash
   cd ../PP-AI-Service
   source venv/bin/activate && python app.py   # listens on :8000
   ```

2. Start the frontend:

   ```bash
   npm install
   npm run dev
   ```

   No `.env.local` is needed for local dev: the frontend calls `/api/see` and the Vite dev server
   proxies it to `http://localhost:8000` (override with `DEV_PROXY_TARGET`).

3. Open:
   - Desktop: <http://localhost:5173> (browsers treat localhost as a secure context, so the camera works)
   - Phone / LAN: `http://<your-computer-ip>:5173` (the dev server listens on 0.0.0.0).
     **Note:** browsers only allow camera access on HTTPS or localhost, so the page will load over a
     LAN IP but the camera will be refused. For real-phone testing use an HTTPS tunnel
     (e.g. `cloudflared tunnel --url http://localhost:5173`), or add the address in Chrome at
     `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.

## Configure `VITE_API_BASE_URL`

Copy `.env.example` to `.env.local`:

```
VITE_API_BASE_URL=https://lijialab.com
```

Leave it empty to call same-origin `/api/see` (local dev goes through the Vite proxy). Production builds
hosted on a different domain must set it to the backend URL.

## Deploy

### Backend
The new route is already in `PP-AI-Service/app.py`. Pull the code on the server and restart Flask.
**No Nginx changes needed** (`location /api` already proxies to `localhost:8000`).

### Switching the model provider
Change `AI_PROVIDER` in the backend `.env` and restart Flask:

| Variable | Notes |
| --- | --- |
| `AI_PROVIDER` | `openai` (default) or `deepseek` |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` (optional, falls back to the legacy `OPENAI_API_BASE`), `OPENAI_MODEL` (default `gpt-4o-mini`) | OpenAI |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`), `DEEPSEEK_MODEL` (default `deepseek-flash`) | DeepSeek |

`AI_PROVIDER` only affects `/api/see`; `/api/image` always uses OpenAI. The chosen model must accept
image input, otherwise `/api/see` returns 500.

### Frontend

```bash
npm run build
vercel --prod        # or: firebase deploy
```

Set `VITE_API_BASE_URL` in the hosting platform's environment (it is injected at build time).

## Reminders

- API keys live only in the backend `.env`; the frontend never touches them.
- Mobile access requires HTTPS (provided by Nginx in production).
- `/api/see` has an in-memory rate limit of 20 requests per minute per IP (a 4-second loop uses ~15).
