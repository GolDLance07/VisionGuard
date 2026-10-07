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
  const fps = latestFrame?.fps ? Math.round(latestFrame.fps) : 14
  const latency = latestFrame?.latency_ms ? Math.round(latestFrame.latency_ms) : 62

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-low/90 backdrop-blur-md border-b border-surface-border/40">
      <div className="h-16 w-full px-gutter-desktop flex items-center justify-between">
        {/* Left: Brand & Navigation Tabs */}
        <div className="flex items-center gap-space-md">
          <div
            className="flex items-center gap-space-sm cursor-pointer select-none"
            onClick={() => setActiveTab('live')}
          >
            <img
              alt="Vision Guard Shield Logo"
              className="h-8 w-auto object-contain"
              src="https://lh3.googleusercontent.com/aida/AEtjO1V1I_8bOnZLqh-qWy2B2OnDWl4LOgQ5mMznfcr21XrkFTB41qgVFJ6SXe6hihe0l05I5sXYNSzCvYiRD89qKZxPW3JHL2cOZQ-SXFf749iFksEDR3TAsvi8S-xYnRj4kgSuVm_D9BAZLbCcnaCR3UOwywHOdUKecqBYUgnKg0lQko5Y1FuvcDQhEEGgr6jhmopYn-K1-krdJHBh6OzCcTsD2Tmd6Y6VQbJAhTpMUVD_HzQjlStRuwSsJSE"
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-space-xs">
                <span className="font-semibold text-base text-text-primary tracking-tight">Vision Guard</span>
                <span className="px-space-xs py-0.5 rounded-full bg-surface-container-highest text-primary font-mono text-[11px] font-semibold">
                  PS 03.1
                </span>
              </div>
              <span className="font-mono text-[11px] text-text-muted hidden sm:inline">
                Context-aware safety monitoring
              </span>
            </div>
          </div>

          <nav className="hidden lg:flex items-center gap-space-xs ml-space-md">
            <button
              onClick={() => setActiveTab('live')}
              className={`px-space-sm py-1.5 rounded-lg transition-colors font-semibold text-xs ${
                activeTab === 'live'
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              Live Monitor
            </button>
            <button
              onClick={() => setActiveTab('incidents')}
              className={`px-space-sm py-1.5 rounded-lg transition-colors font-semibold text-xs ${
                activeTab === 'incidents'
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              Incident Log
            </button>
            <button
              onClick={() => setActiveTab('telemetry')}
              className={`px-space-sm py-1.5 rounded-lg transition-colors font-semibold text-xs ${
                activeTab === 'telemetry'
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              Safety Telemetry
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-space-sm py-1.5 rounded-lg transition-colors font-semibold text-xs ${
                activeTab === 'settings'
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              Settings
            </button>
          </nav>
        </div>

        {/* Right: Telemetry & Controls */}
        <div className="flex items-center gap-space-sm">
          {/* Connection Status Pill */}
          <div className="hidden sm:flex items-center gap-space-xs px-space-sm py-1 rounded-full bg-surface-container-high">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-status-low animate-pulse'
                  : connectionStatus === 'connecting'
                  ? 'bg-status-medium animate-ping'
                  : 'bg-status-high'
              }`}
            ></span>
            <span className="font-mono text-[11px] text-text-primary uppercase tracking-wide">
              {connectionStatus === 'connected' ? 'Connected' : connectionStatus || 'STANDBY'}
            </span>
          </div>

          {/* Telemetry Readout */}
          <div className="hidden md:flex items-center px-space-sm py-1 rounded-full bg-surface-container-high font-mono text-[11px] text-text-muted">
            <span className="text-primary font-semibold">{fps} FPS</span>
            <span className="mx-1.5 text-outline-variant">·</span>
            <span>{latency} ms latency</span>
          </div>

          <div className="flex items-center gap-space-xs ml-space-xs">
            {/* Audio Voice Announcements Toggle */}
            <button
              aria-label="Toggle Voice Announcements"
              onClick={onToggleVoice}
              title={voiceEnabled ? 'Voice Announcements Active' : 'Voice Announcements Muted'}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                voiceEnabled
                  ? 'bg-surface-container-high text-secondary'
                  : 'bg-surface-container-high text-text-muted hover:text-on-surface'
              }`}
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
              title={soundEnabled ? 'Chime Sirens Enabled' : 'Chime Sirens Muted'}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                soundEnabled
                  ? 'bg-surface-container-high text-primary'
                  : 'bg-surface-container-high text-text-muted hover:text-on-surface'
              }`}
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
              title={darkMode ? 'Dark Theme (Nominal)' : 'Light Theme'}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">
                {darkMode ? 'dark_mode' : 'light_mode'}
              </span>
            </button>

            {/* Live Settings Drawer Button */}
            <button
              aria-label="Detection Threshold Settings"
              onClick={() => setActiveTab('settings')}
              title="Open Settings"
              className={`flex items-center gap-space-xs h-9 px-space-sm rounded-lg transition-colors ${
                activeTab === 'settings'
                  ? 'bg-surface-container-highest text-primary'
                  : 'bg-surface-container-high hover:bg-surface-container-highest text-on-surface'
              }`}
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span className="hidden xl:inline font-semibold text-xs">Settings</span>
            </button>

            {/* User Profile Avatar */}
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center ml-space-xs shadow-sm">
              <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
