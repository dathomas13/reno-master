import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { SyncBadge } from './SyncBadge';
import { Sheet } from './Sheet';
import { loadSettings, SETTINGS_EVENT, type LocalSettings } from '@/lib/settings';
import { entryOf, navRouteFor, normalizeNavLayout, splitNav } from '@/lib/navLayout';
import { Icon, type IconName } from './Icon';
import { CaptureSheet } from './CaptureSheet';
import { useCallFollowUp } from '@/modules/contacts/useCallFollowUp';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const ROUTE_ICONS: Record<string, IconName> = {
  '/': 'home',
  '/tagebuch': 'diary',
  '/3d': 'cube',
  '/kosten': 'euro',
  '/suche': 'search',
  '/dateien': 'files',
  '/aufgaben': 'task',
  '/notizen': 'note',
  '/kontakte': 'contact',
  '/gespraeche': 'chat',
  '/einstellungen': 'settings',
};


function navItems(routes: string[]): NavItem[] {
  return routes.flatMap((route) => {
    const entry = entryOf(route);
    return entry ? [{ ...entry, icon: <Icon name={ROUTE_ICONS[route] ?? 'more'} /> }] : [];
  });
}

/** follows the settings screen live: a change there shows in the bar without a reload */
function useNavLayout() {
  const [layout, setLayout] = useState(() => normalizeNavLayout(loadSettings().navLayout));
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<LocalSettings>).detail;
      setLayout(normalizeNavLayout(detail?.navLayout));
    };
    window.addEventListener(SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(SETTINGS_EVENT, onChange);
  }, []);
  return layout;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  useCallFollowUp();
  const layout = useNavLayout();
  const split = splitNav(layout);
  const mainNav = navItems(split.bar);
  const moreNav = navItems(split.more);
  const allNav = navItems(layout.order);
  const location = useLocation();
  const fullBleed = location.pathname.startsWith('/3d') || location.pathname.startsWith('/plaene/');
  // NavLink only knows its own path; this also marks the parent of a screen without an entry
  const current = navRouteFor(location.pathname);
  const isCurrent = (to: string) => (to === '/' ? location.pathname === '/' : current === to);

  // the capture button sits in the middle of the bar, whatever the bar holds
  const captureSlot = Math.ceil(mainNav.length / 2);
  const captureButton = (
    <div className="flex-1 min-w-0 flex items-center justify-center">
      <button
        type="button"
        aria-label="Erfassen"
        className="w-12 h-12 -mt-5 rounded-full bg-accent text-bg grid place-items-center shadow-lg
                   ring-4 ring-bg active:scale-95 transition-transform"
        onClick={() => setCaptureOpen(true)}
      >
        <Icon name="plus" className="w-7 h-7" strokeWidth={2.2} />
      </button>
    </div>
  );

  const linkClass = (isActive: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 text-[11px] ${
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
        <button type="button" className="btn btn-primary mx-1 mb-2" onClick={() => setCaptureOpen(true)}>
          <Icon name="plus" className="w-5 h-5" />
          Erfassen
        </button>
        {allNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={() =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                isCurrent(item.to) ? 'bg-accent/15 text-accent' : 'text-muted hover:text-ink'
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
        {mainNav.map((item, index) => (
          <Fragment key={item.to}>
            {index === captureSlot && captureButton}
            <NavLink to={item.to} end={item.to === '/'} className={() => linkClass(isCurrent(item.to))}
                     aria-current={isCurrent(item.to) ? 'page' : undefined}>
              {item.icon}
              <span className="truncate max-w-full">{item.label}</span>
            </NavLink>
          </Fragment>
        ))}
        {captureSlot >= mainNav.length && captureButton}
        <button
          type="button"
          className={linkClass(moreOpen || moreNav.some((item) => isCurrent(item.to)))}
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="more" />
          <span>Mehr</span>
        </button>
      </nav>

      {captureOpen && <CaptureSheet open onClose={() => setCaptureOpen(false)} />}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mehr" doneLabel="Schließen">
        <div className="flex flex-col">
          {moreNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={`list-row ${isCurrent(item.to) ? 'text-accent' : 'text-ink'}`}
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
