import { useMemo, useState } from 'react';
import { Sheet } from './Sheet';
import { useRooms } from '@/data/RoomsContext';
import { useCollection } from '@/data/hooks';
import { COL, type Phase, type Trade } from '@/data/types';
import { LAYER_LABEL, type Layer } from '@/modules/viewer3d/houseScene';

interface MultiPickerProps {
  label: string;
  value: string[];
  onChange(value: string[]): void;
  options: { id: string; name: string; group?: string }[];
  emptyLabel?: string;
  onAdd?(): void;
  addLabel?: string;
}

/** compact multi select: shows the picked names, opens a sheet with the full list */
export function MultiPicker({ label, value, onChange, options, emptyLabel = 'keine', onAdd, addLabel }: MultiPickerProps) {
  const [open, setOpen] = useState(false);
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const groups = useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const option of options) {
      const key = option.group ?? '';
      map.set(key, [...(map.get(key) ?? []), option]);
    }
    return [...map.entries()];
  }, [options]);

  const picked = value.map((id) => byId.get(id)?.name ?? id);

  return (
    <>
      <button type="button" className="field text-left flex items-center gap-2" onClick={() => setOpen(true)}>
        <span className={`flex-1 truncate ${picked.length ? '' : 'text-muted'}`}>
          {picked.length ? picked.join(', ') : emptyLabel}
        </span>
        <span className="text-muted">›</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="pb-4">
          {groups.map(([group, entries]) => (
            <div key={group}>
              {group && <div className="section-title">{group}</div>}
              {entries.map((option) => {
                const on = value.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className="list-row w-full text-left"
                    onClick={() =>
                      onChange(on ? value.filter((id) => id !== option.id) : [...value, option.id])
                    }
                  >
                    <span className={`w-5 ${on ? 'text-accent' : 'text-transparent'}`}>✓</span>
                    <span className="flex-1">{option.name}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {value.length > 0 && (
            <button type="button" className="btn btn-ghost w-full mt-2" onClick={() => onChange([])}>
              Auswahl leeren
            </button>
          )}
          {onAdd && (
            <button type="button" className="btn w-full mt-2" onClick={onAdd}>
              {addLabel ?? 'Hinzufügen'}
            </button>
          )}
        </div>
      </Sheet>
    </>
  );
}

interface StringMultiPickerProps {
  label: string;
  value: string[];
  options: string[];
  onChange(value: string[]): void;
  onAdd(): void;
  emptyLabel: string;
  addLabel: string;
}

/** a `MultiPicker` over a flat, editable list of names rather than ids - roles, people */
function StringMultiPicker({ label, value, options, onChange, onAdd, emptyLabel, addLabel }: StringMultiPickerProps) {
  return (
    <MultiPicker
      label={label}
      value={value}
      onChange={onChange}
      options={options.map((name) => ({ id: name, name }))}
      emptyLabel={emptyLabel}
      onAdd={onAdd}
      addLabel={addLabel}
    />
  );
}

export function PeoplePicker({
  value,
  options,
  onChange,
  onAdd,
}: {
  value: string[];
  options: string[];
  onChange(value: string[]): void;
  onAdd(): void;
}) {
  return (
    <StringMultiPicker
      label="Anwesend"
      value={value}
      options={options}
      onChange={onChange}
      onAdd={onAdd}
      emptyLabel="niemand ausgewählt"
      addLabel="Person hinzufügen"
    />
  );
}

/** a contact's roles/Gewerke, e.g. "Elektriker" - erweiterbar: new roles are added inline */
export function RolePicker({
  value,
  options,
  onChange,
  onAdd,
}: {
  value: string[];
  options: string[];
  onChange(value: string[]): void;
  onAdd(): void;
}) {
  return (
    <StringMultiPicker
      label="Rollen"
      value={value}
      options={options}
      onChange={onChange}
      onAdd={onAdd}
      emptyLabel="keine Rolle"
      addLabel="Rolle hinzufügen"
    />
  );
}

/**
 * `value`/`onChange` operate on stored room ids, which may predate the active naming
 * (an old entry keeps its Ist id even once the picker offers Soll rooms). MultiPicker
 * only knows how to check off exactly the ids in its own `options`, so this translates
 * both ways: a stored id shows checked under whichever option id it resolves to now,
 * and toggling an option adds/removes every stored id that belongs to it (`idsFor`),
 * never just the one that happened to be there.
 */
export function RoomPicker({ value, onChange }: { value: string[]; onChange(value: string[]): void }) {
  const { rooms, idsFor, writeId } = useRooms();
  const options = useMemo(
    () =>
      rooms.map((room) => ({
        id: room.id,
        name: room.name,
        group: LAYER_LABEL[room.floor as Layer] ?? room.floor,
      })),
    [rooms],
  );

  const displayValue = useMemo(() => {
    const shown = new Set<string>();
    for (const raw of value) {
      const option = options.find((o) => idsFor(o.id).includes(raw));
      shown.add(option ? option.id : raw);
    }
    return [...shown];
  }, [value, options, idsFor]);

  function handleChange(nextDisplay: string[]) {
    const removed = displayValue.filter((id) => !nextDisplay.includes(id));
    const added = nextDisplay.filter((id) => !displayValue.includes(id));
    const removedRaw = removed.flatMap((id) => idsFor(id));
    const kept = value.filter((raw) => !removedRaw.includes(raw));
    onChange([...new Set([...kept, ...added.map(writeId)])]);
  }

  return (
    <MultiPicker label="Räume" value={displayValue} onChange={handleChange} options={options} emptyLabel="kein Raum" />
  );
}

export function TradePicker({ value, onChange }: { value: string[]; onChange(value: string[]): void }) {
  const { data } = useCollection<Trade>(COL.trades);
  const options = [...data]
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((trade) => ({ id: trade.id, name: trade.name }));
  return <MultiPicker label="Gewerke" value={value} onChange={onChange} options={options} emptyLabel="kein Gewerk" />;
}

export function PhaseSelect({ value, onChange }: { value?: string; onChange(value: string | undefined): void }) {
  const { data } = useCollection<Phase>(COL.phases);
  const phases = [...data].sort((a, b) => a.order - b.order);
  return (
    <select className="field" value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
      <option value="">keine Phase</option>
      {phases.map((phase) => (
        <option key={phase.id} value={phase.id}>
          {phase.name}
        </option>
      ))}
    </select>
  );
}

export function TradeSelect({ value, onChange }: { value?: string; onChange(value: string | undefined): void }) {
  const { data } = useCollection<Trade>(COL.trades);
  const trades = [...data].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return (
    <select className="field" value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
      <option value="">kein Gewerk</option>
      {trades.map((trade) => (
        <option key={trade.id} value={trade.id}>
          {trade.name}
        </option>
      ))}
    </select>
  );
}
