import { useMemo } from 'react';
import { TopBar } from '@/components/TopBar';
import { previewMap, previewRooms, summarizeRoomMap } from '@/data/roomEdits';
import { useRoomDraft, useRoomTables } from '@/data/useRoomDraft';
import { RoomDraftBar } from './RoomDraftBar';
import { FLOOR_NAMES, FLOOR_ORDER_LIST } from './RoomSheet';

/**
 * Which Planung room each Bestand room becomes. Entries filed under a Bestand room show up
 * under the room chosen here; two Bestand rooms with the same target are merged.
 */
export default function RoomMapEditor() {
  const tables = useRoomTables();
  const draft = useRoomDraft();

  const ist = useMemo(() => previewRooms(tables.ist, draft.edits, 'ist'), [tables.ist, draft.edits]);
  const soll = useMemo(() => previewRooms(tables.soll, draft.edits, 'soll'), [tables.soll, draft.edits]);
  const map = useMemo(() => previewMap(tables.map, draft.edits), [tables.map, draft.edits]);
  const summary = useMemo(() => summarizeRoomMap(ist, soll, map), [ist, soll, map]);

  const parts = [
    summary.merged.length > 0 && `${summary.merged.length} zusammengelegt`,
    summary.renamed.length > 0 && `${summary.renamed.length} umbenannt`,
    summary.added.length > 0 && `${summary.added.length} neu`,
    summary.lost.length > 0 && `${summary.lost.length} ohne Ziel`,
  ].filter(Boolean);
  const subtitle = tables.loaded && ist.length > 0
    ? (parts.length > 0 ? parts.join(' · ') : 'Alle Räume bleiben')
    : 'Bestand → Planung';

  const empty = tables.loaded && (ist.length === 0 || soll.length === 0);

  return (
    <div>
      <TopBar title="Zuordnung Bestand → Planung" subtitle={subtitle} back="/einstellungen/voreinstellungen" />
      <div className="p-4 pb-8">
        <p className="text-xs text-muted">
          Wähle für jeden Bestandsraum, welcher Planungsraum daraus wird. Zeigen zwei Räume auf denselben, sind sie
          zusammengelegt: ihre Einträge erscheinen dann gemeinsam unter dem Planungsraum.
        </p>

        {!tables.loaded && <p className="text-sm text-muted mt-4">Wird geladen…</p>}
        {empty && (
          <p className="text-sm text-muted mt-4">
            Auf diesem Gerät ist noch kein vollständiges Modell. Einmal angemeldet und online öffnen.
          </p>
        )}

        {!empty && FLOOR_ORDER_LIST.map((floor) => {
          const inFloor = ist.filter((r) => r.floor === floor);
          if (inFloor.length === 0) return null;
          return (
            <section key={floor} className="mt-4">
              <h2 className="label">{FLOOR_NAMES[floor]}</h2>
              <ul className="card divide-y divide-line/60">
                {inFloor.map((room) => {
                  const target = map[room.id] ?? room.id;
                  const known = soll.some((r) => r.id === target);
                  const changed = (tables.map[room.id] ?? room.id) !== target;
                  const others = summary.merged.find((m) => m.target.id === target)?.sources.filter((s) => s.id !== room.id);
                  const selectId = `map-${room.id}`;
                  return (
                    <li key={room.id} className="px-4 py-2 flex flex-col gap-1">
                      <label htmlFor={selectId} className="text-sm">
                        {room.name}
                        {changed && <span className="chip chip-on ml-2 py-0 text-xs">geändert</span>}
                      </label>
                      <select
                        id={selectId}
                        className="field min-h-[44px]"
                        value={known ? target : ''}
                        onChange={(event) => {
                          if (event.target.value) draft.add({ op: 'map', from: room.id, to: event.target.value });
                        }}
                      >
                        {!known && <option value="" disabled>Raum fehlt in der Planung</option>}
                        {FLOOR_ORDER_LIST.map((f) => {
                          const options = soll.filter((r) => r.floor === f);
                          if (options.length === 0) return null;
                          return (
                            <optgroup key={f} label={FLOOR_NAMES[f]}>
                              {options.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}{r.isNew ? ' (neu)' : ''}</option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                      {others && others.length > 0 && (
                        <span className="text-xs text-muted">zusammen mit {others.map((o) => o.name).join(', ')}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {!empty && summary.added.length > 0 && (
          <section className="mt-4">
            <h2 className="label">Neu in der Planung</h2>
            <p className="text-sm">{summary.added.map((r) => r.name).join(', ')}</p>
          </section>
        )}

        <p className="text-xs text-muted mt-4">
          Die Zuordnung gilt für beide Konten, sobald veröffentlicht. Es werden keine Einträge verändert.
        </p>

        <RoomDraftBar draft={draft} />
      </div>
    </div>
  );
}
