// Backend origin. Empty means same-origin (local dev proxy and the Nginx deployment)
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
