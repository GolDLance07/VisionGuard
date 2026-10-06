export function WarningPanel({ frame }) {
  if (!frame || frame.risk_level !== 'HIGH') {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-300">
        <h3 className="font-bold text-white text-base mb-2 flex items-center gap-2">
          <span>🔔</span> Safety Warning Status
        </h3>
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-lg flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          <div>
            <div className="text-xs font-semibold text-emerald-300">STATUS: CLEAR</div>
            <div className="text-[11px] text-emerald-400/80">No persistent safety hazards identified</div>
          </div>
        </div>
      </div>
    )
  }

  // Find persistence duration if present in reasons
  const persistenceReason = frame.reasons?.find((r) => r.rule === 'persistence')
  const specificReasons = frame.reasons?.filter((r) => r.rule !== 'persistence') || []

  return (
    <div className="bg-gradient-to-b from-red-950/80 to-slate-900 border-2 border-red-500 rounded-xl p-5 shadow-2xl text-slate-200 animate-pulse">
      <div className="flex items-center gap-2.5 mb-3 text-red-400">
        <span className="w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
        <h3 className="font-extrabold text-base tracking-wider text-red-200">
          POTENTIAL SAFETY RISK
        </h3>
      </div>

      <div className="space-y-2 mb-3">
        {persistenceReason && (
          <div className="text-xs font-mono font-bold text-amber-300 bg-amber-950/60 border border-amber-800/80 px-2.5 py-1.5 rounded-md flex items-center gap-2">
            <span>⏱️</span> {persistenceReason.details}
          </div>
        )}

        <div className="text-xs text-red-200 space-y-1">
          {specificReasons.length > 0 ? (
            specificReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-red-400">•</span>
                <span>{r.details || r.reason}</span>
              </div>
            ))
          ) : (
            <div>High safety score thresholds exceeded continuously.</div>
          )}
        </div>
      </div>

      <div className="pt-2.5 border-t border-red-800/60 text-[10px] text-red-400 leading-tight">
        Disclaimer: System reports observable conditions only. Human verification expected.
      </div>
    </div>
  )
}