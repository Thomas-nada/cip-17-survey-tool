import { useApp } from '../../context/AppContext.tsx';
import { Vote, Wifi, WifiOff, Settings } from 'lucide-react';
import { useState } from 'react';

export function Header() {
  const { mode, setMode, blockfrostApiKey, setBlockfrostApiKey } = useApp();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <header className="bg-slate-900 border-b border-slate-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Title */}
          <a href="/" className="flex items-center gap-3 group">
            <div className="bg-blue-600 p-2 rounded-lg group-hover:bg-blue-500 transition-colors">
              <Vote className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">
                CIP-17 Surveys
              </h1>
              <p className="text-slate-400 text-xs">On-Chain Polls PoC</p>
            </div>
          </a>

          {/* Right side controls */}
          <div className="flex items-center gap-4">
            {/* Mode Toggle */}
            <div className="flex items-center bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setMode('simulated')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === 'simulated'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <WifiOff className="w-3.5 h-3.5" />
                Simulated
              </button>
              <button
                onClick={() => setMode('testnet')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === 'testnet'
                    ? 'bg-emerald-600 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                Testnet
              </button>
            </div>

            {/* Settings button (for Blockfrost API key) */}
            {mode === 'testnet' && (
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-slate-400 hover:text-white transition-colors"
                title="Testnet Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && mode === 'testnet' && (
        <div className="border-t border-slate-700 bg-slate-800/50 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Blockfrost Project ID (Preview Testnet)
            </label>
            <input
              type="text"
              value={blockfrostApiKey}
              onChange={(e) => setBlockfrostApiKey(e.target.value)}
              placeholder="previewXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              className="w-full max-w-md bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
            <p className="text-xs text-slate-500 mt-1">
              Get a free API key at blockfrost.io
            </p>
          </div>
        </div>
      )}
    </header>
  );
}
