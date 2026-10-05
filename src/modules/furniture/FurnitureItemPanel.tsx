import { useState } from 'react';
import { CmInput, cm, sizeLabel } from './FurnitureCatalog';
import {
  clampSize,
  itemLabel,
  normalizeRotation,
  roomAt,
  sticksOut,
  type FurnitureItem,
  type FurnitureModel,
  type RoomLike,
} from './placement';

interface Props {
  item: FurnitureItem;
  models: FurnitureModel[];
  rooms: RoomLike[];
  /** false outside the editor: the panel only tells what the piece is */
  editing: boolean;
  onChange(next: FurnitureItem): void;
  onDuplicate(): void;
  onDelete(): void;
  onEdit(): void;
  onClose(): void;
}

const TURNS: [string, number][] = [
  ['↺ 90°', 90],
  ['↺ 15°', 15],
  ['↻ 15°', -15],
  ['↻ 90°', -90],
];

/** the chosen piece: what it is, where it stands, and - in the editor - turning and sizing it */
export function FurnitureItemPanel({ item, models, rooms, editing, onChange, onDuplicate, onDelete, onEdit, onClose }: Props) {
  const [sizing, setSizing] = useState(false);
  const room = roomAt(rooms, item.floor, item.x, item.y);
  const out = sticksOut(item, rooms);

  const set = (key: 'w' | 'd' | 'h' | 'z', text: string) => {
    const value = Number(text.replace(',', '.')) * 10;
    if (!Number.isFinite(value)) return;
    const next = key === 'z' ? Math.max(0, Math.min(5000, Math.round(value))) : clampSize(value);
    if (next !== item[key]) onChange({ ...item, [key]: next });
  };

  return (
    <div className="card p-3 pointer-events-auto max-h-[45dvh] overflow-y-auto border-l-4 border-l-accent">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{itemLabel(item, models)}</div>
          <div className="text-xs text-muted">
            {room ? room.name : `${item.floor}, kein Raum`} · {sizeLabel(item)}
            {item.z > 0 ? ` · ${cm(item.z)} cm über Boden` : ''}
            {item.rot ? ` · ${item.rot.toLocaleString('de-DE')}°` : ''}
          </div>
          {out && <div className="text-xs text-warn mt-0.5">Steht nicht ganz im Raum – ragt in eine Wand oder nebenan.</div>}
        </div>
        <button type="button" className="btn btn-ghost px-2 py-1 min-h-0" onClick={onClose}>
          ×
        </button>
      </div>

      {!editing && (
        <button type="button" className="chip mt-2" onClick={onEdit}>
          Bearbeiten
        </button>
      )}

      {editing && (
        <>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {TURNS.map(([label, step]) => (
              <button
                key={label}
                type="button"
                className="chip"
                onClick={() => onChange({ ...item, rot: normalizeRotation(item.rot + step) })}
              >
                {label}
              </button>
            ))}
            <button type="button" className={`chip ${sizing ? 'chip-on' : ''}`} onClick={() => setSizing(!sizing)}>
              Maße
            </button>
            <button type="button" className="chip" onClick={onDuplicate}>
              Kopie
            </button>
            <button type="button" className="chip border-bad text-bad" onClick={onDelete}>
              Löschen
            </button>
          </div>

          {sizing && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    ['w', 'Breite'],
                    ['d', 'Tiefe'],
                    ['h', 'Höhe'],
                    ['z', 'Über Boden'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="label text-[10px]">{label} cm</span>
                    <CmInput value={item[key]} onCommit={(text) => set(key, text)} />
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="label text-[10px]">Name</span>
                <NameInput
                  value={item.name ?? ''}
                  placeholder={itemLabel({ ...item, name: undefined }, models)}
                  onCommit={(name) => {
                    const next = { ...item };
                    if (name) next.name = name;
                    else delete next.name;
                    if ((next.name ?? '') !== (item.name ?? '')) onChange(next);
                  }}
                />
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NameInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit(name: string): void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      className="field"
      value={text ?? value}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        if (text !== null) onCommit(text.trim());
        setText(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
      }}
    />
  );
}
