import { useState, useRef } from 'react'

export function Controls({
  source,
  setSource,
  deviceIndex,
  setDeviceIndex,
  fileRef,
  setFileRef,
  onStart,
  onStop,
  sessionId,
  config,
  isStarting = false,
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadedFilename, setUploadedFilename] = useState('')
  const [uploadError, setUploadError] = useState(null)
  const fileInputRef = useRef(null)

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
      const res = await fetch(`${API_BASE}/api/session/upload`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Upload failed with status ${res.status}`)
      }
      const data = await res.json()
      setFileRef(data.file_ref)
      setUploadedFilename(data.filename || file.name)
    } catch (err) {
      console.error('File upload error:', err)
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-200">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${sessionId ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></span>
          {sessionId ? 'Active Session Control' : 'Session Configuration'}
        </h3>
        {sessionId && (
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-800 text-emerald-400 font-medium">
            RUNNING
          </span>
        )}
      </div>

      {!sessionId ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Video Feed Source</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSource('webcam')}
                className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                  source === 'webcam'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                📹 Webcam
              </button>
              <button
                type="button"
                onClick={() => setSource('upload')}
                className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                  source === 'upload'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                📁 Video File
              </button>
            </div>
          </div>

          {source === 'webcam' ? (
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Camera Device Index</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={deviceIndex}
                  onChange={(e) => setDeviceIndex(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                  max={10}
                  className="w-20 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <span className="text-xs text-slate-500">
                  (0 = default built-in/USB camera)
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 space-y-2">
              <label className="block text-xs font-medium text-slate-300">Upload Video File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/avi,video/mov,video/x-matroska,video/webm"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-sm text-slate-200 transition-colors flex items-center justify-center gap-2"
              >
                {uploading ? 'Uploading...' : uploadedFilename ? `Change: ${uploadedFilename}` : 'Choose Video File...'}
              </button>

              {uploadedFilename && (
                <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <span>✓</span> File ready: <span className="font-mono text-slate-300">{uploadedFilename}</span>
                </div>
              )}

              {uploadError && (
                <div className="text-xs text-red-400 mt-1">
                  ⚠ {uploadError}
                </div>
              )}
            </div>
          )}

          <button
            onClick={onStart}
            disabled={isStarting || (source === 'upload' && !fileRef)}
            className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2 ${
              isStarting || (source === 'upload' && !fileRef)
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
            }`}
          >
            {isStarting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                Starting Pipeline...
              </>
            ) : (
              'Start Safety Monitoring'
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Session ID</span>
              <code className="bg-slate-800 px-2 py-0.5 rounded text-slate-200 font-mono text-[11px]">
                {sessionId.slice(0, 12)}...
              </code>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Feed Source</span>
              <span className="text-slate-200 font-medium capitalize">
                {source} {source === 'webcam' ? `(Device #${deviceIndex})` : ''}
              </span>
            </div>
          </div>

          <button
            onClick={onStop}
            className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold text-sm transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-2"
          >
            ⏹ Stop Monitoring & Release Camera
          </button>
        </div>
      )}

      {config && (
        <details className="mt-4 pt-3 border-t border-slate-800 group">
          <summary className="text-xs font-semibold text-slate-400 hover:text-slate-300 cursor-pointer flex items-center justify-between">
            <span>⚙️ Pipeline & Risk Configuration</span>
            <span className="text-slate-500 text-[10px] group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-3 text-xs bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500">Confidence Threshold:</span>{' '}
                <span className="text-slate-300 font-mono">{(config.detection_confidence_threshold * 100).toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-slate-500">Frame Skip:</span>{' '}
                <span className="text-slate-300 font-mono">Every {config.frame_skip} frames</span>
              </div>
              <div>
                <span className="text-slate-500">Persistence Window:</span>{' '}
                <span className="text-slate-300 font-mono">{config.persistence_window} frames</span>
              </div>
              <div>
                <span className="text-slate-500">Min Duration:</span>{' '}
                <span className="text-slate-300 font-mono">{config.min_persistence_duration}s</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <span className="text-slate-500 block mb-1">Unsafe Classes:</span>
              <div className="flex flex-wrap gap-1">
                {config.unsafe_classes?.map((c) => (
                  <span key={c} className="px-1.5 py-0.5 bg-red-950/60 border border-red-800/60 text-red-300 rounded text-[10px]">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </details>
      )}
    </div>
  )
}