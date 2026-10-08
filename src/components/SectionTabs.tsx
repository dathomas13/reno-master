import { Link } from 'react-router-dom';

export interface SectionTab {
  to: string;
  label: string;
  active: boolean;
}

/**
 * The tabs of an area (Tagebuch: Einträge · Fotos, …): the screens that belong together
 * sit side by side here instead of being scattered over the menu. Real links, so back
 * and the address keep working the way they did when each screen had its own entry.
 */
export function SectionTabs({ tabs, label, className = '' }: { tabs: SectionTab[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={`px-3 pt-3 ${className}`}>
      <div
        className="grid rounded-xl border border-line overflow-hidden bg-panel/60"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            to={tab.to}
            replace
            aria-current={tab.active ? 'page' : undefined}
            className={`min-h-10 px-2 text-sm truncate grid place-items-center ${
              tab.active ? 'bg-accent/15 text-accent font-semibold' : 'text-muted'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** the tab sets of the areas, so every screen of an area shows the same row */
export const AREA_TABS = {
  diary: (active: 'entries' | 'photos'): SectionTab[] => [
    { to: '/tagebuch', label: 'Einträge', active: active === 'entries' },
    { to: '/fotos', label: 'Fotos', active: active === 'photos' },
  ],
  house: (active: '3d' | 'plans'): SectionTab[] => [
    { to: '/3d', label: '3D', active: active === '3d' },
    { to: '/plaene', label: 'Pläne', active: active === 'plans' },
  ],
  tasks: (active: 'tasks' | 'notes'): SectionTab[] => [
    { to: '/aufgaben', label: 'Aufgaben', active: active === 'tasks' },
    { to: '/notizen', label: 'Notizen', active: active === 'notes' },
  ],
  contacts: (active: 'contacts' | 'logs'): SectionTab[] => [
    { to: '/kontakte', label: 'Kontakte', active: active === 'contacts' },
    { to: '/gespraeche', label: 'Gespräche', active: active === 'logs' },
  ],
};
