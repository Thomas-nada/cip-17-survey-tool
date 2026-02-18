import type { ReactNode } from 'react';
import { Header } from './Header.tsx';
import { Toaster } from 'react-hot-toast';

export function PageLayout({ children }: { children: ReactNode }) {
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
        {children}
      </main>
      {/* Footer */}
      <footer className="border-t border-slate-800/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between text-xs text-slate-600">
          <span className="font-heading">
            <span className="text-slate-500">Label</span>{' '}
            <span className="brand-gradient-text font-bold">17</span>{' '}
            <span className="text-slate-600">— On-Chain Surveys</span>
          </span>
          <span>Proof of Concept</span>
        </div>
      </footer>
    </div>
  );
}
