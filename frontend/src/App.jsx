import { useState, useEffect, useCallback } from 'react'
import { VideoPanel } from './components/VideoPanel'
import { RiskPanel } from './components/RiskPanel'
import { ObjectsList } from './components/ObjectsList'
import { WarningPanel } from './components/WarningPanel'
import { Controls } from './components/Controls'
import { useDetectionWebSocket } from './hooks/useDetectionWebSocket'

function App() {
  const [sessionId, setSessionId] = useState(null)
  const [source, setSource] = useState('webcam')
  const [deviceIndex, setDeviceIndex] = useState(0)
  const [fileRef, setFileRef] = useState(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [config, setConfig] = useState(null)
  const [isStarting, setIsStarting] = useState(false)
  const [apiError, setApiError] = useState(null)

  const {
    latestFrame,
    connectionStatus,
    errorMessage: wsErrorMessage,
  } = useDetectionWebSocket(sessionId)

  const startSession = useCallback(async () => {
    setIsStarting(true)
    setApiError(null)

    try {
      const payload = {
        source,
        device_index: source === 'webcam' ? deviceIndex : undefined,
        file_ref: source === 'upload' ? fileRef : undefined,
      }

      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `Failed to start session (${res.status})`)
      }

      const data = await res.json()
      setSessionId(data.session_id)
    } catch (err) {
      console.error('Failed to start session:', err)
      setApiError(err.message)
    } finally {
      setIsStarting(false)
    }
  }, [source, deviceIndex, fileRef])

  const stopSession = useCallback(async () => {
    if (!sessionId) return
    try {
      await fetch('/api/session/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
    } catch (err) {
      console.error('Failed to stop session:', err)
    } finally {
      setSessionId(null)
      setFileRef(null)
    }
  }, [sessionId])

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => setConfig(cfg))
      .catch((err) => console.warn('Could not load config:', err))
  }, [])

  const displayError = apiError || wsErrorMessage

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 font-black text-white text-base">
              V
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Vision Guard
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-400 font-medium">
                  V1 MVP
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Real-Time Visual Safety Monitoring & Risk Persistence Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-950/80 border-emerald-800 text-emerald-400'
                  : connectionStatus === 'connecting'
                    ? 'bg-amber-950/80 border-amber-800 text-amber-400 animate-pulse'
                    : connectionStatus === 'error'
                      ? 'bg-red-950/80 border-red-800 text-red-400'
                      : 'bg-slate-800/80 border-slate-700 text-slate-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-400'
                    : connectionStatus === 'connecting'
                      ? 'bg-amber-400'
                      : connectionStatus === 'error'
                        ? 'bg-red-400'
                        : 'bg-slate-500'
                }`}
              ></span>
              {connectionStatus.toUpperCase()}
            </span>

            <button
              onClick={() => setSoundEnabled((prev) => !prev)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm transition-colors"
              title={soundEnabled ? 'Mute Alert Sound' : 'Unmute Alert Sound'}
            >
              {soundEnabled ? '🔔' : '🔕'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        {displayError && (
          <div className="p-4 bg-red-950/60 border border-red-800 rounded-xl flex items-center justify-between text-red-200 text-sm shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <span className="font-bold">Error Notice:</span> {displayError}
              </div>
            </div>
            <button
              onClick={() => setApiError(null)}
              className="text-red-400 hover:text-red-200 text-xs px-2 py-1 rounded border border-red-800"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Video feed & Tracked Objects */}
          <div className="lg:col-span-2 space-y-6">
            <VideoPanel
              frame={latestFrame}
              errorMessage={wsErrorMessage}
              soundEnabled={soundEnabled}
              onToggleSound={() => setSoundEnabled((prev) => !prev)}
              unsafeClasses={config?.unsafe_classes || []}
            />

            <ObjectsList
              objects={latestFrame?.objects || []}
              unsafeClasses={config?.unsafe_classes || []}
            />
          </div>

          {/* Right Column: Risk Evaluation, Warnings & Session Controls */}
          <div className="space-y-6">
            <WarningPanel frame={latestFrame} />

            <RiskPanel frame={latestFrame} />

            <Controls
              source={source}
              setSource={setSource}
              deviceIndex={deviceIndex}
              setDeviceIndex={setDeviceIndex}
              fileRef={fileRef}
              setFileRef={setFileRef}
              onStart={startSession}
              onStop={stopSession}
              sessionId={sessionId}
              config={config}
              isStarting={isStarting}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-3 text-center text-xs text-slate-600">
        Vision Guard V1 &bull; YOLOv8 Visual Inference &bull; Rule-Based Risk Engine &bull; Observability Only
      </footer>
    </div>
  )
}

export default App