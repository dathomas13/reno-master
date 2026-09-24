import { describe, it, expect } from 'vitest';
import {
  compareVersions,
  fitsInDocument,
  isNewer,
  legacySollVersion,
  pickRelease,
  planSync,
  releaseFromDoc,
  releaseToDoc,
  validateRoomMap,
  validateRooms,
  validateScene,
  type ReleaseInfo,
  type ReleaseSource,
} from '@/data/modelRelease';

function release(version: string, source: ReleaseSource): ReleaseInfo {
  return { variant: 'ist', version, updatedAt: '2026-09-16', note: '', source, sceneUrl: 'x' };
}

function scene(prims: unknown[]): unknown {
  return { prims };
}

function prim(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { layer: 'EG', kind: 'wall', tag: 'A', v: [0, 0, 0, 1, 0, 0, 1, 1, 0], t: [0, 1, 2], ...extra };
}

describe('compareVersions', () => {
  it('compares segments as numbers, not as text', () => {
    // the whole point: "0.9" sorts after "0.10" as text, which would hide a new model
    expect(compareVersions('0.10', '0.9')).toBeGreaterThan(0);
    expect(compareVersions('0.9', '0.10')).toBeLessThan(0);
  });

  it('treats equal versions as equal, whatever the length', () => {
    expect(compareVersions('0.23', '0.23')).toBe(0);
    expect(compareVersions('1.0', '1')).toBe(0);
  });

  it('counts a missing segment as zero', () => {
    expect(compareVersions('1.0.1', '1')).toBeGreaterThan(0);
    expect(compareVersions('1', '1.0.1')).toBeLessThan(0);
  });

  it('falls back to text when a segment is not a number', () => {
    expect(compareVersions('0.23b', '0.23a')).toBeGreaterThan(0);
    expect(compareVersions('0.23', '0.23a')).toBeLessThan(0);
  });

  it('isNewer is strict', () => {
    expect(isNewer('0.24', '0.23')).toBe(true);
    expect(isNewer('0.23', '0.23')).toBe(false);
    expect(isNewer('0.22', '0.23')).toBe(false);
  });
});

describe('pickRelease', () => {
  it('takes the highest version, wherever it comes from', () => {
    const picked = pickRelease([release('0.23', 'cache'), release('0.24', 'firestore')]);
    expect(picked?.version).toBe('0.24');
    expect(picked?.source).toBe('firestore');
  });

  it('prefers what is already on the device when the versions are equal', () => {
    // otherwise every start would decode the same model again
    const picked = pickRelease([release('0.23', 'firestore'), release('0.23', 'cache')]);
    expect(picked?.source).toBe('cache');
  });

  it('ignores empty candidates and versionless entries', () => {
    const picked = pickRelease([null, undefined, { ...release('', 'firestore') }, release('0.1', 'cache')]);
    expect(picked?.version).toBe('0.1');
  });

  it('returns null when nothing is reachable', () => {
    expect(pickRelease([null, undefined])).toBeNull();
  });
});

describe('validateScene', () => {
  it('accepts a sound scene', () => {
    expect(validateScene(scene([prim()]))).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    expect(validateScene(null)).not.toBeNull();
    expect(validateScene('{}')).not.toBeNull();
  });

  it('rejects an empty part list', () => {
    expect(validateScene(scene([]))).not.toBeNull();
    expect(validateScene({})).not.toBeNull();
  });

  it('rejects an unknown floor or kind', () => {
    expect(validateScene(scene([prim({ layer: 'ZG' })]))).not.toBeNull();
    expect(validateScene(scene([prim({ kind: 'furniture' })]))).not.toBeNull();
  });

  it('rejects a vertex list that is not whole points', () => {
    expect(validateScene(scene([prim({ v: [0, 0, 0, 1] })]))).not.toBeNull();
  });

  it('rejects a triangle index that points past the vertices', () => {
    // exactly what a truncated download looks like, and it would throw inside three.js
    expect(validateScene(scene([prim({ t: [0, 1, 99] })]))).not.toBeNull();
    expect(validateScene(scene([prim({ t: [0, 1, -1] })]))).not.toBeNull();
  });

  it('rejects a triangle list that is not whole triangles', () => {
    expect(validateScene(scene([prim({ t: [0, 1] })]))).not.toBeNull();
  });
});

describe('validateRooms', () => {
  it('accepts a sound room list, including an empty one', () => {
    expect(validateRooms({ rooms: [] })).toBeNull();
    expect(validateRooms({ rooms: [{ id: 'eg-bad', name: 'Bad', rects: [[0, 0, 1, 1]] }] })).toBeNull();
  });

  it('insists on an id, because diary and costs hang on it', () => {
    expect(validateRooms({ rooms: [{ name: 'Bad', rects: [] }] })).not.toBeNull();
    expect(validateRooms({ rooms: [{ id: '', name: 'Bad', rects: [] }] })).not.toBeNull();
  });

  it('rejects a missing list', () => {
    expect(validateRooms({})).not.toBeNull();
    expect(validateRooms(null)).not.toBeNull();
  });

  it('accepts a room without rectangles - not surveyed yet, not an error', () => {
    expect(validateRooms({ rooms: [{ id: 'kg-technik', name: 'Technikraum', rects: [] }] })).toBeNull();
  });
});

