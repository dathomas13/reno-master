import { describe, it, expect } from 'vitest';
import { buildRoomNaming, disambiguatedNames, resolveInVariant, roomsWithLinkedNames, type RoomLike } from '@/data/roomNaming';

function room(id: string, name: string, floor = 'KG'): RoomLike {
  return { id, name, floor, areaM2: 10 };
}

// A small house: two rooms merge into one Technikraum, one room is a pure rename, one
// room is untouched, and Wintergarten is genuinely new (no Ist predecessor).
const ist = [
  room('kg-heizung', 'Heizung'),
  room('kg-oellager', 'Öllager'),
  room('kg-wohnzimmer', 'Wohnzimmer'),
  room('og-g', 'Garderobe (?)'),
  room('eg-esskueche', 'Essküche'),
  room('kg-esskueche', 'Essküche'), // same name, different floor - must stay a separate room
];

const soll = [
  room('kg-technik', 'Technikraum'),
  room('kg-wohnzimmer', 'Wohnzimmer'),
  room('og-g', 'Garderobe'), // pure rename, same id
  room('eg-esskueche', 'Essküche'),
  room('kg-esskueche', 'Essküche'),
  room('kg-wintergarten', 'Wintergarten'), // new room, no Ist predecessor
];

const map = {
  'kg-heizung': 'kg-technik',
  'kg-oellager': 'kg-technik',
  'kg-wohnzimmer': 'kg-wohnzimmer',
  'og-g': 'og-g',
  'eg-esskueche': 'eg-esskueche',
  'kg-esskueche': 'kg-esskueche',
};

describe('buildRoomNaming - bestand', () => {
  const view = buildRoomNaming(ist, soll, map, 'bestand');

  it('lists the Ist rooms', () => {
    expect(view.rooms.map((r) => r.id).sort()).toEqual([...ist].map((r) => r.id).sort());
  });

  it('shows an Ist id as its own Ist room', () => {
    expect(view.roomFor('kg-heizung')?.name).toBe('Heizung');
    expect(view.roomFor('kg-oellager')?.name).toBe('Öllager');
  });

  it('shows a Soll-only id under its Soll name, never as a blank room', () => {
    expect(view.roomFor('kg-technik')?.name).toBe('Technikraum');
    expect(view.roomFor('kg-wintergarten')?.name).toBe('Wintergarten');
  });

  it('falls back to the raw id for something neither table knows', () => {
    expect(view.roomFor('does-not-exist')).toBeUndefined();
  });

  it('keeps same-name rooms on different floors apart', () => {
    expect(view.idsFor('kg-esskueche')).toEqual(['kg-esskueche']);
    expect(view.idsFor('eg-esskueche')).toEqual(['eg-esskueche']);
  });
});

describe('buildRoomNaming - planung', () => {
  const view = buildRoomNaming(ist, soll, map, 'planung');

  it('lists the Soll rooms', () => {
    expect(view.rooms.map((r) => r.id).sort()).toEqual([...soll].map((r) => r.id).sort());
  });

  it('resolves a merged Ist id forward to the merged Soll room', () => {
    expect(view.roomFor('kg-heizung')?.name).toBe('Technikraum');
    expect(view.roomFor('kg-oellager')?.name).toBe('Technikraum');
    expect(view.roomFor('kg-technik')?.name).toBe('Technikraum');
  });

  it('collects every predecessor id for the merged room', () => {
    expect(view.idsFor('kg-technik').sort()).toEqual(['kg-heizung', 'kg-oellager', 'kg-technik'].sort());
  });

  it('does not aggregate a predecessor viewed on its own - Heizung alone stays alone', () => {
    // opened directly (e.g. from the Ist 3D model, which still shows Heizung and
    // Öllager as two separate rooms), "Heizung" must not pull in Öllager's entries
    expect(view.idsFor('kg-heizung')).toEqual(['kg-heizung']);
    expect(view.idsFor('kg-oellager')).toEqual(['kg-oellager']);
  });

  it('does not merge an unrelated, unmapped room', () => {
    expect(view.idsFor('kg-wohnzimmer')).toEqual(['kg-wohnzimmer']);
  });

  it('resolves a pure rename (same id, new name)', () => {
    expect(view.roomFor('og-g')?.name).toBe('Garderobe');
  });

  it('matches() finds an entry filed under any predecessor', () => {
    expect(view.matches(['kg-heizung'], 'kg-technik')).toBe(true);
    expect(view.matches(['kg-oellager'], 'kg-technik')).toBe(true);
    expect(view.matches(['kg-technik'], 'kg-technik')).toBe(true);
    expect(view.matches(['kg-wohnzimmer'], 'kg-technik')).toBe(false);
  });

  it('writeId returns the id the caller already resolved to', () => {
    expect(view.writeId('kg-technik')).toBe('kg-technik');
  });
});

