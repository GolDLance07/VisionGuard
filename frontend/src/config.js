// Centralized configuration for VisionGuard API and WebSocket endpoints
// Handles local development proxying vs production cloud deployments (Vercel -> Render)

export const DEFAULT_CLOUD_API = 'https://visionguard-c4et.onrender.com'
export const DEFAULT_CLOUD_WS = 'wss://visionguard-c4et.onrender.com'

export function getApiBase() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '')
  }
  // When running locally on Vite dev server, use empty string to leverage the Vite proxy (/api -> localhost:8000)
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return ''
  }
  // On cloud hosting (e.g. Vercel), route directly to the active Render backend
  return DEFAULT_CLOUD_API
}

export function getWsBase() {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL.replace(/\/+$/, '')
  }
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}`
  }
  // On cloud hosting (e.g. Vercel), route WebSocket directly to the active Render backend
  return DEFAULT_CLOUD_WS
}
