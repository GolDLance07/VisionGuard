import React, { useState, useEffect } from 'react'

export function ThresholdTuningCard({ config, onConfigSaved }) {
  const [conf, setConf] = useState(0.50)
  const [speed, setSpeed] = useState(400)
  const [dist, setDist] = useState(150)
  const [persist, setPersist] = useState(1.0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (config) {
      if (config.detection_confidence_threshold !== undefined) setConf(config.detection_confidence_threshold)
      if (config.speed_thresholds?.rapid !== undefined) setSpeed(config.speed_thresholds.rapid)
      if (config.proximity_thresholds?.close !== undefined) setDist(config.proximity_thresholds.close)
      if (config.min_persistence_duration !== undefined) setPersist(config.min_persistence_duration)
    }
  }, [config])

  const saveConfig = async (updates) => {
    setSaving(true)
    try {
      const payload = {
        detection_confidence_threshold: updates.conf !== undefined ? updates.conf : conf,
        speed_thresholds: {
          stationary: 10,
          normal: 100,
          rapid: updates.speed !== undefined ? updates.speed : speed,
        },
        proximity_thresholds: {
          close: updates.dist !== undefined ? updates.dist : dist,
          medium: (updates.dist !== undefined ? updates.dist : dist) * 2,
          far: (updates.dist !== undefined ? updates.dist : dist) * 4,
        },
        min_persistence_duration: updates.persist !== undefined ? updates.persist : persist,
      }

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const updated = await res.json()
        if (onConfigSaved) onConfigSaved(updated)
      }
    } catch (err) {
      console.error('Failed to update config:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setConf(0.50)
    setSpeed(400)
    setDist(150)
    setPersist(1.0)
    saveConfig({ conf: 0.50, speed: 400, dist: 150, persist: 1.0 })
  }

  return (
    <div className="w-full p-space-md rounded-xl bg-surface-container border border-surface-border/80 shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-outline text-[18px]">tune</span>
          <h3 className="font-semibold text-xs text-text-primary">Threshold Tuning (FR-14)</h3>
        </div>
        <button
          className="font-mono text-[10px] text-primary hover:underline font-bold uppercase"
          onClick={handleReset}
          type="button"
        >
          RESET DEFAULTS
        </button>
      </div>

      <div className="flex flex-col gap-space-md">
        {/* Slider 1: Confidence Threshold */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between font-sans text-xs">
            <span className="text-text-primary">Confidence Threshold</span>
            <span className="font-mono text-xs text-primary font-bold">{conf.toFixed(2)}</span>
          </div>
          <input
            className="w-full accent-primary h-1.5 bg-surface-container-high rounded-lg cursor-pointer"
            max="0.90"
            min="0.20"
            onChange={(e) => {
              const val = parseFloat(e.target.value)
              setConf(val)
            }}
            onMouseUp={() => saveConfig({ conf })}
            onTouchEnd={() => saveConfig({ conf })}
            step="0.05"
            type="range"
            value={conf}
          />
          <div className="flex justify-between font-mono text-[10px] text-text-muted">
            <span>0.20 (Sensitive)</span>
            <span>0.90 (Strict)</span>
          </div>
        </div>

        {/* Slider 2: Rapid Movement Speed */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between font-sans text-xs">
            <span className="text-text-primary">Rapid-Movement Limit</span>
            <span className="font-mono text-xs text-primary font-bold">{speed} px/s</span>
          </div>
          <input
            className="w-full accent-primary h-1.5 bg-surface-container-high rounded-lg cursor-pointer"
            max="1000"
            min="100"
            onChange={(e) => {
              const val = parseInt(e.target.value)
              setSpeed(val)
            }}
            onMouseUp={() => saveConfig({ speed })}
            onTouchEnd={() => saveConfig({ speed })}
            step="50"
            type="range"
            value={speed}
          />
          <div className="flex justify-between font-mono text-[10px] text-text-muted">
            <span>100 px/s</span>
            <span>1000 px/s</span>
          </div>
        </div>

        {/* Slider 3: Close Proximity Distance */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between font-sans text-xs">
            <span className="text-text-primary">Proximity Critical Distance</span>
            <span className="font-mono text-xs text-primary font-bold">{dist} px</span>
          </div>
          <input
            className="w-full accent-primary h-1.5 bg-surface-container-high rounded-lg cursor-pointer"
            max="400"
            min="50"
            onChange={(e) => {
              const val = parseInt(e.target.value)
              setDist(val)
            }}
            onMouseUp={() => saveConfig({ dist })}
            onTouchEnd={() => saveConfig({ dist })}
            step="10"
            type="range"
            value={dist}
          />
          <div className="flex justify-between font-mono text-[10px] text-text-muted">
            <span>50 px (Contact)</span>
            <span>400 px (Zone)</span>
          </div>
        </div>

        {/* Slider 4: Persistence Window */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between font-sans text-xs">
            <span className="text-text-primary">Persistence Dampening Window</span>
            <span className="font-mono text-xs text-primary font-bold">{persist.toFixed(1)} s</span>
          </div>
          <input
            className="w-full accent-primary h-1.5 bg-surface-container-high rounded-lg cursor-pointer"
            max="5.0"
            min="0.5"
            onChange={(e) => {
              const val = parseFloat(e.target.value)
              setPersist(val)
            }}
            onMouseUp={() => saveConfig({ persist })}
            onTouchEnd={() => saveConfig({ persist })}
            step="0.1"
            type="range"
            value={persist}
          />
          <div className="flex justify-between font-mono text-[10px] text-text-muted">
            <span>0.5 s (Instant)</span>
            <span>5.0 s (Filtered)</span>
          </div>
        </div>
      </div>

      <div className="pt-2 flex items-center justify-between font-mono text-[11px] text-text-muted border-t border-surface-border/40">
        <span>CALIBRATION: ACTIVE</span>
        <span className="text-primary flex items-center gap-1 font-semibold">
          <span className={`w-1.5 h-1.5 rounded-full ${saving ? 'bg-status-medium animate-ping' : 'bg-status-low'}`}></span>
          {saving ? 'SAVING...' : 'AUTO-SAVED'}
        </span>
      </div>
    </div>
  )
}
