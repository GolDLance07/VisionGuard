export function RiskPanel({ frame }) {
  if (!frame) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-400">
        <h3 className="font-bold text-white text-base mb-3 flex items-center gap-2">
          <span>🛡️</span> Risk Assessment
        </h3>
        <p className="text-sm text-slate-500">Awaiting stream telemetry...</p>
      </div>
    )
  }

  const getLevelBadge = (level) => {
    switch (level) {
      case 'HIGH':
        return 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/50'
      case 'LOW_CONFIDENCE':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/50'
      default:
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
    }
  }

  const scorePct = Math.min(Math.max((frame.risk_score || 0) * 100, 0), 100)

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-200 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <span>🛡️</span> Risk Assessment
        </h3>
        <span className={`px-2.5 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider ${getLevelBadge(frame.risk_level)}`}>
          {frame.risk_level === 'LOW_CONFIDENCE' ? 'LOW CONFIDENCE' : `${frame.risk_level} RISK`}
        </span>
      </div>

      {/* Risk Score Progress Bar */}
      <div>
        <div className="flex justify-between items-center text-xs mb-1.5">
          <span className="text-slate-400 font-medium">Aggregate Risk Index</span>
          <span className="font-mono text-sm font-bold text-white">{scorePct.toFixed(1)}%</span>
        </div>
        <div className="relative h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              frame.risk_level === 'HIGH'
                ? 'bg-gradient-to-r from-orange-500 to-red-500'
                : frame.risk_level === 'MEDIUM'
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                  : 'bg-gradient-to-r from-teal-500 to-emerald-500'
            }`}
            style={{ width: `${scorePct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1 font-mono">
          <span>0% (LOW)</span>
          <span>30% (MED)</span>
          <span>70% (HIGH)</span>
          <span>100%</span>
        </div>
      </div>

      {/* Evaluation Reasons Breakdown */}
      <div className="space-y-2 pt-2 border-t border-slate-800">
        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Active Evaluated Factors ({frame.reasons?.length || 0})
        </h4>
        {frame.reasons?.length > 0 ? (
          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            {frame.reasons.map((r, i) => (
              <div
                key={i}
                className="p-2 rounded bg-slate-950/60 border border-slate-800/80 text-xs flex items-start gap-2"
              >
                <span className="text-amber-400 font-bold shrink-0">▸</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 capitalize">
                      {r.rule.replace(/_/g, ' ')}
                    </span>
                    {r.score !== undefined && (
                      <span className="text-[10px] font-mono text-slate-400">
                        score: {(r.score * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-[11px] mt-0.5 leading-snug">
                    {r.details || r.reason || 'Condition detected'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic p-2 bg-slate-950/40 rounded border border-slate-800/40">
            No adverse risk rules triggered in current frame
          </p>
        )}
      </div>
    </div>
  )
}