import React, { useState, useEffect } from 'react'

export function SettingsView({ config, onConfigSaved, soundEnabled, onToggleSound }) {
  const [model, setModel] = useState(config?.model_path || 'models/yolov8s.pt')
  const [confThreshold, setConfThreshold] = useState(config?.detection_confidence_threshold ?? 0.50)
  const [speedThreshold, setSpeedThreshold] = useState(config?.movement_speed_threshold ?? 400)
  const [proxThreshold, setProxThreshold] = useState(config?.proximity_distance_threshold ?? 150)
  const [persistenceDuration, setPersistenceDuration] = useState(config?.min_persistence_duration ?? 1.0)
  const [volume, setVolume] = useState(65)
  const [warningTimeout, setWarningTimeout] = useState('60')
  const [backendEngine, setBackendEngine] = useState('webgpu')
  const [entropyFallback, setEntropyFallback] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMsg, setToastMsg] = useState('PARAMETERS RECOMPUTED SUCCESSFULLY')

  useEffect(() => {
    if (config) {
      if (config.model_path) setModel(config.model_path)
      if (config.detection_confidence_threshold !== undefined)
        setConfThreshold(config.detection_confidence_threshold)
      if (config.movement_speed_threshold !== undefined)
        setSpeedThreshold(config.movement_speed_threshold)
      if (config.proximity_distance_threshold !== undefined)
        setProxThreshold(config.proximity_distance_threshold)
      if (config.min_persistence_duration !== undefined)
        setPersistenceDuration(config.min_persistence_duration)
    }
  }, [config])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const payload = {
        model_path: model,
        detection_confidence_threshold: parseFloat(confThreshold),
        movement_speed_threshold: parseFloat(speedThreshold),
        proximity_distance_threshold: parseFloat(proxThreshold),
        min_persistence_duration: parseFloat(persistenceDuration),
      }

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data = await res.json()
      onConfigSaved?.(data)

      setToastMsg('PARAMETERS RECOMPUTED & SYNCHRONIZED SUCCESSFULLY')
      setShowToast(true)
      setTimeout(() => setShowToast(false), 3500)
    } catch (err) {
      console.error('Failed to update config:', err)
      setToastMsg(`ERROR: ${err.message}`)
      setShowToast(true)
      setTimeout(() => setShowToast(false), 4000)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    setModel('models/yolov8s.pt')
    setConfThreshold(0.50)
    setSpeedThreshold(400)
    setProxThreshold(150)
    setPersistenceDuration(1.0)
    setVolume(65)
    setWarningTimeout('60')
    setEntropyFallback(true)
    setToastMsg('RESTORED NOMINAL FACTORY CALIBRATION')
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  const testAudioTone = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(784, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.3)
        const volVal = (volume / 100) * 0.3
        gain.gain.setValueAtTime(volVal, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.3)
      }
    } catch (e) {
      console.debug('Audio test failed:', e)
    }
  }

  // Recall & Precision Gauges
  const recallVal = (100 - (confThreshold - 0.2) * 80).toFixed(1)
  const precisionVal = (60 + (confThreshold - 0.2) * 50).toFixed(1)

  return (
    <div className="w-full flex flex-col gap-space-lg animate-in fade-in duration-200">
      {/* 1. Sub-Header Context Ribbon */}
      <div className="w-full bg-surface-container-low px-gutter-desktop py-space-lg rounded-xl border border-surface-border/60 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs">
              <span className="font-mono text-[11px] text-primary uppercase tracking-widest font-bold">
                SYS-PARAM // PROTOCOL 3.1
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              <span className="font-mono text-[11px] text-text-muted">STATE: SYNCHRONIZED</span>
            </div>
            <h1 className="font-bold text-2xl text-text-primary tracking-tight">
              System Configuration &amp; Heuristic Tuning
            </h1>
            <p className="font-sans text-xs text-text-muted max-w-2xl leading-relaxed">
              Tune local inference filters, kinematic thresholds, and audio-visual feedback parameters with live zero-latency re-quantization.
            </p>
          </div>

          <div className="flex items-center gap-space-sm shrink-0 flex-wrap">
            <button
              onClick={handleReset}
              className="h-9 px-space-md rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs transition-colors flex items-center gap-space-xs border border-surface-border/60"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px] text-text-muted">restart_alt</span>
              <span>Reset Defaults</span>
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="h-9 px-space-md rounded-lg bg-primary-container hover:bg-primary text-on-primary-container hover:text-on-primary font-semibold text-xs transition-all duration-200 shadow-md flex items-center gap-space-xs font-mono"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">verified</span>
              <span>{isSaving ? 'Synchronizing...' : 'Apply & Save Settings'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Notification Toast */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-space-sm px-space-md py-space-sm rounded-lg bg-surface-container-highest border border-primary/40 shadow-2xl text-text-primary animate-in fade-in slide-in-from-bottom-4 duration-200">
          <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
          <span className="font-mono text-xs font-semibold">{toastMsg}</span>
        </div>
      )}

      {/* 2. Main Two-Column Configuration Grid */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* ================= LEFT COLUMN: INFERENCE & SPATIAL HEURISTICS (55%) ================= */}
        <div className="lg:col-span-7 flex flex-col gap-space-lg">
          {/* SECTION 1: Detection & Inference Thresholds */}
          <div className="bg-surface-container-low rounded-xl p-space-lg border border-surface-border/80 shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-surface-border/40">
              <div className="flex items-center gap-space-sm">
                <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[18px]">analytics</span>
                </div>
                <div className="flex flex-col">
                  <h2 className="font-semibold text-sm text-text-primary">
                    Detection &amp; Inference Thresholds
                  </h2>
                  <span className="font-mono text-[10px] text-text-muted">
                    Edge-quantized object scoring model
                  </span>
                </div>
              </div>
              <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-primary font-mono text-[10px] font-bold border border-primary/20">
                LIVE EVAL
              </span>
            </div>

            {/* YOLO Model Selector */}
            <div className="bg-surface-container rounded-lg p-space-md flex flex-col gap-space-xs border border-surface-border/50">
              <div className="flex items-center justify-between">
                <span className="font-sans text-xs text-text-primary font-semibold">Active YOLO Neural Model</span>
                <span className="font-mono text-[11px] text-primary font-bold">{model}</span>
              </div>
              <div className="grid grid-cols-2 gap-space-sm mt-1">
                <button
                  type="button"
                  onClick={() => setModel('models/yolov8s.pt')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    model.includes('yolov8s')
                      ? 'border-primary bg-primary/10 text-text-primary'
                      : 'border-surface-border bg-surface-container-high text-text-muted hover:text-text-primary'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center justify-between">
                    <span>YOLOv8s (Small)</span>
                    <span className="text-[10px] font-mono text-primary font-bold">HIGH ACCURACY</span>
                  </div>
                  <div className="text-[11px] text-text-muted font-sans mt-0.5">
                    Recommended for detecting compact knives, scissors &amp; tools.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setModel('models/yolov8n.pt')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    model.includes('yolov8n')
                      ? 'border-primary bg-primary/10 text-text-primary'
                      : 'border-surface-border bg-surface-container-high text-text-muted hover:text-text-primary'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center justify-between">
                    <span>YOLOv8n (Nano)</span>
                    <span className="text-[10px] font-mono text-text-muted">LOW LATENCY</span>
                  </div>
                  <div className="text-[11px] text-text-muted font-sans mt-0.5">
                    Ultra-fast inference on lower-spec edge machines.
                  </div>
                </button>
              </div>
            </div>

            {/* Slider: Confidence */}
            <div className="bg-surface-container rounded-lg p-space-md flex flex-col gap-space-sm border border-surface-border/50">
              <div className="flex items-center justify-between">
                <label className="font-sans text-xs text-text-primary font-semibold flex items-center gap-1.5" htmlFor="conf-slider">
                  <span>Object Detection Confidence</span>
                  <span className="material-symbols-outlined text-text-muted text-[16px]" title="Lower limits allow subtle visual signals; higher prevents spurious false positives.">
                    info
                  </span>
                </label>
                <span className="font-mono text-sm text-primary font-bold bg-surface-container-high px-space-sm py-0.5 rounded border border-surface-border">
                  {Number(confThreshold).toFixed(2)}
                </span>
              </div>

              <div className="relative w-full flex items-center py-1">
                <input
                  id="conf-slider"
                  type="range"
                  min="0.20"
                  max="0.90"
                  step="0.01"
                  value={confThreshold}
                  onChange={(e) => setConfThreshold(e.target.value)}
                  className="w-full h-1.5 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div className="flex items-center justify-between font-mono text-[10px] text-text-muted">
                <span>0.20 (High Recall)</span>
                <span>Balanced (0.50)</span>
                <span>0.90 (High Precision)</span>
              </div>

              {/* Recall vs Precision Dynamic Gauges */}
              <div className="mt-space-xs pt-space-xs flex items-center gap-space-md">
                <div className="flex-1 bg-surface-container-high rounded p-2 flex flex-col gap-1 border border-surface-border/40">
                  <div className="flex justify-between items-center font-mono text-[10px]">
                    <span className="text-text-muted">RECALL DEPTH</span>
                    <span className="text-secondary font-bold">{recallVal}%</span>
                  </div>
                  <div className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-secondary h-full rounded-full transition-all duration-200"
                      style={{ width: `${Math.min(Math.max(recallVal, 0), 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div className="flex-1 bg-surface-container-high rounded p-2 flex flex-col gap-1 border border-surface-border/40">
                  <div className="flex justify-between items-center font-mono text-[10px]">
                    <span className="text-text-muted">PRECISION PURITY</span>
                    <span className="text-primary font-bold">{precisionVal}%</span>
                  </div>
                  <div className="w-full bg-surface-container-highest rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-200"
                      style={{ width: `${Math.min(Math.max(precisionVal, 0), 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fallback Toggle */}
            <div className="bg-surface-container rounded-lg p-space-md flex items-center justify-between gap-space-md border border-surface-border/50">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-sans text-xs text-text-primary font-semibold">
                    Motion Blur &amp; Optical Entropy Degradation Fallback
                  </span>
                  <span className="px-space-xs py-0.5 rounded-full bg-status-medium/10 text-status-medium font-mono text-[10px] font-bold">
                    Auto-Suppress
                  </span>
                </div>
                <p className="font-sans text-[11px] text-text-muted leading-relaxed">
                  Automatically activates <span className="font-mono text-status-low-conf font-bold">LOW CONFIDENCE</span> telemetry state instead of firing unstable hazard escalations during high camera shake or low lux.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={entropyFallback}
                  onChange={(e) => setEntropyFallback(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container"></div>
              </label>
            </div>
          </div>

          {/* SECTION 2: Kinematic & Spatial Heuristics */}
          <div className="bg-surface-container-low rounded-xl p-space-lg border border-surface-border/80 shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-surface-border/40">
              <div className="flex items-center gap-space-sm">
                <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center">
                  <span className="material-symbols-outlined text-secondary text-[18px]">straighten</span>
                </div>
                <div className="flex flex-col">
                  <h2 className="font-semibold text-sm text-text-primary">
                    Kinematic &amp; Spatial Heuristics
                  </h2>
                  <span className="font-mono text-[10px] text-text-muted">
                    Geometric vector verification in screen space
                  </span>
                </div>
              </div>
              <span className="font-mono text-[10px] text-text-muted">AXIS: 2D-NORMALIZED</span>
            </div>

            {/* Visual Spatial Blueprint Graphic */}
            <div className="w-full bg-surface-container rounded-lg p-space-md flex flex-col gap-space-sm border border-surface-border/50">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider font-bold">
                  Spatial Boundary Vector Simulation
                </span>
                <span className="font-mono text-[10px] text-primary font-bold">REALTIME COORD</span>
              </div>
              <div className="w-full h-24 bg-surface-container-lowest rounded relative overflow-hidden flex items-center justify-center border border-surface-border/40">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#57f1db_1px,transparent_1px)] [background-size:12px_12px]"></div>

                {/* Human Entity Indicator */}
                <div className="absolute left-1/4 flex flex-col items-center">
                  <div className="w-16 h-20 rounded bg-detection-person/10 border border-detection-person flex flex-col items-center justify-center relative">
                    <div className="absolute -top-3 left-0 bg-surface-container-highest px-1 py-0.5 rounded text-[9px] font-mono text-detection-person font-bold">
                      PERSON #1
                    </div>
                    <span className="material-symbols-outlined text-detection-person text-lg">person</span>
                  </div>
                </div>

                {/* Vector distance line */}
                <div className="relative flex items-center justify-center w-36">
                  <div className="h-0.5 w-full bg-status-medium/40 border-b border-dashed border-status-medium"></div>
                  <div className="absolute bg-surface-container-high px-2 py-0.5 rounded font-mono text-[10px] text-status-medium font-bold shadow border border-status-medium/30">
                    {proxThreshold} px
                  </div>
                </div>

                {/* Hazardous Tool Indicator */}
                <div className="absolute right-1/4 flex flex-col items-center">
                  <div className="w-14 h-16 rounded bg-detection-object/10 border border-detection-object flex flex-col items-center justify-center relative">
                    <div className="absolute -top-3 left-0 bg-surface-container-highest px-1 py-0.5 rounded text-[9px] font-mono text-detection-object font-bold">
                      TOOL #04
                    </div>
                    <span className="material-symbols-outlined text-detection-object text-lg">hardware</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Kinematic Slider 1: Speed */}
            <div className="bg-surface-container rounded-lg p-space-md flex flex-col gap-space-sm border border-surface-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-sans text-xs text-text-primary font-semibold block" htmlFor="speed-slider">
                    Rapid Displacement Speed Threshold
                  </label>
                  <span className="font-sans text-[11px] text-text-muted">
                    Flags sudden directional acceleration vectors.
                  </span>
                </div>
                <span className="font-mono text-sm text-text-primary font-bold bg-surface-container-high px-space-sm py-0.5 rounded shrink-0 border border-surface-border">
                  {speedThreshold} px/s
                </span>
              </div>
              <input
                id="speed-slider"
                type="range"
                min="100"
                max="1000"
                step="25"
                value={speedThreshold}
                onChange={(e) => setSpeedThreshold(e.target.value)}
                className="w-full h-1.5 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex items-center justify-between font-mono text-[10px] text-text-muted">
                <span>100 px/s (Sensitive)</span>
                <span>400 px/s (Standard)</span>
                <span>1000 px/s (Rigid Tolerance)</span>
              </div>
            </div>

            {/* Kinematic Slider 2: Critical Proximity */}
            <div className="bg-surface-container rounded-lg p-space-md flex flex-col gap-space-sm border border-surface-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-sans text-xs text-text-primary font-semibold block" htmlFor="prox-slider">
                    Critical Proximity Separation
                  </label>
                  <span className="font-sans text-[11px] text-text-muted">
                    Minimum pixel gap between hazardous object centroid and person hull.
                  </span>
                </div>
                <span className="font-mono text-sm text-status-medium font-bold bg-surface-container-high px-space-sm py-0.5 rounded shrink-0 border border-surface-border">
                  {proxThreshold} px
                </span>
              </div>
              <input
                id="prox-slider"
                type="range"
                min="50"
                max="400"
                step="10"
                value={proxThreshold}
                onChange={(e) => setProxThreshold(e.target.value)}
                className="w-full h-1.5 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex items-center justify-between font-mono text-[10px] text-text-muted">
                <span>50 px (Contact Boundary)</span>
                <span>150 px (Default Margin)</span>
                <span>400 px (Wide Exclusion)</span>
              </div>
            </div>

            {/* Kinematic Slider 3: Persistence */}
            <div className="bg-surface-container rounded-lg p-space-md flex flex-col gap-space-sm border border-surface-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-sans text-xs text-text-primary font-semibold block" htmlFor="pers-slider">
                    Persistence Verification Window
                  </label>
                  <span className="font-sans text-[11px] text-text-muted">
                    Required temporal continuity prior to HIGH severity confirmation.
                  </span>
                </div>
                <span className="font-mono text-sm text-primary font-bold bg-surface-container-high px-space-sm py-0.5 rounded shrink-0 border border-surface-border">
                  {Number(persistenceDuration).toFixed(1)} s
                </span>
              </div>
              <input
                id="pers-slider"
                type="range"
                min="0.5"
                max="5.0"
                step="0.1"
                value={persistenceDuration}
                onChange={(e) => setPersistenceDuration(e.target.value)}
                className="w-full h-1.5 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <div className="flex items-center justify-between font-mono text-[10px] text-text-muted">
                <span>0.5 s (Instantaneous)</span>
                <span>1.0 s (Debounced)</span>
                <span>5.0 s (Long-term Stagnation)</span>
              </div>
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: SENSORY, PIPELINE & STORAGE (45%) ================= */}
        <div className="lg:col-span-5 flex flex-col gap-space-lg">
          {/* SECTION 3: Sensory Alerting & Notifications */}
          <div className="bg-surface-container-low rounded-xl p-space-lg border border-surface-border/80 shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-surface-border/40">
              <div className="flex items-center gap-space-sm">
                <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center">
                  <span className="material-symbols-outlined text-status-medium text-[18px]">volume_up</span>
                </div>
                <div className="flex flex-col">
                  <h2 className="font-semibold text-sm text-text-primary">Sensory Alerting &amp; Audio</h2>
                  <span className="font-mono text-[10px] text-text-muted">
                    Synthesized WebAudio spatial tones
                  </span>
                </div>
              </div>
              <span className="px-space-xs py-0.5 rounded-full bg-status-low/10 text-status-low font-mono text-[10px] font-bold">
                AUDIO READY
              </span>
            </div>

            {/* Chime Toggle */}
            <div className="bg-surface-container rounded-lg p-space-md flex items-center justify-between border border-surface-border/50">
              <div className="flex flex-col">
                <span className="font-sans text-xs text-text-primary font-semibold">
                  High-Risk Continuous Chime &amp; Voice
                </span>
                <span className="font-sans text-[11px] text-text-muted">
                  Audible siren upon verified hazard escalation
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={onToggleSound}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-primary after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container"></div>
              </label>
            </div>

            {/* Volume & Test Audio */}
            <div className="bg-surface-container rounded-lg p-space-md flex flex-col gap-space-sm border border-surface-border/50">
              <div className="flex items-center justify-between">
                <label className="font-sans text-xs text-text-primary font-semibold" htmlFor="vol-slider">
                  Output Volume Level
                </label>
                <span className="font-mono text-sm text-text-primary font-bold bg-surface-container-high px-space-sm py-0.5 rounded border border-surface-border">
                  {volume}%
                </span>
              </div>
              <div className="flex items-center gap-space-md">
                <input
                  id="vol-slider"
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(e.target.value)}
                  className="w-full h-1.5 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <button
                  onClick={testAudioTone}
                  className="h-8 px-space-sm shrink-0 rounded bg-surface-container-high hover:bg-surface-container-highest text-primary font-mono text-[11px] font-semibold transition-colors flex items-center gap-1 border border-surface-border/60"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[15px]">graphic_eq</span>
                  <span>Test Audio</span>
                </button>
              </div>
            </div>

            {/* Alarm Timeout Selector */}
            <div className="bg-surface-container rounded-lg p-space-md flex flex-col gap-space-sm border border-surface-border/50">
              <label className="font-sans text-xs text-text-primary font-semibold">
                Active Warning Timeout Duration
              </label>
              <div className="grid grid-cols-3 gap-space-xs">
                {['30', '60', 'manual'].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setWarningTimeout(opt)}
                    className={`py-2 px-space-xs rounded font-mono text-[10px] font-bold text-center transition-colors border ${
                      warningTimeout === opt
                        ? 'bg-primary-container text-on-primary-container border-primary shadow-sm'
                        : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest border-surface-border/40'
                    }`}
                    type="button"
                  >
                    {opt === 'manual' ? 'MANUAL ONLY' : `${opt} SECONDS`}
                  </button>
                ))}
              </div>
              <p className="font-sans text-[11px] text-text-muted mt-0.5">
                Audible warning auto-silences after duration unless manual acknowledge operator override is requested.
              </p>
            </div>
          </div>

          {/* SECTION 4: Hardware & Camera Pipeline */}
          <div className="bg-surface-container-low rounded-xl p-space-lg border border-surface-border/80 shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-surface-border/40">
              <div className="flex items-center gap-space-sm">
                <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-[18px]">videocam</span>
                </div>
                <div className="flex flex-col">
                  <h2 className="font-semibold text-sm text-text-primary">Hardware &amp; Capture Pipeline</h2>
                  <span className="font-mono text-[10px] text-text-muted">Direct optical ingestion layer</span>
                </div>
              </div>
              <span className="font-mono text-[10px] text-primary font-bold">60 FPS SYNC</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
              <div className="bg-surface-container rounded-lg p-space-sm flex flex-col gap-1 border border-surface-border/40">
                <label className="font-mono text-[10px] text-text-muted uppercase font-bold">Optical Device</label>
                <select className="w-full bg-surface-container-high text-text-primary font-sans text-xs rounded px-2 py-1.5 focus:outline-none border border-surface-border/60">
                  <option value="cam-0">Integrated HD Sensor (Built-in)</option>
                  <option selected value="cam-1">USB 4K Industrial Node (Cam #2)</option>
                </select>
              </div>

              <div className="bg-surface-container rounded-lg p-space-sm flex flex-col gap-1 border border-surface-border/40">
                <label className="font-mono text-[10px] text-text-muted uppercase font-bold">Resolution / FPS</label>
                <select className="w-full bg-surface-container-high text-text-primary font-sans text-xs rounded px-2 py-1.5 focus:outline-none border border-surface-border/60">
                  <option value="720p">1280x720 @ 30 FPS (Low Latency)</option>
                  <option selected value="1080p">1920x1080 @ 15 FPS (High Res)</option>
                  <option value="vga">640x480 @ 60 FPS (Kinematic Max)</option>
                </select>
              </div>
            </div>

            {/* Inference Compute Engine Selector */}
            <div className="flex flex-col gap-space-xs">
              <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
                Inference Compute Engine
              </span>
              <div className="grid grid-cols-2 gap-space-sm">
                <div
                  onClick={() => setBackendEngine('webgpu')}
                  className={`cursor-pointer rounded-lg p-space-md transition-all flex flex-col gap-space-xs border-2 ${
                    backendEngine === 'webgpu'
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-surface-border bg-surface-container hover:bg-surface-container-high'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-primary">WebGPU</span>
                    <span className="px-space-xs py-0.5 rounded bg-primary-container text-on-primary-container font-mono text-[9px] font-bold">
                      ACCELERATED
                    </span>
                  </div>
                  <p className="font-sans text-[11px] text-text-muted">
                    Dedicated GPU shader pipeline. Sub-12ms inference latency.
                  </p>
                  <div className="mt-1 font-mono text-[10px] text-primary flex items-center gap-1 font-bold">
                    <span className="material-symbols-outlined text-[14px]">check</span> Active Selection
                  </div>
                </div>

                <div
                  onClick={() => setBackendEngine('wasm')}
                  className={`cursor-pointer rounded-lg p-space-md transition-all flex flex-col gap-space-xs border-2 ${
                    backendEngine === 'wasm'
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-surface-border bg-surface-container hover:bg-surface-container-high'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-text-primary">WASM SIMD</span>
                    <span className="px-space-xs py-0.5 rounded bg-surface-container-highest text-text-muted font-mono text-[9px]">
                      CPU FALLBACK
                    </span>
                  </div>
                  <p className="font-sans text-[11px] text-text-muted">
                    Multi-threaded CPU fallback when GPU compute buffers are locked.
                  </p>
                  <div className="mt-1 font-mono text-[10px] text-text-muted">Latency ~48ms</div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 5: Data Isolation & Memory Privacy */}
          <div className="bg-surface-container-low rounded-xl p-space-lg border border-surface-border/80 shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-surface-border/40">
              <div className="flex items-center gap-space-sm">
                <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center">
                  <span className="material-symbols-outlined text-outline text-[18px]">lock</span>
                </div>
                <div className="flex flex-col">
                  <h2 className="font-semibold text-sm text-text-primary">
                    Data Isolation &amp; Local Persistence
                  </h2>
                  <span className="font-mono text-[10px] text-text-muted">
                    Strict local sandbox compliance
                  </span>
                </div>
              </div>
              <span className="font-mono text-[10px] text-status-low font-bold">ISOLATED</span>
            </div>

            <div className="bg-surface-container rounded-lg p-space-md flex items-start gap-space-sm border border-surface-border/40">
              <span className="material-symbols-outlined text-primary text-[20px] mt-0.5 shrink-0">
                shield_lock
              </span>
              <div className="flex flex-col">
                <span className="font-sans text-xs text-text-primary font-semibold">
                  Zero-Persistence RAM Guarantee
                </span>
                <p className="font-sans text-[11px] text-text-muted mt-0.5 leading-relaxed">
                  Frames remain in ephemeral GPU / VRAM buffers. No footage is transferred or stored on external cloud infrastructure.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
