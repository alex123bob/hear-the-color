import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  // In local dev, leave VITE_API_BASE_URL empty: /api requests are proxied by the dev server to local Flask
  const proxyTarget = env.DEV_PROXY_TARGET || 'http://localhost:8000'
  return {
    plugins: [react()],
    server: {
      host: true, // Listen on 0.0.0.0 so phones / LAN IPs can reach it
      proxy: { '/api': { target: proxyTarget, changeOrigin: true } },
    },
    preview: { host: true, proxy: { '/api': { target: proxyTarget, changeOrigin: true } } },
    build: {
      target: 'es2020',
      minify: 'esbuild',
      sourcemap: false,
    },
  }
})
