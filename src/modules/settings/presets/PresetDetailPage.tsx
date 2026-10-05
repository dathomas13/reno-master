import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { useLists } from '@/data/useLists';
import { findPreset, type PresetDef } from '@/data/presets';
import { usePresetUsage } from '@/data/presetUsage';
import { renameEverywhere } from '@/data/presetRename';
import { SEED_LISTS } from '@/data/seed/lists';
import type { ListKey } from '@/data/types';
import { WEATHER_ICON } from '@/modules/diary/DiaryListPage';
import { PresetListEditor } from './PresetListEditor';
import TradesEditor from './TradesEditor';
import RoomsEditor from './RoomsEditor';
import RoomMapEditor from './RoomMapEditor';

const OVERVIEW = '/einstellungen/voreinstellungen';

function StringListPage({ preset, listKey }: { preset: PresetDef; listKey: ListKey }) {
  const { lists, add, rename, remove, restore, setOrder, reset } = useLists();
  const usage = usePresetUsage(listKey);
  const [menuOpen, setMenuOpen] = useState(false);
  const items = lists[listKey];

  return (
    <>
      <TopBar
        title={preset.title}
        back={OVERVIEW}
        subtitle={`${preset.section} · ${items.length === 1 ? '1 Eintrag' : `${items.length} Einträge`}`}
        action={
          <button
            type="button"
            className="btn btn-ghost w-11 px-0"
            aria-label="Weitere Aktionen"
            onClick={() => setMenuOpen(true)}
          >
            ⋯
          </button>
        }
      />
      <div className="max-w-2xl pb-24">
        <PresetListEditor
          items={items}
          usage={usage}
          singular={preset.singular}
          placeholder={preset.placeholder}
          maxLength={preset.maxLength}
          seedCount={SEED_LISTS[listKey].length}
          onAdd={(value) => void add(listKey, value)}
          onRename={(from, to, everywhere) => {
            void rename(listKey, from, to);
            if (everywhere) void renameEverywhere(listKey, from, to).catch(() => undefined);
          }}
          onRemove={(value) => remove(listKey, value)}
          onRestore={(value, index) => void restore(listKey, value, index)}
          onReorder={(next) => void setOrder(listKey, next)}
          onReset={() => void reset(listKey)}
          leading={listKey === 'weather' ? (value) => <span aria-hidden>{WEATHER_ICON[value] ?? '·'}</span> : undefined}
          menuOpen={menuOpen}
          onMenuClose={() => setMenuOpen(false)}
        />
      </div>
    </>
  );
}

export default function PresetDetailPage() {
  const { key } = useParams();
  const preset = findPreset(key);
  if (!preset) return <Navigate to={OVERVIEW} replace />;
  switch (preset.kind) {
    case 'trades':
      return <TradesEditor />;
    case 'rooms':
      return <RoomsEditor />;
    case 'roomMap':
      return <RoomMapEditor />;
    case 'strings':
      return preset.listKey ? (
        <StringListPage key={preset.key} preset={preset} listKey={preset.listKey} />
      ) : (
        <Navigate to={OVERVIEW} replace />
      );
  }
}
