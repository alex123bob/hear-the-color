# Deployment

Production runs on the GCP server at `https://lijialab.com`:

- **Backend:** PP-AI-Service (Flask, port 8000) behind Nginx `location /api`.
- **Frontend:** this repo's static build, served by Nginx at `/hear-the-color/`.

Page and API share one origin, so there is no CORS and the existing HTTPS certificate covers both.
Mobile browsers only allow camera access over HTTPS, which is why the real deployment matters for testing.

Background: [DESIGN.md](DESIGN.md). Full Nginx config for reference: [nginx.conf.example](nginx.conf.example).
Day-to-day usage: [README](../README.md).

**Checklist (first deployment):** backend pulled and restarted (§1) → Nginx block added and reloaded (§2) →
`npm run release` on your laptop, push, run the workflow on GitHub, then `./server-deploy.sh` on the server (§3) → open the page on a phone.

## 1. Backend (PP-AI-Service)

Needed whenever the `/api/see` route or provider config changes.

1. On the server, pull the latest code:

   ```bash
   cd <path-to>/PP-AI-Service && git pull
   ```

2. Edit the server's `.env` (keys live only here, never in the frontend):

   ```
   AI_PROVIDER=deepseek          # default; or openai
   DEEPSEEK_API_KEY=...          # required for deepseek
   # OPENAI_API_KEY=...          # only when AI_PROVIDER=openai
   ```

   `/api/see` ignores the `OPENAI_API_BASE` / `X-PP-TOKEN` proxy settings used by other routes.
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

Only this project's block is needed. Add it inside the existing `server { listen 443 ssl; ... }` block
(anywhere, e.g. next to `/yvonne`; Nginx matches the longest prefix, so it wins over the catch-all
`location /`). Don't replace the whole config. [nginx.conf.example](nginx.conf.example) is a full reference
copy of the production file with this block marked, so you can see where it sits.

```nginx
location = /hear-the-color {
    return 301 /hear-the-color/;
}
location /hear-the-color/ {
    alias /home/alex123bobo/hear-the-color/dist/;
    index index.html;
    try_files $uri $uri/ =404;
}
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Nginx (user `www-data`) must be able to read `dist/`, so every parent folder needs the execute bit, e.g.
`chmod o+x /home/alex123bobo`. If you'd rather not open your home folder, copy `dist/` to a path such as
`/var/www/hear-the-color/` after each build and point `alias` there instead.

## 3. Frontend (every release)

The server needs **no Node**: releases are built by GitHub Actions and the server only downloads the result.

**On your laptop** (clean `main`):

```bash
npm run release                 # patch bump, e.g. 0.1.0 -> 0.1.1; or: npm run release minor|major
```

It pulls, checks that the build works, bumps the version in `package.json` / `package-lock.json` and commits
"Release vX.Y.Z". It does **not** tag or push, so it works with whichever tool you push with:

1. Push the commit (GitHub Desktop is fine).
2. On GitHub: **Actions -> release -> Run workflow**, branch `main`, tag field empty. The workflow builds the
   app, creates the `vX.Y.Z` tag on that commit and publishes `hear-the-color-dist.tar.gz` as a GitHub Release
   asset. (Pushing a `v*` tag by hand also triggers it, but you don't need to.)

**On the server** (needs only `curl` and `tar`):

```bash
# first time: fetch the script (or git clone the repo, the script is in scripts/)
mkdir -p /home/alex123bobo/hear-the-color && cd /home/alex123bobo/hear-the-color
curl -fsSLO https://raw.githubusercontent.com/alex123bob/hear-the-color/main/scripts/server-deploy.sh
chmod +x server-deploy.sh

# every release
./server-deploy.sh              # latest release, or: ./server-deploy.sh v0.2.0
```

Layout it maintains under `/home/alex123bobo/hear-the-color`: `releases/<tag>/` (the 5 newest are kept) and a
`dist` symlink to the live one. Nginx serves `dist/`, so switching versions is instant and needs no reload.
**Rollback** is just `./server-deploy.sh <older-tag>`. If `dist/` already exists as a real folder from an
earlier manual copy, the script stops and tells you to move it away first.

The workflow builds without `VITE_API_BASE_URL`, so the page calls the same origin it is served from. The repo
is public, so no token is needed to download releases.

Open <https://lijialab.com/hear-the-color/> on your phone. Hard-refresh if you still see an old version.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Blank page, 404s for `assets/...` | `alias` path in Nginx is wrong (it must end in `/dist/`, the symlink), or the release archive is empty |
| 403 / 404 on the page | Nginx user can't read the folder: check permissions on `/home/alex123bobo` and `hear-the-color` |
| Page loads, camera refused | Not on HTTPS, or camera permission denied in the browser |
| Caption says "Network seems to have an issue" | `/api/see` unreachable or returned 5xx: check `~/ppaiservice.log` and the provider key/model |
| Caption says "Too many requests, please wait a moment" | Rate limit hit (20 requests/minute per IP) |
| Works for OpenAI, fails for DeepSeek | The DeepSeek model doesn't accept images |

## Rolling back

- **Frontend:** `./server-deploy.sh <previous-tag>` on the server (instant, no rebuild).
- **Provider:** set `AI_PROVIDER=openai` (needs `OPENAI_API_KEY` and OpenAI access from the server's region) in the backend `.env` and run `./stop.sh && ./start.sh`.
- **Remove the app:** delete the Nginx `location /hear-the-color` blocks and reload; `/api/*` is unaffected.
