import { describe, expect, it } from 'vitest';
import {
  footprintBox,
  guessUnit,
  itemLabel,
  modelSizeMm,
  newItem,
  normalizeRotation,
  parseFurnitureDoc,
  roomAt,
  roomCentre,
  snapPosition,
  sticksOut,
  type FurnitureItem,
  type RoomLike,
} from '@/modules/furniture/placement';

const bath: RoomLike = { id: 'og-bad', name: 'Bad', floor: 'OG', rects: [[400, 400, 2400, 3000]] };
const hall: RoomLike = { id: 'og-flur', name: 'Flur', floor: 'OG', rects: [[2515, 400, 4000, 3000]] };
// L-shaped: a main part and an alcove to the north
const living: RoomLike = {
  id: 'eg-wohnen',
  name: 'Wohnen',
  floor: 'EG',
  rects: [
    [400, 400, 5000, 4000],
    [400, 4000, 2000, 5000],
  ],
};
const rooms = [bath, hall, living];

function wc(patch: Partial<FurnitureItem> = {}): FurnitureItem {
  return { id: 'a', type: 'wc', floor: 'OG', x: 1000, y: 2000, z: 0, rot: 0, w: 370, d: 540, h: 420, ...patch };
}

describe('parseFurnitureDoc', () => {
  it('reads items and models and drops what cannot be drawn', () => {
    const state = parseFurnitureDoc({
      items: {
        good: { type: 'wc', floor: 'OG', x: 1000, y: 2000, rot: 450, w: 370, d: 540, h: 420 },
        noFloor: { type: 'wc', x: 1, y: 1, w: 10, d: 10, h: 10 },
        badSize: { type: 'wc', floor: 'OG', x: 1, y: 1, w: 0, d: 10, h: 10 },
        nan: { type: 'wc', floor: 'EG', x: Number.NaN, y: 1, w: 10, d: 10, h: 10 },
        orphan: { type: 'model', modelId: 'gone', floor: 'EG', x: 1, y: 1, w: 10, d: 10, h: 10 },
        own: { type: 'model', modelId: 'm1', floor: 'EG', x: 1, y: 1, w: 10, d: 10, h: 10, name: '  Sessel Oma ' },
      },
      models: {
        m1: { name: 'Sessel', storagePath: 'moebel/m1.glb', w: 800, d: 800, h: 900, bytes: 1234, uploadState: 'pending' },
        broken: { name: 'kaputt', w: 1, d: 1, h: 1 },
      },
    });
    expect(state.items.map((item) => item.id)).toEqual(['good', 'own']);
    expect(state.items[0]).toMatchObject({ rot: 90, z: 0 });
    expect(state.items[1]!.name).toBe('Sessel Oma');
    expect(state.models.map((model) => model.id)).toEqual(['m1']);
    expect(state.models[0]!.uploadState).toBe('pending');
  });

  it('copes with a missing or strange document', () => {
    expect(parseFurnitureDoc(null)).toEqual({ items: [], models: [] });
    expect(parseFurnitureDoc({ items: 'x', models: 3 })).toEqual({ items: [], models: [] });
  });
});

describe('rotation and footprint', () => {
  it('normalises rotations', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(720)).toBe(0);
    expect(normalizeRotation(359.99999)).toBe(0);
    expect(normalizeRotation(15 * 25)).toBe(15);
  });

  it('swaps width and depth on a quarter turn', () => {
    expect(footprintBox(wc())).toEqual({ x0: 815, y0: 1730, x1: 1185, y1: 2270 });
    expect(footprintBox(wc({ rot: 90 }))).toEqual({ x0: 730, y0: 1815, x1: 1270, y1: 2185 });
  });
});

