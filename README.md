# Hear the Color

A web-based AI vision assistant for visually impaired users. Raise your phone: the browser opens the camera,
captures a frame every 4 seconds, and sends it to the backend. A multimodal LLM returns one warm, specific
sentence describing the scene, and the browser reads it aloud.

Live at <https://lijialab.com/hear-the-color/> (after you deploy, see below).

## How it fits together

| Part | Where | Notes |
| --- | --- | --- |
| Frontend | this repo | Vite + React 18 + TypeScript, static build |
| Backend | [`PP-AI-Service`](../PP-AI-Service) (sibling repo) | `POST /api/see`, see its [`docs/SEE_API.md`](../PP-AI-Service/docs/SEE_API.md) |
| Voice | the browser | Web Speech API; the backend only returns text |

**All backend changes belong in PP-AI-Service.** Architecture and design decisions: [docs/DESIGN.md](docs/DESIGN.md).

## Run locally

Requirements: Node 18+, and PP-AI-Service set up as a sibling folder (`../PP-AI-Service`) with a working `.env`.

```bash
# terminal 1: backend on :8000
cd ../PP-AI-Service && source venv/bin/activate && python app.py

# terminal 2: frontend on :5173
npm install
npm run dev
```

No `.env.local` is needed: the frontend calls `/api/see` and the Vite dev server proxies it to
`http://localhost:8000` (override with `DEV_PROXY_TARGET`, see [`.env.example`](.env.example)).

Open:
- Desktop: <http://localhost:5173>. Browsers treat `localhost` as secure, so the camera works.
- Phone on the same Wi-Fi: `http://<your-computer-ip>:5173`. The page loads, but **the camera is refused**
  because browsers require HTTPS (or localhost). For real-phone testing use an HTTPS tunnel, e.g.
  `cloudflared tunnel --url http://localhost:5173`, or deploy to the server.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (0.0.0.0:5173, `/api` proxied to Flask) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `./deploy.sh` | Build and rsync `dist/` to the server, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | frontend `.env.local` | Backend origin. **Leave empty** when the page is served from the same domain as the API (local dev and the Nginx deployment). Set it (e.g. `https://lijialab.com`) only for a separate static host such as Vercel/Firebase. |
| `DEV_PROXY_TARGET` | frontend `.env.local` | Backend for the dev proxy (default `http://localhost:8000`) |
| `AI_PROVIDER` | backend `.env` | `openai` (default) or `deepseek`. Affects `/api/see` only. |

Provider keys, models and base URLs are backend settings, listed in
[`PP-AI-Service/.env.example`](../PP-AI-Service/.env.example). **API keys live only in the backend `.env`; the
frontend never touches them.**

## Deploy

Production serves the static build from Nginx at `/hear-the-color/` on the same domain as the API, so there
is no CORS and the existing HTTPS certificate is reused.

```bash
DEPLOY_TARGET=<user>@<server>:/home/alex123bobo/hear-the-color/ ./deploy.sh
```

First-time setup (Nginx block, backend restart) and troubleshooting: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Docs

- [docs/DESIGN.md](docs/DESIGN.md): architecture, API contract, frontend behavior, decisions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): backend, Nginx and frontend release steps
- [docs/nginx.conf.example](docs/nginx.conf.example): reference copy of the production Nginx config
