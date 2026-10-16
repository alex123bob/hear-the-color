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

### Frontend (same Nginx server, same domain)

The frontend is a static build served by Nginx under `/hear-the-color/`, the same way the dictionary app
is served. Because the page and `/api/see` share one origin, leave `VITE_API_BASE_URL` empty
(no CORS, and the existing HTTPS certificate covers it).

1. One-time: add this block to the `server { listen 443 ssl; ... }` section of the Nginx config
   (next to `/yvonne` and `/home/`), then `sudo nginx -t && sudo systemctl reload nginx`:

   ```nginx
   location = /hear-the-color {
       return 301 /hear-the-color/;
   }
   location /hear-the-color/ {
       alias /home/alex123bobo/hear-the-color/;
       index index.html;
       try_files $uri $uri/ =404;
   }
   ```

2. Every release, from this repo:

   ```bash
   DEPLOY_TARGET=user@your-server:/home/alex123bobo/hear-the-color/ ./deploy.sh
   ```

   This runs `npm run build` and rsyncs `dist/` to the server. No Flask or Nginx restart is needed.

3. Open <https://lijialab.com/hear-the-color/> on your phone.

(Alternative: `vercel --prod` / `firebase deploy`, with `VITE_API_BASE_URL=https://lijialab.com` set at build time.)

## Reminders

- API keys live only in the backend `.env`; the frontend never touches them.
- Mobile access requires HTTPS (provided by Nginx in production).
- `/api/see` has an in-memory rate limit of 20 requests per minute per IP (a 4-second loop uses ~15).
