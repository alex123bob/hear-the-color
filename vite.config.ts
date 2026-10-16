import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  // 本地开发时 VITE_API_BASE_URL 留空，请求走 /api 并由 dev server 代理到本地 Flask
  const proxyTarget = env.DEV_PROXY_TARGET || 'http://localhost:8000'
  return {
    plugins: [react()],
    server: {
      host: true, // 监听 0.0.0.0，手机/局域网 IP 也能访问
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
