import React, { useState } from 'react'

export function IncidentHistory({ incidents = [], onClear }) {
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [filterLevel, setFilterLevel] = useState('ALL')

  // Default mock incidents if none captured yet
  const displayIncidents = incidents.length > 0 ? incidents : [
    {
      id: 'inc-demo-101',
      timestamp: Date.now() - 120000,
      timeStr: '22:12:45',
      riskScore: 0.84,
      riskLevel: 'HIGH',
      title: 'Sharp Object & Rapid Velocity Detected',
      primaryReason: 'Unsafe object: knife (91% confidence) moving at 620 px/s within 68px of Person #2',
      reasons: [
        { rule: 'unsafe_object', score: 0.91, details: 'Unsafe object knife detected (91% confidence)' },
        { rule: 'movement', score: 0.85, details: 'Kinematic speed 620 px/s exceeds 400 px/s threshold' },
        { rule: 'proximity', score: 0.80, details: 'Proximity vector 68 px to Person #2 is critically close' },
        { rule: 'persistence', score: 1.0, details: 'Condition maintained for 1.3s (> 1.0s window)' },
      ],
      detectedClasses: ['knife (91%)'],
      frame: null,
    },
    {
      id: 'inc-demo-102',
      timestamp: Date.now() - 480000,
      timeStr: '22:06:10',
      riskScore: 0.58,
      riskLevel: 'MEDIUM',
      title: 'Proximity Closing Warning',
      primaryReason: 'Person #1 and Person #2 moving into close 110 px boundary zone',
      reasons: [
        { rule: 'proximity', score: 0.58, details: 'Closing distance 110 px observed between tracked people' },
      ],
      detectedClasses: [],
      frame: null,
    },
  ]

  const filtered = displayIncidents.filter((inc) => {
    if (filterLevel === 'ALL') return true
    if (filterLevel === 'HIGH') return inc.riskLevel === 'HIGH' || inc.riskLevel === 'high'
    if (filterLevel === 'MEDIUM') return inc.riskLevel === 'MEDIUM' || inc.riskLevel === 'medium'
    return true
  })

  return (
    <div className="w-full space-y-space-md animate-in fade-in duration-200">
      {/* Top Incident Header & Filters */}
      <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-wrap items-center justify-between gap-space-sm shadow-sm">
        <div className="flex items-center gap-space-sm">
          <div className="w-9 h-9 rounded-lg bg-status-high/20 border border-status-high/40 flex items-center justify-center text-status-high">
            <span className="material-symbols-outlined text-[20px]">warning</span>
          </div>
          <div>
            <h2 className="font-bold text-base text-text-primary flex items-center gap-2">
              Incident Evidence Log & Snapshots
              <span className="px-2 py-0.5 rounded-full bg-status-high/20 text-status-high font-mono text-xs font-bold border border-status-high/30">
                {displayIncidents.length} LOGGED
              </span>
            </h2>
            <p className="font-sans text-xs text-text-muted mt-0.5">
              Verified high-risk safety event recordings with frame snapshots and sensor evidence.
            </p>
          </div>
        </div>

        {/* Filter Pills & Clear */}
        <div className="flex items-center gap-space-xs flex-wrap">
          <div className="inline-flex p-0.5 rounded-lg bg-surface-container-high border border-surface-border/60">
            {['ALL', 'HIGH', 'MEDIUM'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-2.5 py-1 rounded font-mono text-[11px] font-semibold transition-colors ${
                  filterLevel === lvl
                    ? 'bg-primary-container text-on-primary-container shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                type="button"
              >
                {lvl}
              </button>
            ))}
          </div>

          {onClear && incidents.length > 0 && (
            <button
              onClick={onClear}
              className="h-8 px-space-sm rounded bg-surface-container-high hover:bg-surface-container-highest border border-surface-border/60 text-text-muted hover:text-text-primary font-mono text-xs font-semibold transition-colors"
              type="button"
            >
              CLEAR LOG
            </button>
          )}
        </div>
      </div>

      {/* Incident Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
        {filtered.map((inc) => {
          const isHigh = inc.riskLevel === 'HIGH' || inc.riskLevel === 'high'
          return (
            <div
              key={inc.id}
              onClick={() => setSelectedIncident(inc)}
              className={`group p-space-md rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-space-sm ${
                isHigh
                  ? 'bg-surface-container border-status-high/40 hover:border-status-high hover:shadow-lg'
                  : 'bg-surface-container border-surface-border/80 hover:border-outline'
              }`}
            >
              <div className="flex items-start gap-space-sm">
                {/* Snapshot Thumbnail */}
                <div className="w-24 h-16 rounded-lg overflow-hidden bg-surface-container-lowest border border-surface-border/80 shrink-0 relative group-hover:scale-105 transition-transform flex items-center justify-center">
                  {inc.frame ? (
                    <img
                      src={`data:image/jpeg;base64,${inc.frame}`}
                      alt="Incident snapshot"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="material-symbols-outlined text-outline text-[24px]">
                      videocam_off
                    </span>
                  )}
                  <div className="absolute inset-0 bg-status-high/10 group-hover:bg-transparent"></div>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] font-extrabold uppercase ${
                        isHigh ? 'bg-status-high text-surface-container-lowest' : 'bg-status-medium text-surface-container-lowest'
                      }`}
                    >
                      {inc.riskLevel}
                    </span>
                    <span className="font-mono text-[11px] text-text-muted">
                      🕒 {inc.timeStr}
                    </span>
                  </div>

                  <h3 className="font-semibold text-xs text-text-primary leading-tight truncate mt-0.5">
                    {inc.title || 'Safety Hazard Trigger'}
                  </h3>
                  <p className="font-sans text-[11px] text-text-muted line-clamp-2">
                    {inc.primaryReason}
                  </p>
                </div>
              </div>

              {/* Bottom Footer Telemetry */}
              <div className="pt-2 border-t border-surface-border/40 flex items-center justify-between font-mono text-[11px]">
                <span className="text-primary font-bold">
                  SCORE: {((inc.riskScore || 0) * 100).toFixed(0)}%
                </span>
                {inc.detectedClasses?.length > 0 && (
                  <span className="text-text-muted truncate">
                    {inc.detectedClasses.join(', ')}
                  </span>
                )}
                <span className="text-primary group-hover:underline flex items-center gap-0.5 font-semibold">
                  VIEW EVIDENCE <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Full Evidence Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-surface-container border border-surface-border rounded-2xl max-w-2xl w-full p-space-md shadow-2xl text-text-primary space-y-space-md animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border/60">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-status-high text-[24px]">
                  gpp_maybe
                </span>
                <div>
                  <h3 className="font-bold text-sm text-text-primary">
                    {selectedIncident.title || 'Incident Evidence Report'}
                  </h3>
                  <p className="font-mono text-[11px] text-text-muted mt-0.5">
                    Logged at {selectedIncident.timeStr} · Peak Risk Score:{' '}
                    <strong className="text-status-high">
                      {((selectedIncident.riskScore || 0) * 100).toFixed(1)}%
                    </strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="w-8 h-8 rounded-lg bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center text-text-muted hover:text-text-primary"
                type="button"
              >
                ✕
              </button>
            </div>

            {/* Frame Image */}
            <div className="rounded-xl overflow-hidden border border-surface-border/80 bg-surface-container-lowest aspect-video flex items-center justify-center shadow-inner relative">
              {selectedIncident.frame ? (
                <img
                  src={`data:image/jpeg;base64,${selectedIncident.frame}`}
                  alt="Incident full resolution frame"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-1 text-text-muted font-mono text-xs">
                  <span className="material-symbols-outlined text-[36px]">photo_camera</span>
                  <span>Optical Frame Captured in Memory</span>
                </div>
              )}
            </div>

            {/* Trigger Factors List */}
            <div className="space-y-1.5 p-space-md rounded-xl bg-surface-container-low border border-surface-border/60 text-xs">
              <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider block mb-1">
                Deterministic Rule Triggers
              </span>
              <ul className="space-y-1 font-sans">
                {selectedIncident.reasons?.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary font-mono font-bold">→</span>
                    <span className="text-text-primary">
                      <strong className="capitalize">{r.rule?.replace(/_/g, ' ')}:</strong>{' '}
                      {r.details || r.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-end gap-space-sm pt-2">
              <button
                onClick={() => setSelectedIncident(null)}
                className="h-9 px-space-md rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-surface-border/60 font-semibold text-xs text-text-primary transition-colors"
                type="button"
              >
                Close Evidence Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
