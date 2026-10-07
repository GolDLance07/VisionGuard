import React from 'react'

export function ObjectsList({ objects = [], unsafeClasses = [] }) {
  // Default mock entities for display when no live stream is active
  const displayObjects = objects.length > 0 ? objects : [
    { id: 102, class_name: 'person', confidence: 0.97, speed: 180, track_id: 'P-102', bbox: { x1: 140, y1: 220, x2: 410, y2: 900 } },
    { id: 108, class_name: 'person', confidence: 0.94, speed: 45, track_id: 'P-108', bbox: { x1: 560, y1: 280, x2: 850, y2: 900 } },
    { id: 441, class_name: 'knife', confidence: 0.91, speed: 620, track_id: 'O-441', bbox: { x1: 420, y1: 520, x2: 550, y2: 760 } },
  ]

  return (
    <div className="w-full p-space-md rounded-xl bg-surface-container border border-surface-border/80 shadow-sm flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-secondary text-[18px]">category</span>
          <h3 className="font-semibold text-xs text-text-primary">Tracked Entities</h3>
        </div>
        <span className="font-mono text-[10px] text-text-muted uppercase font-bold">
          {displayObjects.length} DETECTIONS
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="font-mono text-[10px] text-text-muted border-b border-surface-border/60 pb-1">
              <th className="py-1.5 font-bold uppercase tracking-wider">ENTITY</th>
              <th className="py-1.5 font-bold uppercase tracking-wider">CONFIDENCE</th>
              <th className="py-1.5 font-bold uppercase tracking-wider">VELOCITY</th>
              <th className="py-1.5 font-bold uppercase tracking-wider text-right">TRACK ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border/30 font-mono text-[11px]">
            {displayObjects.map((obj) => {
              const isPerson = obj.class_name.toLowerCase() === 'person'
              const isUnsafe =
                unsafeClasses.includes(obj.class_name) ||
                ['knife', 'scissors', 'gun', 'weapon'].includes(obj.class_name.toLowerCase())
              const trackIdStr = obj.track_id || (isPerson ? `P-${obj.id}` : `O-${obj.id}`)

              return (
                <tr
                  key={obj.id}
                  className={isUnsafe ? 'bg-detection-object/10 border-l-2 border-l-detection-object' : ''}
                >
                  <td className={`py-2.5 font-semibold flex items-center gap-1.5 ${
                    isPerson ? 'text-detection-person' : isUnsafe ? 'text-detection-object' : 'text-primary'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      isPerson ? 'bg-detection-person' : isUnsafe ? 'bg-detection-object' : 'bg-primary'
                    }`}></span>
                    {obj.class_name.charAt(0).toUpperCase() + obj.class_name.slice(1)} #{obj.id}
                  </td>
                  <td className="py-2.5 text-text-primary font-bold">
                    {(obj.confidence * 100).toFixed(0)}%
                  </td>
                  <td className="py-2.5 text-text-muted">
                    {obj.speed ? Math.round(obj.speed) : 0} px/s{' '}
                    <span className={obj.speed > 400 ? 'text-status-high font-bold' : 'text-primary'}>
                      {obj.speed > 400 ? '↗ HIGH' : obj.speed > 100 ? '↗' : '→'}
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-text-muted font-mono">
                    {trackIdStr}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}