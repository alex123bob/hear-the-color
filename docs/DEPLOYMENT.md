# Deployment

Production runs on the GCP server at `https://lijialab.com`:

- **Backend:** PP-AI-Service (Flask, port 8000) behind Nginx `location /api`.
- **Frontend:** this repo's static build, served by Nginx at `/hear-the-color/`.

Page and API share one origin, so there is no CORS and the existing HTTPS certificate covers both.
Mobile browsers only allow camera access over HTTPS, which is why the real deployment matters for testing.

Background: [DESIGN.md](DESIGN.md). Full Nginx config for reference: [nginx.conf.example](nginx.conf.example).
Day-to-day usage: [README](../README.md).

**Checklist (first deployment):** backend pulled and restarted (§1) → Nginx block added and reloaded (§2) →
`./deploy.sh` (§3) → open the page on a phone.

## 1. Backend (PP-AI-Service)

Needed whenever the `/api/see` route or provider config changes.

1. On the server, pull the latest code:

   ```bash
   cd <path-to>/PP-AI-Service && git pull
   ```

2. Edit the server's `.env` (keys live only here, never in the frontend):

   ```
   AI_PROVIDER=openai            # or deepseek
   OPENAI_API_KEY=...            # existing OpenAI settings keep working
   # DEEPSEEK_API_KEY=...        # only when AI_PROVIDER=deepseek
   ```

   Optional: `OPENAI_BASE_URL`, `OPENAI_MODEL`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`
   (all variables and defaults: [`PP-AI-Service/docs/SEE_API.md`](../../PP-AI-Service/docs/SEE_API.md)).
   The chosen model must accept image input, otherwise `/api/see` returns 500.

3. Restart Flask:

   ```bash
   ./stop.sh && ./start.sh        # logs: ~/ppaiservice.log
   ```

4. Verify (expect `{"error":"missing image"}` with HTTP 400):

   ```bash
   curl -i -X POST https://lijialab.com/api/see -H 'Content-Type: application/json' -d '{}'
   ```

No Nginx change is needed for the backend; `location /api` already proxies to `localhost:8000`.

## 2. Nginx (one-time)

Add to the `server { listen 443 ssl; ... }` block of the Nginx config (see the marked section in
[nginx.conf.example](nginx.conf.example)), next to `/yvonne` and `/home/`
(it must be inside this block so it takes priority over the catch-all `location /`):

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

Then:

```bash
mkdir -p /home/alex123bobo/hear-the-color        # target folder, must be readable by nginx
sudo nginx -t && sudo systemctl reload nginx
```

## 3. Frontend (every release)

From this repo, on your machine:

```bash
DEPLOY_TARGET=<user>@<server>:/home/alex123bobo/hear-the-color/ ./deploy.sh
```

`deploy.sh` runs `npm run build` and `rsync -avz --delete dist/` to the target, so the server folder becomes
an exact copy of the build (don't point it at a folder holding other files). No server restart is needed.

Leave `VITE_API_BASE_URL` **empty** for this setup: the page then calls same-origin `/api/see`. A value set at
build time would make it call that host instead.

Open <https://lijialab.com/hear-the-color/> on your phone.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Blank page, 404s for `assets/...` | Build was not made with `base: './'` (already set in `vite.config.ts`), or `alias` path in Nginx is wrong |
| 403 / 404 on the page | Nginx user can't read the folder: check permissions on `/home/alex123bobo` and `hear-the-color` |
| Page loads, camera refused | Not on HTTPS, or camera permission denied in the browser |
| Caption says "Network seems to have an issue" | `/api/see` unreachable or returned 5xx: check `~/ppaiservice.log` and the provider key/model |
| Caption says "Too many requests, please wait a moment" | Rate limit hit (20 requests/minute per IP) |
| Works for OpenAI, fails for DeepSeek | The DeepSeek model doesn't accept images |

## Rolling back

- **Frontend:** check out the previous commit and run `./deploy.sh` again.
- **Provider:** set `AI_PROVIDER=openai` in the backend `.env` and run `./stop.sh && ./start.sh`.
- **Remove the app:** delete the Nginx `location /hear-the-color` blocks and reload; `/api/*` is unaffected.
