/**
 * A generated floor plan as a vector PDF, true to scale on a standard sheet.
 *
 * No PDF library: the plan SVG comes from our own builder (modelBuild/plansSvg.ts) and
 * uses a handful of elements and classes only - rect, line, path (M/l/z), text with an
 * optional rotate() - so this file reads exactly that and writes the PDF operators by
 * hand. Lines stay lines and text stays text, so the sheet prints sharp at any size and
 * the text can be searched. The colours and sizes below mirror STYLE in plansSvg.ts; a
 * test makes sure every class the builder writes is known here.
 *
 * Fonts are the PDF base fonts Helvetica and Helvetica-Bold (Arial has the same metrics)
 * in WinAnsiEncoding, which covers German text, "²" and "·". Nothing is embedded.
 *
 * The scale is the largest usual architect's scale at which the whole drawing fits the
 * sheet (1:100 for a floor on A4); portrait or landscape is chosen for the larger scale.
 */

export type PaperFormat = 'A4' | 'A3' | 'A2' | 'A1';

/** portrait width × height in mm */
export const PAPER: Record<PaperFormat, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
};
export const PAPER_FORMATS = Object.keys(PAPER) as PaperFormat[];

/** usual scales of building plans, largest first */
export const SCALES = [20, 25, 50, 100, 200, 250, 500, 1000];

const MARGIN = 10; // mm on every side of the sheet
const FOOTER = 6; // mm below the drawing for the scale line
const PT = 72 / 25.4; // PDF points per mm

export interface PlanPdfLayout {
  paper: PaperFormat;
  landscape: boolean;
  /** 100 means 1:100 */
  scale: number;
  /** sheet size in mm */
  pageW: number;
  pageH: number;
}

/** the largest scale at which a drawing of w × h mm (model) fits the sheet, null if none */
export function choosePlanLayout(drawingW: number, drawingH: number, paper: PaperFormat): PlanPdfLayout | null {
  let best: PlanPdfLayout | null = null;
  // on a tie the sheet follows the drawing: a wide plan goes landscape
  for (const landscape of drawingW > drawingH ? [true, false] : [false, true]) {
    const [pw, ph] = PAPER[paper];
    const pageW = landscape ? ph : pw;
    const pageH = landscape ? pw : ph;
    const roomW = pageW - 2 * MARGIN;
    const roomH = pageH - 2 * MARGIN - FOOTER;
    const scale = SCALES.find((s) => drawingW / s <= roomW && drawingH / s <= roomH);
    if (scale === undefined) continue;
    if (!best || scale < best.scale) best = { paper, landscape, scale, pageW, pageH };
  }
  return best;
}

// ---- reading the plan SVG -----------------------------------------------------------

interface SvgElement {
  tag: string;
  cls: string;
  attrs: Record<string, string>;
  text?: string;
}

interface ParsedPlan {
  viewBox: [number, number, number, number];
  attrs: Record<string, string>;
  elements: SvgElement[];
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function readAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(/([a-zA-Z][a-zA-Z0-9:-]*)="([^"]*)"/g)) attrs[match[1]] = unescapeXml(match[2]);
  return attrs;
}

export function parsePlanSvg(svg: string): ParsedPlan {
  const root = /<svg\b([^>]*)>/.exec(svg);
  if (!root) throw new Error('Das ist kein Plan aus dem Modell.');
  const attrs = readAttrs(root[1]);
  const box = (attrs.viewBox ?? '').split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some((v) => !Number.isFinite(v)) || box[2] <= 0 || box[3] <= 0) {
    throw new Error('Der Plan hat keine gültige Größe.');
  }
  // style and defs hold CSS and the hatch pattern, not drawing
  const body = svg.slice(root.index + root[0].length)
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<defs>[\s\S]*?<\/defs>/g, '');
  const elements: SvgElement[] = [];
  const tag = /<(rect|line|path|text)\b([^>]*?)(\/?)>/g;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(body))) {
    const elementAttrs = readAttrs(match[2]);
    const element: SvgElement = { tag: match[1], cls: elementAttrs.class ?? '', attrs: elementAttrs };
    if (match[1] === 'text' && match[3] !== '/') {
      const end = body.indexOf('</text>', tag.lastIndex);
      if (end < 0) break;
      element.text = unescapeXml(body.slice(tag.lastIndex, end));
      tag.lastIndex = end + 7;
    }
    elements.push(element);
  }
  return { viewBox: box as [number, number, number, number], attrs, elements };
}

