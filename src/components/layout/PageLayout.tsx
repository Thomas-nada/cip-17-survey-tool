import type { ReactNode } from 'react';
import { useState } from 'react';
import { Header } from './Header.tsx';
import { Toaster } from 'react-hot-toast';
import { useApp } from '../../context/AppContext.tsx';
import { useI18n } from '../../context/I18nContext.tsx';

export function PageLayout({ children }: { children: ReactNode }) {
  const { state } = useApp();
  const { t } = useI18n();
  const [showErrorDetails, setShowErrorDetails] = useState(false);

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
        {children}
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
