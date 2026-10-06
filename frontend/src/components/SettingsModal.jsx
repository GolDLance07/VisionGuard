import { useState, useEffect } from 'react'

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
  const [savedSuccess, setSavedSuccess] = useState(false)

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
    setSavedSuccess(false)
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
      setSavedSuccess(true)
      setTimeout(() => {
        setSavedSuccess(false)
        onClose()
      }, 800)
    } catch (err) {
      console.error('Save config error:', err)
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">⚙️</span>
            <div>
              <h3 className="font-bold text-white text-lg">Pipeline & Risk Configuration</h3>
              <p className="text-xs text-slate-400">Live tunable thresholds — applies immediately</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-sm"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          {/* YOLO Model Weights Selector */}
          <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <label className="block text-xs font-semibold text-slate-200">
              YOLO Detection Model Weights
            </label>
            <select
              value={modelPath}
              onChange={(e) => setModelPath(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="models/yolov8s.pt">YOLOv8 Small (models/yolov8s.pt) — High Accuracy (82%+ Knife/Scissors)</option>
              <option value="models/yolov8n.pt">YOLOv8 Nano (models/yolov8n.pt) — Ultra Lightweight (CPU Optimized)</option>
            </select>
            <p className="text-[11px] text-slate-500">
              Switches model weights dynamically. YOLOv8s provides superior detection recall on handheld sharp objects.
            </p>
          </div>

          {/* Detection Confidence Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-300">Detection Confidence Threshold</span>
              <span className="font-mono text-blue-400">{(confThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.10"
              max="0.80"
              step="0.05"
              value={confThreshold}
              onChange={(e) => setConfThreshold(e.target.value)}
              className="w-full accent-blue-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Lower threshold (20–30%) increases sensitivity for small/held objects like knives.
            </p>
          </div>

          {/* Proximity Threshold Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-300">Proximity "Close" Threshold</span>
              <span className="font-mono text-blue-400">{proximityClose} px</span>
            </div>
            <input
              type="range"
              min="40"
              max="250"
              step="10"
              value={proximityClose}
              onChange={(e) => setProximityClose(e.target.value)}
              className="w-full accent-blue-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Objects within this distance from a person trigger maximum proximity risk score.
            </p>
          </div>

          {/* Persistence Window Slider */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Persistence Window</span>
                <span className="font-mono text-blue-400">{persistenceWindow} frames</span>
              </div>
              <input
                type="range"
                min="5"
                max="25"
                step="1"
                value={persistenceWindow}
                onChange={(e) => setPersistenceWindow(e.target.value)}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-300">Min Duration</span>
                <span className="font-mono text-blue-400">{minDuration}s</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.5"
                step="0.1"
                value={minDuration}
                onChange={(e) => setMinDuration(e.target.value)}
                className="w-full accent-blue-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Frame Skip */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-slate-300">Frame Skip Rate</span>
              <span className="font-mono text-blue-400">Process every {frameSkip} frame</span>
            </div>
            <input
              type="range"
              min="1"
              max="4"
              step="1"
              value={frameSkip}
              onChange={(e) => setFrameSkip(e.target.value)}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          {/* Unsafe Classes Tag List */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="block text-xs font-semibold text-slate-300">
              Monitored Unsafe Classes ({unsafeClasses.length})
            </label>
            <div className="flex flex-wrap gap-1.5">
              {unsafeClasses.map((cls) => (
                <span
                  key={cls}
                  className="px-2 py-1 rounded bg-red-950/70 border border-red-800/80 text-red-300 text-xs flex items-center gap-1.5 font-medium"
                >
                  {cls}
                  <button
                    type="button"
                    onClick={() => handleRemoveClass(cls)}
                    className="text-red-400 hover:text-white"
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
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddClass}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-white font-medium rounded-lg"
              >
                + Add
              </button>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2"
          >
            {saving ? 'Saving...' : savedSuccess ? '✓ Saved!' : 'Apply Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
