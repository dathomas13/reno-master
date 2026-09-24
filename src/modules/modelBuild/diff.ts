/**
 * What an imported house file changes compared with the model in use - the report shown
 * before anything is published. Walls and rooms are matched by id; everything else
 * (stairs, dormer, garage …) is compared as a whole.
 */
import type { HouseSource, SourceOpening, SourceRoom, SourceWall } from './source';

export interface SourceDiff {
  /** one German line per change, in the order walls, openings, rooms, rest */
  changes: string[];
  /** room ids the new file no longer has - entries linked to them lose their room */
  removedRoomIds: string[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const m2 = (r: SourceRoom) => (r.rects.reduce((s, [x0, y0, x1, y1]) => s + (x1 - x0) * (y1 - y0), 0) / 1e6)
  .toFixed(2).replace('.', ',');

function wallLabel(w: SourceWall): string {
  return `${w.floor} „${w.name}“`;
}

function coords(before: SourceWall, after: SourceWall): string {
  const keys = ['x0', 'y0', 'x1', 'y1'] as const;
  return keys.filter((k) => before[k] !== after[k]).map((k) => `${k} ${before[k]} → ${after[k]}`).join(', ');
}

function openingText(o: SourceOpening): string {
  const kind = o.kind === 'window' ? 'Fenster' : o.kind === 'door' ? 'Tür' : 'Durchgang';
  return `${kind} ${o.from}–${o.to}`;
}

export function diffSources(base: HouseSource | null, next: HouseSource): SourceDiff {
  if (!base) return { changes: ['Kein bisheriger Stand zum Vergleichen.'], removedRoomIds: [] };
  const changes: string[] = [];

  for (const key of Object.keys(next.params) as (keyof HouseSource['params'])[]) {
    if (base.params[key] !== next.params[key]) changes.push(`Grundmaß ${key}: ${base.params[key]} → ${next.params[key]}`);
  }

  const oldWalls = new Map(base.walls.map((w) => [w.id, w]));
  const newWalls = new Map(next.walls.map((w) => [w.id, w]));
  for (const w of next.walls) {
    const before = oldWalls.get(w.id);
    if (!before) {
      changes.push(`Neue Wand ${wallLabel(w)}, ${w.x1 - w.x0} × ${w.y1 - w.y0} mm`);
      continue;
    }
    const moved = coords(before, w);
    if (moved) changes.push(`Wand ${wallLabel(w)}: ${moved}`);
    if (before.name !== w.name) changes.push(`Wand ${w.id} umbenannt: „${before.name}“ → „${w.name}“`);
    if (before.floor !== w.floor) changes.push(`Wand ${w.id}: Geschoss ${before.floor} → ${w.floor}`);
    if (before.tag !== w.tag) changes.push(`Wand ${wallLabel(w)}: Konfidenz ${before.tag} → ${w.tag}`);
    if (before.tragend !== w.tragend) changes.push(`Wand ${wallLabel(w)}: tragend ${before.tragend ?? 'automatisch'} → ${w.tragend ?? 'automatisch'}`);
    const oldOpenings = (before.openings ?? []).map((o) => JSON.stringify({ ...o, note: undefined }));
    const newOpenings = (w.openings ?? []).map((o) => JSON.stringify({ ...o, note: undefined }));
    const removed = (before.openings ?? []).filter((_, i) => !newOpenings.includes(oldOpenings[i]));
    const added = (w.openings ?? []).filter((_, i) => !oldOpenings.includes(newOpenings[i]));
    for (const o of removed) changes.push(`Wand ${wallLabel(w)}: ${openingText(o)} entfernt oder geändert`);
    for (const o of added) changes.push(`Wand ${wallLabel(w)}: ${openingText(o)} neu oder geändert`);
  }
  for (const w of base.walls) {
    if (!newWalls.has(w.id)) changes.push(`Wand entfernt: ${wallLabel(w)}`);
  }

  const oldRooms = new Map(base.rooms.map((r) => [r.id, r]));
  const newRooms = new Map(next.rooms.map((r) => [r.id, r]));
  for (const r of next.rooms) {
    const before = oldRooms.get(r.id);
    if (!before) {
      changes.push(`Neuer Raum ${r.id} „${r.name}“, ${m2(r)} m²`);
      continue;
    }
    if (before.name !== r.name) changes.push(`Raum ${r.id} umbenannt: „${before.name}“ → „${r.name}“`);
    if (before.floor !== r.floor) changes.push(`Raum ${r.id}: Geschoss ${before.floor} → ${r.floor}`);
    if (!same(before.rects, r.rects)) changes.push(`Raum ${r.id} „${r.name}“: Fläche ${m2(before)} → ${m2(r)} m²`);
  }
  const removedRoomIds = base.rooms.filter((r) => !newRooms.has(r.id)).map((r) => r.id);
  for (const id of removedRoomIds) changes.push(`Raum entfernt: ${id} „${oldRooms.get(id)?.name ?? ''}“`);

  const sections: [keyof HouseSource, string][] = [
    ['stairs', 'Treppen'], ['landings', 'Podeste'], ['slabOpenings', 'Deckenöffnungen'],
    ['slabExtras', 'Deckenstücke'], ['loggiaParapets', 'Loggia-Brüstungen'], ['gaube', 'Gaube'],
    ['balkon', 'Balkon'], ['garage', 'Garage'],
  ];
  for (const [key, label] of sections) if (!same(base[key], next[key])) changes.push(`${label} geändert`);

  return { changes, removedRoomIds };
}
