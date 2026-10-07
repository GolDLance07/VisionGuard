import React from 'react'

export function RiskPanel({ frame, effectiveRiskLevel }) {
  const riskLevel = effectiveRiskLevel || frame?.risk_level || 'LOW'
  const isLowConf = riskLevel === 'LOW_CONFIDENCE' || riskLevel === 'low-conf'

  const scorePct = isLowConf ? 0 : Math.min(Math.max((frame?.risk_score || 0.12) * 100, 0), 100)

  const getBadgeStyle = (level) => {
    switch (level) {
      case 'HIGH':
      case 'high':
        return 'bg-status-high text-surface-container-lowest'
      case 'MEDIUM':
      case 'medium':
        return 'bg-status-medium text-surface-container-lowest'
      case 'LOW_CONFIDENCE':
      case 'low-conf':
        return 'bg-status-low-conf text-surface-container-lowest'
      default:
        return 'bg-status-low text-surface-container-lowest'
    }
  }

  const getScoreColor = (level) => {
    switch (level) {
      case 'HIGH':
      case 'high':
        return 'text-status-high'
      case 'MEDIUM':
      case 'medium':
        return 'text-status-medium'
      case 'LOW_CONFIDENCE':
      case 'low-conf':
        return 'text-status-low-conf'
      default:
        return 'text-status-low'
    }
  }

  const getSubLabel = (level) => {
    switch (level) {
      case 'HIGH':
      case 'high':
        return 'ELEVATED CRITICALITY'
      case 'MEDIUM':
      case 'medium':
        return 'MONITORING CLOSING DISTANCE'
      case 'LOW_CONFIDENCE':
      case 'low-conf':
        return 'DEGRADED lux / OCCLUSION'
      default:
        return 'NORMAL NOMINAL STATE'
    }
  }

  const getBarColor = (level) => {
    switch (level) {
      case 'HIGH':
      case 'high':
        return 'bg-status-high'
      case 'MEDIUM':
      case 'medium':
        return 'bg-status-medium'
      case 'LOW_CONFIDENCE':
      case 'low-conf':
        return 'bg-status-low-conf'
      default:
        return 'bg-status-low'
    }
  }

  return (
    <div className="w-full p-space-md rounded-xl bg-surface-container border border-surface-border/80 shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
          Synthesized Safety Risk
        </span>
        <div
          id="risk-badge"
          className={`px-2.5 py-1 rounded font-mono text-[10px] font-extrabold tracking-wider uppercase shadow-sm ${getBadgeStyle(
            riskLevel
          )}`}
        >
          {riskLevel.replace(/_/g, ' ')}
        </div>
      </div>

      {/* Quantitative Large Readout & Progress Meter */}
      <div className="flex flex-col gap-space-xs">
        <div className="flex items-baseline justify-between">
          <span
            id="risk-score"
            className={`font-mono text-3xl font-extrabold tracking-tight ${getScoreColor(riskLevel)}`}
          >
            {isLowConf ? '—' : `${scorePct.toFixed(0)}%`}
          </span>
          <span
            id="risk-sub-label"
            className={`font-mono text-[11px] font-semibold ${getScoreColor(riskLevel)}`}
          >
            {getSubLabel(riskLevel)}
          </span>
        </div>

        {/* Meter Track Bar */}
        <div className="w-full h-2.5 rounded-full bg-surface-border overflow-hidden relative">
          <div
            id="risk-bar"
            className={`h-full rounded-full transition-all duration-500 ease-out ${getBarColor(
              riskLevel
            )}`}
            style={{ width: `${scorePct}%` }}
          ></div>
        </div>
        <div className="flex items-center justify-between text-text-muted font-mono text-[10px] pt-1">
          <span>0% (NORMAL)</span>
          <span>50% (MODERATE)</span>
          <span>100% (CRITICAL)</span>
        </div>
      </div>

      {/* Persistence Window Note */}
      <div className="p-space-sm rounded-lg bg-surface-container-low border border-surface-border/50 font-mono text-[11px] text-text-muted flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-[16px] text-outline">timelapse</span>
        <span id="risk-persistence-note">
          {riskLevel === 'HIGH' || riskLevel === 'high'
            ? 'Threshold exceeded for 1.3s (persistence limit: 1.0s)'
            : riskLevel === 'MEDIUM' || riskLevel === 'medium'
            ? 'Approaching proximity limit (110 px observed, 150 px boundary)'
            : isLowConf
            ? 'Camera lux low or high motion blur — score unverified'
            : 'All parameters within standard operating boundaries.'}
        </span>
      </div>
    </div>
  )
}