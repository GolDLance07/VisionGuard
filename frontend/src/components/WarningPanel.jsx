import React, { useState } from 'react'

export function WarningPanel({ frame, effectiveRiskLevel }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [silenced, setSilenced] = useState(false)

  const isHighRisk = effectiveRiskLevel === 'HIGH'

  if (!isHighRisk) {
    return (
      <div className="w-full p-space-md rounded-xl bg-surface-container border border-surface-border/80 shadow-sm flex items-center gap-space-sm">
        <div className="w-9 h-9 rounded-lg bg-status-low/10 border border-status-low/30 flex items-center justify-center shrink-0 text-status-low">
          <span className="material-symbols-outlined text-[20px]">verified</span>
        </div>
        <div className="flex flex-col">
          <span className="font-mono text-[10px] text-status-low uppercase font-bold tracking-wider">
            STATUS: NOMINAL
          </span>
          <span className="font-sans text-xs text-text-muted mt-0.5">
            No persistent safety hazards or high-risk conditions identified.
          </span>
        </div>
      </div>
    )
  }

  const handleAcknowledge = () => {
    setAcknowledged(true)
    setTimeout(() => setAcknowledged(false), 5000)
  }

  const handleSilence = () => {
    setSilenced(true)
    setTimeout(() => setSilenced(false), 30000)
  }

  return (
    <div
      id="panel-warning"
      className={`w-full p-space-md rounded-xl bg-error-container/20 border-2 border-status-high shadow-lg relative overflow-hidden transition-all duration-300 ${
        acknowledged ? 'opacity-50' : 'animate-pulse'
      }`}
    >
      <div className="flex items-start gap-space-sm">
        <div className="w-10 h-10 rounded-lg bg-status-high/20 border border-status-high/40 flex items-center justify-center shrink-0 text-status-high">
          <span className="material-symbols-outlined text-[24px]">gpp_maybe</span>
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-status-high uppercase tracking-wider font-bold">
              CRITICAL WARNING
            </span>
            <span className="font-mono text-[10px] text-text-muted">RULE #402</span>
          </div>
          <h2 className="font-semibold text-sm text-text-primary mt-0.5 leading-snug">
            Potential Safety Hazard Verified
          </h2>
          <p className="font-sans text-xs text-text-muted mt-1 leading-relaxed">
            Condition has persisted for <strong className="text-text-primary font-medium">1.3s</strong>{' '}
            (exceeding the 1.0s safety tolerance window). Immediate human verification is recommended.
          </p>

          <div className="flex items-center gap-space-xs mt-space-md flex-wrap">
            <button
              onClick={handleAcknowledge}
              className="h-8 px-space-sm rounded bg-status-high hover:bg-status-high/90 text-surface-container-lowest font-semibold text-xs transition-colors shadow-sm"
              type="button"
            >
              {acknowledged ? '✓ Alert Acknowledged' : 'Acknowledge Alert'}
            </button>
            <button
              onClick={handleSilence}
              className="h-8 px-space-sm rounded bg-surface-container-highest hover:bg-surface-bright border border-surface-border/60 text-text-primary font-semibold text-xs transition-colors"
              type="button"
            >
              {silenced ? '🔇 Buzzer Silenced (30s)' : 'Silence Buzzer (30s)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}