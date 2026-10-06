import { useEffect, useRef, useState } from 'react'

export function VideoPanel({ frame, errorMessage, soundEnabled = true, onToggleSound, unsafeClasses = [] }) {
  const lastSoundTimeRef = useRef(0)

  // Web Audio chime for HIGH risk
  useEffect(() => {
    if (!frame || frame.risk_level !== 'HIGH' || !soundEnabled) return

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
  }, [frame, soundEnabled])

  const isHighRisk = frame?.risk_level === 'HIGH'
  const isMedRisk = frame?.risk_level === 'MEDIUM'

  // Identify relationships for visual lines (person <-> unsafe object)
  const people = frame?.objects?.filter(o => o.class_name === 'person') || []
  const unsafeObjects = frame?.objects?.filter(o => 
    unsafeClasses.includes(o.class_name) || ['knife', 'scissors', 'gun'].includes(o.class_name)
  ) || []

  return (
    <div className={`relative rounded-xl overflow-hidden shadow-2xl bg-slate-950 border-2 transition-all duration-300 ${
      isHighRisk 
        ? 'border-red-500 ring-4 ring-red-500/30' 
        : isMedRisk 
          ? 'border-amber-500/60' 
          : 'border-slate-800'
    }`}>
      {/* Video Stream Container */}
      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {frame?.frame ? (
          <>
            {/* The Live Video Frame */}
            <img
              src={`data:image/jpeg;base64,${frame.frame}`}
              alt="Live video stream"
              className="w-full h-full object-contain select-none pointer-events-none"
            />

            {/* Bounding Boxes & Tracking Vectors Overlay */}
            <svg
              viewBox="0 0 640 480"
              className="absolute inset-0 w-full h-full pointer-events-none"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Proximity lines between people and unsafe objects */}
              {people.map(person => {
                const px = (person.bbox.x1 + person.bbox.x2) / 2
                const py = (person.bbox.y1 + person.bbox.y2) / 2
                return unsafeObjects.map(obj => {
                  const ox = (obj.bbox.x1 + obj.bbox.x2) / 2
                  const oy = (obj.bbox.y1 + obj.bbox.y2) / 2
                  const dist = Math.hypot(px - ox, py - oy)
                  return (
                    <g key={`line-${person.id}-${obj.id}`}>
                      <line
                        x1={px}
                        y1={py}
                        x2={ox}
                        y2={oy}
                        stroke="#ef4444"
                        strokeWidth="2"
                        strokeDasharray="6 4"
                        className="animate-pulse"
                      />
                      <rect
                        x={(px + ox) / 2 - 28}
                        y={(py + oy) / 2 - 10}
                        width="56"
                        height="18"
                        rx="4"
                        fill="rgba(15, 23, 42, 0.85)"
                      />
                      <text
                        x={(px + ox) / 2}
                        y={(py + oy) / 2 + 3}
                        fill="#f87171"
                        fontSize="10"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {Math.round(dist)} px
                      </text>
                    </g>
                  )
                })
              })}

              {/* Render Bounding Boxes */}
              {frame.objects?.map(obj => {
                const isUnsafe = unsafeClasses.includes(obj.class_name) || ['knife', 'scissors', 'gun'].includes(obj.class_name)
                const { x1, y1, x2, y2 } = obj.bbox
                const width = Math.max(x2 - x1, 10)
                const height = Math.max(y2 - y1, 10)
                const color = isUnsafe ? '#ef4444' : '#3b82f6'
                const fillColor = isUnsafe ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.08)'

                const labelText = `#${obj.id} ${obj.class_name} ${(obj.confidence * 100).toFixed(0)}%`
                const labelWidth = Math.min(Math.max(labelText.length * 7 + 10, 60), 160)

                return (
                  <g key={`obj-${obj.id}`}>
                    {/* Bounding Box Rect */}
                    <rect
                      x={x1}
                      y={y1}
                      width={width}
                      height={height}
                      fill={fillColor}
                      stroke={color}
                      strokeWidth={isUnsafe ? 3 : 2}
                      rx="2"
                    />

                    {/* Corner accents */}
                    <path
                      d={`M ${x1} ${y1 + 8} L ${x1} ${y1} L ${x1 + 8} ${y1}`}
                      stroke={color}
                      strokeWidth="3"
                      fill="none"
                    />
                    <path
                      d={`M ${x2 - 8} ${y1} L ${x2} ${y1} L ${x2} ${y1 + 8}`}
                      stroke={color}
                      strokeWidth="3"
                      fill="none"
                    />

                    {/* Label Tag */}
                    <rect
                      x={x1}
                      y={Math.max(y1 - 20, 0)}
                      width={labelWidth}
                      height="18"
                      fill={color}
                      rx="3"
                    />
                    <text
                      x={x1 + 5}
                      y={Math.max(y1 - 6, 13)}
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="system-ui, sans-serif"
                    >
                      {labelText}
                    </text>

                    {/* Speed indicator if moving */}
                    {obj.speed > 5 && (
                      <text
                        x={x1 + 5}
                        y={Math.min(y2 - 6, 474)}
                        fill="#38bdf8"
                        fontSize="10"
                        fontWeight="bold"
                        filter="drop-shadow(0 1px 2px rgb(0 0 0 / 0.8))"
                      >
                        ⚡ {Math.round(obj.speed)} px/s
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            {errorMessage ? (
              <div className="max-w-md p-6 bg-red-950/50 border border-red-800 rounded-lg text-red-200">
                <div className="w-12 h-12 mx-auto mb-3 text-red-400">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h4 className="font-semibold text-lg text-red-100 mb-1">Camera Stream Error</h4>
                <p className="text-sm text-red-300 mb-3">{errorMessage}</p>
                <p className="text-xs text-red-400">
                  Tip: Verify your webcam isn't locked by another app, or try Camera Index 1 or uploaded video.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                <div className="text-sm font-medium text-slate-300">Connecting to vision stream...</div>
                <div className="text-xs text-slate-500">Initializing YOLO detector and object tracker</div>
              </div>
            )}
          </div>
        )}

        {/* Live HUD Header */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-xs font-semibold text-slate-200 shadow">
              <span className={`w-2 h-2 rounded-full ${frame ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              {frame ? 'LIVE MONITOR' : 'STANDBY'}
            </span>

            {frame && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border backdrop-blur-md shadow ${
                isHighRisk 
                  ? 'bg-red-500/80 border-red-400 text-white animate-bounce' 
                  : isMedRisk 
                    ? 'bg-amber-500/80 border-amber-400 text-white' 
                    : 'bg-emerald-500/80 border-emerald-400 text-white'
              }`}>
                RISK: {frame.risk_level}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            {onToggleSound && (
              <button
                type="button"
                onClick={onToggleSound}
                className="px-2.5 py-1 rounded-md bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-xs font-medium text-slate-300 hover:text-white transition-colors"
                title={soundEnabled ? 'Mute Alert Sound' : 'Enable Alert Sound'}
              >
                {soundEnabled ? '🔔 Alert Audio ON' : '🔕 Muted'}
              </button>
            )}

            {frame && (
              <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-md px-2.5 py-1 text-xs text-slate-300 font-mono shadow">
                <span>{frame.fps || 0} FPS</span>
                <span className="text-slate-600">|</span>
                <span>{frame.latency_ms || 0}ms</span>
              </div>
            )}
          </div>
        </div>

        {/* High Risk Alarm Banner at top */}
        {isHighRisk && (
          <div className="absolute top-12 inset-x-4 bg-red-600/90 backdrop-blur-md text-white text-center py-2 px-4 rounded-lg shadow-lg font-bold text-sm tracking-wide flex items-center justify-center gap-2 animate-pulse">
            <span>🚨 POTENTIAL SAFETY RISK DETECTED</span>
          </div>
        )}
      </div>
    </div>
  )
}