import { useApp } from '../../context/AppContext.tsx';
import { Wifi, Settings, PlusCircle, LayoutGrid, List, Wallet, LogOut, Loader2, ChevronDown, AlertTriangle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../context/I18nContext.tsx';
import {
  getUserPreferences,
  setUserPreference,
  clearLocalAppCache,
  type CopyFormat,
  type DefaultResultsSort,
  type ExplorerProvider,
  type FontScale,
} from '../../utils/userPreferences.ts';

/** Inline SVG logo — dark/light variants of the "17" brand mark */
function LogoMark({ className = '', theme = 'dark' }: { className?: string; theme?: 'dark' | 'light' | '8bit' }) {
  const isLight = theme === 'light';
  const is8Bit = theme === '8bit';
  if (is8Bit) {
    return (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect x="0" y="0" width="64" height="64" fill="#130f24" stroke="#39ff14" strokeWidth="2" />
        <rect x="0" y="0" width="64" height="4" fill="#39ff14" />

        {/* Pixel 1 */}
        <rect x="12" y="14" width="6" height="6" fill="#77f9ff" />
        <rect x="18" y="14" width="6" height="6" fill="#77f9ff" />
        <rect x="18" y="20" width="6" height="6" fill="#77f9ff" />
        <rect x="18" y="26" width="6" height="6" fill="#77f9ff" />
        <rect x="18" y="32" width="6" height="6" fill="#77f9ff" />
        <rect x="18" y="38" width="6" height="6" fill="#77f9ff" />
        <rect x="12" y="44" width="18" height="6" fill="#77f9ff" />

        {/* Pixel 7 */}
        <rect x="34" y="14" width="18" height="6" fill="#ff00a8" />
        <rect x="46" y="20" width="6" height="6" fill="#ff00a8" />
        <rect x="40" y="26" width="6" height="6" fill="#ff00a8" />
        <rect x="40" y="32" width="6" height="6" fill="#ff00a8" />
        <rect x="34" y="38" width="6" height="6" fill="#ff00a8" />
        <rect x="34" y="44" width="6" height="6" fill="#ff00a8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14b8a6"/>
          <stop offset="100%" stopColor="#8b5cf6"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={isLight ? '#f8fafc' : '#07090f'} stroke={isLight ? '#cbd5e1' : 'none'} />
      <rect y="0" width="64" height="2" rx="1" fill={isLight ? '#14b8a6' : 'url(#hg)'} />
      <path d="M 13 16 L 20 14 L 20 44 L 25 44 L 25 49 L 10 49 L 10 44 L 15 44 L 15 21 L 12 22 L 10 17.5 Z" fill="url(#hg)"/>
      <path d="M 28 14 L 54 14 L 54 19 L 40 49 L 34 49 L 47 21 L 47 19 L 28 19 Z" fill="url(#hg)"/>
      <rect x="32" y="29" width="13" height="4" rx="1" fill="url(#hg)" opacity="0.85"/>
    </svg>
  );
}

/** Truncate a hex address for display: first 8 chars ... last 6 chars */
function truncateAddress(addr: string): string {
  if (addr.length <= 20) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export function Header() {
  const { mode, setMode, wallet, dispatch } = useApp();
  const { t } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  const [showWalletDropdown, setShowWalletDropdown] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light' | '8bit'>(
    () => {
      const stored = localStorage.getItem('cip17_theme');
      if (stored === 'light' || stored === 'dark' || stored === '8bit') return stored;
      return 'dark';
    }
  );
  const [prefs, setPrefs] = useState(() => getUserPreferences());
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cip17_theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-font-scale', prefs.fontScale);
  }, [prefs.fontScale]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowWalletDropdown(false);
      }
    }
    if (showWalletDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showWalletDropdown]);

  const handleConnect = async (walletId: string) => {
    try {
      await wallet.connect(walletId);
      setShowWalletDropdown(false);
      toast.success(t('toast.walletConnected', { wallet: walletId }), { icon: '🔗' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      toast.error(msg);
    }
  };

  const handleDisconnect = () => {
    wallet.disconnect();
    setShowWalletDropdown(false);
    toast.success(t('toast.walletDisconnected'), { icon: '🔌' });
  };

  const walletNetworkMismatch = wallet.connectedWallet && wallet.networkId !== null && (
    (mode === 'mainnet' && wallet.networkId !== 1) ||
    (mode === 'testnet' && wallet.networkId !== 0)
  );
  const navItems = [
    { path: '/', label: t('header.dashboard'), icon: LayoutGrid },
    { path: '/surveys', label: t('header.surveys'), icon: List },
    { path: '/create', label: t('header.create'), icon: PlusCircle },
  ];

  const handlePreferenceChange = <K extends keyof typeof prefs>(key: K, value: (typeof prefs)[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setUserPreference(key, value);
  };

  const handleResetLocalCache = () => {
    if (!window.confirm('Reset local app cache and reload?')) return;
    clearLocalAppCache();
    dispatch({ type: 'CLEAR_STATE' });
    toast.success('Local cache cleared');
    window.location.reload();
  };

  return (
    <header className="bg-[#07090f]/80 backdrop-blur-xl border-b border-slate-700/30 sticky top-[3px] z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`flex items-center justify-between ${
            theme === '8bit' ? 'min-h-[86px] py-3' : 'h-16'
          }`}
        >
          {/* Logo / Title — gradient "17" wordmark */}
          <button
            onClick={() => navigate('/')}
            className={`flex items-center group ${
              theme === '8bit' ? 'gap-2' : 'gap-3'
            }`}
          >
            <div className="relative">
              <LogoMark
                theme={theme}
                className={`w-10 h-10 shadow-lg transition-shadow ${
                  theme === '8bit'
                    ? 'shadow-fuchsia-500/20'
                    : 'rounded-xl shadow-teal-500/20 group-hover:shadow-teal-400/30'
                }`}
              />
              <div
                className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 border-2 ${
                  theme === '8bit'
                    ? 'bg-fuchsia-400 border-[#1b1230]'
                    : 'bg-emerald-400 rounded-full border-[#07090f] animate-pulse'
                }`}
              />
            </div>
            <div className="hidden sm:block font-heading">
              <h1
                className={`text-white font-bold leading-tight whitespace-nowrap ${
                  theme === '8bit' ? 'text-sm' : 'text-lg'
                }`}
              >
                <span className="text-slate-300">Label</span>{' '}
                <span className="brand-gradient-text">17</span>
              </h1>
              <p
                className={`text-slate-500 font-medium uppercase ${
                  theme === '8bit'
                    ? 'text-[8px] tracking-wide leading-tight mt-1'
                    : 'text-[10px] tracking-wider'
                }`}
              >
                {t('header.onChainSurveys')}
              </p>
            </div>
          </button>

          {/* Center nav links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-800/30 rounded-xl p-1 border border-slate-700/30">
            {navItems.map(({ path, label, icon: Icon }) => {
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
            {/* Wallet Connection Button */}
            <div className="relative" ref={dropdownRef}>
              {wallet.connectedWallet ? (
                /* Connected state */
                <button
                  onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 hover:bg-teal-500/15 hover:text-teal-300 transition-all duration-200"
                >
                  {wallet.connectedWallet.icon && (
                    <img
                      src={wallet.connectedWallet.icon}
                      alt={wallet.connectedWallet.name}
                      className="w-4 h-4 rounded-sm"
                    />
                  )}
                  <span className="text-xs font-semibold font-code hidden sm:inline">
                    {wallet.address ? truncateAddress(wallet.address) : wallet.connectedWallet.name}
                  </span>
                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showWalletDropdown ? 'rotate-180' : ''}`} />
                </button>
              ) : (
                /* Not connected — Connect button */
                <button
                  onClick={() => setShowWalletDropdown(!showWalletDropdown)}
                  disabled={wallet.connecting}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-violet-600 hover:from-teal-500 hover:to-violet-500 text-white text-xs font-semibold transition-all duration-200 shadow-lg shadow-teal-600/20 hover:shadow-teal-500/25 disabled:opacity-50"
                >
                  {wallet.connecting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wallet className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {wallet.connecting ? t('header.connecting') : t('header.connectWallet')}
                  </span>
                </button>
              )}

              {/* Wallet Dropdown */}
              {showWalletDropdown && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[#0d1220] border border-slate-700/50 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-slideDown z-[100]">
                  {wallet.connectedWallet ? (
                    /* Connected dropdown — show address + disconnect */
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        {wallet.connectedWallet.icon && (
                          <img
                            src={wallet.connectedWallet.icon}
                            alt={wallet.connectedWallet.name}
                            className="w-8 h-8 rounded-lg"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{wallet.connectedWallet.name}</p>
                          <p className="text-xs text-slate-500">CIP-30 v{wallet.connectedWallet.apiVersion}</p>
                        </div>
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      </div>

                      {wallet.address && (
                        <div className="bg-slate-800/50 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-slate-500 mb-0.5">{t('header.address')}</p>
                          <p className="text-xs font-code text-slate-300 break-all">
                            {wallet.address.slice(0, 24)}...{wallet.address.slice(-12)}
                          </p>
                        </div>
                      )}

                      {wallet.networkId !== null && (
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                            wallet.networkId === 0
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {wallet.networkId === 0 ? t('header.testnet') : t('header.mainnet')}
                          </span>
                          {walletNetworkMismatch && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-400">
                              <AlertTriangle className="w-3 h-3" />
                              {t('header.switchTo', { network: mode === 'mainnet' ? t('header.mainnet') : t('header.testnet') })}
                            </span>
                          )}
                        </div>
                      )}

                      <button
                        onClick={handleDisconnect}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 hover:text-red-300 text-xs font-semibold transition-all"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        {t('header.disconnect')}
                      </button>
                    </div>
                  ) : (
                    /* Wallet selector list */
                    <div>
                      <div className="px-4 py-3 border-b border-slate-700/30">
                        <p className="text-sm font-semibold text-white font-heading">{t('header.connectWalletTitle')}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{t('header.selectCip30Wallet')}</p>
                      </div>

                      {wallet.availableWallets.length === 0 ? (
                        <div className="p-4 text-center">
                          <Wallet className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                          <p className="text-sm text-slate-400 font-medium mb-1">{t('header.noWalletsDetected')}</p>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {t('header.installWalletHelp')}
                          </p>
                        </div>
                      ) : (
                        <div className="p-2">
                          {wallet.availableWallets.map((w) => (
                            <button
                              key={w.id}
                              onClick={() => handleConnect(w.id)}
                              disabled={wallet.connecting}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800/50 transition-all duration-200 text-left group disabled:opacity-50"
                            >
                              {w.icon ? (
                                <img
                                  src={w.icon}
                                  alt={w.name}
                                  className="w-8 h-8 rounded-lg bg-slate-800 p-0.5"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                                  <Wallet className="w-4 h-4 text-slate-500" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                                  {w.name}
                                </p>
                                <p className="text-[10px] text-slate-600">
                                  CIP-30 v{w.apiVersion}
                                </p>
                              </div>
                              <div className="text-xs text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                                {t('header.connect')}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {wallet.error && (
                        <div className="px-4 py-2 border-t border-slate-700/30 bg-red-500/5">
                          <p className="text-xs text-red-400">{wallet.error}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Network mode toggle */}
            <div className="flex items-center bg-slate-800/50 rounded-xl p-1 border border-slate-700/30">
              <button
                onClick={() => setMode('mainnet')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  mode === 'mainnet'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">{t('header.mainnet')}</span>
              </button>
              <button
                onClick={() => setMode('testnet')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  mode === 'testnet'
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">{t('header.testnet')}</span>
              </button>
            </div>

            {/* Settings button (for Blockfrost API key) */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`user-settings-btn p-2 rounded-lg transition-all duration-200 ${
                showSettings
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
              title={t('header.userPreferences')}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex items-center gap-1 pb-3 -mt-1">
          {navItems.map(({ path, label, icon: Icon }) => {
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
      {showSettings && (
        <div className="border-t border-slate-700/30 bg-[#07090f]/80 backdrop-blur-xl animate-slideDown">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <p className="text-sm font-medium text-slate-300 mb-3">{t('header.userPreferences')}</p>
            <div className="space-y-4 text-xs">
              <div>
                <p className="text-slate-400 mb-2">{t('header.theme')}</p>
                <div className="inline-flex rounded-lg border border-slate-700/40 bg-slate-900/40 p-1">
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`px-3 py-1.5 rounded-md font-semibold ${theme === 'dark' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {t('header.dark')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`px-3 py-1.5 rounded-md font-semibold ${theme === 'light' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {t('header.light')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('8bit')}
                    className={`px-3 py-1.5 rounded-md font-semibold ${theme === '8bit' ? 'bg-fuchsia-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    8-bit
                  </button>
                </div>
              </div>
              <div>
                <p className="text-slate-400 mb-2">Default Results Sort</p>
                <select
                  value={prefs.defaultResultsSort}
                  onChange={(e) => handlePreferenceChange('defaultResultsSort', e.target.value as DefaultResultsSort)}
                  className="option-sort-select text-xs rounded-md bg-slate-900/40 border border-slate-700/40 text-slate-300 px-2 py-1 min-w-[220px]"
                >
                  <option value="leading">Leading (default)</option>
                  <option value="name">Name (A-Z)</option>
                  <option value="votes">Votes (high-low)</option>
                  <option value="percentage">Percentage (high-low)</option>
                </select>
              </div>
              <div>
                <p className="text-slate-400 mb-2">Confirm Before Vote Submit</p>
                <div className="inline-flex rounded-lg border border-slate-700/40 bg-slate-900/40 p-1">
                  <button
                    type="button"
                    onClick={() => handlePreferenceChange('confirmBeforeVoteSubmit', false)}
                    className={`px-3 py-1.5 rounded-md font-semibold ${!prefs.confirmBeforeVoteSubmit ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    Off
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePreferenceChange('confirmBeforeVoteSubmit', true)}
                    className={`px-3 py-1.5 rounded-md font-semibold ${prefs.confirmBeforeVoteSubmit ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    On
                  </button>
                </div>
              </div>
              <div>
                <p className="text-slate-400 mb-2">Copy Format</p>
                <select
                  value={prefs.copyFormat}
                  onChange={(e) => handlePreferenceChange('copyFormat', e.target.value as CopyFormat)}
                  className="option-sort-select text-xs rounded-md bg-slate-900/40 border border-slate-700/40 text-slate-300 px-2 py-1 min-w-[220px]"
                >
                  <option value="json_pretty">JSON (pretty)</option>
                  <option value="json_minified">JSON (minified)</option>
                  <option value="cli_snippet">CLI snippet</option>
                </select>
              </div>
              <div>
                <p className="text-slate-400 mb-2">Explorer</p>
                <select
                  value={prefs.explorerProvider}
                  onChange={(e) => handlePreferenceChange('explorerProvider', e.target.value as ExplorerProvider)}
                  className="option-sort-select text-xs rounded-md bg-slate-900/40 border border-slate-700/40 text-slate-300 px-2 py-1 min-w-[220px]"
                >
                  <option value="cardanoscan">Cardanoscan</option>
                  <option value="cexplorer">Cexplorer</option>
                </select>
              </div>
              <div>
                <p className="text-slate-400 mb-2">Font Scale</p>
                <select
                  value={prefs.fontScale}
                  onChange={(e) => handlePreferenceChange('fontScale', e.target.value as FontScale)}
                  className="option-sort-select text-xs rounded-md bg-slate-900/40 border border-slate-700/40 text-slate-300 px-2 py-1 min-w-[220px]"
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
              <div>
                <p className="text-slate-400 mb-2">Local Cache</p>
                <button
                  type="button"
                  onClick={handleResetLocalCache}
                  className="px-3 py-1.5 rounded-md font-semibold border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                >
                  Reset Local Cache
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
