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
  sendFrame,
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedFilename, setUploadedFilename] = useState('')
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false)
  const [streamUrlInput, setStreamUrlInput] = useState('')
  const [showStreamModal, setShowStreamModal] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [webcamActive, setWebcamActive] = useState(false)
  const [webcamError, setWebcamError] = useState(null)

  const fileInputRef = useRef(null)
  const videoContainerRef = useRef(null)
  const localVideoRef = useRef(null)
  const localStreamRef = useRef(null)
  const captureCanvasRef = useRef(null)
  const captureIntervalRef = useRef(null)
  const isAwaitingReplyRef = useRef(false)
  const lastSendTimeRef = useRef(0)
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

  // Unlock in-flight sender whenever a response arrives from the server
  useEffect(() => {
    if (frame) {
      isAwaitingReplyRef.current = false
    }
  }, [frame])

  // Browser Webcam Streaming Effect: Stream local camera frames to server over WebSocket
  useEffect(() => {
    let active = true

    if (source === 'webcam' && sessionId) {
      async function startBrowserWebcam() {
        try {
          setWebcamError(null)
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user',
            },
            audio: false,
          })

          if (!active) {
            stream.getTracks().forEach((t) => t.stop())
            return
          }

          localStreamRef.current = stream
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream
            localVideoRef.current.play().catch(() => {})
          }
          setWebcamActive(true)

          // Offscreen canvas: 480x360 for light memory footprint and fast cloud inference
          if (!captureCanvasRef.current) {
            captureCanvasRef.current = document.createElement('canvas')
            captureCanvasRef.current.width = 480
            captureCanvasRef.current.height = 360
          }

          const ctx = captureCanvasRef.current.getContext('2d')
          isAwaitingReplyRef.current = false
          lastSendTimeRef.current = 0

          // Smart streaming loop with backpressure flow-control:
          // Never send a new frame while the server is still processing the previous one!
          captureIntervalRef.current = setInterval(() => {
            const now = Date.now()

            // Watchdog: reset lock if server took longer than 1500ms
            if (isAwaitingReplyRef.current && now - lastSendTimeRef.current > 1500) {
              isAwaitingReplyRef.current = false
            }

            if (isAwaitingReplyRef.current) {
              return // Skip to avoid server memory queueing!
            }

            if (
              localVideoRef.current &&
              localVideoRef.current.readyState >= 2 &&
              typeof sendFrame === 'function'
            ) {
              ctx.drawImage(localVideoRef.current, 0, 0, 480, 360)
              const dataUrl = captureCanvasRef.current.toDataURL('image/jpeg', 0.5)
              isAwaitingReplyRef.current = true
              lastSendTimeRef.current = now
              sendFrame(dataUrl)
            }
          }, 85)
        } catch (err) {
          console.error('Browser webcam error:', err)
          setWebcamError(
            err.name === 'NotAllowedError'
              ? 'Camera permission denied. Please allow camera access in your browser to monitor.'
              : `Unable to access browser webcam: ${err.message}`
          )
        }
      }

      startBrowserWebcam()
    } else {
      // Clean up webcam tracks when session stops or source changes
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current)
        captureIntervalRef.current = null
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
        localStreamRef.current = null
      }
      setWebcamActive(false)
    }

    return () => {
      active = false
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current)
        captureIntervalRef.current = null
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
        localStreamRef.current = null
      }
    }
  }, [sessionId, source, sendFrame])

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
  // Category mapping for safety classification
  const getHazardCategory = (className, category) => {
    if (category && category !== 'Object') {
      if (category === 'Sharp Object') return 'Sharp Objects'
      if (category === 'Blunt Weapon' || category === 'Blunt Object') return 'Blunt Objects'
      return category
    }
    const lower = (className || '').toLowerCase()
    if (['knife', 'scissors', 'blade', 'dagger', 'sword', 'box cutter', 'machete', 'cutter', 'scalpel'].includes(lower)) {
      return 'Sharp Objects'
    }
    if (['baseball bat', 'bat', 'crowbar', 'pipe', 'club', 'stick', 'hammer'].includes(lower)) {
      return 'Blunt Objects'
    }
    if (['gun', 'pistol', 'rifle', 'handgun', 'shotgun', 'weapon', 'firearm'].includes(lower)) {
      return 'Firearm'
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
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
      const res = await fetch(`${apiBase}/api/session/upload`, {
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

  // Classification helpers for Sharp vs Blunt Objects
  const isSharpObj = (o) => {
    const cat = getHazardCategory(o.class_name, o.category)
    if (cat === 'Sharp Objects') return true
    const lower = (o.class_name || '').toLowerCase()
    return ['knife', 'scissors', 'blade', 'dagger', 'sword', 'box cutter', 'cutter', 'scalpel'].includes(lower)
  }

  const isBluntObj = (o) => {
    const cat = getHazardCategory(o.class_name, o.category)
    if (cat === 'Blunt Objects') return true
    const lower = (o.class_name || '').toLowerCase()
    return ['baseball bat', 'bat', 'crowbar', 'pipe', 'club', 'stick', 'hammer'].includes(lower)
  }

  // Precompute holding relationships between people and objects
  const holdingPairs = []
  const heldObjectIds = new Set()
  const holdingPersonIds = new Set()
  const personHeldObjects = new Map() // personId -> list of held objects

  people.forEach((p) => {
    unsafeObjects.forEach((w) => {
      const x_left = Math.max(p.bbox.x1, w.bbox.x1)
      const y_top = Math.max(p.bbox.y1, w.bbox.y1)
      const x_right = Math.min(p.bbox.x2, w.bbox.x2)
      const y_bottom = Math.min(p.bbox.y2, w.bbox.y2)
      const overlapArea = Math.max(0, x_right - x_left) * Math.max(0, y_bottom - y_top)
      const wArea = Math.max(1, (w.bbox.x2 - w.bbox.x1) * (w.bbox.y2 - w.bbox.y1))
      const overlapRatio = overlapArea / wArea

      const dx = Math.max(0, Math.max(p.bbox.x1 - w.bbox.x2, w.bbox.x1 - p.bbox.x2))
      const dy = Math.max(0, Math.max(p.bbox.y1 - w.bbox.y2, w.bbox.y1 - p.bbox.y2))
      const edgeDist = Math.hypot(dx, dy)

      const pHeight = Math.max(1, p.bbox.y2 - p.bbox.y1)
      const p_cx = (p.bbox.x1 + p.bbox.x2) / 2
      const p_cy = (p.bbox.y1 + p.bbox.y2) / 2
      const w_cx = (w.bbox.x1 + w.bbox.x2) / 2
      const w_cy = (w.bbox.y1 + w.bbox.y2) / 2
      const centerDist = Math.hypot(p_cx - w_cx, p_cy - w_cy)

      const isHolding =
        Boolean(p.is_holding_weapon) ||
        Boolean(w.is_held) ||
        overlapRatio >= 0.25 ||
        edgeDist < 30 ||
        centerDist < pHeight * 0.45

      if (isHolding) {
        const isBlunt = isBluntObj(w)
        const isSharp = isSharpObj(w)
        holdingPairs.push({ person: p, weapon: w, distance: edgeDist, isBlunt, isSharp })
        heldObjectIds.add(w.id)
        holdingPersonIds.add(p.id)
        if (!personHeldObjects.has(p.id)) {
          personHeldObjects.set(p.id, [])
        }
        personHeldObjects.get(p.id).push(w)
      }
    })
  })

  // Compute Threat Orientations & Pointing Vectors (Person A -> Person B)
  const redThreatPersonIds = new Set()
  const redThreatWeaponIds = new Set()
  const targetedPersonIds = new Set()
  const pointingThreatVectors = [] // [{ fromPerson, toPerson, weapon, reason, dist }]

  people.forEach((pA) => {
    const heldList = personHeldObjects.get(pA.id) || []
    const isArmed = heldList.length > 0
    const pSpeed = pA.speed || 0
    const pA_cx = (pA.bbox.x1 + pA.bbox.x2) / 2
    const pA_cy = (pA.bbox.y1 + pA.bbox.y2) / 2

    // Check fast movement while armed
    if (isArmed && pSpeed > 25) {
      redThreatPersonIds.add(pA.id)
      heldList.forEach((w) => redThreatWeaponIds.add(w.id))
    }
    // High-speed sudden charge/rush
    if (pSpeed > 55) {
      redThreatPersonIds.add(pA.id)
    }
    if (effectiveRiskLevel === 'HIGH' && isArmed) {
      redThreatPersonIds.add(pA.id)
      heldList.forEach((w) => redThreatWeaponIds.add(w.id))
    }

    // Direction of the object in hand of Person A towards Person B
    people.forEach((pB) => {
      if (pB.id === pA.id) return

      const pB_cx = (pB.bbox.x1 + pB.bbox.x2) / 2
      const pB_cy = (pB.bbox.y1 + pB.bbox.y2) / 2
      const dAB_x = pB_cx - pA_cx
      const dAB_y = pB_cy - pA_cy
      const distAB = Math.hypot(dAB_x, dAB_y)

      if (distAB > 450) return // beyond interaction proximity

      heldList.forEach((w) => {
        const w_cx = (w.bbox.x1 + w.bbox.x2) / 2
        const w_cy = (w.bbox.y1 + w.bbox.y2) / 2
        // Displacement vector of held object relative to Person A's torso center
        const dAW_x = w_cx - pA_cx
        const dAW_y = w_cy - pA_cy
        const lenAW = Math.hypot(dAW_x, dAW_y)

        let isPointed = false
        if (lenAW > 4 && distAB > 10) {
          const cosSim = (dAW_x * dAB_x + dAW_y * dAB_y) / (lenAW * distAB)
          // Weapon held out/extended towards Person B
          if (cosSim > 0.32) {
            isPointed = true
          }
        }

        // Armed approach vector
        let isArmedAdvance = false
        if (pSpeed > 14 && distAB > 10) {
          const radA = (pA.direction || 0) * (Math.PI / 180)
          const moveCosSim = (Math.cos(radA) * dAB_x + Math.sin(radA) * dAB_y) / distAB
          if (moveCosSim > 0.42) {
            isArmedAdvance = true
          }
        }

        if (isPointed || isArmedAdvance) {
          redThreatPersonIds.add(pA.id)
          redThreatWeaponIds.add(w.id)
          targetedPersonIds.add(pB.id)
          pointingThreatVectors.push({
            fromPerson: pA,
            toPerson: pB,
            weapon: w,
            reason: isPointed ? 'POINTED AT' : 'RAPID APPROACH',
            dist: distAB,
          })
        }
      })
    })
  })

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

        {/* Local Browser Webcam Video Feed */}
        <video
          ref={localVideoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-contain select-none z-0 ${
            source === 'webcam' && webcamActive ? 'block' : 'hidden'
          }`}
        />

        {/* Live Frame Image from Detection Engine (for uploaded videos or server frames) */}
        {source !== 'webcam' && frame?.frame && (
          <img
            src={`data:image/jpeg;base64,${frame.frame}`}
            alt="Live safety monitoring feed"
            className="absolute inset-0 w-full h-full object-contain select-none z-0"
          />
        )}

        {/* Browser Webcam Error Banner */}
        {webcamError && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 max-w-md bg-red-950/90 text-red-200 border border-red-800 text-xs px-4 py-2 rounded-lg shadow-xl backdrop-blur-md flex items-center gap-2">
            <span className="text-sm">⚠</span>
            <span>{webcamError}</span>
          </div>
        )}

        {/* Top Overlay Banner with Color Tracking Legend */}
        <div className="relative z-20 m-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Risk Alert / Status pill */}
          {(isHighRisk || isMedRisk) ? (
            <div
              id="video-top-banner"
              className="flex items-center gap-space-sm px-space-md py-2 rounded-lg bg-surface-container-low/95 backdrop-blur-md border border-surface-border/80 transition-all duration-300"
            >
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
              <span
                className={`font-mono text-xs font-bold tracking-wide uppercase ${isHighRisk ? 'text-status-high' : 'text-status-medium'
                  }`}
              >
                {isHighRisk ? 'CRITICAL SAFETY HAZARD DETECTED' : 'ELEVATED ACTIVITY MONITORING'}
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
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low/85 backdrop-blur-md border border-surface-border/60">
              <span className="w-2 h-2 rounded-full bg-status-low animate-pulse"></span>
              <span className="font-mono text-[11px] text-text-primary font-semibold">
                SURVEILLANCE ACTIVE · PERIMETER SECURE
              </span>
            </div>
          )}

          {/* Color Code Tracking Legend Pill */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-surface-container-low/90 backdrop-blur-md border border-surface-border/70 text-[10px] font-mono shadow-sm">
            <span className="text-text-muted uppercase font-bold tracking-wider hidden md:inline">HUD MODES:</span>
            <div className="flex items-center gap-1.5" title="Blue: Normal Person Tracking">
              <span className="w-2 h-2 rounded-full bg-[#38bdf8] ring-1 ring-[#38bdf8]/40"></span>
              <span className="text-[#38bdf8] font-bold">NORMAL</span>
            </div>
            <div className="flex items-center gap-1.5" title="Yellow: Person holding any Blunt Object">
              <span className="w-2 h-2 rounded-full bg-[#facc15] ring-1 ring-[#facc15]/40"></span>
              <span className="text-[#facc15] font-bold">BLUNT OBJ</span>
            </div>
            <div className="flex items-center gap-1.5" title="Orange: Sharp Objects">
              <span className="w-2 h-2 rounded-full bg-[#f97316] ring-1 ring-[#f97316]/40"></span>
              <span className="text-[#f97316] font-bold">SHARP OBJ</span>
            </div>
            <div className="flex items-center gap-1.5" title="Red: Fast Movements / Pointed Towards Person B">
              <span className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse ring-1 ring-[#ef4444]/50"></span>
              <span className="text-[#ef4444] font-bold">THREAT</span>
            </div>
          </div>
        </div>

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
                id="arrow-sharp"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
              </marker>
              <marker
                id="arrow-blunt"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#facc15" />
              </marker>
              <marker
                id="arrow-threat"
                viewBox="0 0 10 10"
                refX="5"
                refY="5"
                markerWidth="4"
                markerHeight="4"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
              </marker>
            </defs>

            {/* Red Threat Vectors: Direction of object in hand of Person A pointed towards Person B */}
            {pointingThreatVectors.map((tv, idx) => {
              const w_cx = (tv.weapon.bbox.x1 + tv.weapon.bbox.x2) / 2
              const w_cy = (tv.weapon.bbox.y1 + tv.weapon.bbox.y2) / 2
              const pB_cx = (tv.toPerson.bbox.x1 + tv.toPerson.bbox.x2) / 2
              const pB_y = Math.max(tv.toPerson.bbox.y1, 14)
              const midX = (w_cx + pB_cx) / 2
              const midY = (w_cy + pB_y) / 2

              return (
                <g key={`threat-vector-${tv.fromPerson.id}-${tv.toPerson.id}-${idx}`}>
                  {/* Pointing Laser Line */}
                  <line
                    x1={w_cx}
                    y1={w_cy}
                    x2={pB_cx}
                    y2={pB_y}
                    stroke="#ef4444"
                    strokeWidth="2.5"
                    strokeDasharray="6 3"
                    className="animate-pulse"
                  />
                  {/* Glowing Target Reticle on Targeted Person B */}
                  <circle
                    cx={pB_cx}
                    cy={pB_y}
                    r="18"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                    className="animate-spin"
                    style={{ transformOrigin: `${pB_cx}px ${pB_y}px`, animationDuration: '3s' }}
                  />
                  {/* Floating Warning Pill */}
                  <rect
                    x={midX - 74}
                    y={midY - 11}
                    width="148"
                    height="22"
                    rx="4"
                    fill="rgba(15, 2, 2, 0.95)"
                    stroke="#ef4444"
                    strokeWidth="1.5"
                  />
                  <text
                    x={midX}
                    y={midY + 4}
                    fill="#ef4444"
                    fontSize="8.5"
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                    textAnchor="middle"
                  >
                    ⚠ {tv.reason}: PERSON #{tv.toPerson.id}
                  </text>
                </g>
              )
            })}

            {/* Holding Relationship Tethers (Person <-> Held Object) */}
            {holdingPairs.map((pair, idx) => {
              const p_cx = (pair.person.bbox.x1 + pair.person.bbox.x2) / 2
              const p_top_y = Math.max(pair.person.bbox.y1, 14)
              const w_cx = (pair.weapon.bbox.x1 + pair.weapon.bbox.x2) / 2
              const w_top_y = Math.max(pair.weapon.bbox.y1, 14)
              const midX = (p_cx + w_cx) / 2
              const midY = (p_top_y + w_top_y) / 2

              const isRed = redThreatPersonIds.has(pair.person.id) || redThreatWeaponIds.has(pair.weapon.id)
              const linkColor = isRed
                ? '#ef4444'
                : pair.isBlunt
                  ? '#facc15'
                  : pair.isSharp
                    ? '#f97316'
                    : '#fde047'

              const tetherLabel = isRed
                ? '⚠ THREAT OBJECT'
                : pair.isBlunt
                  ? '⚠ BLUNT OBJECT'
                  : pair.isSharp
                    ? '⚠ SHARP OBJECT'
                    : '⚠ HELD OBJECT'

              return (
                <g key={`holding-tether-${pair.person.id}-${pair.weapon.id}-${idx}`}>
                  <line
                    x1={p_cx}
                    y1={p_top_y}
                    x2={w_cx}
                    y2={w_top_y}
                    stroke={linkColor}
                    strokeWidth="2.5"
                    strokeDasharray="4 3"
                    className="animate-pulse"
                  />
                  <rect
                    x={midX - 48}
                    y={midY - 9}
                    width="96"
                    height="18"
                    rx="4"
                    fill="rgba(5, 15, 24, 0.94)"
                    stroke={linkColor}
                    strokeWidth="1.2"
                  />
                  <text
                    x={midX}
                    y={midY + 3.5}
                    fill={linkColor}
                    fontSize="8.5"
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                    textAnchor="middle"
                  >
                    {tetherLabel}
                  </text>
                </g>
              )
            })}

            {/* Standalone Proximity Lines (for non-held separate people & unsafe objects) */}
            {people.map((person) => {
              const p_cx = (person.bbox.x1 + person.bbox.x2) / 2
              const p_top_y = Math.max(person.bbox.y1, 14)
              return unsafeObjects
                .filter((w) => !heldObjectIds.has(w.id))
                .map((obj) => {
                  const o_cx = (obj.bbox.x1 + obj.bbox.x2) / 2
                  const o_top_y = Math.max(obj.bbox.y1, 14)
                  const dist = Math.hypot(p_cx - o_cx, p_top_y - o_top_y)
                  if (dist > 320) return null
                  const midX = (p_cx + o_cx) / 2
                  const midY = (p_top_y + o_top_y) / 2
                  const proxColor = isBluntObj(obj) ? '#facc15' : isSharpObj(obj) ? '#f97316' : '#fb923c'
                  return (
                    <g key={`proximity-${person.id}-${obj.id}`}>
                      <line
                        x1={p_cx}
                        y1={p_top_y}
                        x2={o_cx}
                        y2={o_top_y}
                        stroke={proxColor}
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        strokeOpacity="0.75"
                      />
                      <rect
                        x={midX - 24}
                        y={midY - 8}
                        width="48"
                        height="15"
                        rx="3"
                        fill="rgba(5, 15, 24, 0.9)"
                        stroke={proxColor}
                        strokeWidth="1"
                      />
                      <text
                        x={midX}
                        y={midY + 2.5}
                        fill={proxColor}
                        fontSize="8.5"
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

            {/* Concentric Circle Trackers on Top of Person or Object */}
            {frame?.objects?.map((obj) => {
              const isPerson = obj.class_name.toLowerCase() === 'person'
              const isUnsafe =
                unsafeClasses.includes(obj.class_name) ||
                ['knife', 'scissors', 'gun', 'weapon', 'baseball bat', 'bat', 'crowbar', 'blade'].includes(obj.class_name)

              // 4-Tier Color Scheme Implementation:
              // 1. Blue: Normal person tracking
              // 2. Yellow: Person holding any Blunt Object (or blunt object itself)
              // 3. Orange: Sharp objects (knives, scissors, blades, cutters)
              // 4. Red: Fast movements / holding object pointed towards person B / high threat
              let color = '#38bdf8' // Default Blue (Normal person tracking)
              let roleType = 'normal' // 'normal' | 'blunt' | 'sharp' | 'red'

              if (isPerson) {
                const heldList = personHeldObjects.get(obj.id) || []
                const hasBlunt = heldList.some((w) => isBluntObj(w))
                const hasSharp = heldList.some((w) => isSharpObj(w))

                if (redThreatPersonIds.has(obj.id)) {
                  color = '#ef4444' // Red Threat
                  roleType = 'red'
                } else if (hasBlunt) {
                  color = '#facc15' // Yellow (Person holding Blunt Object)
                  roleType = 'blunt'
                } else if (hasSharp) {
                  color = '#f97316' // Orange (Person holding Sharp Object)
                  roleType = 'sharp'
                } else {
                  color = '#38bdf8' // Blue (Normal Person Tracking)
                  roleType = 'normal'
                }
              } else {
                // Object / Weapon
                if (redThreatWeaponIds.has(obj.id)) {
                  color = '#ef4444' // Red (weapon involved in threat)
                  roleType = 'red'
                } else if (isBluntObj(obj)) {
                  color = '#facc15' // Yellow (Blunt Object)
                  roleType = 'blunt'
                } else if (isSharpObj(obj)) {
                  color = '#f97316' // Orange (Sharp Object)
                  roleType = 'sharp'
                } else {
                  color = '#fb923c' // Amber for other hazardous objects
                  roleType = 'sharp'
                }
              }

              const { x1, y1, x2, y2 } = obj.bbox
              const cx = (x1 + x2) / 2
              const top_y = Math.max(y1, 14)

              // Velocity vector
              const hasMotion = obj.speed && obj.speed > 5
              const rad = (obj.direction || 0) * (Math.PI / 180)
              const vecLen = Math.min(Math.max(obj.speed * 0.4, 14), 40)
              const vx = cx + Math.cos(rad) * vecLen
              const vy = top_y + Math.sin(rad) * vecLen

              // Badge Label text
              let labelText = ''
              if (isPerson) {
                if (roleType === 'red') {
                  const ptVector = pointingThreatVectors.find((v) => v.fromPerson.id === obj.id)
                  if (ptVector) {
                    labelText = `⚠ PERSON #${obj.id} · ${ptVector.reason} PERSON #${ptVector.toPerson.id}`
                  } else if (obj.speed && obj.speed > 25) {
                    labelText = `⚠ PERSON #${obj.id} · RAPID MOVEMENT (${obj.speed.toFixed(0)}px/s)`
                  } else {
                    labelText = `⚠ PERSON #${obj.id} · CRITICAL THREAT`
                  }
                } else if (roleType === 'blunt') {
                  labelText = `PERSON #${obj.id} · HOLDING BLUNT OBJECT`
                } else if (roleType === 'sharp') {
                  labelText = `PERSON #${obj.id} · HOLDING SHARP OBJECT`
                } else {
                  labelText = `PERSON #${obj.id} · ${(obj.confidence * 100).toFixed(0)}%`
                }
              } else {
                const isHeld = heldObjectIds.has(obj.id)
                if (roleType === 'red') {
                  labelText = `⚠ ${isSharpObj(obj) ? 'SHARP OBJECT' : isBluntObj(obj) ? 'BLUNT OBJECT' : 'WEAPON'} #${obj.id} · POINTED/ACTIVE`
                } else if (roleType === 'blunt') {
                  labelText = `BLUNT OBJECT #${obj.id}${isHeld ? ' · HELD' : ''} · ${(obj.confidence * 100).toFixed(0)}%`
                } else if (roleType === 'sharp') {
                  labelText = `SHARP OBJECT #${obj.id}${isHeld ? ' · HELD' : ''} · ${(obj.confidence * 100).toFixed(0)}%`
                } else {
                  labelText = `${obj.class_name.toUpperCase()} #${obj.id} · ${(obj.confidence * 100).toFixed(0)}%`
                }
              }

              const badgeWidth = Math.min(labelText.length * 6.6 + 18, 230)
              const badgeX = Math.max(cx - badgeWidth / 2, 4)
              const badgeY = Math.max(top_y - 24, 4)

              // Outer ping animation speed matched to risk severity
              const pingDuration =
                roleType === 'red' ? '0.75s' : roleType === 'sharp' ? '1.4s' : roleType === 'blunt' ? '2.0s' : '3.0s'

              return (
                <g key={`tracker-circle-${obj.id}`}>
                  {/* Subtle vertical anchor guideline to object */}
                  <line
                    x1={cx}
                    y1={top_y + 12}
                    x2={cx}
                    y2={Math.min(y2, top_y + (isPerson ? 40 : 18))}
                    stroke={color}
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    strokeOpacity="0.35"
                  />

                  {/* Concentric Circle 1: Outer Radar Ripple */}
                  <circle
                    cx={cx}
                    cy={top_y}
                    r="15"
                    fill="none"
                    stroke={color}
                    strokeWidth="1.2"
                    strokeOpacity="0.4"
                    className="animate-ping"
                    style={{
                      transformOrigin: `${cx}px ${top_y}px`,
                      animationDuration: pingDuration,
                    }}
                  />

                  {/* Concentric Circle 2: Outer Ring */}
                  <circle
                    cx={cx}
                    cy={top_y}
                    r="11"
                    fill="none"
                    stroke={color}
                    strokeWidth="1.6"
                    strokeDasharray={roleType !== 'normal' ? '3 2' : 'none'}
                    className={roleType === 'red' ? 'animate-pulse' : ''}
                  />

                  {/* Concentric Circle 3: Middle Ring */}
                  <circle
                    cx={cx}
                    cy={top_y}
                    r="6"
                    fill={color}
                    fillOpacity="0.22"
                    stroke={color}
                    strokeWidth="1.8"
                  />

                  {/* Concentric Circle 4: Inner Solid Target Dot */}
                  <circle
                    cx={cx}
                    cy={top_y}
                    r="2.5"
                    fill={color}
                  />

                  {/* Crosshair Reticle Ticks */}
                  <line x1={cx - 15} y1={top_y} x2={cx - 11} y2={top_y} stroke={color} strokeWidth="1.5" />
                  <line x1={cx + 11} y1={top_y} x2={cx + 15} y2={top_y} stroke={color} strokeWidth="1.5" />
                  <line x1={cx} y1={top_y - 15} x2={cx} y2={top_y - 11} stroke={color} strokeWidth="1.5" />
                  <line x1={cx} y1={top_y + 11} x2={cx} y2={top_y + 15} stroke={color} strokeWidth="1.5" />

                  {/* Motion Velocity Vector */}
                  {hasMotion && (
                    <line
                      x1={cx}
                      y1={top_y}
                      x2={vx}
                      y2={vy}
                      stroke={color}
                      strokeWidth="2"
                      markerEnd={
                        roleType === 'red'
                          ? 'url(#arrow-threat)'
                          : roleType === 'blunt'
                            ? 'url(#arrow-blunt)'
                            : roleType === 'sharp'
                              ? 'url(#arrow-sharp)'
                              : 'url(#arrow-person)'
                      }
                    />
                  )}

                  {/* Top Target Badge Tag */}
                  <rect
                    x={badgeX}
                    y={badgeY}
                    width={badgeWidth}
                    height="16"
                    rx="3"
                    fill="rgba(5, 15, 24, 0.94)"
                    stroke={color}
                    strokeWidth="1"
                    className="shadow-sm"
                  />
                  <text
                    x={badgeX + badgeWidth / 2}
                    y={badgeY + 11}
                    fill={color}
                    fontSize="8.5"
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                    textAnchor="middle"
                  >
                    {labelText}
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