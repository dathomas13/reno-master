import { useState } from 'react';
import { SettingsHeading } from './SettingsHelp';
import { OrderList } from './OrderList';
import { loadSettings, saveSettings } from '@/lib/settings';
import {
  DEFAULT_HOME_LAYOUT,
  homeBlockOf,
  moveHomeBlock,
  normalizeHomeLayout,
  toggleHomeBlock,
  type HomeLayout,
} from '@/lib/homeLayout';

export function HomeSection() {
  const [layout, setLayout] = useState<HomeLayout>(() => normalizeHomeLayout(loadSettings().homeLayout));

  function update(next: HomeLayout) {
    setLayout(next);
    saveSettings({ homeLayout: next });
  }

  return (
    <section className="card p-4">
      <SettingsHeading title="Startseite">
        Mit dem Haken wählen, was auf der Startseite erscheint, mit den Pfeilen die Reihenfolge von oben nach
        unten. Gilt nur für dieses Gerät.
      </SettingsHeading>
      <OrderList
        items={layout.order.map((id) => ({
          id,
          label: homeBlockOf(id)?.label ?? id,
          checked: !layout.hidden.includes(id),
        }))}
        checkLabel="auf der Startseite"
        onToggle={(id) => update(toggleHomeBlock(layout, id))}
        onMove={(id, delta) => update(moveHomeBlock(layout, id, delta))}
      />
      <button type="button" className="btn mt-3" onClick={() => update(normalizeHomeLayout(DEFAULT_HOME_LAYOUT))}>
        Zurücksetzen
      </button>
    </section>
  );
}
