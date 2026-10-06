import { useState } from 'react'

export function IncidentHistory({ incidents = [], onClear }) {
  const [selectedIncident, setSelectedIncident] = useState(null)

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-200">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <span>🚨</span> Incident Log & Snapshots
        </h3>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-red-950/70 border border-red-800/80 text-red-400 text-xs font-mono font-semibold">
            {incidents.length} Logged
          </span>
          {incidents.length > 0 && onClear && (
            <button
              onClick={onClear}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {incidents.length === 0 ? (
        <div className="p-4 bg-slate-950/40 border border-slate-800/40 rounded-lg text-center text-xs text-slate-500 italic">
          No critical risk incidents captured yet during active session.
        </div>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              onClick={() => setSelectedIncident(inc)}
              className="group p-2.5 rounded-lg border border-red-900/40 bg-red-950/20 hover:bg-red-950/40 hover:border-red-700/60 transition-all cursor-pointer flex gap-3 items-center"
            >
              {/* Snapshot Thumbnail */}
              {inc.frame ? (
                <div className="w-16 h-12 rounded overflow-hidden bg-black shrink-0 border border-red-900/60 relative group-hover:scale-105 transition-transform">
                  <img
                    src={`data:image/jpeg;base64,${inc.frame}`}
                    alt="Incident snapshot"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-red-500/10 group-hover:bg-transparent"></div>
                </div>
              ) : (
                <div className="w-16 h-12 rounded bg-slate-950 shrink-0 border border-slate-800 flex items-center justify-center text-xs text-slate-600">
                  No img
                </div>
              )}

              {/* Incident Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-red-300 text-xs truncate">
                    {inc.primaryReason || 'Safety Threshold Exceeded'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">
                    {inc.timeStr}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="text-amber-400 font-mono font-semibold">
                    Score: {(inc.riskScore * 100).toFixed(0)}%
                  </span>
                  {inc.detectedClasses?.length > 0 && (
                    <span className="truncate text-slate-400">
                      &bull; Objects: <span className="text-slate-200">{inc.detectedClasses.join(', ')}</span>
                    </span>
                  )}
                </div>
              </div>

              <span className="text-slate-600 group-hover:text-slate-300 text-xs">
                🔍
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Full-Size Snapshot Modal */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl text-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h4 className="font-bold text-white text-base flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                  Incident Evidence Frame
                </h4>
                <p className="text-xs text-slate-400">
                  Captured at {selectedIncident.timeStr} &bull; Peak Score: {(selectedIncident.riskScore * 100).toFixed(1)}%
                </p>
              </div>
              <button
                onClick={() => setSelectedIncident(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {selectedIncident.frame && (
              <div className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video flex items-center justify-center shadow-inner">
                <img
                  src={`data:image/jpeg;base64,${selectedIncident.frame}`}
                  alt="Full incident frame"
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            <div className="space-y-1.5 bg-slate-950/70 p-3 rounded-lg border border-slate-800 text-xs">
              <span className="text-slate-400 font-semibold block">Trigger Factors:</span>
              <ul className="space-y-1 text-slate-300">
                {selectedIncident.reasons?.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-amber-400 font-bold">▸</span>
                    <span><strong className="capitalize">{r.rule.replace(/_/g, ' ')}:</strong> {r.details || r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedIncident(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
