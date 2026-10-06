import { useState, useEffect, useCallback, useRef } from 'react'
import { VideoPanel } from './components/VideoPanel'
import { RiskPanel } from './components/RiskPanel'
import { ObjectsList } from './components/ObjectsList'
import { WarningPanel } from './components/WarningPanel'
import { Controls } from './components/Controls'
import { SettingsModal } from './components/SettingsModal'
import { IncidentHistory } from './components/IncidentHistory'
import { useDetectionWebSocket } from './hooks/useDetectionWebSocket'

function App() {
  const [sessionId, setSessionId] = useState(null)
  const [source, setSource] = useState('webcam')
  const [deviceIndex, setDeviceIndex] = useState(0)
  const [fileRef, setFileRef] = useState(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [config, setConfig] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [incidents, setIncidents] = useState([])

  const lastIncidentTimeRef = useRef(0)

  const {
    latestFrame,
    connectionStatus,
    errorMessage: wsErrorMessage,
  } = useDetectionWebSocket(sessionId)

  // Record HIGH-risk incident snapshots
  useEffect(() => {
    if (!latestFrame || latestFrame.risk_level !== 'HIGH') return

    const now = Date.now()
    if (now - lastIncidentTimeRef.current > 3500) {
      lastIncidentTimeRef.current = now

      const timeStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })

      const unsafe = latestFrame.objects?.filter(
        (o) => (config?.unsafe_classes || ['knife', 'scissors', 'gun']).includes(o.class_name)
      ) || []

      const primaryReason =
        latestFrame.reasons?.find((r) => r.rule !== 'persistence')?.details ||
        'Potential Security Risk'

      const newIncident = {
        id: `inc-${now}`,
        timestamp: now,
        timeStr,
        riskScore: latestFrame.risk_score,
        riskLevel: latestFrame.risk_level,
        primaryReason,
        reasons: latestFrame.reasons || [],
        frame: latestFrame.frame,
        detectedClasses: [...new Set(unsafe.map((o) => o.class_name))],
      }

      setIncidents((prev) => [newIncident, ...prev].slice(0, 30))
    }
  }, [latestFrame, config])

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
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
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
                Real-Time Visual Safety Monitoring & Threat Detection Engine
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Configure Detection & Risk Thresholds"
            >
              <span>⚙️</span>
              <span>Live Settings</span>
            </button>

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
              onClick={() => setVoiceEnabled((prev) => !prev)}
              className={`p-1.5 rounded-lg border text-sm transition-colors ${
                voiceEnabled
                  ? 'bg-blue-900/60 border-blue-700 text-blue-200'
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title={voiceEnabled ? 'Mute Voice Alerts' : 'Enable Voice Alerts'}
            >
              {voiceEnabled ? '🗣️' : '🔇'}
            </button>

            <button
              onClick={() => setSoundEnabled((prev) => !prev)}
              className={`p-1.5 rounded-lg border text-sm transition-colors ${
                soundEnabled
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title={soundEnabled ? 'Mute Chime Alerts' : 'Enable Chime Alerts'}
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
              voiceEnabled={voiceEnabled}
              onToggleSound={() => setSoundEnabled((prev) => !prev)}
              onToggleVoice={() => setVoiceEnabled((prev) => !prev)}
              unsafeClasses={config?.unsafe_classes || []}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ObjectsList
                objects={latestFrame?.objects || []}
                unsafeClasses={config?.unsafe_classes || []}
              />
              <IncidentHistory
                incidents={incidents}
                onClear={() => setIncidents([])}
              />
            </div>
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

      {/* Live Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onConfigSaved={(updated) => setConfig(updated)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-3 text-center text-xs text-slate-600">
        Vision Guard V1 &bull; Real-time YOLOv8 &bull; Rule-Based Risk Engine &bull; Automated Voice Callouts
      </footer>
    </div>
  )
}

export default App