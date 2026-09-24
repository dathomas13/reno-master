/**
 * The floor plans of a house file as DXF, for viewing and drawing over in any CAD program.
 *
 * ASCII DXF R12 - the oldest dialect, the one every program reads. Units mm, origin and
 * axes exactly as in the house file, so a new survey drawn on top of it can be read off
 * directly. All floors lie on top of each other and are told apart by layer:
 *
 *   EG_WAND_A / _B / _C   walls by confidence, closed polylines
 *   EG_FENSTER, EG_TUER, EG_DURCHGANG   openings, as the part of the wall they take
 *   EG_RAUM               room rectangles;  EG_RAUMTEXT  id, name and area
 *   EG_TREPPE             stair outlines (the storey the flight starts in)
 *
 * Export only. The way back is the house file - see ANLEITUNG-EXTERN.md.
 */
import { alongX, FLOORS, type HouseSource } from './source';

type Rect = [number, number, number, number];

const COLORS: Record<string, number> = {
  WAND_A: 7, WAND_B: 2, WAND_C: 1, FENSTER: 5, TUER: 3, DURCHGANG: 8, RAUM: 9, RAUMTEXT: 4, TREPPE: 6,
};

/** DXF R12 is not Unicode; \U+XXXX is how AutoCAD and QCAD spell a non-ASCII character */
function dxfText(text: string): string {
  return [...text].map((ch) => {
    const code = ch.codePointAt(0) ?? 63;
    return code < 128 ? ch : `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
  }).join('');
}

function n(v: number): string {
  return String(Math.round(v * 10) / 10);
}

export function buildDxf(src: HouseSource): string {
  const out: string[] = [];
  const put = (...pairs: (string | number)[]) => {
    for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), String(pairs[i + 1]));
  };
  const layers = new Set<string>();

  const rect = (layer: string, [x0, y0, x1, y1]: Rect) => {
    layers.add(layer);
    put(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, 1);
    for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) put(0, 'VERTEX', 8, layer, 10, n(x), 20, n(y), 30, 0);
    put(0, 'SEQEND', 8, layer);
  };
  const text = (layer: string, x: number, y: number, height: number, value: string) => {
    layers.add(layer);
    put(0, 'TEXT', 8, layer, 10, n(x), 20, n(y), 30, 0, 40, height, 1, dxfText(value), 72, 1, 11, n(x), 21, n(y), 31, 0);
  };

  for (const floor of FLOORS) {
    for (const w of src.walls.filter((x) => x.floor === floor)) {
      rect(`${floor}_WAND_${w.tag}`, [w.x0, w.y0, w.x1, w.y1]);
      for (const o of w.openings ?? []) {
        const layer = `${floor}_${o.kind === 'window' ? 'FENSTER' : o.kind === 'door' ? 'TUER' : 'DURCHGANG'}`;
        rect(layer, alongX(w) ? [o.from, w.y0, o.to, w.y1] : [w.x0, o.from, w.x1, o.to]);
      }
    }
    for (const room of src.rooms.filter((r) => r.floor === floor)) {
      for (const r of room.rects) rect(`${floor}_RAUM`, r);
      const [x0, y0, x1, y1] = room.rects[0];
      const area = room.rects.reduce((s, [a, b, c, d]) => s + (c - a) * (d - b), 0) / 1e6;
      text(`${floor}_RAUMTEXT`, (x0 + x1) / 2, (y0 + y1) / 2 + 120, 180, room.name);
      text(`${floor}_RAUMTEXT`, (x0 + x1) / 2, (y0 + y1) / 2 - 180, 110,
        `${room.id} · ${area.toFixed(2).replace('.', ',')} m²`);
    }
  }
  for (const s of src.stairs) {
    const floor = s.z0 < 0 ? 'KG' : 'EG';
    const length = s.steps * s.run;
    const r: Rect = s.direction === '+x' ? [s.x0, s.y0, s.x0 + length, s.y0 + s.width]
      : s.direction === '-x' ? [s.x0 - length, s.y0, s.x0, s.y0 + s.width]
        : s.direction === '+y' ? [s.x0, s.y0, s.x0 + s.width, s.y0 + length]
          : [s.x0, s.y0 - length, s.x0 + s.width, s.y0];
    rect(`${floor}_TREPPE`, r);
  }

  const head: string[] = [];
  const hput = (...pairs: (string | number)[]) => {
    for (let i = 0; i < pairs.length; i += 2) head.push(String(pairs[i]), String(pairs[i + 1]));
  };
  hput(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  hput(0, 'SECTION', 2, 'TABLES');
  hput(0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
  hput(0, 'TABLE', 2, 'LAYER', 70, layers.size);
  for (const layer of [...layers].sort()) {
    hput(0, 'LAYER', 2, layer, 70, 0, 62, COLORS[layer.slice(layer.indexOf('_') + 1)] ?? 7, 6, 'CONTINUOUS');
  }
  hput(0, 'ENDTAB', 0, 'ENDSEC');
  return [...head, '0', 'SECTION', '2', 'ENTITIES', ...out, '0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n';
}