// ---- the look of each class (mirrors STYLE in plansSvg.ts) ----------------------------

const INK = '#111111';
const MUTED = '#555555';
const PAPER_COLOR = '#ffffff';
const DIM = '#c62828';
const DOOR = '#2e7d32';
const STAIR = '#333333';
const HATCH = { color: '#8a8a8a', width: 18, spacing: 120 };

interface ShapeStyle {
  fill?: string;
  stroke?: string;
  width?: number;
  dash?: number[];
  hatch?: true;
}

interface TextStyle {
  color: string;
  size: number;
  middle: boolean;
  bold?: boolean;
  /** white outline behind the text (paint-order: stroke), its width */
  halo?: number;
}

export const SHAPE_STYLES: Record<string, ShapeStyle | null> = {
  room: null, // invisible tap area
  'wall-edge': { fill: INK, stroke: INK, width: 30 },
  wall: { fill: '#d6d6d6', stroke: '#d6d6d6', width: 8 },
  'wall light': { fill: '#5f5f5f', stroke: '#5f5f5f', width: 8 },
  'wall-c': { hatch: true },
  gap: { fill: PAPER_COLOR },
  jamb: { stroke: INK, width: 15 },
  glass: { stroke: '#1f6fb2', width: 12 },
  'door-line': { stroke: DOOR, width: 12, dash: [60, 40] },
  'slide-leaf': { fill: DOOR },
  'slide-rail': { stroke: DOOR, width: 8 },
  stair: { stroke: STAIR, width: 12 },
  'stair-run': { stroke: STAIR, width: 15 },
  'stair-arrow': { fill: STAIR },
  dim: { stroke: DIM, width: 10 },
  'dim-tick': { stroke: DIM, width: 22 },
  scale: { stroke: INK, width: 14 },
  north: { fill: INK },
};

export const TEXT_STYLES: Record<string, TextStyle> = {
  'room-label': { color: INK, size: 230, middle: true, halo: 60 },
  'room-area': { color: INK, size: 170, middle: true, halo: 50 },
  'room-size': { color: MUTED, size: 140, middle: true, halo: 50 },
  'opening-text': { color: INK, size: 110, middle: true, halo: 40 },
  'dim-text': { color: DIM, size: 150, middle: true },
  'dim-text small': { color: DIM, size: 110, middle: true },
  'scale-text': { color: INK, size: 170, middle: true },
  legend: { color: MUTED, size: 150, middle: false },
  title: { color: INK, size: 380, middle: false, bold: true },
  subtitle: { color: MUTED, size: 200, middle: false },
  'north-text': { color: INK, size: 260, middle: true, bold: true },
};

// ---- text: WinAnsi bytes and Helvetica widths -------------------------------------------

/** Unicode -> WinAnsi for the range 0x80-0x9F, where cp1252 differs from Latin-1 */
const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** the WinAnsi codes of a text; what the encoding lacks becomes "?" */
export function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 63;
    if (code >= 32 && code < 127) out.push(code);
    else if (code >= 0xa0 && code <= 0xff) out.push(code);
    else if (CP1252_HIGH[code]) out.push(CP1252_HIGH[code]);
    else if (code === 0x2212) out.push(45); // minus sign
    else out.push(63);
  }
  return out;
}

// advance widths in 1/1000 em for the codes 32..255 (Adobe AFM, as reportlab has them)
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667,
  556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556,
  556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722,
  500, 500, 500, 334, 260, 334, 584, 278, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0,
  611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556,
  556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365,
  556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722,
  722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889,
  500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556,
  500, 556, 500,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722,
  611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556,
  611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778,
  556, 556, 500, 389, 280, 389, 584, 278, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0,
  611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556,
  556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365,
  556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722,
  722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889,
  556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611,
  556, 611, 556,
];

/** width of WinAnsi codes in em */
export function textWidth(codes: number[], bold = false): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  return codes.reduce((sum, code) => sum + (table[code - 32] ?? 556), 0) / 1000;
}

function pdfString(codes: number[]): string {
  let out = '(';
  for (const code of codes) {
    if (code === 40 || code === 41 || code === 92) out += `\\${String.fromCharCode(code)}`;
    else out += String.fromCharCode(code);
  }
  return `${out})`;
}

// ---- writing the PDF ----------------------------------------------------------------------

