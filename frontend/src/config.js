// Centralized configuration for VisionGuard API and WebSocket endpoints
// Follows VisionGuard Full Refactoring Specification §3.2 and §5.4:
// - Deterministic same-origin proxy in local development (Vite -> localhost:8000)
// - Explicit environment variables for cross-origin deployment
// - No silent or hardcoded cloud fallbacks

export function getApiBase() {
  const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL
  if (envUrl) {
    return envUrl.replace(/\/+$/, '')
  }
  // When running locally on Vite dev server or with same-origin reverse proxy,
  // return empty string so relative paths (/api/...) are routed by Vite or Nginx proxy
  return ''
}

export function getWsBase() {
  const envWs = import.meta.env.VITE_WS_BASE_URL || import.meta.env.VITE_WS_URL
  if (envWs) {
    return envWs.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}`
  }
  return 'ws://localhost:5173'
}

export function getRuntimeConfig() {
  const isLocal =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  return {
    apiBase: getApiBase(),
    wsBase: getWsBase(),
    isLocal,
    mode: import.meta.env.MODE,
  }
}

export function getSnapshotUrl(incident) {
  if (!incident) return null
  const src = incident.imageUrl || incident.frame
  if (!src || typeof src !== 'string') return null
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src
  }
  if (src.startsWith('/')) {
    const base = getApiBase()
    return base ? `${base}${src}` : src
  }
  return `data:image/jpeg;base64,${src}`
}

