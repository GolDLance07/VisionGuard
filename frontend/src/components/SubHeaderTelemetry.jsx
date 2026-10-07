import React from 'react'

export function SubHeaderTelemetry({
  sessionId,
  source,
  deviceIndex,
  uploadedFilename,
  latestFrame,
  previewState,
  onSetPreviewState,
}) {
  const currentRisk = previewState || latestFrame?.risk_level || 'LOW'
  const isHigh = currentRisk === 'HIGH'
  const isMed = currentRisk === 'MEDIUM'

  const activeRule = latestFrame?.reasons?.find((r) => r.rule !== 'persistence')?.rule || 'R-402'

  return (
    <div className="w-full pb-space-md pt-2">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-space-md gap-space-sm border-b border-surface-border/40">
        {/* Left Telemetry Chips */}
        <div className="flex items-center gap-space-sm flex-wrap">
          {/* Session ID Pill */}
          <div className="flex items-center gap-space-xs px-2.5 py-1 rounded-full bg-surface-container-high border border-surface-border/50">
            <span className="font-mono text-[10px] text-text-muted uppercase font-medium">SESSION ID</span>
            <span className="font-mono text-[11px] text-primary font-bold">
              {sessionId ? sessionId.slice(0, 14) : 'VG-LIVE-SYSTEM'}
            </span>
          </div>

          {/* Source Tag */}
          <div className="flex items-center gap-space-xs px-2.5 py-1 rounded-full bg-surface-container-high border border-surface-border/50">
            <span className="font-mono text-[10px] text-text-muted uppercase font-medium">SOURCE</span>
            <span className="font-mono text-[11px] text-on-surface font-semibold uppercase">
              {source === 'webcam'
                ? `WORKSTATION-CAM-0${deviceIndex}`
                : uploadedFilename
                ? uploadedFilename
                : 'LOCAL VIDEO CLIP'}
            </span>
          </div>

          <span className="hidden md:inline text-outline-variant">·</span>

          {/* Active Rule Trigger Status */}
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            {isHigh ? (
              <>
                <span className="w-2 h-2 rounded-full bg-status-high animate-ping"></span>
                <span className="text-status-high font-bold tracking-wide">
                  TRIGGER ACTIVE: RULE {activeRule.toUpperCase()}
                </span>
              </>
            ) : isMed ? (
              <>
                <span className="w-2 h-2 rounded-full bg-status-medium animate-pulse"></span>
                <span className="text-status-medium font-bold tracking-wide">
                  ELEVATED MONITORING: RULE {activeRule.toUpperCase()}
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-status-low"></span>
                <span className="text-status-low font-medium">NOMINAL MONITORING STATE</span>
              </>
            )}
          </div>
        </div>

        {/* Right Preview State Selector */}
        <div className="flex items-center gap-space-xs self-end sm:self-auto">
          <span className="font-mono text-[10px] text-text-muted mr-1 hidden lg:inline uppercase font-medium">
            PREVIEW STATE:
          </span>
          <div className="inline-flex p-0.5 rounded-lg bg-surface-container-high border border-surface-border/60">
            <button
              onClick={() => onSetPreviewState(previewState === 'low' ? null : 'low')}
              className={`px-2.5 py-1 rounded font-mono text-[11px] font-semibold transition-colors ${
                previewState === 'low'
                  ? 'bg-status-low text-surface-container-lowest shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              type="button"
            >
              LOW
            </button>
            <button
              onClick={() => onSetPreviewState(previewState === 'medium' ? null : 'medium')}
              className={`px-2.5 py-1 rounded font-mono text-[11px] font-semibold transition-colors ${
                previewState === 'medium'
                  ? 'bg-status-medium text-surface-container-lowest shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              type="button"
            >
              MED
            </button>
            <button
              onClick={() => onSetPreviewState(previewState === 'high' ? null : 'high')}
              className={`px-2.5 py-1 rounded font-mono text-[11px] font-semibold transition-colors ${
                previewState === 'high'
                  ? 'bg-status-high text-surface-container-lowest shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              type="button"
            >
              HIGH
            </button>
            <button
              onClick={() => onSetPreviewState(previewState === 'low-conf' ? null : 'low-conf')}
              className={`px-2.5 py-1 rounded font-mono text-[11px] font-semibold transition-colors ${
                previewState === 'low-conf'
                  ? 'bg-status-low-conf text-surface-container-lowest shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              type="button"
            >
              LOW CONF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
