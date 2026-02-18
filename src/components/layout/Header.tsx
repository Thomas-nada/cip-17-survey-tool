import { useApp } from '../../context/AppContext.tsx';
import { Vote, Wifi, WifiOff, Settings, PlusCircle, LayoutGrid, List } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

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
    <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Title */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 group"
          >
            <div className="relative">
              <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-2 rounded-xl group-hover:from-blue-400 group-hover:to-blue-600 transition-all shadow-lg shadow-blue-500/20">
                <Vote className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-white font-bold text-lg leading-tight">
                CIP-17
              </h1>
              <p className="text-slate-500 text-[10px] font-medium tracking-wider uppercase">
                On-Chain Surveys
              </p>
            </div>
          </button>

          {/* Center nav links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-800/50 rounded-xl p-1 border border-slate-700/50">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-slate-700 text-white shadow-sm'
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
            <div className="flex items-center bg-slate-800/80 rounded-xl p-1 border border-slate-700/50">
              <button
                onClick={() => setMode('simulated')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  mode === 'simulated'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
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
                    ? 'bg-slate-800 text-white'
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
        <div className="border-t border-slate-700/50 bg-slate-800/50 backdrop-blur-xl animate-slideDown">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Blockfrost Project ID (Preview Testnet)
            </label>
            <input
              type="text"
              value={blockfrostApiKey}
              onChange={(e) => setBlockfrostApiKey(e.target.value)}
              placeholder="previewXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              className="w-full max-w-md bg-slate-900/50 border border-slate-600 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
            />
            <p className="text-xs text-slate-500 mt-2">
              Get a free API key at{' '}
              <span className="text-emerald-400">blockfrost.io</span>
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
