export function ObjectsList({ objects = [], unsafeClasses = [] }) {
  if (!objects.length) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-400">
        <h3 className="font-bold text-white text-base mb-2 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>🎯</span> Tracked Entities
          </span>
          <span className="text-xs text-slate-500 font-mono">0 active</span>
        </h3>
        <p className="text-xs text-slate-500">No objects tracked in the current scene.</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-slate-200">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <span>🎯</span> Tracked Entities
        </h3>
        <span className="px-2 py-0.5 rounded-full bg-blue-950 border border-blue-800 text-blue-400 text-xs font-mono font-semibold">
          {objects.length} Active
        </span>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {objects.map((obj) => {
          const isUnsafe = unsafeClasses.includes(obj.class_name) || ['knife', 'scissors', 'gun'].includes(obj.class_name)
          return (
            <div
              key={obj.id}
              className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-all ${
                isUnsafe
                  ? 'bg-red-950/40 border-red-800/80'
                  : 'bg-slate-950/60 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                  isUnsafe ? 'bg-red-900/80 text-red-200' : 'bg-blue-900/80 text-blue-200'
                }`}>
                  #{obj.id}
                </span>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white capitalize text-sm">
                      {obj.class_name}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {(obj.confidence * 100).toFixed(0)}% conf
                    </span>
                  </div>

                  {obj.speed !== undefined && obj.speed > 0 && (
                    <div className="text-[10px] text-sky-400 flex items-center gap-2 mt-0.5">
                      <span>⚡ Speed: {Math.round(obj.speed)} px/s</span>
                      {obj.direction !== undefined && (
                        <span>🧭 Heading: {Math.round(obj.direction)}°</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right font-mono text-[10px] text-slate-500">
                <div>[{Math.round(obj.bbox.x1)}, {Math.round(obj.bbox.y1)}]</div>
                <div>[{Math.round(obj.bbox.x2)}, {Math.round(obj.bbox.y2)}]</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}