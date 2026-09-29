import { useState } from 'react';
import { OrderList } from './OrderList';
import { SettingsFold } from './SettingsFold';
import { loadSettings, saveSettings } from '@/lib/settings';
import {
  DEFAULT_HOME_LAYOUT,
  homeBlockOf,
  moveHomeBlock,
  normalizeHomeLayout,
  toggleHomeBlock,
  visibleHomeBlocks,
  type HomeLayout,
} from '@/lib/homeLayout';

export function HomeSection() {
  const [layout, setLayout] = useState<HomeLayout>(() => normalizeHomeLayout(loadSettings().homeLayout));

  function update(next: HomeLayout) {
    setLayout(next);
    saveSettings({ homeLayout: next });
  }

  return (
    <SettingsFold
      title="Startseite"
      summary={`${visibleHomeBlocks(layout).length} von ${layout.order.length} Kacheln sichtbar`}
    >
      <p className="text-sm text-muted mb-2">
        Mit dem Haken wählen, was auf der Startseite erscheint, mit den Pfeilen die Reihenfolge von oben nach
        unten. Gilt nur für dieses Gerät.
      </p>
      <OrderList
        items={layout.order.map((id) => ({
          id,
          label: homeBlockOf(id)?.label ?? id,
          checked: !layout.hidden.includes(id),
        }))}
        canMove={(id, delta) => moveHomeBlock(layout, id, delta) !== layout}
        onMove={(id, delta) => update(moveHomeBlock(layout, id, delta))}
        check={{ label: 'auf der Startseite', onToggle: (id) => update(toggleHomeBlock(layout, id)) }}
      />
      <button type="button" className="btn mt-3" onClick={() => update(normalizeHomeLayout(DEFAULT_HOME_LAYOUT))}>
        Zurücksetzen
      </button>
    </SettingsFold>
  );
}
