import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Header } from './Header.tsx';
import { Toaster } from 'react-hot-toast';
import { useApp } from '../../context/AppContext.tsx';
import { useI18n } from '../../context/I18nContext.tsx';

const LOADING_LINES = [
  'Booting Label 17 governance matrix...',
  'Indexing on-chain survey packets...',
  'Negotiating with highly opinionated stake blobs...',
  'Calibrating tally lasers to deterministic mode...',
  'Compiling civic wisdom into verifiable metadata...',
];

export function PageLayout({ children }: { children: ReactNode }) {
  const { state, mode, setMode } = useApp();
  const { t } = useI18n();
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [loadingLineIndex, setLoadingLineIndex] = useState(0);
  const showSurveyLoader = state.loading && state.surveys.length === 0;

  useEffect(() => {
    if (!showSurveyLoader) return;
    const interval = window.setInterval(() => {
      setLoadingLineIndex((i) => (i + 1) % LOADING_LINES.length);
    }, 1400);
    return () => window.clearInterval(interval);
  }, [showSurveyLoader]);

  return (
    <div className="accent-stripe min-h-screen bg-transparent text-white">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0c0f1a',
            color: '#f1f5f9',
            border: '1px solid rgba(20, 184, 166, 0.2)',
            borderRadius: '12px',
            fontSize: '13px',
            padding: '12px 16px',
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
          },
          success: {
            iconTheme: {
              primary: '#14b8a6',
              secondary: '#f1f5f9',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#f1f5f9',
            },
          },
        }}
      />
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {mode === 'mainnet' && (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 md:p-8 animate-fadeIn">
            <div className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              Mainnet
            </div>
            <h2 className="mt-4 font-heading text-2xl text-white">
              Mainnet support coming soon
            </h2>
            <p className="mt-2 text-sm text-slate-300 max-w-2xl">
              Mainnet mode is temporarily disabled while the production rollout is finalized. Please use Preview for now.
            </p>
            <button
              type="button"
              onClick={() => setMode('testnet')}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold transition-colors"
            >
              Switch to Preview
            </button>
          </div>
        )}
        {showSurveyLoader && (
          <div className="mb-6 rounded-2xl border border-teal-500/25 bg-slate-900/50 p-6 md:p-8 animate-fadeIn">
            <div className="inline-flex items-center gap-2 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-300">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal-400" />
              Syncing Chain State
            </div>
            <h2 className="mt-4 font-heading text-xl md:text-2xl text-white">
              Label 17 Cold Start Sequence
            </h2>
            <p className="mt-2 text-sm text-slate-300 font-code min-h-[1.4rem]">
              {LOADING_LINES[loadingLineIndex]}
            </p>
            <div className="mt-5 h-2 w-full overflow-hidden rounded-md border border-slate-700/60 bg-slate-800/80">
              <div className="h-full w-1/3 animate-pulse bg-gradient-to-r from-teal-500 via-cyan-400 to-violet-500" />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Pulling surveys and responses from index cache. This usually takes a few seconds.
            </p>
          </div>
        )}
        {state.error && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-200 font-medium">{t('layout.errorLoading')}</p>
            <button
              type="button"
              onClick={() => setShowErrorDetails((v) => !v)}
              className="mt-1 text-xs text-amber-300 hover:text-amber-200 underline underline-offset-2"
            >
              {showErrorDetails ? t('layout.hideTechnicalDetails') : t('layout.showTechnicalDetails')}
            </button>
            {showErrorDetails && (
              <pre className="mt-2 overflow-x-auto rounded-lg border border-amber-500/20 bg-slate-900/50 p-2 text-[11px] text-amber-200">
                {state.error}
              </pre>
            )}
          </div>
        )}
        {mode === 'mainnet' ? null : children}
      </main>
      {/* Footer */}
      <footer className="border-t border-slate-800/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between text-xs text-slate-600">
          <span className="font-heading">
            <span className="text-slate-500">Label</span>{' '}
            <span className="brand-gradient-text font-bold">17</span>{' '}
            <span className="text-slate-600">— {t('layout.footerOnChainSurveys')}</span>
          </span>
          <span>{t('layout.footerNetworks')}</span>
        </div>
      </footer>
    </div>
  );
}
