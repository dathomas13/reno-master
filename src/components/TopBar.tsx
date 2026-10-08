import { useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SyncBadge } from './SyncBadge';
import { Icon } from './Icon';
import { debugLog } from '@/platform/debugLog';

interface TopBarProps {
  title: string;
  subtitle?: string;
  back?: boolean | string;
  action?: ReactNode;
}

export function TopBar({ title, subtitle, back, action }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // Back means back: to wherever the user came from (search, 3D, start page). The fixed
  // target only applies when there is nothing to go back to - a cold start on a deep link.
  function goBack() {
    // a stuck back button was reported once and could not be reproduced - leave a trace
    debugLog('navigation', `Zurück-Pfeil auf ${location.pathname}${location.search} (${location.key === 'default' ? 'Einstieg' : 'Verlauf'})`);
    if (location.key !== 'default') navigate(-1);
    else navigate(typeof back === 'string' ? back : '/', { replace: true });
  }
  return (
    <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-line pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 px-3 h-14">
        {back && (
          <button
            type="button"
            aria-label="Zurück"
            className="btn btn-ghost px-2 min-h-11 -ml-1"
            onClick={goBack}
          >
            <Icon name="chevronLeft" strokeWidth={1.8} />
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
