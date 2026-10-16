# Hear the Color

A web-based AI vision assistant for visually impaired users. Raise your phone, the browser opens the
camera, a frame is captured every 4 seconds and sent to the backend, which asks a multimodal LLM for a
warm, specific one-sentence English description. The frontend reads it aloud with browser TTS.

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

Production serves the frontend from Nginx at `https://lijialab.com/hear-the-color/` and the backend at
`/api/see` on the same domain. Full steps (backend restart, one-time Nginx block, `./deploy.sh`,
troubleshooting) are in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

Quick version:

```bash
# frontend, every release
DEPLOY_TARGET=<user>@<server>:/home/alex123bobo/hear-the-color/ ./deploy.sh
```

### Switching the model provider
Change `AI_PROVIDER` (`openai` default, or `deepseek`) in the backend `.env` and restart Flask.
`AI_PROVIDER` only affects `/api/see`; `/api/image` always uses OpenAI. The chosen model must accept
image input. All provider variables are listed in `PP-AI-Service/.env.example`.

## Reminders

- API keys live only in the backend `.env`; the frontend never touches them.
- Mobile access requires HTTPS (provided by Nginx in production).
- `/api/see` has an in-memory rate limit of 20 requests per minute per IP (a 4-second loop uses ~15).
