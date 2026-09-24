/**
 * The house file - format reno-haus/1, the one source of the 3D model.
 *
 * Documented for humans and other tools in tools/model/ANLEITUNG-EXTERN.md. The Python
 * scripts read the same file (tools/model/hausdatei.py). parseSource turns text into a
 * checked document or into a list of German messages that name the exact place
 * ("Wand eg-flur-bad (walls[12]), Öffnung 2: …"), because the person reading them edited
 * the file by hand or through another AI and has to find the spot.
 */

export const SOURCE_FORMAT = 'reno-haus/1';

export type Floor = 'KG' | 'EG' | 'OG' | 'GAR';
export type Tag = 'A' | 'B' | 'C';
export type OpeningKind = 'window' | 'door' | 'passage';

export const FLOORS: Floor[] = ['KG', 'EG', 'OG', 'GAR'];

export interface SourceOpening {
  kind: OpeningKind;
  /** absolute coordinate along the wall: x for an east-west wall, y for a north-south one */
  from: number;
  to: number;
  /** above the floor of the storey */
  sill: number;
  height: number;
  tag: Tag;
  note?: string;
}

export interface SourceWall {
  id: string;
  floor: Floor;
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tag: Tag;
  /** optional override; otherwise a wall of 240 mm or more counts as load bearing */
  tragend?: boolean;
  note?: string;
  openings?: SourceOpening[];
}

export interface SourceStair {
  name: string;
  x0: number;
  y0: number;
  width: number;
  steps: number;
  rise: number;
  run: number;
  z0: number;
  direction: '+x' | '-x' | '+y' | '-y';
  tag: Tag;
}

export interface SourceLanding { name: string; x0: number; y0: number; x1: number; y1: number; z: number; tag: Tag }
export interface SourceSlabExtra {
  floor: Floor; name: string; x0: number; y0: number; x1: number; y1: number; z0: number; tag: Tag;
}
export interface SourceParapet { x0: number; y0: number; x1: number; y1: number; h: number; tag: Tag }

export interface SourceRoom {
  id: string;
  name: string;
  floor: Floor;
  rects: [number, number, number, number][];
  note?: string;
}

export interface HouseParams {
  houseW: number;
  houseD: number;
  tOut: number;
  slab: number;
  storey: number;
  kniestock: number;
  roofPitch: number;
  roofOverhang: number;
  roofT: number;
  ogCeil: number;
  yVor: number;
}

export interface HouseSource {
  format: typeof SOURCE_FORMAT;
  variant: 'ist' | 'soll';
  version: string;
  note: string;
  info?: string[];
  params: HouseParams;
  walls: SourceWall[];
  stairs: SourceStair[];
  landings: SourceLanding[];
  slabOpenings: Partial<Record<'EG' | 'OG', [number, number, number, number]>>;
  slabExtras: SourceSlabExtra[];
  loggiaParapets: SourceParapet[];
  gaube: {
    x0: number; x1: number; depth: number; wallH: number;
    windows: [number, number][]; cheek: [number, number]; tag: Tag;
  };
  balkon: { x0: number; x1: number; y0: number; y1: number; tag: Tag };
  garage: { x: [number, number]; y: [number, number]; z0: number; hFront: number; hBack: number };
  rooms: SourceRoom[];
  /**
   * Soll only: every Ist room id -> the Soll room id it becomes (merges point several
   * old ids at one new one). Read forward only, see src/data/roomNaming.ts.
   */
  roomMap?: Record<string, string>;
}

export type ParseResult =
  /** raw: the file as read, with keys and extra fields untouched - what gets stored again */
  | { ok: true; source: HouseSource; raw: Record<string, unknown> }
  | { ok: false; errors: string[] };

const PARAM_KEYS: (keyof HouseParams)[] = [
  'houseW', 'houseD', 'tOut', 'slab', 'storey', 'kniestock', 'roofPitch', 'roofOverhang', 'roofT',
  'ogCeil', 'yVor',
];

