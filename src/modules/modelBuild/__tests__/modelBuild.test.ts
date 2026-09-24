import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pyRound } from '../pyRound';
import { buildScene } from '../buildScene';
import { buildRooms, checkSource } from '../checks';
import { diffSources } from '../diff';
import { buildDxf } from '../dxf';
import { formatSource } from '../format';
import { parseSource, type HouseSource } from '../source';
import { nextVersion, prepareImport } from '../index';
import { buildPlanSvg, PLAN_FLOORS, pyFixed } from '../plansSvg';

// both runners (vitest, tools/verify) start in the repository root
const read = (file: string) => readFileSync(join(process.cwd(), 'public', 'models', file), 'utf8');

function istSource(): { text: string; source: HouseSource } {
  const text = read('haus-ist.json');
  const parsed = parseSource(text);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return { text, source: parsed.source };
}

interface EditDoc {
  note?: string;
  walls: { id: string; x0: number; x1: number; openings: { from: number; to: number }[] }[];
  rooms: { id: string; rects: number[][] }[];
}

/** a deep copy to edit in a test */
function edited(change: (doc: EditDoc) => void): string {
  const doc = JSON.parse(read('haus-ist.json'));
  change(doc);
  return JSON.stringify(doc);
}

describe('pyRound', () => {
  it('rounds like Python: exact ties to even, everything else to the nearest', () => {
    expect(pyRound(-2578.125, 2)).toBe(-2578.12);
    expect(pyRound(0.125, 2)).toBe(0.12);
    expect(pyRound(0.375, 2)).toBe(0.38);
    expect(pyRound(2.5)).toBe(2);
    expect(pyRound(3.5)).toBe(4);
    // 1.005 is really 1.00499999999999989… in binary, so it goes down
    expect(pyRound(1.005, 2)).toBe(1);
    expect(pyRound(196.42857142857142, 1)).toBe(196.4);
  });
});

describe('the house file', () => {
  it('builds the same scene as tools/model/build_scene_lite.py', () => {
    const { source } = istSource();
    const reference = JSON.parse(read('ist.json'));
    const scene = buildScene(source, { version: '0.25', note: '', generatedAt: '2026-09-24' });
    expect(scene.prims.length).toBe(reference.prims.length);
    for (let i = 0; i < reference.prims.length; i += 1) {
      const mine = scene.prims[i];
      const theirs = reference.prims[i];
      expect(`${i} ${mine.layer} ${mine.name} ${mine.kind} ${mine.tag} ${mine.tragend}`)
        .toBe(`${i} ${theirs.layer} ${theirs.name} ${theirs.kind} ${theirs.tag} ${theirs.tragend}`);
      expect(JSON.stringify(mine.v) === JSON.stringify(theirs.v)).toBe(true);
      expect(JSON.stringify(mine.t) === JSON.stringify(theirs.t)).toBe(true);
      expect(mine.bb).toEqual(theirs.bb);
    }
  });

  it('builds the same rooms as tools/model/build_rooms.py', () => {
    const { source } = istSource();
    const reference = JSON.parse(read('rooms-ist.json'));
    expect(buildRooms(source, reference.generatedAt)).toEqual(reference);
  });

  it('is laid out exactly as tools/model/hausdatei.py writes it', () => {
    const { text } = istSource();
    expect(formatSource(JSON.parse(text)) === text).toBe(true);
    expect(formatSource(JSON.parse(read('haus-soll.json'))) === read('haus-soll.json')).toBe(true);
  });

  it('passes its own checks', () => {
    const { source } = istSource();
    expect(checkSource(source).errors).toEqual([]);
  });
});

