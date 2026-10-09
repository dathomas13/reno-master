import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { OrderList } from './OrderList';
import { SettingsHeading } from './SettingsHelp';
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

/** one line for the settings overview: what the start page shows right now */
export function homeSettingsSummary(): string {
  const settings = loadSettings();
  const blocks = normalizeHomeLayout(settings.homeLayout);
  const tiles = visibleShortcuts(normalizeShortcuts(settings.shortcuts));
  return `${visibleHomeBlocks(blocks).length} von ${blocks.order.length} Blöcken · Schnellzugriff: ${
    tiles.map((item) => item.label).join(', ') || 'leer'
  }`;
}

/**
 * The start page as its own settings screen, like the presets: which blocks in which
 * order, and which quick access tiles. Both kept per device.
 */
export default function HomeSettingsPage() {
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
    <>
      <TopBar title="Startseite" subtitle="Gilt nur für dieses Gerät" back="/einstellungen" />

      <div className="p-4 max-w-2xl flex flex-col gap-4">
        <section className="card p-4">
          <SettingsHeading title="Blöcke">
            Mit dem Haken wählen, was auf der Startseite erscheint, mit den Pfeilen die Reihenfolge von oben
            nach unten.
          </SettingsHeading>
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
        </section>

        <section className="card p-4">
          <SettingsHeading title="Schnellzugriff">
            Was über dem Strich steht, erscheint als Kachel (höchstens {MAX_SHORTCUTS}), in dieser Reihenfolge.
          </SettingsHeading>
          <OrderList
            items={tiles.order.map((id) => ({ id, label: shortcutOf(id)?.label ?? id }))}
            canMove={(id, delta) => moveShortcut(tiles, id, delta) !== tiles}
            onMove={(id, delta) => updateTiles(moveShortcut(tiles, id, delta))}
            divider={{ after: tiles.shown, above: 'Kacheln', below: 'nicht gezeigt' }}
          />
          <button type="button" className="btn mt-3" onClick={() => updateTiles(normalizeShortcuts(DEFAULT_SHORTCUTS))}>
            Zurücksetzen
          </button>
        </section>
      </div>
    </>
  );
}
