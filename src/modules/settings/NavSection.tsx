import { useState } from 'react';
import { OrderList } from './OrderList';
import { SettingsFold } from './SettingsFold';
import { loadSettings, saveSettings } from '@/lib/settings';
import {
  DEFAULT_NAV_LAYOUT,
  MAX_BAR_ITEMS,
  entryOf,
  moveNavEntry,
  normalizeNavLayout,
  type NavLayout,
} from '@/lib/navLayout';

export function NavSection() {
  const [layout, setLayout] = useState<NavLayout>(() => normalizeNavLayout(loadSettings().navLayout));

  function update(next: NavLayout) {
    setLayout(next);
    saveSettings({ navLayout: next });
  }

  return (
    <SettingsFold
      title="Menü"
      summary={`Leiste: ${layout.bar.map((route) => entryOf(route)?.label ?? route).join(', ') || 'leer'}`}
    >
      <p className="text-sm text-muted mb-2">
        Mit den Pfeilen sortieren. Was über dem Strich steht, kommt unten in die Leiste (höchstens{' '}
        {MAX_BAR_ITEMS}), der Rest unter „Mehr“. Gilt nur für dieses Gerät.
      </p>
      <OrderList
        items={layout.order.map((route) => ({ id: route, label: entryOf(route)?.label ?? route }))}
        canMove={(route, delta) => moveNavEntry(layout, route, delta) !== layout}
        onMove={(route, delta) => update(moveNavEntry(layout, route, delta))}
        divider={{ after: layout.bar.length, above: 'Leiste', below: 'Mehr' }}
      />
      <button type="button" className="btn mt-3" onClick={() => update(normalizeNavLayout(DEFAULT_NAV_LAYOUT))}>
        Zurücksetzen
      </button>
    </SettingsFold>
  );
}
