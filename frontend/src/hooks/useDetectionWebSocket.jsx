import { useEffect, useRef, useState, useCallback } from 'react'

export function useDetectionWebSocket(sessionId) {
  const [latestFrame, setLatestFrame] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('disconnected')
  const [errorMessage, setErrorMessage] = useState(null)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onclose = null // prevent close handler from firing reconnect
      wsRef.current.close()
      wsRef.current = null
    }
    setConnectionStatus('disconnected')
  }, [])

  const connect = useCallback(() => {
    if (!sessionId) return

    // If already connected or connecting to the same session, skip
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    setConnectionStatus('connecting')
    setErrorMessage(null)

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const customWsBase = import.meta.env.VITE_WS_URL
    let wsUrl
    if (customWsBase) {
      const base = customWsBase.replace(/\/+$/, '')
      const path = base.endsWith('/ws') ? '/detection' : '/ws/detection'
      wsUrl = `${base}${path}?session_id=${encodeURIComponent(sessionId)}`
    } else {
      wsUrl = `${protocol}//${window.location.host}/ws/detection?session_id=${encodeURIComponent(sessionId)}`
    }
    
    let ws
    try {
      ws = new WebSocket(wsUrl)
    } catch (err) {
      setConnectionStatus('error')
      setErrorMessage(err.message || 'Failed to establish WebSocket connection')
      return
    }

    wsRef.current = ws

    ws.onopen = () => {
      setConnectionStatus('connected')
      setErrorMessage(null)
    }

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data)
        setLatestFrame(frame)
      } catch (err) {
        console.error('Failed to parse frame JSON:', err)
      }
    }

    ws.onclose = (event) => {
      wsRef.current = null
      if (event.code === 1000) {
        setConnectionStatus('disconnected')
        return
      }

      if (event.code === 4000 || event.code === 4004) {
        setConnectionStatus('error')
        setErrorMessage(event.reason || (event.code === 4004 ? 'Session expired or not found' : 'Stream error occurred'))
        return
      }

      setConnectionStatus('disconnected')
      // Auto-reconnect for unexpected drops
      reconnectTimeoutRef.current = window.setTimeout(() => {
        if (sessionId) connect()
      }, 2000)
    }

    ws.onerror = (err) => {
      console.warn('WebSocket encountered an error:', err)
    }
  }, [sessionId])

  useEffect(() => {
    if (sessionId) {
      connect()
    } else {
      disconnect()
      setLatestFrame(null)
      setErrorMessage(null)
    }

    return () => {
      disconnect()
    }
  }, [sessionId, connect, disconnect])

  const sendFrame = useCallback((frameData) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'frame', frame: frameData }))
      return true
    }
    return false
  }, [])

  return { latestFrame, connect, disconnect, connectionStatus, errorMessage, sendFrame }
}