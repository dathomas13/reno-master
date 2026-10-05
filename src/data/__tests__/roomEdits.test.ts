import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyRoomEdits, newRoomId, summarizeRoomMap, type RoomEdit } from '../roomEdits';
import { checkSource } from '@/modules/modelBuild/checks';
import { formatSource } from '@/modules/modelBuild/format';
import { parseSource } from '@/modules/modelBuild/source';

// Frozen test data (Ist v0.27, Soll with a Technikraum without area); both runners start in the repository root.
const read = (file: string) => readFileSync(join(process.cwd(), 'tools', 'model', 'testdata', file), 'utf8');
const IST = read('haus-ist.json');
const SOLL = read('haus-soll.json');

function parsed(text: string) {
  const result = parseSource(text);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.source;
}

describe('applyRoomEdits', () => {
  it('the test data is already in the canonical layout', () => {
    expect(formatSource(JSON.parse(IST))).toBe(IST);
    expect(formatSource(JSON.parse(SOLL))).toBe(SOLL);
  });

  it('rename changes only the name, never the id', () => {
    const before = parsed(IST);
    const room = before.rooms[0];
    const edit: RoomEdit = { op: 'rename', variant: 'ist', id: room.id, name: 'Neuer Name' };
    const { text, applied, dropped } = applyRoomEdits(IST, [edit], 'ist');
    expect(applied).toEqual([edit]);
    expect(dropped).toEqual([]);
    const after = parsed(text);
    expect(after.rooms.map((r) => r.id)).toEqual(before.rooms.map((r) => r.id));
    expect(after.rooms[0].name).toBe('Neuer Name');
    expect(after.rooms.slice(1)).toEqual(before.rooms.slice(1));
    expect(after.walls).toEqual(before.walls);
    expect(checkSource(after).errors).toEqual([]);
  });

  it('ignores edits of other variants', () => {
    const edit: RoomEdit = { op: 'rename', variant: 'soll', id: 'kg-technik', name: 'X' };
    const result = applyRoomEdits(IST, [edit], 'ist');
    expect(result.applied).toEqual([]);
    expect(result.dropped).toEqual([]);
    expect(result.text).toBe(IST);
  });

  it('drops an unknown id', () => {
    const edit: RoomEdit = { op: 'rename', variant: 'ist', id: 'gibt-es-nicht', name: 'X' };
    const result = applyRoomEdits(IST, [edit], 'ist');
    expect(result.dropped).toEqual([edit]);
    expect(result.text).toBe(IST);
  });

  it('changes the mapping and keeps the file valid', () => {
    const edit: RoomEdit = { op: 'map', from: 'kg-obst', to: 'kg-technik' };
    const { text, applied } = applyRoomEdits(SOLL, [edit], 'soll');
    expect(applied).toEqual([edit]);
    const after = parsed(text);
    expect(after.roomMap?.['kg-obst']).toBe('kg-technik');
    expect(after.roomMap?.['kg-heizung']).toBe('kg-technik');
    expect(checkSource(after).errors).toEqual([]);
  });

  it('drops a mapping to a room that does not exist', () => {
    const edit: RoomEdit = { op: 'map', from: 'kg-obst', to: 'kg-nirgends' };
    expect(applyRoomEdits(SOLL, [edit], 'soll').dropped).toEqual([edit]);
  });

  it('adds a Soll room without area; the check accepts it', () => {
    const edit: RoomEdit = { op: 'addSoll', id: 'og-ankleide', name: 'Ankleide', floor: 'OG' };
    const { text, applied } = applyRoomEdits(SOLL, [edit], 'soll');
    expect(applied).toEqual([edit]);
    const after = parsed(text);
    expect(after.rooms.at(-1)).toEqual({ id: 'og-ankleide', name: 'Ankleide', floor: 'OG', rects: [] });
    expect(checkSource(after).errors).toEqual([]);
    expect(applyRoomEdits(text, [edit], 'soll').dropped).toEqual([edit]);
  });

  it('is stable: applying nothing returns the same bytes, applying twice the same result', () => {
    expect(applyRoomEdits(SOLL, [], 'soll').text).toBe(SOLL);
    const edits: RoomEdit[] = [
      { op: 'rename', variant: 'soll', id: 'kg-technik', name: 'Haustechnik' },
      { op: 'addSoll', id: 'og-ankleide', name: 'Ankleide', floor: 'OG' },
    ];
    const once = applyRoomEdits(SOLL, edits, 'soll').text;
    const twice = applyRoomEdits(once, [edits[0]], 'soll').text;
    expect(twice).toBe(once);
    expect(formatSource(JSON.parse(once))).toBe(once);
  });
});

describe('newRoomId', () => {
  it('spells umlauts out and makes ids unique', () => {
    expect(newRoomId('Große Küche', 'EG', [])).toBe('eg-grosse-kueche');
    expect(newRoomId('Ankleide', 'OG', ['og-ankleide'])).toBe('og-ankleide-2');
    expect(newRoomId('Ankleide', 'OG', ['og-ankleide', 'og-ankleide-2'])).toBe('og-ankleide-3');
    expect(newRoomId('!!!', 'KG', [])).toBe('kg-raum');
  });
});

describe('summarizeRoomMap', () => {
  it('sorts the Planung rooms into stay, merged, renamed and new', () => {
    const ist = parsed(IST).rooms;
    const soll = parsed(SOLL);
    const summary = summarizeRoomMap(ist, soll.rooms, soll.roomMap ?? {});
    expect(summary.merged.map((m) => m.target.id)).toEqual(['kg-technik']);
    expect(summary.merged[0].sources.map((r) => r.id).sort()).toEqual(['kg-heizung', 'kg-oellager']);
    expect(summary.lost).toEqual([]);
    expect(summary.stay.length + summary.renamed.length + summary.merged.length + summary.added.length)
      .toBe(soll.rooms.length);
  });

  it('finds a new room', () => {
    const summary = summarizeRoomMap(
      [{ id: 'a', name: 'A', floor: 'EG' }],
      [{ id: 'a', name: 'B', floor: 'EG' }, { id: 'n', name: 'N', floor: 'EG' }],
      {},
    );
    expect(summary.renamed).toHaveLength(1);
    expect(summary.added.map((r) => r.id)).toEqual(['n']);
  });
});
