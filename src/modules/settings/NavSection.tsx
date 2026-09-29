import { useState } from 'react';
import { SettingsHeading } from './SettingsHelp';
import { OrderList } from './OrderList';
import { loadSettings, saveSettings } from '@/lib/settings';
import {
  DEFAULT_NAV_LAYOUT,
  MAX_BAR_ITEMS,
  entryOf,
  moveNavEntry,
  normalizeNavLayout,
  toggleNavBar,
  type NavLayout,
} from '@/lib/navLayout';

export function NavSection() {
  const [layout, setLayout] = useState<NavLayout>(() => normalizeNavLayout(loadSettings().navLayout));
  const barFull = layout.bar.length >= MAX_BAR_ITEMS;

  function update(next: NavLayout) {
    setLayout(next);
    saveSettings({ navLayout: next });
  }

  return (
    <section className="card p-4">
      <SettingsHeading title="Menü">
        Mit den Pfeilen die Reihenfolge im Menü festlegen, mit dem Haken bis zu {MAX_BAR_ITEMS} Einträge
        unten in die Leiste holen. Die Leiste zeigt sie in derselben Reihenfolge, alles andere steht unter
        „Mehr“. Gilt nur für dieses Gerät.
      </SettingsHeading>
      <p className="text-sm text-muted mb-2">
        Unten in der Leiste: {layout.bar.length} von {MAX_BAR_ITEMS}
      </p>
      <OrderList
        items={layout.order.map((route) => ({
          id: route,
          label: entryOf(route)?.label ?? route,
          checked: layout.bar.includes(route),
          locked: barFull,
        }))}
        checkLabel="in der Leiste"
        onToggle={(route) => update(toggleNavBar(layout, route))}
        onMove={(route, delta) => update(moveNavEntry(layout, route, delta))}
      />
      <button type="button" className="btn mt-3" onClick={() => update(normalizeNavLayout(DEFAULT_NAV_LAYOUT))}>
        Zurücksetzen
      </button>
    </section>
  );
}
