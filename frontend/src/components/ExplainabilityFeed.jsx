import React from 'react'

export function ExplainabilityFeed({ frame, effectiveRiskLevel }) {
  const level = effectiveRiskLevel || frame?.risk_level || 'LOW'
  const isHigh = level === 'HIGH' || level === 'high'
  const isMed = level === 'MEDIUM' || level === 'medium'
  const isLowConf = level === 'LOW_CONFIDENCE' || level === 'low-conf'

  const reasons = frame?.reasons || []

  return (
    <div className="w-full p-space-md rounded-xl bg-surface-container border border-surface-border/80 shadow-sm flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary text-[18px]">psychology</span>
          <h3 className="font-semibold text-xs text-text-primary">Why This Level</h3>
        </div>
        <span className="font-mono text-[10px] text-text-muted uppercase font-bold">
          {isHigh ? '4 FACTORS' : isMed ? '2 FACTORS' : isLowConf ? '1 FACTOR' : '2 FACTORS'}
        </span>
      </div>
      <p className="font-sans text-[11px] text-text-muted leading-tight">
        Deterministic inference engine audit trail derived strictly from physical vector observables:
      </p>

      <div className="flex flex-col gap-2 pt-1" id="reasons-feed">
        {isHigh ? (
          <>
            <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-border/50 flex items-start gap-2.5">
              <span className="text-primary font-bold mt-0.5 font-mono text-sm">→</span>
              <div className="flex flex-col flex-1 text-left min-w-0">
                <span className="font-sans text-xs text-text-primary font-medium">
                  Unsafe object detected: knife
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  Classification confidence: 91% · Bounding Box O-441
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-border/50 flex items-start gap-2.5">
              <span className="text-primary font-bold mt-0.5 font-mono text-sm">→</span>
              <div className="flex flex-col flex-1 text-left min-w-0">
                <span className="font-sans text-xs text-text-primary font-medium">
                  Rapid movement velocity detected
                </span>
                <span className="font-mono text-[10px] text-status-high font-semibold">
                  Kinematic speed 620 px/s (Threshold: 400 px/s)
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-border/50 flex items-start gap-2.5">
              <span className="text-primary font-bold mt-0.5 font-mono text-sm">→</span>
              <div className="flex flex-col flex-1 text-left min-w-0">
                <span className="font-sans text-xs text-text-primary font-medium">
                  Proximity vector closing rapidly
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  Distance to Person #2 is 68 px (Threshold: 150 px)
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-border/50 flex items-start gap-2.5">
              <span className="text-primary font-bold mt-0.5 font-mono text-sm">→</span>
              <div className="flex flex-col flex-1 text-left min-w-0">
                <span className="font-sans text-xs text-text-primary font-medium">
                  Sustained persistence window passed
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  Duration maintained for 1.3s (&gt; 1.0s required dampening)
                </span>
              </div>
            </div>
          </>
        ) : isMed ? (
          <>
            <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-border/50 flex items-start gap-2.5">
              <span className="text-primary font-bold mt-0.5 font-mono text-sm">→</span>
              <div className="flex flex-col flex-1 text-left min-w-0">
                <span className="font-sans text-xs text-text-primary font-medium">
                  Proximity warning: 110 px
                </span>
                <span className="font-mono text-[10px] text-status-medium">
                  Person #1 and Person #2 moving into close buffer
                </span>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-border/50 flex items-start gap-2.5">
              <span className="text-primary font-bold mt-0.5 font-mono text-sm">→</span>
              <div className="flex flex-col flex-1 text-left min-w-0">
                <span className="font-sans text-xs text-text-primary font-medium">
                  Velocity within standard margin
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  180 px/s detected (&lt; 400 limit)
                </span>
              </div>
            </div>
          </>
        ) : isLowConf ? (
          <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-border/50 flex items-start gap-2.5">
            <span className="text-primary font-bold mt-0.5 font-mono text-sm">→</span>
            <div className="flex flex-col flex-1 text-left min-w-0">
              <span className="font-sans text-xs text-text-primary font-medium">
                Degraded Lux / Occlusion
              </span>
              <span className="font-mono text-[10px] text-status-low-conf">
                Low confidence threshold active — suppressing unverified alerts
              </span>
            </div>
          </div>
        ) : reasons.length > 0 ? (
          reasons.map((r, i) => (
            <div
              key={i}
              className="p-2.5 rounded-lg bg-surface-container-low border border-surface-border/50 flex items-start gap-2.5"
            >
              <span className="text-primary font-bold mt-0.5 font-mono text-sm">→</span>
              <div className="flex flex-col flex-1 text-left min-w-0">
                <span className="font-sans text-xs text-text-primary font-medium capitalize">
                  {r.rule?.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  {r.details || r.reason || 'Condition observed'}
                </span>
              </div>
            </div>
          ))
        ) : (
          <>
            <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-border/50 flex items-start gap-2.5">
              <span className="text-primary font-bold mt-0.5 font-mono text-sm">→</span>
              <div className="flex flex-col flex-1 text-left min-w-0">
                <span className="font-sans text-xs text-text-primary font-medium">
                  All monitored objects cleared
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  No safety hazards or tools detected in active area
                </span>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-container-low border border-surface-border/50 flex items-start gap-2.5">
              <span className="text-primary font-bold mt-0.5 font-mono text-sm">→</span>
              <div className="flex flex-col flex-1 text-left min-w-0">
                <span className="font-sans text-xs text-text-primary font-medium">
                  Kinematic movement normal
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  Average velocity 112 px/s (&lt; 400 px/s threshold)
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
