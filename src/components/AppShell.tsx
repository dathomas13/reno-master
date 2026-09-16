import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { SyncBadge } from './SyncBadge';
import { Sheet } from './Sheet';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

/** inline icons keep the app free of an icon package and work offline */
function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  diary: 'M4 4h11l5 5v11H4zM15 4v5h5M8 13h8M8 17h5',
  cube: 'M12 3 3 7.5v9L12 21l9-4.5v-9zM3 7.5 12 12l9-4.5M12 12v9',
  euro: 'M17 6.5A6 6 0 0 0 8 12a6 6 0 0 0 9 5.5M5 10.5h8M5 13.5h8',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  plan: 'M3 5h18v14H3zM9 5v14M3 12h6M15 5v6M15 11h6',
  task: 'M5 12l4 4 10-10M4 20h16',
  contact: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5 21 21',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM4.5 12a7.5 7.5 0 0 1 .2-1.6l-2-1.5 2-3.4 2.3 1a7.6 7.6 0 0 1 2.8-1.6L10.2 2h3.6l.4 2.9c1 .3 2 .9 2.8 1.6l2.3-1 2 3.4-2 1.5a7.6 7.6 0 0 1 0 3.2l2 1.5-2 3.4-2.3-1a7.6 7.6 0 0 1-2.8 1.6l-.4 2.9h-3.6l-.4-2.9a7.6 7.6 0 0 1-2.8-1.6l-2.3 1-2-3.4 2-1.5A7.5 7.5 0 0 1 4.5 12z',
};

const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Start', icon: <Icon path={ICONS.home} /> },
  { to: '/tagebuch', label: 'Tagebuch', icon: <Icon path={ICONS.diary} /> },
  { to: '/3d', label: '3D', icon: <Icon path={ICONS.cube} /> },
  { to: '/kosten', label: 'Kosten', icon: <Icon path={ICONS.euro} /> },
];

const MORE_NAV: NavItem[] = [
  { to: '/suche', label: 'Suche', icon: <Icon path={ICONS.search} /> },
  { to: '/plaene', label: 'Pläne', icon: <Icon path={ICONS.plan} /> },
  { to: '/aufgaben', label: 'Aufgaben', icon: <Icon path={ICONS.task} /> },
  { to: '/kontakte', label: 'Kontakte', icon: <Icon path={ICONS.contact} /> },
  { to: '/einstellungen', label: 'Einstellungen', icon: <Icon path={ICONS.settings} /> },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const fullBleed = location.pathname.startsWith('/3d') || location.pathname.startsWith('/plaene/');

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[11px] ${
      isActive ? 'text-accent' : 'text-muted'
    }`;

  return (
    <div className="min-h-full flex md:flex-row flex-col">
      {/* desktop sidebar */}
      <nav className="hidden md:flex md:flex-col md:w-56 md:shrink-0 border-r border-line bg-panel/40 p-3 gap-1">
        <div className="px-3 py-4">
          <div className="font-semibold">Reno Master</div>
          <div className="text-xs text-muted">Schlesierstraße 31</div>
        </div>
        {[...MAIN_NAV, ...MORE_NAV].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink'
              }`
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
        <div className="mt-auto px-3">
          <SyncBadge />
        </div>
      </nav>

      <main
        className={`flex-1 min-w-0 ${fullBleed ? '' : 'pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0'}`}
      >
        {children}
      </main>

      {/* phone bottom navigation */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 flex border-t border-line bg-panel/95 backdrop-blur
                   pb-[env(safe-area-inset-bottom)]"
      >
        {MAIN_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClass}>
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button type="button" className={linkClass({ isActive: moreOpen })} onClick={() => setMoreOpen(true)}>
          <Icon path={ICONS.more} />
          <span>Mehr</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mehr">
        <div className="flex flex-col">
          {MORE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="list-row text-ink"
              onClick={() => setMoreOpen(false)}
            >
              <span className="text-accent">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
            </NavLink>
          ))}
          <div className="p-4">
            <SyncBadge />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
