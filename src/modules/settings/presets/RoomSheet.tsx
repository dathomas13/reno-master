import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { normalizeRoomName, ROOM_NAME_MAX, type RoomFloor, type RoomRow } from '@/data/roomEdits';

export const FLOOR_NAMES: Record<string, string> = {
  KG: 'Keller',
  EG: 'Erdgeschoss',
  OG: 'Obergeschoss',
  GAR: 'Garage',
};
export const FLOOR_ORDER_LIST: RoomFloor[] = ['KG', 'EG', 'OG', 'GAR'];

export interface RoomSheetResult {
  name: string;
  floor: RoomFloor;
  /** Bestand rename only: rename the Planung room with the same id as well */
  alsoSoll: boolean;
}

interface RoomSheetProps {
  open: boolean;
  onClose(): void;
  mode: 'rename' | 'add';
  variant: 'ist' | 'soll';
  /** the room being renamed */
  room?: RoomRow;
  /** every room of the same table, for the warning about a repeated name */
  siblings: RoomRow[];
  /** entries linked to the room */
  usage?: number;
  /** the Planung room that carries the same id as the renamed Bestand room */
  counterpart?: RoomRow;
  onSave(result: RoomSheetResult): void;
}

/** Rename a room, or add a new Planung room (no area yet, ids are never changed). */
export function RoomSheet({ open, onClose, mode, variant, room, siblings, usage, counterpart, onSave }: RoomSheetProps) {
  const [name, setName] = useState('');
  const [floor, setFloor] = useState<RoomFloor>('EG');
  const [alsoSoll, setAlsoSoll] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(room?.name ?? '');
    setFloor((room?.floor as RoomFloor | undefined) ?? 'EG');
    setAlsoSoll(false);
    const timer = window.setTimeout(() => input.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open, room]);

  const clean = normalizeRoomName(name);
  const tooLong = clean.length > ROOM_NAME_MAX;
  const valid = clean.length > 0 && !tooLong;
  const theFloor = mode === 'add' ? floor : (room?.floor ?? floor);
  const twin = valid && siblings.some(
    (r) => r.id !== room?.id && r.floor === theFloor && r.name.localeCompare(clean, 'de', { sensitivity: 'accent' }) === 0,
  );

  function save() {
    if (!valid) return;
    onSave({ name: clean, floor, alsoSoll });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={mode === 'add' ? 'Planungsraum hinzufügen' : 'Raum umbenennen'} doneLabel="Abbrechen">
      <form
        className="p-4 flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div>
          <label htmlFor="room-name" className="label">Name</label>
          <input
            id="room-name"
            ref={input}
            className="field min-h-[44px]"
            value={name}
            maxLength={ROOM_NAME_MAX + 10}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
          {tooLong && <p className="text-xs text-bad mt-1">Höchstens {ROOM_NAME_MAX} Zeichen.</p>}
          {twin && <p className="text-xs text-warn mt-1">Im selben Geschoss gibt es schon einen Raum „{clean}“.</p>}
        </div>

        {mode === 'add' && (
          <div>
            <label htmlFor="room-floor" className="label">Geschoss</label>
            <select
              id="room-floor"
              className="field min-h-[44px]"
              value={floor}
              onChange={(event) => setFloor(event.target.value as RoomFloor)}
            >
              {FLOOR_ORDER_LIST.map((f) => <option key={f} value={f}>{FLOOR_NAMES[f]}</option>)}
            </select>
            <p className="text-xs text-muted mt-2">
              Der neue Raum hat noch keine Fläche: er sammelt schon Einträge, erscheint aber erst im 3D und in den
              Plänen, wenn seine Wände gezeichnet sind.
            </p>
          </div>
        )}

        {mode === 'rename' && room && (
          <p className="text-xs text-muted">
            Die Kennung <code>{room.id}</code> bleibt, damit alle Einträge dem Raum zugeordnet bleiben
            {usage !== undefined && usage > 0 ? ` (${usage} Einträge)` : ''}.
          </p>
        )}

        {mode === 'rename' && variant === 'ist' && counterpart && (
          <label className="flex gap-2 text-sm min-h-[44px] items-center">
            <input type="checkbox" checked={alsoSoll} onChange={(event) => setAlsoSoll(event.target.checked)} className="w-5 h-5" />
            <span>Auch in der Planung umbenennen (dort „{counterpart.name}“)</span>
          </label>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            {mode === 'add' ? 'Hinzufügen' : 'Übernehmen'}
          </button>
        </div>
        <p className="text-xs text-muted">Die Änderung kommt in den Entwurf und gilt erst nach dem Veröffentlichen.</p>
      </form>
    </Sheet>
  );
}