describe('buildRoomNaming - aliases', () => {
  it('gives the merged room its predecessors as aliases, so old names stay searchable', () => {
    const planung = buildRoomNaming(ist, soll, map, 'planung');
    expect(planung.aliases('kg-technik').sort()).toEqual(['Heizung', 'Öllager']);
  });

  it('gives a predecessor room its successor name as an alias, in the other direction', () => {
    const bestand = buildRoomNaming(ist, soll, map, 'bestand');
    expect(bestand.aliases('kg-heizung')).toEqual(['Technikraum']);
  });

  it('gives no alias when nothing differs', () => {
    const bestand = buildRoomNaming(ist, soll, map, 'bestand');
    expect(bestand.aliases('kg-wohnzimmer')).toEqual([]);
  });

  it('gives a renamed room the other name as its only alias', () => {
    const bestand = buildRoomNaming(ist, soll, map, 'bestand');
    expect(bestand.aliases('og-g')).toEqual(['Garderobe']);
  });
});

describe('resolveInVariant - the 3D viewer, one side at a time', () => {
  const withArea = (id: string, name: string, areaM2?: number): RoomLike => ({ id, name, floor: 'KG', areaM2 });
  const istSide = [withArea('kg-heizung', 'Heizung', 6.17), withArea('kg-oellager', 'Öllager', 10.48)];
  const sollSide = [withArea('kg-technik', 'Technikraum')];
  const map = { 'kg-heizung': 'kg-technik', 'kg-oellager': 'kg-technik' };

  it('resolves forward on the Soll side, always uniquely', () => {
    expect(resolveInVariant('kg-heizung', 'soll', sollSide, map)?.id).toBe('kg-technik');
    expect(resolveInVariant('kg-technik', 'soll', sollSide, map)?.id).toBe('kg-technik');
  });

  it('resolves an Ist id directly, without consulting the map', () => {
    expect(resolveInVariant('kg-heizung', 'ist', istSide, map)?.id).toBe('kg-heizung');
  });

  it('picks the largest predecessor when a Soll id merges several Ist rooms', () => {
    // Öllager (10.48 m²) is bigger than Heizung (6.17 m²) - the link highlights it
    expect(resolveInVariant('kg-technik', 'ist', istSide, map)?.name).toBe('Öllager');
  });

  it('falls back to the first listed predecessor when none has a surveyed area', () => {
    const noArea = istSide.map((r) => ({ ...r, areaM2: undefined }));
    expect(resolveInVariant('kg-technik', 'ist', noArea, map)?.id).toBe('kg-heizung');
  });

  it('finds nothing for an id with no predecessor on this side', () => {
    expect(resolveInVariant('does-not-exist', 'ist', istSide, map)).toBeUndefined();
  });
});

describe('disambiguatedNames', () => {
  const floorLabel = { KG: 'Keller', EG: 'Erdgeschoss', OG: 'Obergeschoss' };

  it('leaves a unique name alone', () => {
    const names = disambiguatedNames([room('kg-wohnzimmer', 'Wohnzimmer', 'KG')], floorLabel);
    expect(names.get('kg-wohnzimmer')).toBe('Wohnzimmer');
  });

  it('appends the floor only where the name repeats', () => {
    const names = disambiguatedNames(
      [room('kg-wohnzimmer', 'Wohnzimmer', 'KG'), room('eg-wohnzimmer', 'Wohnzimmer', 'EG'), room('og-diele', 'Diele', 'OG')],
      floorLabel,
    );
    expect(names.get('kg-wohnzimmer')).toBe('Wohnzimmer (Keller)');
    expect(names.get('eg-wohnzimmer')).toBe('Wohnzimmer (Erdgeschoss)');
    expect(names.get('og-diele')).toBe('Diele');
  });
});

describe('buildRoomNaming - degrades gracefully without a mapping', () => {
  it('an empty map still resolves every id to itself', () => {
    const view = buildRoomNaming(ist, soll, {}, 'planung');
    expect(view.roomFor('kg-heizung')?.id).toBe('kg-heizung');
    expect(view.idsFor('kg-heizung')).toEqual(['kg-heizung']);
    expect(view.matches(['kg-heizung'], 'kg-heizung')).toBe(true);
  });
});

describe('roomsWithLinkedNames', () => {
  const ist = [
    { id: 'kg-heizung', name: 'Heizung', floor: 'KG' },
    { id: 'kg-oellager', name: 'Öllager', floor: 'KG' },
    { id: 'eg-bad', name: 'Bad', floor: 'EG' },
  ];
  const soll = [
    { id: 'kg-technik', name: 'Technikraum', floor: 'KG' },
    { id: 'eg-bad', name: 'Bad', floor: 'EG' },
  ];
  const map = { 'kg-heizung': 'kg-technik', 'kg-oellager': 'kg-technik', 'eg-bad': 'eg-bad' };

  it('lists the rooms of both tables once, whichever naming is set', () => {
    for (const naming of ['bestand', 'planung'] as const) {
      const ids = roomsWithLinkedNames(ist, soll, map, naming).map((room) => room.id).sort();
      expect(ids).toEqual(['eg-bad', 'kg-heizung', 'kg-oellager', 'kg-technik']);
    }
  });

  it('links a merged room to each of its predecessors, and each predecessor to it', () => {
    const rooms = roomsWithLinkedNames(ist, soll, map, 'planung');
    const byId = new Map(rooms.map((room) => [room.id, room]));
    expect([...(byId.get('kg-technik')?.aliases ?? [])].sort()).toEqual(['Heizung', 'Öllager']);
    expect(byId.get('kg-heizung')?.aliases).toEqual(['Technikraum']);
    expect(byId.get('eg-bad')?.aliases).toEqual([]);
  });
});
