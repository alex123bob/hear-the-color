# Hear the Color

A web-based AI vision assistant for visually impaired users. Raise your phone: the browser opens the camera,
captures a frame, and sends it to the backend. A multimodal LLM returns one warm, specific sentence
describing the scene, and the browser reads it aloud. Only once the sentence has been fully spoken does it
look again, so descriptions never talk over each other. The language follows the browser/system language
(UI text for English, Chinese, Spanish, French and Japanese; the description and voice follow any language),
with English as the fallback.

Live at <https://lijialab.com/hear-the-color/> (after you deploy, see below).

## How it fits together

| Part | Where | Notes |
| --- | --- | --- |
| Frontend | this repo | Vite + React 18 + TypeScript, static build |
| Backend | [`PP-AI-Service`](../PP-AI-Service) (sibling repo) | `POST /api/see`, see its [`docs/SEE_API.md`](../PP-AI-Service/docs/SEE_API.md) |
| Voice | OpenAI TTS (returned by `/api/see` with `include_audio`), or a built-in device voice | Picker at the top-left. The AI voice sounds most natural; a built-in voice is ~2 s faster and free. Falls back to a built-in voice if the server can't produce audio |

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
- Phone on the same Wi-Fi: browsers only allow the camera on HTTPS (or localhost), so plain
  `http://<your-computer-ip>:5173` shows "require https". Run `npm run dev:https` instead and open
  `https://<your-computer-ip>:5173` (the URL is printed as "Network"). It uses a self-signed certificate, so
  accept the browser warning once (Advanced -> Proceed). Alternatively use a tunnel such as
  `cloudflared tunnel --url http://localhost:5173`, or deploy to the server.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (0.0.0.0:5173, `/api` proxied to Flask) |
| `npm run dev:https` | Same, with a self-signed HTTPS certificate, needed for the camera on a phone over LAN |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run release [patch\|minor\|major]` | Check the build, bump the version and commit it (no tag, no push). Then push with GitHub Desktop and run the `release` workflow on GitHub |
| `./scripts/server-deploy.sh [tag]` | Run on the server: download a release and make it live (also used for rollback) |

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | frontend `.env.local` | Backend origin. **Leave empty** when the page is served from the same domain as the API (local dev and the Nginx deployment). Set it (e.g. `https://lijialab.com`) only for a separate static host such as Vercel/Firebase. |
| `DEV_PROXY_TARGET` | frontend `.env.local` | Backend for the dev proxy (default `http://localhost:8000`) |
| `?lang=xx` | page URL | Override the detected language for testing, e.g. `http://localhost:5173/?lang=ja` |
| `AI_PROVIDER` | backend `.env` | `deepseek` (default) or `openai`. Affects `/api/see` only. |

Provider keys, models and base URLs are backend settings, listed in
[`PP-AI-Service/.env.example`](../PP-AI-Service/.env.example). **API keys live only in the backend `.env`; the
frontend never touches them.**

## Deploy

Production serves the static build from Nginx at `/hear-the-color/` on the same domain as the API, so there
is no CORS and the existing HTTPS certificate is reused.

```bash
npm run release               # laptop: check build, bump version, commit
# push with GitHub Desktop, then GitHub -> Actions -> release -> Run workflow (builds the release)
./server-deploy.sh            # server: download the latest release and switch to it (no Node needed)
```

First-time setup (Nginx block,
backend restart) and troubleshooting: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Docs

- [docs/DESIGN.md](docs/DESIGN.md): architecture, API contract, frontend behavior, decisions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): backend, Nginx and frontend release steps
- [docs/nginx.conf.example](docs/nginx.conf.example): reference copy of the production Nginx config