function num(v: number): string {
  const rounded = Math.round(v * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function rgb(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => num(c / 255)).join(' ');
}

function attrNum(element: SvgElement, name: string): number {
  return Number(element.attrs[name] ?? 0);
}

/** "M x y l dx dy … z" as our builder writes it -> PDF path operators */
function pathOps(d: string): string {
  const tokens = d.match(/[MmLlZz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const ops: string[] = [];
  let x = 0;
  let y = 0;
  let command = 'M';
  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i];
    if (/[A-Za-z]/.test(token)) {
      command = token;
      i += 1;
      if (command === 'z' || command === 'Z') ops.push('h');
      continue;
    }
    const a = Number(tokens[i]);
    const b = Number(tokens[i + 1]);
    i += 2;
    const relative = command === command.toLowerCase();
    x = relative ? x + a : a;
    y = relative ? y + b : b;
    ops.push(`${num(x)} ${num(y)} ${command.toLowerCase() === 'm' ? 'm' : 'l'}`);
    // further pairs after an M are line-tos, as in SVG
    if (command === 'M') command = 'L';
    if (command === 'm') command = 'l';
  }
  return ops.join(' ');
}

function shapeOps(element: SvgElement, style: ShapeStyle, out: string[]) {
  let geometry: string;
  let closed = true;
  if (element.tag === 'rect') {
    geometry = `${num(attrNum(element, 'x'))} ${num(attrNum(element, 'y'))} ${num(attrNum(element, 'width'))} ${num(attrNum(element, 'height'))} re`;
  } else if (element.tag === 'line') {
    geometry = `${num(attrNum(element, 'x1'))} ${num(attrNum(element, 'y1'))} m ${num(attrNum(element, 'x2'))} ${num(attrNum(element, 'y2'))} l`;
    closed = false;
  } else {
    geometry = pathOps(element.attrs.d ?? '');
  }

  if (style.hatch) {
    hatchOps(element, geometry, out);
    return;
  }
  const fill = closed && style.fill;
  const stroke = style.stroke && style.width;
  if (!fill && !stroke) return;
  const parts: string[] = [];
  if (fill) parts.push(`${rgb(style.fill!)} rg`);
  if (stroke) {
    parts.push(`${rgb(style.stroke!)} RG ${num(style.width!)} w`);
    parts.push(style.dash ? `[${style.dash.map(num).join(' ')}] 0 d` : '[] 0 d');
  }
  parts.push(geometry, fill && stroke ? 'B' : fill ? 'f' : 'S');
  out.push(parts.join(' '));
}

/** the diagonal hatching of estimated walls, as the SVG pattern draws it (userSpaceOnUse, rotate 45) */
function hatchOps(element: SvgElement, geometry: string, out: string[]) {
  const x = attrNum(element, 'x');
  const y = attrNum(element, 'y');
  const w = attrNum(element, 'width');
  const h = attrNum(element, 'height');
  const c = Math.SQRT1_2;
  // corners in pattern space (inverse of rotate(45))
  const us = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => c * px + c * py);
  const vs = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => -c * px + c * py);
  const [u0, u1] = [Math.min(...us), Math.max(...us)];
  const [v0, v1] = [Math.min(...vs), Math.max(...vs)];
  const lines: string[] = [];
  for (let k = Math.ceil(u0 / HATCH.spacing); k * HATCH.spacing <= u1; k += 1) {
    const u = k * HATCH.spacing;
    lines.push(`${num(u)} ${num(v0)} m ${num(u)} ${num(v1)} l`);
  }
  out.push(`q ${geometry} W n ${num(c)} ${num(c)} ${num(-c)} ${num(c)} 0 0 cm `
    + `${rgb(HATCH.color)} RG ${HATCH.width} w [] 0 d ${lines.join(' ')} S Q`);
}

