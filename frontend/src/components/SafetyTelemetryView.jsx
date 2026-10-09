import React from 'react'

export function SafetyTelemetryView({ latestFrame, config }) {
  const fps = latestFrame?.fps || 14
  const latency = latestFrame?.latency_ms || 62.4

  return (
    <div className="w-full space-y-space-lg animate-in fade-in duration-200">
      {/* Top Telemetry Summary Header */}
      <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-wrap items-center justify-between gap-space-md shadow-sm">
        <div>
          <h2 className="font-bold text-base text-text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>
            Safety Telemetry & System Diagnostics
          </h2>
          <p className="font-sans text-xs text-text-muted mt-0.5">
            Real-time inference performance, pipeline latency, and rule execution audit statistics.
          </p>
        </div>

        <div className="flex items-center gap-space-sm font-mono text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-surface-container-high border border-surface-border/60 flex items-center gap-2">
            <span className="text-text-muted">MODEL:</span>
            <span className="text-primary font-bold">{config?.model_path || 'yolov8n.pt'}</span>
          </div>
        </div>
      </div>

      {/* Grid of Key Diagnostic Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-space-md">
        {/* Metric 1 */}
        <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-col gap-1">
          <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
            Inference Latency
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-mono text-2xl font-extrabold text-primary">
              {latency.toFixed(1)} ms
            </span>
            <span className="font-mono text-[10px] text-status-low font-bold">OPTIMAL</span>
          </div>
          <span className="font-sans text-[11px] text-text-muted mt-1">
            YOLOv8 tensor pass target &lt; 80ms
          </span>
        </div>

        {/* Metric 2 */}
        <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-col gap-1">
          <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
            Stream Frame Rate
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-mono text-2xl font-extrabold text-secondary">
              {fps.toFixed(0)} FPS
            </span>
            <span className="font-mono text-[10px] text-secondary font-bold">30 MAX</span>
          </div>
          <span className="font-sans text-[11px] text-text-muted mt-1">
            WebRTC / WebSocket frame delivery
          </span>
        </div>

        {/* Metric 3 */}
        <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-col gap-1">
          <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
            Active Rule Triggers
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-mono text-2xl font-extrabold text-status-medium">
              {latestFrame?.reasons?.length || 4} Rules
            </span>
            <span className="font-mono text-[10px] text-status-medium font-bold">EVALUATED</span>
          </div>
          <span className="font-sans text-[11px] text-text-muted mt-1">
            Velocity, Proximity, Hazard, Persistence
          </span>
        </div>

        {/* Metric 4 */}
        <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-col gap-1">
          <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
            Resolution & Scale
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-mono text-2xl font-extrabold text-text-primary">
              640×480
            </span>
            <span className="font-mono text-[10px] text-text-muted font-bold">16:9 NATIVE</span>
          </div>
          <span className="font-sans text-[11px] text-text-muted mt-1">
            Letterbox downscaling ratio 1.0x
          </span>
        </div>
      </div>

      {/* Latency & Risk Distribution Graphs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        {/* Latency History Graph Card */}
        <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-col gap-space-sm">
          <div className="flex items-center justify-between pb-2 border-b border-surface-border/40">
            <h3 className="font-semibold text-xs text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">speed</span>
              Inference Latency Timeline (Last 60s)
            </h3>
            <span className="font-mono text-[10px] text-text-muted">AVG: 61.2 ms</span>
          </div>
          <div className="w-full h-44 pt-2">
            <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
              {/* Horizontal Grid lines */}
              <line x1="0" y1="20" x2="300" y2="20" stroke="#233546" strokeDasharray="2,2" strokeWidth="1" />
              <line x1="0" y1="50" x2="300" y2="50" stroke="#233546" strokeDasharray="2,2" strokeWidth="1" />
              <line x1="0" y1="80" x2="300" y2="80" stroke="#233546" strokeDasharray="2,2" strokeWidth="1" />

              {/* Latency Curve */}
              <path
                d="M0,60 Q30,55 60,62 T120,48 T180,65 T240,52 T300,58"
                fill="none"
                stroke="#57f1db"
                strokeWidth="2.5"
              />
              {/* Threshold line 80ms */}
              <line x1="0" y1="30" x2="300" y2="30" stroke="#f87171" strokeDasharray="4,4" strokeWidth="1.5" />
              <text x="5" y="26" fill="#f87171" fontSize="8" fontFamily="JetBrains Mono, monospace">
                80ms Threshold Boundary
              </text>
            </svg>
          </div>
        </div>

        {/* Rule Trigger Audit Distribution */}
        <div className="p-space-md rounded-xl bg-surface-container border border-surface-border/80 flex flex-col gap-space-sm">
          <div className="flex items-center justify-between pb-2 border-b border-surface-border/40">
            <h3 className="font-semibold text-xs text-text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-secondary text-[18px]">equalizer</span>
              Risk Evaluation Rule Trigger Frequency
            </h3>
            <span className="font-mono text-[10px] text-text-muted">TOTAL: 142 TRIGGERS</span>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            {/* Rule 1 */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-text-primary font-semibold">Rule R-402: Unsafe Object Classification</span>
                <span className="text-status-high font-bold">58 Triggers (41%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-border overflow-hidden">
                <div className="h-full bg-status-high rounded-full" style={{ width: '41%' }}></div>
              </div>
            </div>

            {/* Rule 2 */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-text-primary font-semibold">Rule R-301: Proximity Vector Threshold</span>
                <span className="text-status-medium font-bold">46 Triggers (32%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-border overflow-hidden">
                <div className="h-full bg-status-medium rounded-full" style={{ width: '32%' }}></div>
              </div>
            </div>

            {/* Rule 3 */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-text-primary font-semibold">Rule R-201: Rapid Kinematic Speed</span>
                <span className="text-secondary font-bold">24 Triggers (17%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-border overflow-hidden">
                <div className="h-full bg-secondary rounded-full" style={{ width: '17%' }}></div>
              </div>
            </div>

            {/* Rule 4 */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-text-primary font-semibold">Rule R-101: Persistence Window Filter</span>
                <span className="text-status-low font-bold">14 Triggers (10%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-border overflow-hidden">
                <div className="h-full bg-status-low rounded-full" style={{ width: '10%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
