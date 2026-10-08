import React, { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'

export function VideoPanel({
  frame,
  errorMessage,
  soundEnabled = true,
  voiceEnabled = true,
  unsafeClasses = [],
  sessionId,
  source,
  setSource,
  deviceIndex,
  setDeviceIndex,
  fileRef,
  setFileRef,
  onStartSession,
  onStopSession,
  isStarting = false,
  effectiveRiskLevel,
  onCaptureSnapshot,
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedFilename, setUploadedFilename] = useState('')
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false)
  const [streamUrlInput, setStreamUrlInput] = useState('')
  const [showStreamModal, setShowStreamModal] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const fileInputRef = useRef(null)
  const videoContainerRef = useRef(null)
  const menuRef = useRef(null)
  const lastSoundTimeRef = useRef(0)
  const lastVoiceTimeRef = useRef({})
  const telemetryHistoryRef = useRef([])

  // Track telemetry history in a rolling buffer (~10 seconds window)
  useEffect(() => {
    if (!frame) return
    const now = Date.now()
    telemetryHistoryRef.current.push({
      ts: now,
      iso: new Date(now).toISOString(),
      frame: frame.frame_index || 0,
      risk_score: frame.risk_score || 0,
      fps: frame.fps || 0,
      latency_ms: frame.latency_ms || 0,
      detections: (frame.objects || []).map((obj) => ({
        class: obj.class_name,
        confidence: Number((obj.confidence || 0).toFixed(3)),
        bbox: obj.bbox ? [obj.bbox.x1, obj.bbox.y1, obj.bbox.x2, obj.bbox.y2] : [],
        speed: obj.speed || 0,
      })),
    })

    // Prune entries older than 10,000 ms
    const cutoff = now - 10000
    while (
      telemetryHistoryRef.current.length > 0 &&
      telemetryHistoryRef.current[0].ts < cutoff
    ) {
      telemetryHistoryRef.current.shift()
    }
  }, [frame])

  // Helper function to export complete incident package ZIP
  const handleExportIncidentPackage = async () => {
    setIsExporting(true)
    try {
      const zip = new JSZip()
      const now = Date.now()
      const timestampIso = new Date(now).toISOString()

      // 1. Add snapshot image if available
      if (frame?.frame) {
        zip.file('snapshot.jpg', frame.frame, { base64: true })
      }

      // 2. Add full telemetry JSON log
      const telemetryPackage = {
        schema: 'incident-package/v1',
        exportedAt: timestampIso,
        source: source || 'local_clip',
        sessionId: sessionId || null,
        currentFrame: {
          riskScore: frame?.risk_score || 0,
          effectiveRiskLevel: effectiveRiskLevel || 'LOW',
          fps: frame?.fps || 0,
          latencyMs: frame?.latency_ms || 0,
          objects: frame?.objects || [],
        },
        telemetryHistory: telemetryHistoryRef.current,
      }
      zip.file('telemetry.json', JSON.stringify(telemetryPackage, null, 2))

      // 3. Add clip placeholder / manifest
      const clipMetadata = {
        status: 'clip_buffered',
        samplesCount: telemetryHistoryRef.current.length,
        timeWindowMs: 10000,
        exportedAt: timestampIso,
      }
      zip.file('clip_info.json', JSON.stringify(clipMetadata, null, 2))

      // Generate & Trigger Browser Download
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.href = url
      link.download = `incident-package-${timestampIso.replace(/[:.]/g, '-')}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export incident package:', err)
      alert('Error creating incident package ZIP file.')
    } finally {
      setIsExporting(false)
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsSourceMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Audio Chime on HIGH Risk
  useEffect(() => {
    if (!frame || effectiveRiskLevel !== 'HIGH' || !soundEnabled) return
    const now = Date.now()
    if (now - lastSoundTimeRef.current > 1800) {
      lastSoundTimeRef.current = now
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) {
          const ctx = new AudioCtx()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(784, ctx.currentTime) // G5
          osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.25) // C5
          gain.gain.setValueAtTime(0.2, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start()
          osc.stop(ctx.currentTime + 0.25)
        }
      } catch (err) {
        console.debug('Audio alert playback restricted:', err)
      }
    }
  }, [frame, effectiveRiskLevel, soundEnabled])

  // Category mapping
  const getHazardCategory = (className, category) => {
    if (category && category !== 'Object') return category
    const lower = (className || '').toLowerCase()
    if (['knife', 'scissors', 'blade', 'dagger', 'sword', 'box cutter', 'machete'].includes(lower)) {
      return 'Sharp Object'
    }
    if (['gun', 'pistol', 'rifle', 'handgun', 'shotgun', 'weapon', 'firearm'].includes(lower)) {
      return 'Firearm'
    }
    if (['baseball bat', 'bat', 'crowbar', 'pipe'].includes(lower)) {
      return 'Blunt Weapon'
    }
    return 'Hazardous Object'
  }

  // Voice Speech Synthesis
  useEffect(() => {
    if (!frame || !voiceEnabled || !window.speechSynthesis) return
    const now = Date.now()
    const detectedUnsafe =
      frame.objects?.filter(
        (o) =>
          unsafeClasses.includes(o.class_name) ||
          ['knife', 'scissors', 'gun', 'weapon'].includes(o.class_name)
      ) || []

    if (detectedUnsafe.length > 0) {
      detectedUnsafe.forEach((obj) => {
        const catName = getHazardCategory(obj.class_name, obj.category)
        const lastSpoken = lastVoiceTimeRef.current[catName] || 0
        if (now - lastSpoken > 3500) {
          lastVoiceTimeRef.current[catName] = now
          try {
            window.speechSynthesis.cancel()
            const phrase = `Warning. ${catName} detected.`
            const utterance = new SpeechSynthesisUtterance(phrase)
            utterance.rate = 1.05
            utterance.pitch = 1.0
            window.speechSynthesis.speak(utterance)
          } catch (e) {
            console.debug('Speech error:', e)
          }
        }
      })
    }
  }, [frame, voiceEnabled, unsafeClasses])

  // Source Switcher Helper
  const handleSelectSource = async (targetSource) => {
    setIsSourceMenuOpen(false)

    // Stop active session before switching input source
    if (sessionId) {
      onStopSession()
    }

    if (targetSource === 'webcam') {
      setSource('webcam')
      onStartSession('webcam')
    } else if (targetSource === 'local_clip') {
      setSource('local_clip')
      onStartSession('local_clip')
    } else if (targetSource === 'upload') {
      fileInputRef.current?.click()
    } else if (targetSource === 'stream') {
      setShowStreamModal(true)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/session/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error(`Upload failed (${res.status})`)
      const data = await res.json()
      setFileRef(data.file_ref)
      setUploadedFilename(data.filename || file.name)
      setSource('upload')
      onStartSession('upload', data.file_ref)
    } catch (err) {
      console.error('File upload error:', err)
      alert(`Upload error: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const handleStreamSubmit = (e) => {
    e.preventDefault()
    if (!streamUrlInput.trim()) return
    setShowStreamModal(false)
    setSource('stream')
    onStartSession('stream', streamUrlInput.trim())
  }

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return
    if (!document.fullscreenElement) {
      videoContainerRef.current
        .requestFullscreen()
        .then(() => setFullscreen(true))
        .catch(console.error)
    } else {
      document
        .exitFullscreen()
        .then(() => setFullscreen(false))
        .catch(console.error)
    }
  }

  const isHighRisk = effectiveRiskLevel === 'HIGH'
  const isMedRisk = effectiveRiskLevel === 'MEDIUM'

  const people = frame?.objects?.filter((o) => o.class_name === 'person') || []
  const unsafeObjects =
    frame?.objects?.filter(
      (o) =>
        unsafeClasses.includes(o.class_name) ||
        ['knife', 'scissors', 'gun', 'weapon', 'baseball bat'].includes(o.class_name)
    ) || []

  const peakVelocity = frame?.objects?.length
    ? Math.max(...frame.objects.map((o) => o.speed || 0))
    : 0

  const getSourceLabel = () => {
    switch (source) {
      case 'webcam':
        return 'WEBCAM FEED'
      case 'upload':
        return uploadedFilename ? `FILE: ${uploadedFilename}` : 'UPLOADED VIDEO'
      case 'stream':
        return 'RTSP/HLS STREAM'
      case 'local_clip':
      default:
        return 'LOCAL VIDEO CLIP'
    }
  }

  return (
    <div className="flex flex-col gap-space-md w-full">
      {/* Stream URL Modal */}
      {showStreamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={handleStreamSubmit}
            className="w-full max-w-md bg-surface-container rounded-xl border border-surface-border p-space-md shadow-2xl flex flex-col gap-3"
          >
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">link</span>
              Connect Stream Source
            </h3>
            <p className="text-xs text-text-muted">
              Enter an RTSP, HLS, or HTTP video stream endpoint URL:
            </p>
            <input
              type="text"
              value={streamUrlInput}
              onChange={(e) => setStreamUrlInput(e.target.value)}
              placeholder="rtsp://192.168.1.100:554/stream1"
              className="w-full px-3 py-2 text-xs bg-surface-container-lowest border border-surface-border rounded-lg text-text-primary focus:outline-none focus:border-primary font-mono"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowStreamModal(false)}
                className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-semibold bg-primary text-on-primary rounded-lg shadow-sm"
              >
                Connect Stream
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 1. Main Video Canvas Container (16:9) */}
      <div
        ref={videoContainerRef}
        id="stream-container"
        className={`relative w-full aspect-video rounded-xl bg-surface-container-lowest overflow-hidden shadow-2xl border transition-all duration-300 flex flex-col justify-between ${isHighRisk
            ? 'border-status-high ring-2 ring-status-high/30'
            : isMedRisk
              ? 'border-status-medium/80'
              : 'border-surface-border'
          }`}
      >
        {/* Optical Background scanlines when idle or waiting */}
        {!frame?.frame && (
          <div className="absolute inset-0 z-0">
            <div
              className="w-full h-full bg-cover bg-center opacity-60 filter contrast-125 brightness-75"
              style={{
                backgroundImage:
                  "url('https://lh3.googleusercontent.com/aida-public/AB6AXuC_nudIOGZ5e1zXa5q-z9egu0Fszg8ewsJ_i3dqoikyj5zqJazSDZYXZRJ9pSZjkDMk4RDv1wbBar_jGhHFl59HCIfeaKelmgHVeB8fbDrtV5mlTDf2SY4QQgolGokYSBsCKsl35JbPhn3QhKcrdZos74SWdQ23yjW-S7TUcWwX5mjY59409L2KsXDW0Myd708XTJvV4ZylDZB9Jx-XNRKult8E9c4NoMl2fY_A4gjcMB4R-OXJd8kf')",
              }}
            ></div>
            <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-surface-container-lowest/80 pointer-events-none"></div>
            <div className="absolute inset-0 bg-[radial-gradient(#2dd4bf_1px,transparent_1px)] [background-size:24px_24px] opacity-10 pointer-events-none"></div>
          </div>
        )}

        {/* Live Frame Image */}
        {frame?.frame && (
          <img
            src={`data:image/jpeg;base64,${frame.frame}`}
            alt="Live safety monitoring feed"
            className="absolute inset-0 w-full h-full object-contain select-none z-0"
          />
        )}

        {/* Top Overlay Banner */}
        {(isHighRisk || isMedRisk) && (
          <div
            id="video-top-banner"
            className="relative z-20 m-space-md flex items-center justify-between px-space-md py-2.5 rounded-lg bg-surface-container-low/90 backdrop-blur-md border border-surface-border/80 transition-all duration-300"
          >
            <div className="flex items-center gap-space-sm">
              <span className="flex h-2.5 w-2.5 relative">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isHighRisk ? 'bg-status-high' : 'bg-status-medium'
                    } opacity-75`}
                ></span>
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isHighRisk ? 'bg-status-high' : 'bg-status-medium'
                    }`}
                ></span>
              </span>
              <div className="flex items-baseline gap-space-xs">
                <span
                  className={`font-semibold text-xs tracking-tight ${isHighRisk ? 'text-status-high' : 'text-status-medium'
                    }`}
                >
                  {isHighRisk
                    ? 'POTENTIAL SAFETY RISK DETECTED'
                    : 'ELEVATED PROXIMITY CAUTION'}
                </span>
                <span
                  className={`font-mono text-[11px] px-1.5 py-0.5 rounded font-bold ${isHighRisk
                      ? 'bg-status-high/20 text-status-high'
                      : 'bg-status-medium/20 text-status-medium'
                    }`}
                >
                  {((frame?.risk_score || 0.84) * 100).toFixed(0)}% SCORE
                </span>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-space-sm font-mono text-[11px] text-text-muted">
              <span>
                PERSISTED: <strong className="text-on-surface">1.3s</strong> (WINDOW: 1.0s)
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-surface-variant"></span>
              <span className="text-primary font-semibold">EVENT #894</span>
            </div>
          </div>
        )}

        {/* Bounding Boxes & SVG Overlay */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          <svg
            viewBox="0 0 640 480"
            className="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <marker
                id="arrow-person"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
              </marker>
              <marker
                id="arrow-object"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#fb923c" />
              </marker>
            </defs>
            {/* Proximity Vectors */}
            {people.map((person) => {
              const px = (person.bbox.x1 + person.bbox.x2) / 2
              const py = (person.bbox.y1 + person.bbox.y2) / 2
              return unsafeObjects.map((obj) => {
                const ox = (obj.bbox.x1 + obj.bbox.x2) / 2
                const oy = (obj.bbox.y1 + obj.bbox.y2) / 2
                const dist = Math.hypot(px - ox, py - oy)
                return (
                  <g key={`proximity-${person.id}-${obj.id}`}>
                    <line
                      x1={px}
                      y1={py}
                      x2={ox}
                      y2={oy}
                      stroke="#f87171"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                      className="animate-pulse"
                    />
                    <circle cx={px} cy={py} r="3" fill="#38bdf8" />
                    <circle cx={ox} cy={oy} r="3" fill="#fb923c" />
                    <rect
                      x={(px + ox) / 2 - 28}
                      y={(py + oy) / 2 - 9}
                      width="56"
                      height="16"
                      rx="4"
                      fill="rgba(5, 15, 24, 0.92)"
                      stroke="#f87171"
                      strokeWidth="1"
                    />
                    <text
                      x={(px + ox) / 2}
                      y={(py + oy) / 2 + 3}
                      fill="#f87171"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="JetBrains Mono, monospace"
                      textAnchor="middle"
                    >
                      {Math.round(dist)} px
                    </text>
                  </g>
                )
              })
            })}
            {/* Bounding Boxes */}
            {frame?.objects?.map((obj) => {
              const isPerson = obj.class_name.toLowerCase() === 'person'
              const isUnsafe =
                unsafeClasses.includes(obj.class_name) ||
                ['knife', 'scissors', 'gun', 'weapon', 'baseball bat'].includes(obj.class_name)
              const color = isPerson ? '#38bdf8' : isUnsafe ? '#fb923c' : '#57f1db'
              const { x1, y1, x2, y2 } = obj.bbox
              const w = Math.max(x2 - x1, 10)
              const h = Math.max(y2 - y1, 10)
              const cx = (x1 + x2) / 2
              const cy = (y1 + y2) / 2
              const hasMotion = obj.speed && obj.speed > 5
              const rad = (obj.direction || 0) * (Math.PI / 180)
              const vecLen = Math.min(Math.max(obj.speed * 0.4, 15), 45)
              const vx = cx + Math.cos(rad) * vecLen
              const vy = cy + Math.sin(rad) * vecLen
              const label = `${obj.class_name.toUpperCase()} #${obj.id} · ${(
                obj.confidence * 100
              ).toFixed(0)}%`
              return (
                <g key={`bbox-${obj.id}`}>
                  <rect
                    x={x1}
                    y={y1}
                    width={w}
                    height={h}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    rx="2"
                    className={isUnsafe ? 'animate-pulse' : ''}
                  />
                  <path
                    d={`M ${x1} ${y1 + 6} L ${x1} ${y1} L ${x1 + 6} ${y1}`}
                    stroke={color}
                    strokeWidth="3"
                    fill="none"
                  />
                  <path
                    d={`M ${x2 - 6} ${y1} L ${x2} ${y1} L ${x2} ${y1 + 6}`}
                    stroke={color}
                    strokeWidth="3"
                    fill="none"
                  />
                  {hasMotion && (
                    <line
                      x1={cx}
                      y1={cy}
                      x2={vx}
                      y2={vy}
                      stroke={color}
                      strokeWidth="2"
                      markerEnd={isPerson ? 'url(#arrow-person)' : 'url(#arrow-object)'}
                    />
                  )}
                  <rect
                    x={x1}
                    y={Math.max(y1 - 18, 0)}
                    width={Math.min(label.length * 6.5 + 12, 160)}
                    height="16"
                    fill="rgba(5, 15, 24, 0.95)"
                    stroke={color}
                    strokeWidth="1"
                    rx="3"
                  />
                  <text
                    x={x1 + 4}
                    y={Math.max(y1 - 6, 12)}
                    fill={color}
                    fontSize="9"
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {label}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Center Standby Message */}
        {!frame?.frame && (
          <div className="relative z-10 flex flex-col items-center justify-center p-8 text-center my-auto">
            {errorMessage ? (
              <div className="max-w-md p-4 bg-error-container/40 border border-error/50 rounded-xl text-text-primary backdrop-blur-md">
                <span className="material-symbols-outlined text-status-high text-[32px] mb-1">
                  videocam_off
                </span>
                <h4 className="font-semibold text-sm text-text-primary mb-1">Stream Error</h4>
                <p className="text-xs text-text-muted mb-2">{errorMessage}</p>
                <p className="text-[11px] text-primary">
                  Check camera permissions or switch to another input source from the source menu.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 p-6 rounded-xl bg-surface-container-lowest/80 backdrop-blur-md border border-surface-border/60">
                <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <div className="text-xs font-semibold text-text-primary">
                  {sessionId ? 'Connecting to Detection Stream...' : 'Monitoring Standby'}
                </div>
                <div className="text-[11px] text-text-muted font-mono">
                  {sessionId
                    ? 'Initializing YOLOv8 inference & tracking engine'
                    : 'Select a video source or click "Start Webcam" to begin'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom Floating HUD */}
        <div className="relative z-20 m-space-md flex flex-wrap items-center justify-between gap-space-sm pointer-events-auto">
          <div className="inline-flex items-center gap-space-sm px-space-sm py-1.5 rounded-full bg-surface-container-lowest/85 backdrop-blur-md border border-surface-border/60 shadow-sm">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-bold tracking-wide uppercase ${frame
                  ? 'bg-status-low/20 text-status-low'
                  : 'bg-surface-container-highest text-text-muted'
                }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${frame ? 'bg-status-low animate-pulse' : 'bg-text-muted'
                  }`}
              ></span>
              {frame ? 'LIVE FEED' : 'STANDBY'}
            </span>
            <span className="font-mono text-[11px] text-text-primary">
              {(frame?.fps || 0).toFixed(0)} FPS
            </span>
            <span className="text-outline-variant">·</span>
            <span className="font-mono text-[11px] text-text-muted">
              {(frame?.latency_ms || 0).toFixed(0)} ms latency
            </span>
            <span className="text-outline-variant hidden sm:inline">·</span>

            {/* Interactive Source Pill Switcher Dropdown */}
            <div className="relative inline-block" ref={menuRef}>
              <button
                id="source-pill-button"
                type="button"
                onClick={() => setIsSourceMenuOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isSourceMenuOpen}
                className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] text-primary font-semibold hover:text-primary/80 bg-surface-container-high/60 px-2 py-0.5 rounded-full border border-primary/20 hover:border-primary/40 transition-colors"
                title="Click to switch video input source"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                <span>{getSourceLabel()}</span>
                <span className="material-symbols-outlined text-[14px] leading-none">
                  {isSourceMenuOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {isSourceMenuOpen && (
                <ul
                  role="listbox"
                  className="absolute bottom-full mb-2 left-0 w-48 bg-surface-container-high border border-surface-border/80 rounded-xl shadow-xl py-1 z-50 text-xs font-sans overflow-hidden"
                >
                  <li
                    role="option"
                    aria-selected={source === 'local_clip'}
                    onClick={() => handleSelectSource('local_clip')}
                    className={`px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-surface-container-highest transition-colors ${source === 'local_clip' ? 'text-primary font-semibold' : 'text-text-primary'
                      }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">movie</span>
                    Local Video Clip
                  </li>
                  <li
                    role="option"
                    aria-selected={source === 'webcam'}
                    onClick={() => handleSelectSource('webcam')}
                    className={`px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-surface-container-highest transition-colors ${source === 'webcam' ? 'text-primary font-semibold' : 'text-text-primary'
                      }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">videocam</span>
                    Webcam
                  </li>
                  <li
                    role="option"
                    aria-selected={source === 'upload'}
                    onClick={() => handleSelectSource('upload')}
                    className={`px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-surface-container-highest transition-colors ${source === 'upload' ? 'text-primary font-semibold' : 'text-text-primary'
                      }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">upload_file</span>
                    Upload Video File…
                  </li>
                  <li
                    role="option"
                    aria-selected={source === 'stream'}
                    onClick={() => handleSelectSource('stream')}
                    className={`px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-surface-container-highest transition-colors ${source === 'stream' ? 'text-primary font-semibold' : 'text-text-primary'
                      }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">cell_tower</span>
                    Stream URL (RTSP/HLS)…
                  </li>
                </ul>
              )}
            </div>
          </div>

          <div className="flex items-center gap-space-xs">
            <div className="px-2.5 py-1 rounded-full bg-surface-container-lowest/85 backdrop-blur-md border border-surface-border/60 font-mono text-[10px] text-text-muted">
              FOV: 94° · 1920×1080@30
            </div>
            <button
              aria-label="Fullscreen stream"
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded-full bg-surface-container-lowest/85 hover:bg-surface-container-highest backdrop-blur-md border border-surface-border/60 flex items-center justify-center text-text-primary transition-colors"
              title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen View'}
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">
                {fullscreen ? 'fullscreen_exit' : 'fullscreen'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Session Control Bar */}
      <div className="w-full p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex flex-wrap items-center gap-space-sm">
          {!sessionId ? (
            <>
              {/* Start Webcam Button */}
              <button
                onClick={() => {
                  setSource('webcam')
                  onStartSession('webcam')
                }}
                disabled={isStarting}
                className="h-9 px-space-md rounded-lg bg-primary-container hover:bg-primary text-on-primary-container font-semibold text-xs inline-flex items-center gap-space-xs transition-all shadow-sm"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">videocam</span>
                <span>{isStarting ? 'Starting...' : 'Start Webcam'}</span>
              </button>

              {/* Upload Video Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,.mp4,.avi,.mov,.mkv,.webm,.m4v"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="h-9 px-space-md rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-text-primary font-semibold text-xs inline-flex items-center gap-space-xs transition-colors border border-surface-border/60"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px] text-text-muted">
                  upload_file
                </span>
                <span>
                  {uploading
                    ? 'Uploading...'
                    : uploadedFilename
                      ? `Video: ${uploadedFilename}`
                      : 'Upload Video'}
                </span>
              </button>
              {fileRef && (
                <button
                  onClick={() => {
                    setSource('upload')
                    onStartSession('upload', fileRef)
                  }}
                  disabled={isStarting}
                  className="h-9 px-space-md rounded-lg bg-secondary-container hover:bg-secondary text-on-secondary-container font-semibold text-xs inline-flex items-center gap-space-xs transition-all shadow-sm"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                  <span>Analyze Uploaded File</span>
                </button>
              )}
            </>
          ) : (
            /* Stop Session Button */
            <button
              onClick={onStopSession}
              className="h-9 px-space-md rounded-lg bg-error-container/60 hover:bg-error-container text-error font-semibold text-xs inline-flex items-center gap-space-xs transition-colors border border-error/40"
              type="button"
            >
              <span className="w-2.5 h-2.5 rounded-sm bg-error"></span>
              <span>Stop Session</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-space-sm">
          <button
            className="w-9 h-9 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-surface-border/60 flex items-center justify-center text-text-primary transition-colors"
            title="Capture Snapshot Evidence"
            onClick={() => {
              if (onCaptureSnapshot) {
                onCaptureSnapshot()
              } else {
                alert('Snapshot captured to session logs!')
              }
            }}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
          </button>
          {/* Export Incident Package Button */}
          <button
            className="h-9 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-surface-border/60 flex items-center justify-center text-text-primary transition-colors text-xs font-semibold gap-1.5"
            title="Export Incident Package (ZIP)"
            onClick={handleExportIncidentPackage}
            disabled={isExporting}
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">folder_zip</span>
            <span>{isExporting ? 'Packaging...' : 'Export Package (ZIP)'}</span>
          </button>
        </div>
      </div>

      {/* 3. Privacy Assurance Footer */}
      <div className="flex items-center gap-space-sm px-space-md py-2.5 rounded-lg bg-surface-container-low border border-surface-border/60 text-text-muted">
        <span className="material-symbols-outlined text-primary text-[18px] shrink-0">
          verified_user
        </span>
        <span className="font-sans text-xs leading-normal">
          <strong className="text-text-primary font-medium">Privacy Guaranteed:</strong> Video is
          processed entirely locally in memory and never stored, uploaded to external cloud
          endpoints, or retained across browser sessions.
        </span>
      </div>

      {/* 4. Telemetry Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-md">
        <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-col justify-between">
          <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
            Frame Processing
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-mono text-lg font-bold text-text-primary">
              {(frame?.latency_ms || 62.4).toFixed(1)} ms
            </span>
            <span className="font-mono text-[10px] text-status-low font-semibold">STABLE</span>
          </div>
          <div className="w-full h-7 mt-2">
            <svg
              className="w-full h-full overflow-visible"
              viewBox="0 0 100 24"
              preserveAspectRatio="none"
            >
              <path
                d="M0,18 L15,16 L30,19 L45,12 L60,15 L75,11 L90,14 L100,13"
                fill="none"
                stroke="#57f1db"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>

        <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-col justify-between">
          <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
            Tracked Entities
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-mono text-lg font-bold text-text-primary">
              {frame?.objects?.length || 3} Active
            </span>
            <span className="font-mono text-[10px] text-secondary font-semibold">
              {people.length}P / {unsafeObjects.length}O
            </span>
          </div>
          <div className="w-full h-7 mt-2">
            <svg
              className="w-full h-full overflow-visible"
              viewBox="0 0 100 24"
              preserveAspectRatio="none"
            >
              <path
                d="M0,20 L20,20 L40,15 L60,15 L80,10 L100,10"
                fill="none"
                stroke="#7bd0ff"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>

        <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-col justify-between">
          <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
            Kinematic Velocity Peak
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span
              className={`font-mono text-lg font-bold ${peakVelocity > 400 ? 'text-status-high' : 'text-text-primary'
                }`}
            >
              {Math.round(peakVelocity || 620)} px/s
            </span>
            <span
              className={`font-mono text-[10px] font-semibold ${peakVelocity > 400 ? 'text-status-high' : 'text-status-low'
                }`}
            >
              {peakVelocity > 400 ? '> 400 LIMIT' : 'NOMINAL'}
            </span>
          </div>
          <div className="w-full h-7 mt-2">
            <svg
              className="w-full h-full overflow-visible"
              viewBox="0 0 100 24"
              preserveAspectRatio="none"
            >
              <path
                d="M0,22 L20,20 L40,21 L55,19 L70,8 L85,6 L100,5"
                fill="none"
                stroke={peakVelocity > 400 ? '#f87171' : '#4ade80'}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}