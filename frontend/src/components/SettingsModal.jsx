import React, { useState, useEffect } from 'react'

export function SettingsModal({ isOpen, onClose, config, onConfigSaved }) {
  const [modelPath, setModelPath] = useState('models/yolov8s.pt')
  const [confThreshold, setConfThreshold] = useState(0.25)
  const [proximityClose, setProximityClose] = useState(100)
  const [persistenceWindow, setPersistenceWindow] = useState(10)
  const [minDuration, setMinDuration] = useState(0.5)
  const [frameSkip, setFrameSkip] = useState(1)
  const [unsafeClasses, setUnsafeClasses] = useState([])
  const [newClassInput, setNewClassInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (config) {
      setModelPath(config.model_path || 'models/yolov8s.pt')
      setConfThreshold(config.detection_confidence_threshold || 0.25)
      setProximityClose(config.proximity_thresholds?.close || 100)
      setPersistenceWindow(config.persistence_window || 10)
      setMinDuration(config.min_persistence_duration || 0.5)
      setFrameSkip(config.frame_skip || 1)
      setUnsafeClasses(config.unsafe_classes || ['knife', 'scissors', 'gun', 'weapon', 'baseball bat'])
    }
  }, [config, isOpen])

  if (!isOpen) return null

  const handleAddClass = () => {
    const trimmed = newClassInput.trim().toLowerCase()
    if (trimmed && !unsafeClasses.includes(trimmed)) {
      setUnsafeClasses([...unsafeClasses, trimmed])
      setNewClassInput('')
    }
  }

  const handleRemoveClass = (cls) => {
    setUnsafeClasses(unsafeClasses.filter((c) => c !== cls))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        model_path: modelPath,
        detection_confidence_threshold: parseFloat(confThreshold),
        proximity_thresholds: {
          close: parseFloat(proximityClose),
          medium: parseFloat(proximityClose) * 2,
          far: parseFloat(proximityClose) * 4,
        },
        persistence_window: parseInt(persistenceWindow),
        min_persistence_duration: parseFloat(minDuration),
        frame_skip: parseInt(frameSkip),
        unsafe_classes: unsafeClasses,
      }

      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Failed to update configuration')
      const updated = await res.json()
      onConfigSaved(updated)
      onClose()
    } catch (err) {
      console.error('Save config error:', err)
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-surface-container border border-surface-border rounded-2xl max-w-lg w-full p-space-md shadow-2xl text-text-primary space-y-space-md animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border/60">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-[22px]">tune</span>
            <div>
              <h3 className="font-bold text-sm text-text-primary">Pipeline & Model Configuration</h3>
              <p className="font-mono text-[11px] text-text-muted">Live tunable parameters & allow-list</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center text-text-muted hover:text-text-primary"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Model Weights Selector */}
          <div className="space-y-1.5 p-space-sm rounded-xl bg-surface-container-low border border-surface-border/60">
            <label className="block font-mono text-[11px] font-bold text-text-primary uppercase tracking-wider">
              YOLO Detection Model Weights
            </label>
            <select
              value={modelPath}
              onChange={(e) => setModelPath(e.target.value)}
              className="w-full px-3 py-1.5 bg-surface-container-high border border-surface-border/80 rounded-lg font-mono text-xs text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="models/yolov8s.pt">
                YOLOv8 Small (models/yolov8s.pt) — High Recall (Recommended)
              </option>
              <option value="models/yolov8n.pt">
                YOLOv8 Nano (models/yolov8n.pt) — Lightweight CPU Optimized
              </option>
            </select>
          </div>

          {/* Confidence Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between font-sans text-xs">
              <span className="text-text-primary">Detection Confidence Threshold</span>
              <span className="font-mono text-primary font-bold">{(confThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.10"
              max="0.80"
              step="0.05"
              value={confThreshold}
              onChange={(e) => setConfThreshold(e.target.value)}
              className="w-full accent-primary h-1.5 bg-surface-container-high rounded-lg cursor-pointer"
            />
          </div>

          {/* Proximity Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between font-sans text-xs">
              <span className="text-text-primary">Proximity Critical Boundary</span>
              <span className="font-mono text-primary font-bold">{proximityClose} px</span>
            </div>
            <input
              type="range"
              min="40"
              max="250"
              step="10"
              value={proximityClose}
              onChange={(e) => setProximityClose(e.target.value)}
              className="w-full accent-primary h-1.5 bg-surface-container-high rounded-lg cursor-pointer"
            />
          </div>

          {/* Unsafe Classes Tag List */}
          <div className="space-y-2 pt-2 border-t border-surface-border/40">
            <label className="block font-mono text-[11px] font-bold text-text-primary uppercase tracking-wider">
              Monitored Unsafe Classes ({unsafeClasses.length})
            </label>
            <div className="flex flex-wrap gap-1.5">
              {unsafeClasses.map((cls) => (
                <span
                  key={cls}
                  className="px-2 py-1 rounded bg-error-container/40 border border-error/50 text-error font-mono text-[11px] flex items-center gap-1.5 font-semibold"
                >
                  {cls}
                  <button
                    type="button"
                    onClick={() => handleRemoveClass(cls)}
                    className="hover:text-text-primary text-xs"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Add class (e.g. bottle, stick)..."
                value={newClassInput}
                onChange={(e) => setNewClassInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddClass())}
                className="flex-1 px-3 py-1.5 bg-surface-container-low border border-surface-border rounded-lg font-mono text-xs text-text-primary focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleAddClass}
                className="px-3 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-surface-border/60 text-xs text-text-primary font-semibold rounded-lg"
              >
                + Add
              </button>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-surface-border/60 flex items-center justify-end gap-space-sm">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-semibold text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-primary-container hover:bg-primary text-on-primary-container font-semibold text-xs shadow-sm transition-all"
          >
            {saving ? 'Saving...' : 'Apply Pipeline Configuration'}
          </button>
        </div>
      </div>
    </div>
  )
}