describe('rooms', () => {
  it('finds the room a piece stands in, per storey', () => {
    expect(roomAt(rooms, 'OG', 1000, 2000)?.id).toBe('og-bad');
    expect(roomAt(rooms, 'EG', 1000, 2000)?.id).toBe('eg-wohnen');
    expect(roomAt(rooms, 'EG', 1000, 4500)?.id).toBe('eg-wohnen');
    expect(roomAt(rooms, 'KG', 1000, 2000)).toBeNull();
  });

  it('tells when a piece reaches into a wall', () => {
    expect(sticksOut(wc(), rooms)).toBe(false);
    expect(sticksOut(wc({ x: 2300 }), rooms)).toBe(true);
    // exactly at the wall is inside
    expect(sticksOut(wc({ x: 2400 - 185 }), rooms)).toBe(false);
    expect(sticksOut(wc({ floor: 'KG' }), rooms)).toBe(true);
  });

  it('puts the centre of an L-shaped room into its larger part', () => {
    expect(roomCentre(living)).toEqual({ x: 2700, y: 2200 });
    expect(roomCentre({ id: 'x', name: 'x', floor: 'EG', rects: [] })).toBeNull();
  });
});

describe('snapPosition', () => {
  it('pushes a piece against the nearest wall', () => {
    // back of the WC 60 mm from the north wall of the bath (y1 = 3000)
    const item = wc({ rot: 180 });
    const result = snapPosition(item, 1000, 3000 - 270 - 60, rooms);
    expect(result).toEqual({ x: 1000, y: 3000 - 270, snapped: true });
  });

  it('snaps into a corner on both axes', () => {
    const result = snapPosition(wc(), 400 + 185 + 50, 400 + 270 + 30, rooms);
    expect(result).toEqual({ x: 585, y: 670, snapped: true });
  });

  it('uses the turned footprint', () => {
    // turned by 90 degrees the WC is 540 wide in x
    const result = snapPosition(wc({ rot: 90 }), 400 + 270 + 80, 2000, rooms);
    expect(result.x).toBe(670);
  });

  it('keeps to a 10 mm grid away from the walls', () => {
    expect(snapPosition(wc(), 1234.4, 1777.7, rooms)).toEqual({ x: 1230, y: 1780, snapped: false });
  });

  it('does not snap outside any room', () => {
    expect(snapPosition(wc({ floor: 'KG' }), 1234, 1777, rooms)).toEqual({ x: 1230, y: 1780, snapped: false });
  });
});

describe('newItem', () => {
  it('takes size and mounting height from the catalog', () => {
    const item = newItem('n1', 'haengeschrank', 'EG', { x: 1004, y: 2996 });
    expect(item).toMatchObject({ x: 1000, y: 3000, z: 1450, w: 1200, d: 350, h: 700, rot: 0 });
    expect(itemLabel(item)).toBe('Hängeschrank');
  });

  it('places a model with its own size', () => {
    const item = newItem('n2', 'model', 'OG', { x: 0, y: 0 }, { w: 800, d: 700, h: 900 }, 'm1');
    expect(item).toMatchObject({ type: 'model', modelId: 'm1', w: 800, z: 0 });
    expect(itemLabel(item, [{ id: 'm1', name: 'Ohrensessel', storagePath: 'p', w: 1, d: 1, h: 1, bytes: 0 }])).toBe('Ohrensessel');
  });
});

describe('model files', () => {
  it('guesses the unit a file was made in', () => {
    expect(guessUnit([0.8, 0.9, 0.7])).toBe(1);
    expect(guessUnit([80, 90, 70])).toBe(0.01);
    expect(guessUnit([360, 62, 91])).toBe(0.01);
    expect(guessUnit([800, 900, 700])).toBe(0.001);
    expect(guessUnit([8000, 9000, 7000])).toBe(0.001);
    expect(guessUnit([0, 0, 0])).toBe(1);
  });

  it('turns a glTF box into width, depth and height in mm', () => {
    // glTF: y is up, z towards the viewer
    expect(modelSizeMm([0.8, 0.9, 0.7])).toEqual({ w: 800, d: 700, h: 900 });
    expect(modelSizeMm([45, 85, 50])).toEqual({ w: 450, d: 500, h: 850 });
  });
});
