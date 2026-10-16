# Hear the Color

给视障用户的网页版 AI 视觉助手：举起手机，浏览器打开摄像头，每 4 秒截一帧发给后端，
后端调用多模态大模型返回一句温暖、具体的中文描述，前端用浏览器 TTS 朗读出来。

- 前端：Vite + React 18 + TypeScript（本仓库，纯静态托管）
- 后端：复用 `PP-AI-Service`（Flask），新增 `POST /api/see`，**所有后端改动都在 PP-AI-Service 里**

## 本地运行

1. 启动后端（另一个仓库）：

   ```bash
   cd ../PP-AI-Service
   source venv/bin/activate && python app.py   # 监听 :8000
   ```

2. 启动前端：

   ```bash
   npm install
   npm run dev
   ```

   本地开发时 `.env.local` 不用配置：前端请求 `/api/see`，由 Vite 代理到 `http://localhost:8000`
   （可用 `DEV_PROXY_TARGET` 改代理目标）。

3. 访问：
   - 电脑：<http://localhost:5173>（浏览器视 localhost 为安全环境，可以直接用摄像头）
   - 手机/局域网：`http://<电脑IP>:5173`（dev server 已监听 0.0.0.0）。
     **注意：** 浏览器只在 HTTPS 或 localhost 下允许打开摄像头，所以局域网 IP 的 http 页面能打开、
     但摄像头会被拒绝。手机真机测试请用 HTTPS 隧道（如 `cloudflared tunnel --url http://localhost:5173`），
     或在 Chrome 的 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 中加入该地址。

## 配置 `VITE_API_BASE_URL`

复制 `.env.example` 为 `.env.local`：

```
VITE_API_BASE_URL=https://lijialab.com
```

留空则请求同源 `/api/see`（本地走 Vite 代理）。生产构建（静态托管在别的域名）必须填后端地址。

## 部署

### 后端
新路由已在 `PP-AI-Service/app.py`。把代码拉到服务器，重启 Flask 即可，**无需改 Nginx**
（`location /api` 已经转发到 `localhost:8000`）。

### 切换模型服务商
在后端 `.env` 里改 `AI_PROVIDER`，然后重启 Flask：

| 变量 | 说明 |
| --- | --- |
| `AI_PROVIDER` | `openai`（默认）或 `deepseek` |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL`（可选，兼容旧的 `OPENAI_API_BASE`）/ `OPENAI_MODEL`（默认 `gpt-4o-mini`） | OpenAI |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）/ `DEEPSEEK_MODEL`（默认 `deepseek-flash`） | DeepSeek |

`AI_PROVIDER` 只影响 `/api/see`；`/api/image` 始终使用 OpenAI。
注意：所选模型必须支持图片输入，否则 `/api/see` 会返回 500。

### 前端

```bash
npm run build
vercel --prod        # 或 firebase deploy
```

在托管平台设置环境变量 `VITE_API_BASE_URL`（构建时注入）。

## 提醒

- API Key 只存在后端 `.env`，前端永远不接触。
- 手机访问必须 HTTPS（线上由 Nginx 提供）。
- `/api/see` 带有按 IP 每分钟 20 次的内存限流（4 秒一帧约 15 次/分钟）。
