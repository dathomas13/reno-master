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
import {
  DEFAULT_SHORTCUTS,
  MAX_SHORTCUTS,
  moveShortcut,
  normalizeShortcuts,
  shortcutOf,
  visibleShortcuts,
  type ShortcutLayout,
} from '@/lib/shortcuts';

export function HomeSection() {
  const [layout, setLayout] = useState<HomeLayout>(() => normalizeHomeLayout(loadSettings().homeLayout));
  const [tiles, setTiles] = useState<ShortcutLayout>(() => normalizeShortcuts(loadSettings().shortcuts));

  function update(next: HomeLayout) {
    setLayout(next);
    saveSettings({ homeLayout: next });
  }

  function updateTiles(next: ShortcutLayout) {
    setTiles(next);
    saveSettings({ shortcuts: next });
  }

  return (
    <SettingsFold
      title="Startseite"
      summary={`${visibleHomeBlocks(layout).length} von ${layout.order.length} Blöcken · Schnellzugriff: ${
        visibleShortcuts(tiles).map((item) => item.label).join(', ') || 'leer'
      }`}
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

      {/* the tiles of the quick access block - sorted like the menu: above the line shows */}
      <h3 className="font-medium mt-6 mb-1">Schnellzugriff</h3>
      <p className="text-sm text-muted mb-2">
        Was über dem Strich steht, erscheint als Kachel (höchstens {MAX_SHORTCUTS}), in dieser Reihenfolge.
      </p>
      <OrderList
        items={tiles.order.map((id) => ({ id, label: shortcutOf(id)?.label ?? id }))}
        canMove={(id, delta) => moveShortcut(tiles, id, delta) !== tiles}
        onMove={(id, delta) => updateTiles(moveShortcut(tiles, id, delta))}
        divider={{ after: tiles.shown, above: 'Kacheln', below: 'nicht gezeigt' }}
      />
      <button type="button" className="btn mt-3" onClick={() => updateTiles(normalizeShortcuts(DEFAULT_SHORTCUTS))}>
        Schnellzugriff zurücksetzen
      </button>
    </SettingsFold>
  );
}
