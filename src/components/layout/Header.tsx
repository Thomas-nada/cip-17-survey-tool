import { useApp } from '../../context/AppContext.tsx';
import { Wifi, WifiOff, Settings, PlusCircle, LayoutGrid, List } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/** Inline SVG logo — the "17" brand mark with teal→violet gradient */
function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14b8a6"/>
          <stop offset="100%" stopColor="#8b5cf6"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#07090f"/>
      <rect y="0" width="64" height="2" rx="1" fill="url(#hg)"/>
      <path d="M 13 16 L 20 14 L 20 44 L 25 44 L 25 49 L 10 49 L 10 44 L 15 44 L 15 21 L 12 22 L 10 17.5 Z" fill="url(#hg)"/>
      <path d="M 28 14 L 54 14 L 54 19 L 40 49 L 34 49 L 47 21 L 47 19 L 28 19 Z" fill="url(#hg)"/>
      <rect x="32" y="29" width="13" height="4" rx="1" fill="url(#hg)" opacity="0.85"/>
    </svg>
  );
}

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutGrid },
  { path: '/surveys', label: 'Surveys', icon: List },
  { path: '/create', label: 'Create', icon: PlusCircle },
];

export function Header() {
  const { mode, setMode, blockfrostApiKey, setBlockfrostApiKey } = useApp();
  const [showSettings, setShowSettings] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="bg-[#07090f]/80 backdrop-blur-xl border-b border-slate-700/30 sticky top-[3px] z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Title — gradient "17" wordmark */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 group"
          >
            <div className="relative">
              <LogoMark className="w-10 h-10 rounded-xl shadow-lg shadow-teal-500/20 group-hover:shadow-teal-400/30 transition-shadow" />
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#07090f] animate-pulse" />
            </div>
            <div className="hidden sm:block font-heading">
              <h1 className="text-white font-bold text-lg leading-tight">
                <span className="text-slate-300">Label</span>{' '}
                <span className="brand-gradient-text">17</span>
              </h1>
              <p className="text-slate-500 text-[10px] font-medium tracking-wider uppercase">
                On-Chain Surveys
              </p>
            </div>
          </button>

          {/* Center nav links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-800/30 rounded-xl p-1 border border-slate-700/30">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-teal-500/15 text-teal-300 shadow-sm border border-teal-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Right side controls */}
          <div className="flex items-center gap-3">
            {/* Mode Toggle */}
            <div className="flex items-center bg-slate-800/50 rounded-xl p-1 border border-slate-700/30">
              <button
                onClick={() => setMode('simulated')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  mode === 'simulated'
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <WifiOff className="w-3 h-3" />
                <span className="hidden sm:inline">Simulated</span>
              </button>
              <button
                onClick={() => setMode('testnet')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  mode === 'testnet'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">Testnet</span>
              </button>
            </div>

            {/* Settings button (for Blockfrost API key) */}
            {mode === 'testnet' && (
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  showSettings
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Testnet Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex items-center gap-1 pb-3 -mt-1">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-teal-500/15 text-teal-300 border border-teal-500/20'
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && mode === 'testnet' && (
        <div className="border-t border-slate-700/30 bg-[#07090f]/80 backdrop-blur-xl animate-slideDown">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Blockfrost Project ID (Preview Testnet)
            </label>
            <input
              type="text"
              value={blockfrostApiKey}
              onChange={(e) => setBlockfrostApiKey(e.target.value)}
              placeholder="previewXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              className="w-full max-w-md bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
            />
            <p className="text-xs text-slate-500 mt-2">
              Get a free API key at{' '}
              <span className="text-teal-400">blockfrost.io</span>
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