describe('validateRoomMap', () => {
  it('accepts a sound mapping, including an empty one', () => {
    expect(validateRoomMap({ map: {} })).toBeNull();
    expect(validateRoomMap({ map: { 'kg-heizung': 'kg-technik' } })).toBeNull();
  });

  it('rejects a missing or malformed map', () => {
    expect(validateRoomMap({})).not.toBeNull();
    expect(validateRoomMap(null)).not.toBeNull();
    expect(validateRoomMap({ map: [] })).not.toBeNull();
  });

  it('rejects an entry without a target', () => {
    expect(validateRoomMap({ map: { 'kg-heizung': '' } })).not.toBeNull();
  });
});

describe('releaseFromDoc', () => {
  it('reads a document that carries the scene inline', () => {
    const info = releaseFromDoc('ist', { version: '0.24', note: 'neu', generatedAt: '2026-09-16', scene: '{}' });
    expect(info?.version).toBe('0.24');
    expect(info?.updatedAt).toBe('2026-09-16');
    expect(info?.source).toBe('firestore');
    expect(info?.sceneJson).toBe('{}');
  });

  it('reads a document that only points at a URL', () => {
    const info = releaseFromDoc('soll', { version: '0.5', sceneUrl: 'https://example.test/soll.json' });
    expect(info?.sceneUrl).toBe('https://example.test/soll.json');
    expect(info?.variant).toBe('soll');
  });

  it('ignores a document without a version or without a payload', () => {
    expect(releaseFromDoc('ist', { scene: '{}' })).toBeNull();
    expect(releaseFromDoc('ist', { version: '0.24' })).toBeNull();
    expect(releaseFromDoc('ist', null)).toBeNull();
  });
});

describe('releaseToDoc', () => {
  it('carries version, note and payload, and clears rooms when there are none', () => {
    const doc = releaseToDoc('ist', '0.24', 'Bad neu', '2026-09-16', '{"prims":[]}', null);
    expect(doc.version).toBe('0.24');
    expect(doc.note).toBe('Bad neu');
    expect(doc.bytes).toBe('{"prims":[]}'.length);
    // the document is merged, so an empty room list has to be written, not omitted
    expect(doc.rooms).toBeNull();
  });

  it('keeps the model date out of the audit field the server writes', () => {
    // saveDoc stamps updatedAt with serverTimestamp, so the model date needs its own key
    const doc = releaseToDoc('ist', '0.24', '', '2026-09-16', '{"prims":[]}', null);
    expect(doc.generatedAt).toBe('2026-09-16');
    expect('updatedAt' in doc).toBe(false);
  });

  it('round trips through releaseFromDoc', () => {
    const doc = releaseToDoc('soll', '0.24', 'x', '2026-09-16', '{"prims":[]}', '{"rooms":[]}');
    const info = releaseFromDoc('soll', doc);
    expect(info?.version).toBe('0.24');
    expect(info?.roomsJson).toBe('{"rooms":[]}');
  });

  it('carries the house file along, and clears it for a bare scene', () => {
    const withSource = releaseToDoc('ist', '0.26', '', '2026-09-24', '{"prims":[]}', null, '{"format":"reno-haus/1"}');
    expect(releaseFromDoc('ist', withSource)?.sourceJson).toBe('{"format":"reno-haus/1"}');
    // merged document: a scene published without a house file must not keep the old one
    expect(releaseToDoc('ist', '0.27', '', '2026-09-24', '{"prims":[]}', null).source).toBeNull();
  });
});

describe('fitsInDocument', () => {
  it('lets a normal model through', () => {
    expect(fitsInDocument('x'.repeat(96_000), 'y'.repeat(8_000))).toBe(true);
  });

  it('stops a model that would be refused by Firestore', () => {
    expect(fitsInDocument('x'.repeat(990_000), null)).toBe(false);
  });

  it('counts the house file too', () => {
    expect(fitsInDocument('x'.repeat(500_000), null, 'z'.repeat(490_000))).toBe(false);
  });
});

describe('planSync', () => {
  it('fetches nothing when the newest release is already on the device', () => {
    const plan = planSync([release('0.23', 'cache'), release('0.23', 'firestore')]);
    expect(plan?.action).toBe('keep');
    expect(plan?.release.source).toBe('cache');
  });

  it('stores a newer published model', () => {
    const plan = planSync([release('0.23', 'cache'), release('0.24', 'firestore')]);
    expect(plan?.action).toBe('download');
    expect(plan?.release.source).toBe('firestore');
  });

  it('never steps back to an older published model', () => {
    const plan = planSync([release('0.25', 'cache'), release('0.24', 'firestore')]);
    expect(plan?.action).toBe('keep');
    expect(plan?.release.version).toBe('0.25');
  });

  it('has nothing to do when no release is reachable', () => {
    expect(planSync([null, undefined])).toBeNull();
  });
});

describe('legacySollVersion', () => {
  it('moves the old Soll numbers below the new ones', () => {
    expect(legacySollVersion('0.24')).toBe('0.0.24');
    expect(legacySollVersion('0.23')).toBe('0.0.23');
    expect(isNewer('0.1', '0.0.24')).toBe(true);
    expect(isNewer('0.0.24', '0.0')).toBe(true);
  });

  it('leaves the fresh start, the new numbers and anything else alone', () => {
    expect(legacySollVersion('0.0')).toBeNull();
    expect(legacySollVersion('0.1')).toBeNull();
    expect(legacySollVersion('0.0.24')).toBeNull();
    expect(legacySollVersion('1.2')).toBeNull();
  });
});
