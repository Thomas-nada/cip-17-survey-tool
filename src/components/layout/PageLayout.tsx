import type { ReactNode } from 'react';
import { Header } from './Header.tsx';
import { Toaster } from 'react-hot-toast';

export function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#0f172a',
            color: '#f1f5f9',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            fontSize: '13px',
            padding: '12px 16px',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
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
          <span>Cardano On-Chain Surveys & Polls</span>
          <span>Proof of Concept</span>
        </div>
      </footer>
    </div>
  );
}
