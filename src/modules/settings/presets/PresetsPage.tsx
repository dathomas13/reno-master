import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { useCollection } from '@/data/hooks';
import { loadRoomMap, loadRooms, MODEL_EVENT } from '@/data/models';
import { PRESETS, PRESET_SECTIONS, type PresetDef } from '@/data/presets';
import { useOptions } from '@/data/useOptions';
import { COL, type Phase, type Trade } from '@/data/types';
const NO_MODEL = 'Noch kein Modell auf diesem Gerät';

interface RoomFacts {
  ist: number;
  soll: number;
  merged: number;
  added: number;
}

/** how many Ist rooms, Soll rooms, merges and new rooms; null when the device has no model */
async function loadRoomFacts(): Promise<RoomFacts | null> {
  const [ist, soll, map] = await Promise.all([loadRooms('ist'), loadRooms('soll'), loadRoomMap()]);
  if (ist.rooms.length === 0 && soll.rooms.length === 0) return null;
  const sources = new Map<string, number>();
  for (const target of Object.values(map.map)) sources.set(target, (sources.get(target) ?? 0) + 1);
  const istIds = new Set(ist.rooms.map((room) => room.id));
  return {
    ist: ist.rooms.length,
    soll: soll.rooms.length,
    merged: [...sources.values()].filter((count) => count > 1).length,
    added: soll.rooms.filter((room) => !istIds.has(room.id) && !sources.has(room.id)).length,
  };
}

function useRoomFacts(): { facts: RoomFacts | null; ready: boolean } {
  const [state, setState] = useState<{ facts: RoomFacts | null; ready: boolean }>({ facts: null, ready: false });
  useEffect(() => {
    let current = true;
    const load = () => {
      loadRoomFacts()
        .then((facts) => {
          if (current) setState({ facts, ready: true });
        })
        .catch(() => {
          if (current) setState({ facts: null, ready: true });
        });
    };
    load();
    window.addEventListener(MODEL_EVENT, load);
    return () => {
      current = false;
      window.removeEventListener(MODEL_EVENT, load);
    };
  }, []);
  return state;
}

function Row({ to, title, count, preview }: { to: string; title: string; count?: string; preview?: string }) {
  return (
    <li className="border-b border-line/60 last:border-0">
      <Link to={to} className="flex items-center gap-3 px-4 py-2.5 min-h-14 text-ink active:bg-panel2">
        <span className="min-w-0 flex-1">
          <span className="block">{title}</span>
          {preview && <span className="block text-sm text-muted truncate">{preview}</span>}
        </span>
        {count && <span className="text-sm text-muted tabular-nums shrink-0">{count}</span>}
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-muted shrink-0" fill="none" stroke="currentColor"
          strokeWidth="1.8" aria-hidden="true">
          <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </li>
  );
}

export default function PresetsPage() {
  const { active } = useOptions();
  const { data: trades } = useCollection<Trade>(COL.trades);
  const { data: phases } = useCollection<Phase>(COL.phases);
  const { facts, ready } = useRoomFacts();
  const activeTrades = useMemo(() => trades.filter((trade) => trade.archived !== true), [trades]);
  const activePhases = useMemo(
    () => phases.filter((phase) => phase.archived !== true).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [phases],
  );

  function describe(preset: PresetDef): { count?: string; preview?: string } {
    switch (preset.kind) {
      case 'options': {
        const items = preset.setKey ? active(preset.setKey) : [];
        return { count: String(items.length), preview: items.slice(0, 6).map((entry) => entry.label).join(', ') };
      }
      case 'phases':
        return {
          count: String(activePhases.length),
          preview: activePhases.slice(0, 4).map((phase) => phase.name).join(', '),
        };
      case 'trades':
        return {
          count: String(activeTrades.length),
          preview: activeTrades.slice(0, 6).map((trade) => trade.name).join(', '),
        };
      case 'rooms':
        if (!ready) return {};
        return facts ? { preview: `Bestand ${facts.ist} · Planung ${facts.soll}` } : { preview: NO_MODEL };
      case 'roomMap': {
        if (!ready) return {};
        if (!facts) return { preview: NO_MODEL };
        const parts = [
          facts.merged > 0 ? `${facts.merged} zusammengelegt` : '',
          facts.added > 0 ? `${facts.added} neu` : '',
        ].filter(Boolean);
        return { preview: parts.length ? parts.join(' · ') : 'Alle Räume bleiben' };
      }
    }
  }

  return (
    <>
      <TopBar title="Voreinstellungen" subtitle="Gelten für beide Konten" back="/einstellungen" />
      <div className="max-w-2xl pb-6">
        {PRESET_SECTIONS.map((section) => {
          const presets = PRESETS.filter((preset) => preset.section === section);
          if (presets.length === 0) return null;
          return (
            <section key={section}>
              <h2 className="section-title">{section}</h2>
              <ul className="mx-3 card overflow-hidden">
                {presets.map((preset) => {
                  const { count, preview } = describe(preset);
                  return (
                    <Row
                      key={preset.key}
                      to={`/einstellungen/voreinstellungen/${preset.key}`}
                      title={preset.title}
                      count={count}
                      preview={preview}
                    />
                  );
                })}
              </ul>
            </section>
          );
        })}
        <p className="px-4 pt-4 text-xs text-muted">
          Änderungen gelten sofort für beide Konten. Bestehende Einträge behalten ihre Werte.
        </p>
      </div>
    </>
  );
}
