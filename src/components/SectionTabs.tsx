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
 * Underlined like tabs, not boxed: they belong to the header, and must not look like
 * the filters and switches inside the screen.
 */
export function SectionTabs({ tabs, label, className = '' }: { tabs: SectionTab[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={`flex border-b border-line px-3 ${className}`}>
      {tabs.map((tab) => (
        <Link
          key={tab.label}
          to={tab.to}
          replace
          aria-current={tab.active ? 'page' : undefined}
          className={`flex-1 min-w-0 min-h-11 px-2 -mb-px border-b-2 text-sm truncate grid place-items-center ${
            tab.active ? 'border-accent text-accent font-semibold' : 'border-transparent text-muted'
          }`}
        >
          {tab.label}
        </Link>
      ))}
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