describe('parseSource', () => {
  it('refuses a file that is not a house file', () => {
    const result = parseSource('{"prims": []}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch('keine Hausdatei');
  });

  it('refuses broken JSON with a readable message', () => {
    const result = parseSource('{"format": "reno-haus/1",');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch('kein gültiges JSON');
  });

  it('names the wall and the field that is wrong', () => {
    const result = parseSource(edited((doc) => {
      (doc.walls[3] as unknown as Record<string, unknown>).x1 = 'viel';
    }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join('\n')).toMatch('eg-aussenwand-ost (walls[3]).x1');
  });
});

describe('checkSource', () => {
  it('finds an opening that sticks out of its wall', () => {
    const parsed = parseSource(edited((doc) => {
      doc.walls[0].openings[0].to = 9000;
    }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(checkSource(parsed.source).errors.join('\n')).toMatch('liegt nicht in der Wand');
  });

  it('finds a room cut by a wall', () => {
    const parsed = parseSource(edited((doc) => {
      const room = doc.rooms.find((r) => r.id === 'eg-wohnzimmer');
      if (room) room.rects = [[400, 400, 8245, 6000]];
    }));
    if (!parsed.ok) throw new Error('parse failed');
    const errors = checkSource(parsed.source).errors.join('\n');
    expect(errors).toMatch('eg-wohnzimmer');
    expect(errors).toMatch('geht durch den Raum');
  });
});

describe('prepareImport', () => {
  it('builds, versions and reports a moved wall', () => {
    const { source: base } = istSource();
    const text = edited((doc) => {
      const wall = doc.walls.find((w) => w.id === 'eg-gard-wc-13');
      if (!wall) throw new Error('wall missing');
      wall.x0 += 20;
      wall.x1 += 20;
      doc.note = 'Wand verschoben';
    });
    const result = prepareImport({ text, base, version: '0.26', today: '2026-09-24' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.meta.version).toBe('0.26');
    expect(result.scene.meta.note).toBe('Wand verschoben');
    expect(result.changes.join('\n')).toMatch('x0 8870 → 8890');
    expect(JSON.parse(result.sourceText).version).toBe('0.26');
    expect(result.removedRoomIds).toEqual([]);
  });

  it('refuses an import with errors and builds nothing', () => {
    const { source: base } = istSource();
    const text = edited((doc) => {
      doc.walls[0].openings[0].from = -500;
    });
    const result = prepareImport({ text, base, version: '0.26', today: '2026-09-24' });
    expect(result.ok).toBe(false);
  });

  it('reports removed room ids', () => {
    const { source: base } = istSource();
    const text = edited((doc) => {
      doc.rooms = doc.rooms.filter((r) => r.id !== 'eg-speise');
    });
    const result = prepareImport({ text, base, version: '0.26', today: '2026-09-24' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.removedRoomIds).toEqual(['eg-speise']);
  });

  it('warns when the file is based on an older version than the one in use', () => {
    const { source } = istSource();
    const base = { ...source, version: '0.30' };
    const result = prepareImport({ text: read('haus-ist.json'), base, version: '0.31', today: '2026-09-24' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings[0]).toMatch('beruht auf v0.25');
  });
});

describe('diffSources', () => {
  it('says nothing changed for the same file', () => {
    const { source } = istSource();
    expect(diffSources(source, source).changes).toEqual([]);
  });
});

describe('nextVersion', () => {
  it('counts the last segment up', () => {
    expect(nextVersion('0.25')).toBe('0.26');
    expect(nextVersion('0.99')).toBe('0.100');
    expect(nextVersion('0.0')).toBe('0.1');
    expect(nextVersion('1')).toBe('1.1');
  });
});

describe('buildDxf', () => {
  it('writes every floor on its own layers, in mm', () => {
    const { source } = istSource();
    const dxf = buildDxf(source);
    expect(dxf).toMatch('$INSUNITS');
    expect(dxf).toMatch('EG_WAND_A');
    expect(dxf).toMatch('KG_RAUMTEXT');
    expect(dxf).toMatch('Essk\\U+00FCche');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
  });
});

describe('buildPlanSvg', () => {
  it('draws the same plans as tools/model/build_plans_svg.py, byte for byte', () => {
    const manifest = JSON.parse(read('manifest.json'));
    for (const variant of ['ist', 'soll'] as const) {
      const parsed = parseSource(read(`haus-${variant}.json`));
      if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
      const rooms = buildRooms(parsed.source, '');
      for (const floor of PLAN_FLOORS) {
        const committed = readFileSync(join(process.cwd(), 'public', 'plans', `${variant}-${floor}.svg`), 'utf8');
        const mine = buildPlanSvg(parsed.source, rooms, floor, manifest[variant].version);
        expect(`${variant}-${floor} ${mine === committed}`).toBe(`${variant}-${floor} true`);
      }
    }
  });

  it('follows a moved wall', () => {
    const parsed = parseSource(edited((doc) => {
      const wall = doc.walls.find((w) => w.id === 'eg-gard-wc-13');
      if (!wall) throw new Error('wall missing');
      wall.x0 += 20;
      wall.x1 += 20;
    }));
    if (!parsed.ok) throw new Error('parse failed');
    const svg = buildPlanSvg(parsed.source, buildRooms(parsed.source, ''), 'EG', '0.26');
    expect(svg).toMatch('x="8890"');
    expect(svg).toMatch('Modell v0.26');
  });
});

describe('pyFixed', () => {
  it('formats like Python f-strings', () => {
    expect(pyFixed(2.5)).toBe('2');
    expect(pyFixed(3.5)).toBe('4');
    expect(pyFixed(-0.3)).toBe('-0');
    // 12.995 is really 12.99499… in binary, so Python says 12.99
    expect(pyFixed(12.995, 2)).toBe('12.99');
    expect(pyFixed(12.345, 1)).toBe('12.3');
  });
});
