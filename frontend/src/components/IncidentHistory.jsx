import React, { useState } from 'react'

export function IncidentHistory({ incidents = [], onClear }) {
  const [selectedId, setSelectedId] = useState(incidents[0]?.id || 'inc-default')
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [sourceFilter, setSourceFilter] = useState('ALL')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [statusMap, setStatusMap] = useState({})
  const [dateRange, setDateRange] = useState('TODAY')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // If no incidents captured yet, populate with realistic audit trail seed items
  const seedIncidents = [
    {
      id: 'inc-894',
      eventId: '#894',
      timestamp: Date.now() - 45000,
      timeStr: '14:32:08',
      source: 'CAM-01 (Fabrication)',
      riskScore: 0.84,
      riskLevel: 'HIGH',
      title: 'Sharp Object Proximity Escalation',
      rule: 'Rule R-402',
      ruleDesc: 'Unsafe Object Proximity',
      duration: '1.3s',
      status: 'Requires Review',
      reasons: [
        {
          title: 'Unsafe object classified: knife',
          metric: '91% Conf',
          details: 'Object: "knife" · Bounding Box [O-441] in CAM-01',
        },
        {
          title: 'Rapid kinematic speed vector',
          metric: '620 px/s',
          details: 'Threshold: 400 px/s · Relative acceleration +34%',
        },
        {
          title: 'Proximity vector closing rapidly',
          metric: '68 px dist',
          details: 'Inter-entity boundary to Person #2 (Safety threshold: 150 px)',
        },
        {
          title: 'Persistence temporal window met',
          metric: '1.3s sustained',
          details: 'Passed minimum dampening filter (1.0s requirement)',
        },
      ],
      detectedClasses: ['knife (91%)'],
      frame: null,
    },
    {
      id: 'inc-893',
      eventId: '#893',
      timestamp: Date.now() - 360000,
      timeStr: '13:15:22',
      source: 'CAM-01 (Fabrication)',
      riskScore: 0.68,
      riskLevel: 'MEDIUM',
      title: 'Rapid Kinematic Approach',
      rule: 'Rule R-301',
      ruleDesc: 'Rapid Kinematic Approach',
      duration: '0.8s',
      status: 'Ack by Op #04',
      reasons: [
        {
          title: 'High-speed closure detected',
          metric: '440 px/s',
          details: 'Velocity vector towards workstation edge exceeds 400 px/s threshold',
        },
        {
          title: 'Transient safety boundary overlap',
          metric: '120 px',
          details: 'Person #1 and Person #2 within mutual proximity zone',
        },
      ],
      detectedClasses: [],
      frame: null,
    },
    {
      id: 'inc-891',
      eventId: '#891',
      timestamp: Date.now() - 1200000,
      timeStr: '12:44:03',
      source: 'CAM-02 (Assembly)',
      riskScore: 0.78,
      riskLevel: 'HIGH',
      title: 'Sharp Tool Vector Warning',
      rule: 'Rule R-402',
      ruleDesc: 'Sharp Tool Vector',
      duration: '2.4s',
      status: 'Ack by Op #02',
      reasons: [
        {
          title: 'Tool classification: scissors / shears',
          metric: '88% Conf',
          details: 'Hazard category: Sharp Object in proximity to operator',
        },
        {
          title: 'Sustained presence in buffer zone',
          metric: '2.4s',
          details: 'Extended presence past 1.0s minimum window',
        },
      ],
      detectedClasses: ['scissors (88%)'],
      frame: null,
    },
    {
      id: 'inc-888',
      eventId: '#888',
      timestamp: Date.now() - 3600000,
      timeStr: '11:02:49',
      source: 'CAM-01 (Fabrication)',
      riskScore: 0.54,
      riskLevel: 'MEDIUM',
      title: 'Restricted Zone Intrusion',
      rule: 'Rule R-104',
      ruleDesc: 'Restricted Zone Intrusion',
      duration: '1.1s',
      status: 'Dismissed · Prop',
      reasons: [
        {
          title: 'Safety zone line traversed',
          metric: 'Boundary Breach',
          details: 'Operator crossed physical perimeter boundary line',
        },
      ],
      detectedClasses: [],
      frame: null,
    },
  ]

  // Combine live captured incidents with seed items
  const allIncidents = [
    ...incidents.map((inc, i) => ({
      id: inc.id,
      eventId: `#${894 + incidents.length - i}`,
      timestamp: inc.timestamp,
      timeStr: inc.timeStr,
      source: 'WORKSTATION-CAM-01',
      riskScore: inc.riskScore,
      riskLevel: inc.riskLevel || 'HIGH',
      title: inc.title || 'Safety Risk Threshold Exceeded',
      rule: inc.reasons?.[0]?.rule ? `Rule ${inc.reasons[0].rule.toUpperCase()}` : 'Rule R-402',
      ruleDesc: inc.primaryReason || 'Unsafe Object Proximity Escalation',
      duration: '1.3s',
      status: statusMap[inc.id] || 'Requires Review',
      reasons: (inc.reasons?.length ? inc.reasons : [
        { details: inc.primaryReason || 'Safety threshold boundary exceeded', rule: 'risk' }
      ]).map((r) => ({
        title: r.details || r.reason || 'Safety Rule Trigger',
        metric: r.score ? `${(r.score * 100).toFixed(0)}% Score` : 'Critical',
        details: r.details || 'Observable kinematic condition met',
      })),
      detectedClasses: inc.detectedClasses || [],
      frame: inc.frame,
    })),
    ...seedIncidents,
  ]

  // Filtered list
  const filtered = allIncidents.filter((inc) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const match =
        inc.eventId.toLowerCase().includes(q) ||
        inc.title.toLowerCase().includes(q) ||
        inc.rule.toLowerCase().includes(q) ||
        inc.source.toLowerCase().includes(q)
      if (!match) return false
    }

    // Date Filtering Logic
    if (dateRange === '7D') {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      if (inc.timestamp < sevenDaysAgo) return false
    } else if (dateRange === 'CUSTOM') {
      if (customStartDate) {
        const startMs = new Date(customStartDate).getTime()
        if (inc.timestamp < startMs) return false
      }
      if (customEndDate) {
        // Set to end of the selected day (23:59:59)
        const endMs = new Date(customEndDate).setHours(23, 59, 59, 999)
        if (inc.timestamp > endMs) return false
      }
    }

    if (severityFilter === 'HIGH') {
      if (inc.riskLevel !== 'HIGH' && inc.riskLevel !== 'high') return false
    } else if (severityFilter === 'MEDIUM') {
      if (inc.riskLevel !== 'MEDIUM' && inc.riskLevel !== 'medium') return false
    } else if (severityFilter === 'LOW') {
      if (inc.riskLevel !== 'LOW' && inc.riskLevel !== 'low') return false
    }
    if (sourceFilter !== 'ALL' && !inc.source.includes(sourceFilter)) return false
    return true
  })

  // Selected incident
  const activeIncident =
    filtered.find((i) => i.id === selectedId) ||
    filtered[0] ||
    allIncidents[0]

  const totalToday = allIncidents.length + 10
  const highCriticality = allIncidents.filter((i) => i.riskLevel === 'HIGH' || i.riskLevel === 'high').length

  const handleStatusChange = (newStatus) => {
    if (!activeIncident) return
    setStatusMap((prev) => ({ ...prev, [activeIncident.id]: newStatus }))
  }

  const exportCSV = () => {
    const headers = ['Event ID', 'Time', 'Source', 'Rule', 'Risk Score', 'Level', 'Status']
    const rows = filtered.map((i) => [
      i.eventId,
      i.timeStr,
      i.source,
      i.rule,
      `${(i.riskScore * 100).toFixed(0)}%`,
      i.riskLevel,
      statusMap[i.id] || i.status,
    ])
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n')
    const encoded = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encoded)
    link.setAttribute('download', `vision-guard-incidents-${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadActiveFrame = () => {
    if (!activeIncident?.frame) {
      alert('This simulated audit record does not have a raw base64 frame attached.')
      return
    }
    const a = document.createElement('a')
    a.href = `data:image/jpeg;base64,${activeIncident.frame}`
    a.download = `incident-${activeIncident.eventId.replace('#', '')}-${activeIncident.timeStr}.jpg`
    a.click()
  }

  return (
    <div className="w-full flex flex-col gap-space-lg animate-in fade-in duration-200">
      {/* 1. Header Sub-bar & Filter Controls */}
      <section className="flex flex-col gap-space-md">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
          <div>
            <div className="flex items-center gap-space-xs mb-1">
              <span className="font-mono text-[11px] text-primary uppercase tracking-wider font-semibold">
                Telemetry Archive
              </span>
              <span className="text-outline-variant font-mono text-[11px]">/</span>
              <span className="font-mono text-[11px] text-text-muted">Node-Alpha-East</span>
            </div>
            <h1 className="font-semibold text-2xl text-text-primary tracking-tight">
              Incident Log &amp; Event History
            </h1>
            <p className="font-sans text-xs text-text-muted mt-0.5">
              Auditable deterministic safety risk events captured by local pipeline inference.
            </p>
          </div>

          <div className="flex items-center gap-space-sm self-start md:self-auto flex-wrap">
            {onClear && incidents.length > 0 && (
              <button
                onClick={onClear}
                className="h-9 px-space-sm rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-text-muted hover:text-text-primary font-mono text-xs font-semibold transition-colors border border-surface-border/60"
                type="button"
              >
                Clear Log ({incidents.length})
              </button>
            )}
            <button
              onClick={exportCSV}
              className="h-9 px-space-md flex items-center gap-space-xs rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold text-xs transition-colors shadow-sm border border-surface-border/60"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px] text-text-muted">download</span>
              <span>Export Audit CSV</span>
            </button>
            <button
              onClick={exportCSV}
              className="h-9 px-space-md flex items-center gap-space-xs rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold text-xs transition-colors shadow-sm border border-surface-border/60"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px] text-primary">folder_zip</span>
              <span>Download Frame Archive</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-space-sm bg-surface-container-low p-space-sm rounded-xl border border-surface-border/60 shadow-sm">
          {/* Search Bar */}
          <div className="lg:col-span-5 relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
              search
            </span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-space-md rounded-lg bg-surface-container-highest text-on-surface font-sans text-xs placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary border border-surface-border/40"
              placeholder="Search by Event ID, Rule, or Camera..."
              type="text"
            />
          </div>

          {/* Severity Dropdown */}
          <div className="lg:col-span-2 relative">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full h-10 px-space-sm rounded-lg bg-surface-container-highest text-on-surface font-semibold text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer pr-8 border border-surface-border/40"
            >
              <option value="ALL">All Severities</option>
              <option value="HIGH">High (Active/Archived)</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-text-muted text-[18px] pointer-events-none">
              expand_more
            </span>
          </div>

          {/* Date Range Dropdown */}
          {/* Date Range Dropdown & Custom Inputs */}
          <div className="lg:col-span-3 flex flex-col sm:flex-row gap-space-xs">
            <div className="relative w-full">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full h-10 px-space-sm rounded-lg bg-surface-container-highest text-on-surface font-semibold text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer pr-8 border border-surface-border/40"
              >
                <option value="TODAY">Today (Last 24h)</option>
                <option value="7D">Last 7 Days</option>
                <option value="CUSTOM">Custom Range</option>
              </select>
              <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-text-muted text-[18px] pointer-events-none">
                calendar_today
              </span>
            </div>

            {/* Render Date Inputs when Custom Range is selected */}
            {dateRange === 'CUSTOM' && (
              <div className="flex items-center gap-1.5 bg-surface-container-highest px-2 py-1 rounded-lg border border-surface-border/40">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-on-surface text-[11px] font-mono focus:outline-none cursor-pointer scheme-dark"
                />
                <span className="text-text-muted text-xs">-</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-on-surface text-[11px] font-mono focus:outline-none cursor-pointer scheme-dark"
                />
              </div>
            )}
          </div>

          {/* Source Camera Dropdown */}
          <div className="lg:col-span-2 relative">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full h-10 px-space-sm rounded-lg bg-surface-container-highest text-on-surface font-semibold text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer pr-8 border border-surface-border/40"
            >
              <option value="ALL">All Sources</option>
              <option value="CAM-01">CAM-01 (Fabrication)</option>
              <option value="CAM-02">CAM-02 (Assembly)</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-text-muted text-[18px] pointer-events-none">
              videocam
            </span>
          </div>
        </div>
      </section>

      {/* 2. Metrics KPI Row (4 Cards) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
        {/* KPI 1 */}
        <div className="bg-surface-card p-space-md rounded-xl border border-surface-border/80 flex flex-col justify-between shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
              Total Incidents Today
            </span>
            <span className="material-symbols-outlined text-outline text-[18px]">emergency_home</span>
          </div>
          <div className="flex items-baseline gap-space-sm">
            <span className="font-bold text-3xl text-text-primary tracking-tight leading-none">
              {totalToday}
            </span>
            <span className="font-mono text-[11px] text-status-medium font-semibold">+2 in last hr</span>
          </div>
          <div className="mt-space-sm pt-space-xs flex items-center justify-between text-text-muted font-mono text-[11px]">
            <span>Inference rate: 15.2 FPS</span>
            <span className="text-primary font-semibold">Normal range</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-surface-card p-space-md rounded-xl border border-surface-border/80 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
              High Criticality Verified
            </span>
            <span className="w-2.5 h-2.5 rounded-full bg-status-high animate-pulse"></span>
          </div>
          <div className="flex items-baseline gap-space-sm">
            <span className="font-bold text-3xl text-status-high tracking-tight leading-none">
              {highCriticality}
            </span>
            <span className="font-mono text-[11px] text-text-muted">Verified &gt;1.0s window</span>
          </div>
          <div className="mt-space-sm pt-space-xs flex items-center justify-between text-text-muted font-mono text-[11px]">
            <span>{Math.max(highCriticality - 1, 1)} Acknowledged</span>
            <span className="text-status-high font-semibold">1 Requires Review</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-surface-card p-space-md rounded-xl border border-surface-border/80 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
              Avg Operator Resolution
            </span>
            <span className="material-symbols-outlined text-outline text-[18px]">timer</span>
          </div>
          <div className="flex items-baseline gap-space-sm">
            <span className="font-bold text-3xl text-text-primary tracking-tight leading-none">
              42<span className="text-sm text-text-muted ml-0.5">s</span>
            </span>
            <span className="font-mono text-[11px] text-status-low font-semibold">-18% vs avg</span>
          </div>
          <div className="mt-space-sm pt-space-xs flex items-center justify-between text-text-muted font-mono text-[11px]">
            <span>Target SLA: &lt; 90s</span>
            <span className="text-status-low font-semibold">Within SLA</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-surface-card p-space-md rounded-xl border border-surface-border/80 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
              False Alert Dampening
            </span>
            <span className="material-symbols-outlined text-outline text-[18px]">filter_alt</span>
          </div>
          <div className="flex items-baseline gap-space-sm">
            <span className="font-bold text-3xl text-primary tracking-tight leading-none">
              96.4<span className="text-sm text-text-muted ml-0.5">%</span>
            </span>
            <span className="font-mono text-[11px] text-text-muted">38 transient dropped</span>
          </div>
          <div className="mt-space-sm pt-space-xs flex items-center justify-between text-text-muted font-mono text-[11px]">
            <span>Min temporal hold: 750ms</span>
            <span className="text-primary font-semibold">Stable</span>
          </div>
        </div>
      </section>

      {/* 3. Master-Detail Master Interactive Layout (60% / 40%) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        {/* Left Column: Recorded Event Stream Table (60% ~ 7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-surface-card rounded-xl border border-surface-border/80 shadow-sm overflow-hidden">
          <div className="p-space-md bg-surface-container border-b border-surface-border/60 flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-text-muted text-[20px]">list_alt</span>
              <span className="font-semibold text-sm text-text-primary">Recorded Event Stream</span>
              <span className="px-space-xs py-0.5 rounded-full bg-surface-container-highest text-text-muted font-mono text-[11px]">
                {filtered.length} of {allIncidents.length} events
              </span>
            </div>
            <div className="flex items-center gap-space-xs">
              <button
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-text-muted hover:text-on-surface transition-colors"
                title="Refresh Table"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">sync</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-text-muted font-mono text-[10px] uppercase tracking-wider border-b border-surface-border/40">
                  <th className="py-space-sm px-space-md">Event ID</th>
                  <th className="py-space-sm px-space-sm">Time</th>
                  <th className="py-space-sm px-space-sm">Source</th>
                  <th className="py-space-sm px-space-sm">Trigger Rule</th>
                  <th className="py-space-sm px-space-sm">Peak Score</th>
                  <th className="py-space-sm px-space-sm">Duration</th>
                  <th className="py-space-sm px-space-md text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/40 font-sans text-xs text-text-primary">
                {filtered.map((item) => {
                  const isSelected = item.id === activeIncident?.id
                  const isHigh = item.riskLevel === 'HIGH' || item.riskLevel === 'high'
                  const currentStatus = statusMap[item.id] || item.status

                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`cursor-pointer transition-colors ${isSelected
                        ? 'bg-surface-container-highest/70 border-l-4 border-l-status-high'
                        : 'hover:bg-surface-container'
                        }`}
                    >
                      <td className="py-space-sm px-space-md font-mono text-sm text-primary flex items-center gap-space-xs font-bold">
                        {isHigh && (
                          <span className="w-1.5 h-5 rounded-full bg-status-high mr-1"></span>
                        )}
                        {item.eventId}
                      </td>
                      <td className="py-space-sm px-space-sm font-mono text-[11px] text-text-muted">
                        {item.timeStr}
                      </td>
                      <td className="py-space-sm px-space-sm font-mono text-[11px] text-text-muted truncate max-w-[100px]">
                        {item.source}
                      </td>
                      <td className="py-space-sm px-space-sm">
                        <div className="flex flex-col">
                          <span className="font-semibold text-xs text-text-primary">{item.rule}</span>
                          <span className="text-text-muted font-mono text-[10px] truncate max-w-[130px]">
                            {item.ruleDesc}
                          </span>
                        </div>
                      </td>
                      <td className="py-space-sm px-space-sm">
                        <span
                          className={`inline-flex items-center gap-1 px-space-xs py-0.5 rounded font-mono text-[11px] font-bold ${isHigh
                            ? 'bg-status-high/15 text-status-high'
                            : 'bg-status-medium/15 text-status-medium'
                            }`}
                        >
                          {(item.riskScore * 100).toFixed(0)}% {item.riskLevel}
                        </span>
                      </td>
                      <td className="py-space-sm px-space-sm font-mono text-[11px] text-text-muted">
                        {item.duration}
                      </td>
                      <td className="py-space-sm px-space-md text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] uppercase font-semibold ${currentStatus === 'Requires Review'
                            ? 'bg-status-high/20 text-status-high'
                            : currentStatus.includes('Verified')
                              ? 'bg-status-high text-surface-container-lowest font-bold'
                              : 'bg-surface-container-highest text-text-muted'
                            }`}
                        >
                          {currentStatus === 'Requires Review' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-status-high animate-pulse"></span>
                          )}
                          {currentStatus}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="p-space-md bg-surface-container-low border-t border-surface-border/40 flex flex-col sm:flex-row items-center justify-between gap-space-sm font-mono text-[11px] text-text-muted">
            <span>
              Displaying 1–{filtered.length} of {allIncidents.length} audit log records
            </span>
            <div className="flex items-center gap-space-xs">
              <span className="px-space-xs text-primary font-semibold">Page 1 of 1</span>
            </div>
          </div>
        </div>

        {/* Right Column: Event Detail Forensic Inspector (40% ~ 5 cols) */}
        {activeIncident && (
          <div className="lg:col-span-5 flex flex-col gap-space-md">
            <div className="bg-surface-card rounded-xl border border-surface-border/80 p-space-md shadow-xl flex flex-col gap-space-md">
              {/* Inspector Header */}
              <div className="flex items-start justify-between">
                <div className="flex flex-col">
                  <div className="flex items-center gap-space-xs">
                    <span className="font-mono text-[10px] text-primary uppercase font-bold tracking-wide">
                      Forensic Record
                    </span>
                    <span className="font-mono text-[10px] text-text-muted">· {activeIncident.source}</span>
                  </div>
                  <h2 className="font-bold text-lg text-text-primary tracking-tight mt-0.5">
                    {activeIncident.eventId} · {activeIncident.rule}
                  </h2>
                  <span className="font-sans text-xs text-text-muted">{activeIncident.ruleDesc}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="px-space-sm py-1 rounded bg-status-high/20 text-status-high font-mono text-sm font-bold border border-status-high/40">
                    {(activeIncident.riskScore * 100).toFixed(0)}% {activeIncident.riskLevel}
                  </span>
                  <span className="font-mono text-[10px] text-text-muted mt-1">
                    Verified: {activeIncident.duration}
                  </span>
                </div>
              </div>

              {/* High-Res Snapshot Frame Canvas */}
              <div
                onClick={() => setIsModalOpen(true)}
                className="relative w-full aspect-video rounded-lg overflow-hidden bg-surface-container-lowest border border-surface-border cursor-pointer group flex items-center justify-center shadow-inner"
              >
                {activeIncident.frame ? (
                  <img
                    src={`data:image/jpeg;base64,${activeIncident.frame}`}
                    alt="Captured Incident Evidence"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300"
                  />
                ) : (
                  <img
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBVFujQOvuX0tGAK2S4ZXX8frv1MCV3c1AO1jOlh3ljXTWGcrshuz3LjxXxTlZCbv-npxDI2QoOJjrBE8MHFWCnsa2xe2-z2pNx2Yg7HgM-SU3-MiIW683w9LKV3cLO78VEvEqoNLtZIE_8Llemt5iggnOTNYcnI3GEJMBRrQIJ0ruz1UOamFh380RU8QPoi3XokdEHFmKLNA8Lo4hqvL8kjnKgclufrldDekbIGcaCvkd6-PwyPhoj"
                    alt="Simulated Evidence Frame"
                    className="w-full h-full object-cover opacity-75 transition-transform group-hover:scale-105 duration-300"
                  />
                )}

                {/* Vector Overlays for Bounding Box Reticles */}
                <div className="absolute inset-0 pointer-events-none p-3">
                  {/* Person Bounding Box */}
                  <div className="absolute top-[18%] left-[12%] w-[32%] h-[68%] rounded-sm ring-2 ring-detection-person/90">
                    <span className="absolute -top-5 left-0 px-1.5 py-0.5 bg-surface-container-lowest text-detection-person font-mono text-[10px] font-bold rounded-sm border border-detection-person/40">
                      PERSON #1 · 97%
                    </span>
                  </div>

                  {/* Hazard Object Box (Orange Alert) */}
                  <div className="absolute top-[48%] left-[44%] w-[18%] h-[22%] rounded-sm ring-2 ring-detection-object">
                    <span className="absolute -top-5 left-0 px-1.5 py-0.5 bg-surface-container-lowest text-detection-object font-mono text-[10px] font-bold rounded-sm border border-detection-object/40">
                      {activeIncident.detectedClasses?.[0]
                        ? activeIncident.detectedClasses[0].toUpperCase()
                        : 'SHARP OBJECT · 91%'}
                    </span>
                    <div className="absolute -inset-2 rounded-full border border-status-high/50 animate-ping"></div>
                  </div>

                  {/* HUD Crosshairs */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center opacity-40">
                    <div className="w-6 h-0.5 bg-primary"></div>
                    <div className="h-6 w-0.5 bg-primary absolute"></div>
                  </div>

                  {/* Bottom Telemetry Pill */}
                  <div className="absolute bottom-2 left-2 px-space-xs py-0.5 rounded bg-surface-container-lowest/85 backdrop-blur font-mono text-[10px] text-text-primary flex items-center gap-1.5 border border-surface-border/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-high"></span>
                    <span>KEYFRAME T-0 · {activeIncident.timeStr}</span>
                  </div>

                  {/* Zoom indicator on hover */}
                  <div className="absolute top-2 right-2 p-1.5 rounded-full bg-surface-container-lowest/80 text-text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="material-symbols-outlined text-[16px]">zoom_in</span>
                  </div>
                </div>
              </div>

              {/* Forensic Scrubber Bar */}
              <div className="bg-surface-container p-space-sm rounded-lg flex flex-col gap-space-xs border border-surface-border/60">
                <div className="flex items-center justify-between font-mono text-[10px] text-text-muted">
                  <span>-2.0s</span>
                  <span className="text-primary font-bold">TRIGGER FRAME (+0.0s)</span>
                  <span>+2.0s</span>
                </div>
                <div className="relative w-full h-6 flex items-center">
                  <input
                    className="w-full accent-primary h-1.5 bg-surface-container-highest rounded-lg appearance-none cursor-pointer"
                    max="100"
                    min="0"
                    type="range"
                    defaultValue="50"
                  />
                  <div className="absolute left-[38%] w-[28%] h-1.5 bg-status-high/40 rounded pointer-events-none"></div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-space-xs">
                    <button
                      className="w-7 h-7 rounded bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center text-text-primary"
                      title="Step Back Frame"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">skip_previous</span>
                    </button>
                    <button
                      className="w-7 h-7 rounded bg-primary text-on-primary flex items-center justify-center font-bold"
                      title="Play / Pause"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                    </button>
                    <button
                      className="w-7 h-7 rounded bg-surface-container-high hover:bg-surface-container-highest flex items-center justify-center text-text-primary"
                      title="Step Forward Frame"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">skip_next</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-[10px] text-text-muted">
                    <span className="mr-1">Rate:</span>
                    <button className="px-1.5 py-0.5 rounded bg-surface-container-high text-text-muted">
                      0.25x
                    </button>
                    <button className="px-1.5 py-0.5 rounded bg-surface-container-highest text-primary font-bold">
                      0.5x
                    </button>
                    <button className="px-1.5 py-0.5 rounded bg-surface-container-high text-text-muted">
                      1.0x
                    </button>
                  </div>
                </div>
              </div>

              {/* Deterministic Evidence Trail */}
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
                    Deterministic Evidence Trail
                  </span>
                  <span className="font-mono text-[10px] text-primary font-semibold">
                    Spatial-Temporal Chain
                  </span>
                </div>
                <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-space-sm font-sans text-xs border border-surface-border/40">
                  {activeIncident.reasons.map((r, idx) => (
                    <div key={idx} className="flex items-start gap-space-sm">
                      <span className="text-primary font-bold leading-none mt-0.5">→</span>
                      <div className="flex flex-col w-full">
                        <div className="flex items-center justify-between">
                          <span className="text-text-primary font-semibold">{r.title}</span>
                          <span className="font-mono text-[10px] text-detection-object font-bold">
                            {r.metric}
                          </span>
                        </div>
                        <span className="text-text-muted font-mono text-[10px] mt-0.5">{r.details}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Operator Verification & Audit Sign-Off */}
              <div className="flex flex-col gap-space-sm pt-space-xs border-t border-surface-border/40">
                <span className="font-mono text-[10px] text-text-muted uppercase font-bold tracking-wider">
                  Operator Verification &amp; Audit Sign-Off
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-xs">
                  <button
                    onClick={() => {
                      const currentStatus = statusMap[activeIncident.id] || activeIncident.status;
                      handleStatusChange(currentStatus === 'Verified Hazard' ? 'Requires Review' : 'Verified Hazard');
                    }}
                    aria-pressed={(statusMap[activeIncident.id] || activeIncident.status) === 'Verified Hazard'}
                    className={`h-9 px-space-sm flex items-center justify-center gap-space-xs rounded-lg font-semibold text-xs transition-colors border ${(statusMap[activeIncident.id] || activeIncident.status) === 'Verified Hazard'
                      ? 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border-emerald-500/40'
                      : 'bg-status-high/20 hover:bg-status-high/30 text-status-high border-status-high/40'
                      }`}
                    title={
                      (statusMap[activeIncident.id] || activeIncident.status) === 'Verified Hazard'
                        ? 'Click to remove verification'
                        : 'Mark this incident as a verified hazard'
                    }
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {(statusMap[activeIncident.id] || activeIncident.status) === 'Verified Hazard'
                        ? 'check_circle'
                        : 'verified'}
                    </span>
                    <span>
                      {(statusMap[activeIncident.id] || activeIncident.status) === 'Verified Hazard'
                        ? '✓ Verified Hazard'
                        : 'Mark Verified Hazard'}
                    </span>
                  </button>
                  <button
                    onClick={() => handleStatusChange('Flagged Benign')}
                    className="h-9 px-space-sm flex items-center justify-center gap-space-xs rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-semibold text-xs transition-colors border border-surface-border/60"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px] text-text-muted">flag</span>
                    <span>Flag Benign Prop</span>
                  </button>
                </div>

                {/* Notes Input */}
                <div className="flex flex-col gap-1 mt-1">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-space-sm rounded-lg bg-surface-container-highest text-on-surface font-sans text-xs placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary resize-none border border-surface-border/40"
                    placeholder="Input mandatory incident notes before filing or assigning to Safety Lead..."
                    rows="2"
                  ></textarea>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={downloadActiveFrame}
                    className="text-xs text-primary hover:underline font-mono flex items-center gap-1"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[15px]">download</span>
                    Download Snapshot
                  </button>

                  <button
                    onClick={() => {
                      handleStatusChange('Assigned to Lead')
                      alert(`Event ${activeIncident.eventId} assigned to Safety Lead with notes.`)
                    }}
                    className="h-8 px-space-md flex items-center gap-space-xs rounded-lg bg-primary text-on-primary font-semibold text-xs hover:opacity-90 transition-opacity shadow-sm"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      assignment_turned_in
                    </span>
                    <span>Assign to Safety Lead</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Full-Size Snapshot Modal */}
      {isModalOpen && activeIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl max-w-4xl w-full p-6 shadow-2xl text-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border/60">
              <div>
                <h4 className="font-bold text-white text-base flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-status-high animate-pulse"></span>
                  {activeIncident.eventId} · {activeIncident.title}
                </h4>
                <p className="text-xs text-text-muted mt-0.5">
                  Captured at <strong className="text-white font-mono">{activeIncident.timeStr}</strong> · Peak Score: {(activeIncident.riskScore * 100).toFixed(1)}%
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-text-muted hover:text-white p-1 rounded-lg hover:bg-surface-container-high"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl overflow-hidden border border-surface-border bg-black aspect-video flex items-center justify-center shadow-inner">
              {activeIncident.frame ? (
                <img
                  src={`data:image/jpeg;base64,${activeIncident.frame}`}
                  alt="Full incident frame"
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBVFujQOvuX0tGAK2S4ZXX8frv1MCV3c1AO1jOlh3ljXTWGcrshuz3LjxXxTlZCbv-npxDI2QoOJjrBE8MHFWCnsa2xe2-z2pNx2Yg7HgM-SU3-MiIW683w9LKV3cLO78VEvEqoNLtZIE_8Llemt5iggnOTNYcnI3GEJMBRrQIJ0ruz1UOamFh380RU8QPoi3XokdEHFmKLNA8Lo4hqvL8kjnKgclufrldDekbIGcaCvkd6-PwyPhoj"
                  alt="Simulated Evidence Frame"
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={downloadActiveFrame}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Download High-Res Frame
              </button>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-white text-xs font-semibold"
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
