import { useMemo, useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { newRoomId, previewMap, previewRooms, type RoomRow } from '@/data/roomEdits';
import { useRoomDraft, useRoomTables, useRoomUsage } from '@/data/useRoomDraft';
import { RoomDraftBar } from './RoomDraftBar';
import { FLOOR_NAMES, FLOOR_ORDER_LIST, RoomSheet, type RoomSheetResult } from './RoomSheet';

type Table = 'ist' | 'soll';

type SheetState = { mode: 'rename'; room: RoomRow } | { mode: 'add' } | null;

const m2 = (value: number) => `${value.toFixed(1).replace('.', ',')} m²`;

/**
 * Names of the rooms - Bestand and Planung each have their own. Ids never change; a new
 * Planung room starts without an area. Changes collect in a draft and go out together
 * through the same publish path as „Modell importieren“.
 */
export default function RoomsEditor() {
  const tables = useRoomTables();
  const draft = useRoomDraft();
  const countFor = useRoomUsage();
  const [table, setTable] = useState<Table>('ist');
  const [sheet, setSheet] = useState<SheetState>(null);

  const rows = useMemo(
    () => previewRooms(table === 'ist' ? tables.ist : tables.soll, draft.edits, table),
    [tables.ist, tables.soll, table, draft.edits],
  );
  const sollRows = useMemo(() => previewRooms(tables.soll, draft.edits, 'soll'), [tables.soll, draft.edits]);
  const map = useMemo(() => previewMap(tables.map, draft.edits), [tables.map, draft.edits]);

  /** every stored id that counts towards a row: for a Planung room also its Bestand predecessors */
  function usageOf(row: RoomRow): number {
    if (table === 'ist') return countFor([row.id]);
    const predecessors = tables.ist.filter((r) => (map[r.id] ?? r.id) === row.id).map((r) => r.id);
    return countFor([row.id, ...predecessors]);
  }

  function save(result: RoomSheetResult) {
    if (!sheet) return;
    if (sheet.mode === 'add') {
      const id = newRoomId(result.name, result.floor, [...tables.soll.map((r) => r.id), ...sollRows.map((r) => r.id)]);
      draft.add({ op: 'addSoll', id, name: result.name, floor: result.floor });
      return;
    }
    const { room } = sheet;
    draft.add({ op: 'rename', variant: table, id: room.id, name: result.name });
    if (table === 'ist' && result.alsoSoll) draft.add({ op: 'rename', variant: 'soll', id: room.id, name: result.name });
  }

  const counterpart = sheet?.mode === 'rename' && table === 'ist'
    ? sollRows.find((r) => r.id === sheet.room.id)
    : undefined;

  const empty = tables.loaded && rows.length === 0;

  return (
    <div>
      <TopBar
        title="Räume"
        subtitle={table === 'ist' ? 'Bestand' : 'Planung'}
        back="/einstellungen/voreinstellungen"
      />
      <div className="p-4 pb-8">
        <div className="flex gap-2" role="tablist" aria-label="Raumliste">
          {([['ist', 'Bestand'], ['soll', 'Planung']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={table === key}
              className={`chip min-h-[44px] px-4 ${table === key ? 'chip-on' : ''}`}
              onClick={() => setTable(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted mt-3">
          {table === 'ist'
            ? 'Der Bestand zeigt das Haus, wie es ist. Namen ändern, die Kennung bleibt.'
            : 'Die Planung zeigt das Haus nach dem Umbau. Neue Räume haben zuerst keine Fläche.'}
        </p>

        {!tables.loaded && <p className="text-sm text-muted mt-4">Wird geladen…</p>}
        {empty && (
          <p className="text-sm text-muted mt-4">
            Auf diesem Gerät ist noch kein Modell. Einmal angemeldet und online öffnen – danach geht es auch offline.
          </p>
        )}

        {FLOOR_ORDER_LIST.map((floor) => {
          const inFloor = rows.filter((r) => r.floor === floor);
          if (inFloor.length === 0) return null;
          return (
            <section key={floor} className="mt-4">
              <h2 className="label">{FLOOR_NAMES[floor]}</h2>
              <ul className="card divide-y divide-line/60">
                {inFloor.map((row) => {
                  const used = usageOf(row);
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="w-full min-h-[56px] px-4 py-2 flex items-center gap-3 text-left active:bg-panel2"
                        aria-label={`${row.name} umbenennen`}
                        onClick={() => setSheet({ mode: 'rename', room: row })}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            {row.name}
                            {row.isNew && <span className="chip chip-on ml-2 py-0 text-xs">neu</span>}
                            {row.changed && !row.isNew && <span className="chip chip-on ml-2 py-0 text-xs">geändert</span>}
                          </span>
                          <span className="block text-xs text-muted truncate">
                            {row.id}{row.areaM2 !== undefined ? ` · ${m2(row.areaM2)}` : ' · ohne Fläche'}
                          </span>
                        </span>
                        <span className="text-sm text-muted tabular-nums">{used}×</span>
                        <span aria-hidden="true" className="text-muted">›</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        {table === 'soll' && (
          <button type="button" className="btn btn-primary w-full mt-5" onClick={() => setSheet({ mode: 'add' })}>
            ＋ Planungsraum hinzufügen
          </button>
        )}

        <p className="text-xs text-muted mt-4">
          Namen gelten für beide Konten, sobald veröffentlicht. Bestehende Einträge bleiben ihrem Raum zugeordnet.
        </p>

        <RoomDraftBar draft={draft} />
      </div>

      <RoomSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        mode={sheet?.mode ?? 'rename'}
        variant={table}
        room={sheet?.mode === 'rename' ? sheet.room : undefined}
        siblings={rows}
        usage={sheet?.mode === 'rename' ? usageOf(sheet.room) : undefined}
        counterpart={counterpart}
        onSave={save}
      />
    </div>
  );
}
