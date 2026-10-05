import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { useOptions } from '@/data/useOptions';
import { findPreset, type PresetDef } from '@/data/presets';
import { usePresetUsage } from '@/data/presetUsage';
import { activeEntries, type OptionSetKey } from '@/data/options';
import { WEATHER_ICON } from '@/modules/diary/weatherIcons';
import { PresetListEditor } from './PresetListEditor';
import TradesEditor from './TradesEditor';
import PhasesEditor from './PhasesEditor';
import RoomsEditor from './RoomsEditor';
import RoomMapEditor from './RoomMapEditor';

const OVERVIEW = '/einstellungen/voreinstellungen';

function OptionsPage({ preset, setKey }: { preset: PresetDef; setKey: OptionSetKey }) {
  const options = useOptions();
  const usage = usePresetUsage(setKey);
  const [menuOpen, setMenuOpen] = useState(false);
  const entries = options.sets[setKey];
  const visible = activeEntries(entries).length;

  return (
    <>
      <TopBar
        title={preset.title}
        back={OVERVIEW}
        subtitle={`${preset.section} · ${visible === 1 ? '1 Eintrag' : `${visible} Einträge`}`}
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
          setKey={setKey}
          entries={entries}
          usage={usage}
          singular={preset.singular}
          placeholder={preset.placeholder}
          maxLength={preset.maxLength}
          onAdd={(label) => options.add(setKey, label)}
          onRename={(id, label) => options.rename(setKey, id, label)}
          onArchive={(id) => options.archive(setKey, id)}
          onUnarchive={(id) => options.unarchive(setKey, id)}
          onMove={(id, delta) => options.move(setKey, id, delta)}
          onSortAlpha={() => options.sortAlpha(setKey)}
          onReset={() => options.reset(setKey)}
          leading={setKey === 'weather' ? (entry) => <span aria-hidden>{WEATHER_ICON[entry.id] ?? '·'}</span> : undefined}
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
    case 'phases':
      return <PhasesEditor />;
    case 'rooms':
      return <RoomsEditor />;
    case 'roomMap':
      return <RoomMapEditor />;
    case 'options':
      return preset.setKey ? (
        <OptionsPage key={preset.key} preset={preset} setKey={preset.setKey} />
      ) : (
        <Navigate to={OVERVIEW} replace />
      );
  }
}