function textOps(element: SvgElement, style: TextStyle, out: string[]) {
  const codes = winAnsi(element.text ?? '');
  if (codes.length === 0) return;
  const size = element.attrs['font-size'] ? parseFloat(element.attrs['font-size']) : style.size;
  let x = attrNum(element, 'x');
  let y = attrNum(element, 'y');
  let angle = 0;
  const rotate = /rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)/.exec(element.attrs.transform ?? '');
  if (rotate) {
    angle = (Number(rotate[1]) * Math.PI) / 180;
    const cx = rotate[2] !== undefined ? Number(rotate[2]) : 0;
    const cy = rotate[3] !== undefined ? Number(rotate[3]) : 0;
    const dx = x - cx;
    const dy = y - cy;
    x = cx + Math.cos(angle) * dx - Math.sin(angle) * dy;
    y = cy + Math.sin(angle) * dx + Math.cos(angle) * dy;
  }
  // glyph space (v up) into the y-down drawing space, rotated as in the SVG
  // textLength squeezes a name that does not fit its room (lengthAdjust spacingAndGlyphs)
  const natural = textWidth(codes, style.bold);
  const fitted = Number(element.attrs.textLength);
  const squeeze = fitted > 0 && natural > 0 ? fitted / (natural * size) : 1;
  const a = size * Math.cos(angle) * squeeze;
  const b = size * Math.sin(angle) * squeeze;
  const c = size * Math.sin(angle);
  const d = -size * Math.cos(angle);
  const shift = style.middle ? -natural / 2 : 0;
  const e = x + a * shift;
  const f = y + b * shift;
  const font = style.bold ? '/F2' : '/F1';
  const matrix = `${num(a)} ${num(b)} ${num(c)} ${num(d)} ${num(e)} ${num(f)} Tm`;
  const string = pdfString(codes);
  if (style.halo) {
    out.push(`q 1 1 1 RG ${num(style.halo)} w 1 j [] 0 d BT ${font} 1 Tf 1 Tr ${matrix} ${string} Tj ET Q`);
  }
  out.push(`${rgb(style.color)} rg BT ${font} 1 Tf 0 Tr ${matrix} ${string} Tj ET`);
}

function utf16Hex(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i += 1) hex += text.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${hex}>`;
}

export interface PlanPdfOptions {
  paper: PaperFormat;
  /** document title (file properties) */
  title: string;
  /** line under the drawing, after the scale */
  footer?: string;
}

export interface PlanPdf {
  bytes: Uint8Array;
  layout: PlanPdfLayout;
}

/** the drawing size of a plan SVG in model mm, for the layout before it is drawn */
export function planSize(svg: string): [number, number] {
  const { viewBox } = parsePlanSvg(svg);
  return [viewBox[2], viewBox[3]];
}

export function buildPlanPdf(svg: string, options: PlanPdfOptions): PlanPdf {
  const plan = parsePlanSvg(svg);
  const [vx, vy, vw, vh] = plan.viewBox;
  const layout = choosePlanLayout(vw, vh, options.paper);
  if (!layout) throw new Error(`Der Plan passt auf ${options.paper} in keinem üblichen Maßstab.`);

  const pageW = layout.pageW * PT;
  const pageH = layout.pageH * PT;
  const k = PT / layout.scale; // points per model mm
  // centred in the space above the footer
  const roomW = layout.pageW - 2 * MARGIN;
  const roomH = layout.pageH - 2 * MARGIN - FOOTER;
  const left = (MARGIN + (roomW - vw / layout.scale) / 2) * PT;
  const top = pageH - (MARGIN + (roomH - vh / layout.scale) / 2) * PT;

  const out: string[] = [];
  out.push(`q ${num(k)} 0 0 ${num(-k)} ${num(left - k * vx)} ${num(top + k * vy)} cm 0 J 0 j 4 M`);
  for (const element of plan.elements) {
    if (element.tag === 'text') {
      const style = TEXT_STYLES[element.cls];
      if (style) textOps(element, style, out);
    } else if (element.cls) {
      const style = SHAPE_STYLES[element.cls];
      if (style) shapeOps(element, style, out);
    }
  }
  out.push('Q');

  const footer = `Maßstab 1:${layout.scale} · ${layout.paper}${options.footer ? ` · ${options.footer}` : ''}`;
  out.push(`${rgb(MUTED)} rg BT /F1 7 Tf ${num(MARGIN * PT)} ${num((MARGIN + 1) * PT)} Td ${pdfString(winAnsi(footer))} Tj ET`);

  const content = out.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageW)} ${num(pageH)}] `
      + '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Title ${utf16Hex(options.title)} /Creator (Reno Master) /Producer (Reno Master) >>`,
  ];
  // every character above is one byte (WinAnsi), so string length = byte offset
  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return { bytes, layout };
}

/** "grundriss-eg-bestand-v0.27.pdf" from the data attributes the builder writes */
export function planPdfName(svg: string): string {
  const { attrs } = parsePlanSvg(svg);
  const variant = { ist: 'bestand', aktuell: 'aktuell', soll: 'plan' }[attrs['data-variant'] ?? ''] ?? attrs['data-variant'];
  const parts = ['grundriss', attrs['data-floor'], variant, attrs['data-version'] ? `v${attrs['data-version'].replace(/^v/, '')}` : '']
    .filter(Boolean)
    .map((part) => String(part).toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, ''));
  return `${parts.filter(Boolean).join('-')}.pdf`;
}
