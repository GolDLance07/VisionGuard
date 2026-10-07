import React from 'react'

export function Header({
  activeTab,
  setActiveTab,
  connectionStatus,
  latestFrame,
  soundEnabled,
  onToggleSound,
  voiceEnabled,
  onToggleVoice,
  darkMode,
  onToggleDarkMode,
  onOpenSettings,
}) {
  const fps = latestFrame?.fps || 0
  const latency = latestFrame?.latency_ms || 0

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-low/90 backdrop-blur-md border-b border-surface-border/60">
      <div className="h-16 w-full px-gutter-desktop flex items-center justify-between">
        {/* Left: Brand & Navigation */}
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-space-sm">
            {/* Logo Shield SVG */}
            <div className="w-8 h-8 rounded-lg bg-surface-container-high border border-primary/30 flex items-center justify-center text-primary shadow-sm">
              <span className="material-symbols-outlined text-[22px] text-primary">security</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <span className="font-semibold text-base text-text-primary tracking-tight">Vision Guard</span>
                <span className="px-space-xs py-0.5 rounded-full bg-surface-container-highest text-primary font-mono text-[10px] uppercase font-bold border border-primary/20">
                  PS 03.1 · V1
                </span>
              </div>
              <span className="font-mono text-[11px] text-text-muted hidden sm:inline">
                Context-aware visual safety monitoring
              </span>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="hidden lg:flex items-center gap-space-xs ml-space-md">
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className={`px-space-sm py-1.5 rounded-lg transition-colors font-semibold text-xs flex items-center gap-1.5 ${
                activeTab === 'live'
                  ? 'bg-surface-container-high text-primary border border-surface-border/80 shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">videocam</span>
              Live Monitor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('incidents')}
              className={`px-space-sm py-1.5 rounded-lg transition-colors font-semibold text-xs flex items-center gap-1.5 ${
                activeTab === 'incidents'
                  ? 'bg-surface-container-high text-primary border border-surface-border/80 shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">warning</span>
              Incident Log
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('telemetry')}
              className={`px-space-sm py-1.5 rounded-lg transition-colors font-semibold text-xs flex items-center gap-1.5 ${
                activeTab === 'telemetry'
                  ? 'bg-surface-container-high text-primary border border-surface-border/80 shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">analytics</span>
              Safety Telemetry
            </button>
          </nav>
        </div>

        {/* Right: Telemetry & Controls */}
        <div className="flex items-center gap-space-sm">
          {/* Connection Status Pill */}
          <div className="hidden sm:flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high border border-surface-border/50">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-status-low animate-pulse'
                  : connectionStatus === 'connecting'
                  ? 'bg-status-medium animate-ping'
                  : 'bg-status-high'
              }`}
            ></span>
            <span className="font-mono text-[11px] text-text-primary uppercase tracking-wide font-semibold">
              {connectionStatus || 'STANDBY'}
            </span>
          </div>

          {/* FPS & Latency Pill */}
          <div className="hidden md:flex items-center px-space-sm py-1 rounded-full bg-surface-container-high border border-surface-border/50 font-mono text-[11px] text-text-muted">
            <span className="text-primary font-semibold">{fps.toFixed(0)} FPS</span>
            <span className="mx-1.5 text-outline-variant">·</span>
            <span>{latency.toFixed(0)} ms latency</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-space-xs ml-space-xs">
            {/* Audio Voice Announcements Toggle */}
            <button
              aria-label="Toggle Voice Announcements"
              onClick={onToggleVoice}
              className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${
                voiceEnabled
                  ? 'bg-surface-container-high text-primary border-primary/30'
                  : 'bg-surface-container-high text-text-muted border-surface-border/60 hover:text-on-surface'
              }`}
              title={voiceEnabled ? 'Voice announcements active' : 'Voice announcements muted'}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">
                {voiceEnabled ? 'record_voice_over' : 'voice_over_off'}
              </span>
            </button>

            {/* Audio Alert Toggle */}
            <button
              aria-label="Toggle Audio Alerts"
              onClick={onToggleSound}
              className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${
                soundEnabled
                  ? 'bg-surface-container-high text-primary border-primary/30'
                  : 'bg-surface-container-high text-text-muted border-surface-border/60 hover:text-on-surface'
              }`}
              title={soundEnabled ? 'Chime alerts enabled' : 'Chime alerts muted'}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">
                {soundEnabled ? 'volume_up' : 'volume_off'}
              </span>
            </button>

            {/* Visual Theme Toggle */}
            <button
              aria-label="Toggle Visual Theme"
              onClick={onToggleDarkMode}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-surface-border/60 transition-colors"
              title="Toggle Light/Dark Theme"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">
                {darkMode ? 'dark_mode' : 'light_mode'}
              </span>
            </button>

            {/* Live Settings Drawer Button */}
            <button
              aria-label="Detection Threshold Settings"
              onClick={onOpenSettings}
              className="flex items-center gap-space-xs h-9 px-space-sm rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-surface-border/60 transition-colors"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span className="hidden xl:inline font-semibold text-xs">Settings</span>
            </button>

            {/* User Profile Avatar */}
            <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center ml-space-xs font-bold text-xs shadow-sm">
              <span className="material-symbols-outlined text-[18px]">person</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