/** A wall runs along its longer side; a square one counts as east-west. */
export function alongX(w: { x0: number; y0: number; x1: number; y1: number }): boolean {
  return (w.x1 - w.x0) >= (w.y1 - w.y0);
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Reads and checks a house file.
 *
 * Only the structure is checked here - numbers where numbers belong, known floors and
 * kinds, x0 < x1. Whether the house makes sense (openings inside their wall, rooms not cut
 * by a wall) is checkSource's job in checks.ts, which runs on the parsed document.
 */
export function parseSource(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    return { ok: false, errors: [`Die Datei ist kein gültiges JSON. ${detail}`.trim()] };
  }
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['Die Datei enthält kein JSON-Objekt.'] };
  if (raw.format !== SOURCE_FORMAT) {
    return {
      ok: false,
      errors: [`Das ist keine Hausdatei (format ist ${JSON.stringify(raw.format)}, erwartet "${SOURCE_FORMAT}").`],
    };
  }
  if (raw.variant !== 'ist' && raw.variant !== 'soll') errors.push('variant muss "ist" oder "soll" sein.');
  if (typeof raw.version !== 'string') errors.push('version fehlt.');

  const num = (v: unknown, where: string): number => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`${where}: Zahl erwartet, gefunden ${JSON.stringify(v)}.`);
      return 0;
    }
    return v;
  };
  const tag = (v: unknown, where: string): Tag => {
    if (v === undefined) return 'C';
    if (v !== 'A' && v !== 'B' && v !== 'C') errors.push(`${where}: tag muss A, B oder C sein.`);
    return v as Tag;
  };
  const floor = (v: unknown, where: string): Floor => {
    if (!FLOORS.includes(v as Floor)) errors.push(`${where}: floor muss KG, EG, OG oder GAR sein.`);
    return v as Floor;
  };
  const list = (v: unknown, where: string): unknown[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      errors.push(`${where}: Liste erwartet.`);
      return [];
    }
    return v;
  };
  const rect = (v: unknown, where: string): [number, number, number, number] => {
    if (!Array.isArray(v) || v.length !== 4) {
      errors.push(`${where}: [x0, y0, x1, y1] erwartet.`);
      return [0, 0, 0, 0];
    }
    const r = v.map((x, i) => num(x, `${where}[${i}]`)) as [number, number, number, number];
    if (!(r[0] < r[2] && r[1] < r[3])) errors.push(`${where}: es muss x0 < x1 und y0 < y1 gelten.`);
    return r;
  };

  const paramsRaw = isObj(raw.params) ? raw.params : (errors.push('params fehlt.'), {});
  const params = {} as HouseParams;
  for (const key of PARAM_KEYS) params[key] = num(paramsRaw[key], `params.${key}`);

  const wallIds = new Set<string>();
  const wallNames = new Set<string>();
  const walls: SourceWall[] = list(raw.walls, 'walls').map((entry, i) => {
    const w = isObj(entry) ? entry : {};
    const label = `Wand ${typeof w.id === 'string' ? w.id : ''} (walls[${i}])`.replace('  ', ' ');
    if (typeof w.id !== 'string' || !w.id) errors.push(`walls[${i}]: id fehlt.`);
    else if (wallIds.has(w.id)) errors.push(`${label}: id kommt doppelt vor.`);
    wallIds.add(String(w.id));
    if (typeof w.name !== 'string' || !w.name) errors.push(`${label}: name fehlt.`);
    const wall: SourceWall = {
      id: String(w.id ?? ''),
      floor: floor(w.floor, label),
      name: String(w.name ?? ''),
      x0: num(w.x0, `${label}.x0`),
      y0: num(w.y0, `${label}.y0`),
      x1: num(w.x1, `${label}.x1`),
      y1: num(w.y1, `${label}.y1`),
      tag: tag(w.tag, label),
    };
    // openings are matched to their wall by floor and name in the Python scripts
    const nameKey = `${wall.floor}|${wall.name}`;
    if (wallNames.has(nameKey)) errors.push(`${label}: Name „${wall.name}“ gibt es im ${wall.floor} schon.`);
    wallNames.add(nameKey);
    if (!(wall.x0 < wall.x1 && wall.y0 < wall.y1)) errors.push(`${label}: es muss x0 < x1 und y0 < y1 gelten.`);
    if (w.tragend !== undefined) {
      if (typeof w.tragend !== 'boolean') errors.push(`${label}: tragend muss true oder false sein.`);
      else wall.tragend = w.tragend;
    }
    if (typeof w.note === 'string') wall.note = w.note;
    const openings = list(w.openings, `${label}.openings`).map((item, k) => {
      const o = isObj(item) ? item : {};
      const where = `${label}, Öffnung ${k + 1}`;
      if (o.kind !== 'window' && o.kind !== 'door' && o.kind !== 'passage') {
        errors.push(`${where}: kind muss window, door oder passage sein.`);
      }
      const opening: SourceOpening = {
        kind: o.kind as OpeningKind,
        from: num(o.from, `${where}.from`),
        to: num(o.to, `${where}.to`),
        sill: o.sill === undefined ? 0 : num(o.sill, `${where}.sill`),
        height: o.kind === 'passage' && o.height === undefined ? 0 : num(o.height, `${where}.height`),
        tag: tag(o.tag, where),
      };
      if (typeof o.note === 'string') opening.note = o.note;
      return opening;
    });
    if (openings.length > 0) wall.openings = openings;
    return wall;
  });

  const direction = (v: unknown, where: string) => {
    if (v !== '+x' && v !== '-x' && v !== '+y' && v !== '-y') errors.push(`${where}: direction muss +x, -x, +y oder -y sein.`);
    return v as SourceStair['direction'];
  };
  const stairs: SourceStair[] = list(raw.stairs, 'stairs').map((entry, i) => {
    const s = isObj(entry) ? entry : {};
    const where = `stairs[${i}]`;
    const steps = num(s.steps, `${where}.steps`);
    if (!Number.isInteger(steps) || steps < 1) errors.push(`${where}.steps: ganze Zahl ab 1 erwartet.`);
    return {
      name: String(s.name ?? `Treppe ${i + 1}`),
      x0: num(s.x0, `${where}.x0`), y0: num(s.y0, `${where}.y0`), width: num(s.width, `${where}.width`),
      steps, rise: num(s.rise, `${where}.rise`), run: num(s.run, `${where}.run`), z0: num(s.z0, `${where}.z0`),
      direction: direction(s.direction, where), tag: tag(s.tag, where),
    };
  });
  const landings: SourceLanding[] = list(raw.landings, 'landings').map((entry, i) => {
    const s = isObj(entry) ? entry : {};
    const where = `landings[${i}]`;
    return {
      name: String(s.name ?? 'Podest'), x0: num(s.x0, `${where}.x0`), y0: num(s.y0, `${where}.y0`),
      x1: num(s.x1, `${where}.x1`), y1: num(s.y1, `${where}.y1`), z: num(s.z, `${where}.z`), tag: tag(s.tag, where),
    };
  });
  const slabOpenings: HouseSource['slabOpenings'] = {};
  if (raw.slabOpenings !== undefined) {
    if (!isObj(raw.slabOpenings)) errors.push('slabOpenings: Objekt erwartet.');
    else {
      for (const [key, value] of Object.entries(raw.slabOpenings)) {
        if (key !== 'EG' && key !== 'OG') errors.push(`slabOpenings.${key}: nur EG und OG möglich.`);
        else slabOpenings[key] = rect(value, `slabOpenings.${key}`);
      }
    }
  }
  const slabExtras: SourceSlabExtra[] = list(raw.slabExtras, 'slabExtras').map((entry, i) => {
    const s = isObj(entry) ? entry : {};
    const where = `slabExtras[${i}]`;
    return {
      floor: floor(s.floor, where), name: String(s.name ?? 'Deckenstück'),
      x0: num(s.x0, `${where}.x0`), y0: num(s.y0, `${where}.y0`), x1: num(s.x1, `${where}.x1`),
      y1: num(s.y1, `${where}.y1`), z0: num(s.z0, `${where}.z0`), tag: tag(s.tag, where),
    };
  });
  const loggiaParapets: SourceParapet[] = list(raw.loggiaParapets, 'loggiaParapets').map((entry, i) => {
    const s = isObj(entry) ? entry : {};
    const where = `loggiaParapets[${i}]`;
    return {
      x0: num(s.x0, `${where}.x0`), y0: num(s.y0, `${where}.y0`), x1: num(s.x1, `${where}.x1`),
      y1: num(s.y1, `${where}.y1`), h: num(s.h, `${where}.h`), tag: tag(s.tag, where),
    };
  });

  const g = isObj(raw.gaube) ? raw.gaube : (errors.push('gaube fehlt.'), {});
  const pair = (v: unknown, where: string): [number, number] => {
    if (!Array.isArray(v) || v.length !== 2) {
      errors.push(`${where}: [a, b] erwartet.`);
      return [0, 0];
    }
    return [num(v[0], `${where}[0]`), num(v[1], `${where}[1]`)];
  };
  const gaube: HouseSource['gaube'] = {
    x0: num(g.x0, 'gaube.x0'), x1: num(g.x1, 'gaube.x1'), depth: num(g.depth, 'gaube.depth'),
    wallH: num(g.wallH, 'gaube.wallH'),
    windows: list(g.windows, 'gaube.windows').map((w, i) => pair(w, `gaube.windows[${i}]`)),
    cheek: g.cheek === undefined ? [120, 120] : pair(g.cheek, 'gaube.cheek'),
    tag: tag(g.tag, 'gaube'),
  };
  const b = isObj(raw.balkon) ? raw.balkon : (errors.push('balkon fehlt.'), {});
  const balkon: HouseSource['balkon'] = {
    x0: num(b.x0, 'balkon.x0'), x1: num(b.x1, 'balkon.x1'), y0: num(b.y0, 'balkon.y0'),
    y1: num(b.y1, 'balkon.y1'), tag: tag(b.tag, 'balkon'),
  };
  const gr = isObj(raw.garage) ? raw.garage : (errors.push('garage fehlt.'), {});
  const garage: HouseSource['garage'] = {
    x: pair(gr.x, 'garage.x'), y: pair(gr.y, 'garage.y'), z0: num(gr.z0, 'garage.z0'),
    hFront: num(gr.hFront, 'garage.hFront'), hBack: num(gr.hBack, 'garage.hBack'),
  };

  const roomIds = new Set<string>();
  const rooms: SourceRoom[] = list(raw.rooms, 'rooms').map((entry, i) => {
    const r = isObj(entry) ? entry : {};
    const where = `Raum ${typeof r.id === 'string' ? r.id : ''} (rooms[${i}])`.replace('  ', ' ');
    if (typeof r.id !== 'string' || !r.id) errors.push(`rooms[${i}]: id fehlt.`);
    else if (roomIds.has(r.id)) errors.push(`${where}: id kommt doppelt vor.`);
    roomIds.add(String(r.id));
    if (typeof r.name !== 'string' || !r.name) errors.push(`${where}: name fehlt.`);
    // no rectangles is allowed: a planned room whose walls are not drawn yet still
    // collects entries, it is just not drawn in 3D and in the plans
    const rects = list(r.rects, `${where}.rects`).map((x, k) => rect(x, `${where}.rects[${k}]`));
    const room: SourceRoom = {
      id: String(r.id ?? ''), name: String(r.name ?? ''), floor: floor(r.floor, where), rects,
    };
    if (typeof r.note === 'string') room.note = r.note;
    return room;
  });

  let roomMap: Record<string, string> | undefined;
  if (raw.roomMap !== undefined) {
    if (!isObj(raw.roomMap)) errors.push('roomMap: Objekt { "ist-id": "soll-id" } erwartet.');
    else {
      roomMap = {};
      for (const [from, to] of Object.entries(raw.roomMap)) {
        if (typeof to !== 'string' || !to) errors.push(`roomMap.${from}: Ziel-id erwartet.`);
        else roomMap[from] = to;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  const source: HouseSource = {
    format: SOURCE_FORMAT,
    variant: raw.variant as 'ist' | 'soll',
    version: String(raw.version),
    note: typeof raw.note === 'string' ? raw.note : '',
    ...(Array.isArray(raw.info) ? { info: raw.info.map(String) } : {}),
    params,
    walls,
    stairs,
    landings,
    slabOpenings,
    slabExtras,
    loggiaParapets,
    gaube,
    balkon,
    garage,
    rooms,
    ...(roomMap ? { roomMap } : {}),
  };
  return { ok: true, source, raw };
}
