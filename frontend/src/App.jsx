import { useState, useEffect, useCallback, useRef } from 'react'
import { Header } from './components/Header'
import { SubHeaderTelemetry } from './components/SubHeaderTelemetry'
import { VideoPanel } from './components/VideoPanel'
import { WarningPanel } from './components/WarningPanel'
import { RiskPanel } from './components/RiskPanel'
import { ExplainabilityFeed } from './components/ExplainabilityFeed'
import { ObjectsList } from './components/ObjectsList'
import { ThresholdTuningCard } from './components/ThresholdTuningCard'
import { IncidentHistory } from './components/IncidentHistory'
import { SafetyTelemetryView } from './components/SafetyTelemetryView'
import { SettingsModal } from './components/SettingsModal'
import { SettingsView } from './components/SettingsView'
import { useDetectionWebSocket } from './hooks/useDetectionWebSocket'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

function App() {
  const COOLDOWN_MS = 4000;
  const openIncidentsRef = useRef(new Map());
  const nextIncidentIdRef = useRef(1);
  const [activeTab, setActiveTab] = useState('live') // 'live' | 'incidents' | 'telemetry' | 'settings'
  const [sessionId, setSessionId] = useState(null)
  const [source, setSource] = useState('webcam')
  const [deviceIndex, setDeviceIndex] = useState(0)
  const [fileRef, setFileRef] = useState(null)
  const [uploadedFilename, setUploadedFilename] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [darkMode, setDarkMode] = useState(true)
  const [config, setConfig] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [previewState, setPreviewState] = useState(null) // null | 'low' | 'medium' | 'high' | 'low-conf'

  const lastIncidentTimeRef = useRef(0)

  // WebSocket hook for live stream telemetry
  const {
    latestFrame,
    connectionStatus,
    errorMessage: wsErrorMessage,
    sendFrame,
  } = useDetectionWebSocket(sessionId)

  // Sync dark mode class on html element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  // Record HIGH-risk incident snapshots
  // 1. Group Detections into Single Incident
  useEffect(() => {
    if (!latestFrame || latestFrame.risk_level !== 'HIGH') return;

    const now = Date.now();
    const timeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const unsafe = (latestFrame.objects || []).filter((o) =>
      (config?.unsafe_classes || ['knife', 'scissors', 'gun']).includes(o.class_name)
    );

    const getCategory = (cls) => {
      const l = (cls || '').toLowerCase();
      if (['knife', 'scissors', 'blade', 'dagger', 'sword', 'box cutter', 'machete', 'cutter', 'scalpel'].includes(l)) {
        return 'Sharp Objects';
      }
      if (['baseball bat', 'bat', 'crowbar', 'pipe', 'club', 'stick', 'hammer'].includes(l)) {
        return 'Blunt Objects';
      }
      if (['gun', 'pistol', 'rifle', 'handgun', 'shotgun', 'weapon', 'firearm'].includes(l)) {
        return 'Firearm';
      }
      return 'Hazardous Object';
    };

    unsafe.forEach((obj) => {
      const key = obj.class_name.toLowerCase();
      const existing = openIncidentsRef.current.get(key);

      if (existing) {
        existing.lastSeenAt = now;
        existing.durationMs = now - existing.startedAt;
        existing.detectionCount += 1;
        if (obj.confidence > existing.peakConfidence) {
          existing.peakConfidence = obj.confidence;
        }

        setIncidents((prev) =>
          prev.map((inc) => (inc.id === existing.id ? { ...existing } : inc))
        );
      } else {
        const categories = [getCategory(obj.class_name)];
        const title = `${categories.join(' & ')} Detected`;
        const primaryReason =
          latestFrame.reasons?.find((r) => r.rule !== 'persistence')?.details ||
          'Unsafe physical vector conditions observed';

        const newIncident = {
          id: `inc-${nextIncidentIdRef.current++}`,
          hazardClass: obj.class_name,
          state: 'open',
          startedAt: now,
          lastSeenAt: now,
          durationMs: 0,
          detectionCount: 1,
          peakConfidence: obj.confidence || 0.9,
          status: 'unreviewed',
          timestamp: now,
          timeStr,
          riskScore: latestFrame.risk_score,
          riskLevel: latestFrame.risk_level,
          title,
          primaryReason,
          reasons: latestFrame.reasons || [],
          frame: latestFrame.frame,
          detectedClasses: [`${obj.class_name} (${(obj.confidence * 100).toFixed(0)}%)`],
        };

        openIncidentsRef.current.set(key, newIncident);
        setIncidents((prev) => [newIncident, ...prev]);

        // Sync to Neon PostgreSQL and upload critical snapshot to Cloudinary
        fetch(`${API_BASE}/api/incidents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newIncident),
        })
          .then((res) => res.json())
          .then((resData) => {
            if (resData?.incident?.imageUrl) {
              setIncidents((prev) =>
                prev.map((it) =>
                  it.id === newIncident.id
                    ? { ...it, imageUrl: resData.incident.imageUrl, frame: resData.incident.imageUrl }
                    : it
                )
              );
            }
          })
          .catch((err) => console.debug('Could not sync incident to backend:', err));
      }
    });
  }, [latestFrame, config]);

  // Load persisted incidents from Neon Database on startup
  useEffect(() => {
    fetch(`${API_BASE}/api/incidents`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.incidents && Array.isArray(data.incidents) && data.incidents.length > 0) {
          setIncidents(data.incidents);
        }
      })
      .catch((err) => console.debug('Could not load incidents from database:', err));
  }, []);

  // 2. Cooldown Sweep Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      openIncidentsRef.current.forEach((inc, key) => {
        if (now - inc.lastSeenAt > COOLDOWN_MS) {
          inc.state = 'closed';
          inc.endedAt = inc.lastSeenAt;
          inc.durationMs = inc.endedAt - inc.startedAt;

          openIncidentsRef.current.delete(key);

          setIncidents((prev) =>
            prev.map((item) => (item.id === inc.id ? { ...inc } : item))
          );
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Manual snapshot capture from operator
  const handleCaptureSnapshot = useCallback(() => {
    const now = Date.now()
    const timeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const unsafe =
      latestFrame?.objects?.filter((o) =>
        (config?.unsafe_classes || ['knife', 'scissors', 'gun']).includes(o.class_name)
      ) || []

    const newIncident = {
      id: `inc-manual-${now}`,
      timestamp: now,
      timeStr,
      riskScore: latestFrame?.risk_score ?? 0.84,
      riskLevel: latestFrame?.risk_level ?? 'HIGH',
      title: 'Manual Operator Evidence Snapshot',
      primaryReason: 'Manual operator visual capture during active monitoring session',
      reasons: latestFrame?.reasons?.length
        ? latestFrame.reasons
        : [{ details: 'Manual keyframe captured for forensic retention', rule: 'manual_capture' }],
      frame: latestFrame?.frame || null,
      detectedClasses: unsafe.map((o) => `${o.class_name} (${(o.confidence * 100).toFixed(0)}%)`),
    }

    setIncidents((prev) => [newIncident, ...prev].slice(0, 30))

    // Upload snapshot to Cloudinary and record in database
    fetch(`${API_BASE}/api/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newIncident),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.incident?.imageUrl) {
          setIncidents((prev) =>
            prev.map((it) =>
              it.id === newIncident.id
                ? { ...it, imageUrl: data.incident.imageUrl, frame: data.incident.imageUrl }
                : it
            )
          )
        }
      })
      .catch((err) => console.debug('Snapshot sync error:', err))

    alert(`Snapshot recorded at ${timeStr} and queued for Cloudinary sync!`)
  }, [latestFrame, config])

  // Start Session API call
  const startSession = useCallback(async (overrideSource, overrideFileRef) => {
    setIsStarting(true)
    setApiError(null)

    try {
      const activeSource = (typeof overrideSource === 'string' ? overrideSource : null) || source
      const activeFileRef = (typeof overrideFileRef === 'string' ? overrideFileRef : null) || fileRef
      if (overrideSource && typeof overrideSource === 'string') {
        setSource(overrideSource)
      }
      if (overrideFileRef && typeof overrideFileRef === 'string') {
        setFileRef(overrideFileRef)
      }

      const payload = {
        source: activeSource,
        device_index: activeSource === 'webcam' ? (deviceIndex ?? 0) : undefined,
        file_ref: activeSource === 'upload' ? activeFileRef : undefined,
      }

      const res = await fetch(`${API_BASE}/api/session/start`, {
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

  // Stop Session API call
  const stopSession = useCallback(async () => {
    if (!sessionId) return
    try {
      await fetch(`${API_BASE}/api/session/stop`, {
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

  // Load config on startup
  useEffect(() => {
    fetch(`${API_BASE}/api/config`)
      .then((r) => r.json())
      .then((cfg) => setConfig(cfg))
      .catch((err) => console.warn('Could not load config from backend:', err))
  }, [])

  const displayError = apiError || wsErrorMessage

  // Effective risk level for rendering UI preview or live frame state
  const effectiveRiskLevel = previewState
    ? previewState === 'low'
      ? 'LOW'
      : previewState === 'medium'
        ? 'MEDIUM'
        : previewState === 'high'
          ? 'HIGH'
          : 'LOW_CONFIDENCE'
    : latestFrame?.risk_level || 'LOW'

  return (
    <div className="min-h-screen bg-bg-canvas text-on-surface flex flex-col font-sans antialiased">
      {/* 1. Header Navigation & Controls */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        connectionStatus={connectionStatus}
        latestFrame={latestFrame}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
        voiceEnabled={voiceEnabled}
        onToggleVoice={() => setVoiceEnabled((prev) => !prev)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Container */}
      <main className="w-full pt-16 bg-bg-canvas min-h-screen flex-1 flex flex-col">
        <div className="w-full px-gutter-desktop py-space-md max-w-[1600px] mx-auto flex-1 flex flex-col">
          {/* Error Banner */}
          {displayError && (
            <div className="mb-space-md p-space-md bg-error-container/40 border border-error/50 rounded-xl flex items-center justify-between text-text-primary text-xs shadow-lg backdrop-blur-md">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-status-high text-[20px]">
                  warning
                </span>
                <div>
                  <strong className="text-status-high">System Error:</strong> {displayError}
                </div>
              </div>
              <button
                onClick={() => setApiError(null)}
                className="px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest border border-surface-border text-text-muted text-[11px] font-mono"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* 2. Sub-Header Telemetry & Mode Toggles */}
          <SubHeaderTelemetry
            sessionId={sessionId}
            source={source}
            deviceIndex={deviceIndex}
            uploadedFilename={uploadedFilename}
            latestFrame={latestFrame}
            previewState={previewState}
            onSetPreviewState={setPreviewState}
          />

          {/* 3. Main Views */}
          {activeTab === 'live' && (
            /* Main Asymmetric Split: 65% Viewport | 35% Analytics */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start pt-space-xs">
              {/* Primary Video Canvas Column (65% / 8 cols) */}
              <div className="lg:col-span-8 flex flex-col gap-space-md">
                <VideoPanel
                  frame={latestFrame}
                  errorMessage={wsErrorMessage}
                  soundEnabled={soundEnabled}
                  voiceEnabled={voiceEnabled}
                  unsafeClasses={config?.unsafe_classes || []}
                  sessionId={sessionId}
                  source={source}
                  setSource={setSource}
                  deviceIndex={deviceIndex}
                  setDeviceIndex={setDeviceIndex}
                  fileRef={fileRef}
                  setFileRef={setFileRef}
                  onStartSession={startSession}
                  onStopSession={stopSession}
                  isStarting={isStarting}
                  effectiveRiskLevel={effectiveRiskLevel}
                  onCaptureSnapshot={handleCaptureSnapshot}
                  sendFrame={sendFrame}
                />
              </div>

              {/* Persistent Right Side Diagnostic Panel (35% / 4 cols) */}
              <div className="lg:col-span-4 flex flex-col gap-space-md w-full">
                {/* 1. Urgent Warning Panel */}
                <WarningPanel frame={latestFrame} effectiveRiskLevel={effectiveRiskLevel} />

                {/* 2. Risk Level Card */}
                <RiskPanel frame={latestFrame} effectiveRiskLevel={effectiveRiskLevel} />

                {/* 3. Explainability Feed */}
                <ExplainabilityFeed frame={latestFrame} effectiveRiskLevel={effectiveRiskLevel} />

                {/* 4. Tracked Entities Inventory */}
                <ObjectsList
                  objects={latestFrame?.objects || []}
                  unsafeClasses={config?.unsafe_classes || []}
                />

                {/* 5. Threshold Tuning Card */}
                <ThresholdTuningCard
                  config={config}
                  onConfigSaved={(updated) => setConfig(updated)}
                />
              </div>
            </div>
          )}

          {activeTab === 'incidents' && (
            <div className="pt-space-xs">
              <IncidentHistory incidents={incidents} onClear={() => setIncidents([])} />
            </div>
          )}

          {activeTab === 'telemetry' && (
            <div className="pt-space-xs">
              <SafetyTelemetryView latestFrame={latestFrame} config={config} />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="pt-space-xs">
              <SettingsView
                config={config}
                onConfigSaved={(updated) => setConfig(updated)}
                soundEnabled={soundEnabled}
                onToggleSound={() => setSoundEnabled((prev) => !prev)}
              />
            </div>
          )}
        </div>
      </main>

      {/* 4. Settings Modal Fallback */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onConfigSaved={(updated) => setConfig(updated)}
      />

      {/* 5. Stitch 1:1 Compliance Footer */}
      <footer className="w-full bg-surface-container-lowest/80 py-space-md border-t border-surface-border/40">
        <div className="w-full px-gutter-desktop flex flex-col md:flex-row items-center justify-between gap-space-sm max-w-[1600px] mx-auto">
          <div className="flex items-start gap-space-xs max-w-4xl">
            <span className="material-symbols-outlined text-outline text-[16px] mt-0.5 shrink-0">
              info
            </span>
            <p className="font-sans text-xs text-text-muted leading-relaxed">
              Vision Guard reports observable conditions only (objects, movement, distance, persistence). It does not identify people or infer intent or emotion. Human verification is expected.
            </p>
          </div>
          <div className="flex items-center gap-space-md shrink-0 font-mono text-[11px] text-outline">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              CV Core v2.4.1
            </span>
            <span>IEEE Hackathon 2026</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App