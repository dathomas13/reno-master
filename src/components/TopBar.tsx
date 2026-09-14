import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SyncBadge } from './SyncBadge';

interface TopBarProps {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  action?: ReactNode;
}

export function TopBar({ title, subtitle, back, action }: TopBarProps) {
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-line pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 px-3 h-14">
        {back && (
          <button
            type="button"
            aria-label="Zurück"
            className="btn btn-ghost px-2 min-h-0 py-1 -ml-1"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold truncate leading-tight">{title}</h1>
          {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
        </div>
        <div className="md:hidden">
          <SyncBadge />
        </div>
        {action}
      </div>
    </header>
  );
}
