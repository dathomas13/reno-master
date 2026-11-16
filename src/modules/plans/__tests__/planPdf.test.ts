import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildPlanPdf,
  choosePlanLayout,
  parsePlanSvg,
  planPdfName,
  SHAPE_STYLES,
  TEXT_STYLES,
  textWidth,
  winAnsi,
} from '../planPdf';

const PLANS = join(process.cwd(), 'tools', 'model', 'testdata', 'plans');
const files = readdirSync(PLANS).filter((name: string) => name.endsWith('.svg'));
const read = (name: string) => readFileSync(join(PLANS, name), 'utf8');
const latin1 = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('plan PDF', () => {
  it('knows every class the plan builder writes', () => {
    // a new class in plansSvg.ts that is not mirrored here would silently vanish from the PDF
    for (const name of files) {
      for (const element of parsePlanSvg(read(name)).elements) {
        if (!element.cls) continue;
        const known = element.tag === 'text' ? element.cls in TEXT_STYLES : element.cls in SHAPE_STYLES;
        expect(`${name}: ${element.tag}.${element.cls} ${known ? 'bekannt' : 'unbekannt'}`)
          .toBe(`${name}: ${element.tag}.${element.cls} bekannt`);
      }
    }
  });

  it('reads attributes with digits and the text of every label', () => {
    const plan = parsePlanSvg(read('ist-EG.svg'));
    const line = plan.elements.find((e) => e.tag === 'line')!;
    expect(Number(line.attrs.x1) || Number(line.attrs.x2)).not.toBe(0);
    expect(plan.elements.some((e) => e.tag === 'text' && e.text === 'Erdgeschoss')).toBe(true);
    expect(plan.viewBox[2]).toBeGreaterThan(10000);
  });

  it('puts a floor on A4 at 1:100 and on A2 at 1:50', () => {
    for (const name of files) {
      const [, , w, h] = parsePlanSvg(read(name)).viewBox;
      expect(choosePlanLayout(w, h, 'A4')?.scale).toBe(100);
      expect(choosePlanLayout(w, h, 'A2')?.scale).toBe(50);
    }
  });

  it('picks the orientation that allows the larger scale', () => {
    // 30 m wide, 10 m deep: landscape fits 1:200 on A4, portrait would need 1:250
    expect(choosePlanLayout(30000, 10000, 'A4')).toMatchObject({ landscape: true, scale: 200, pageW: 297, pageH: 210 });
    expect(choosePlanLayout(10000, 30000, 'A4')).toMatchObject({ landscape: false, scale: 200 });
  });

  it('writes a well-formed single page PDF with a working cross reference table', () => {
    const { bytes, layout } = buildPlanPdf(read('ist-EG.svg'), { paper: 'A4', title: 'Erdgeschoss – Bestand', footer: 'erstellt am 16.11.2026' });
    const text = latin1(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(layout).toMatchObject({ paper: 'A4', scale: 100, landscape: false });
    expect(text).toContain('/MediaBox [0 0 595.276 841.89]');

    // every xref entry points at the start of its object
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const entries = text.slice(xrefAt).split('\n').slice(3, 10);
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });

    // the stream length matches the stream
    const length = Number(/\/Length (\d+)/.exec(text)![1]);
    const start = text.indexOf('stream\n') + 7;
    expect(text.slice(start + length, start + length + 10)).toBe('\nendstream');

    // the scale line under the drawing, in WinAnsi (ß = 0xDF)
    expect(text).toContain('(Maßstab 1:100 · A4 · erstellt am 16.11.2026) Tj');
  });

  it('draws walls, lines and the hatching', () => {
    const text = latin1(buildPlanPdf(read('ist-EG.svg'), { paper: 'A4', title: 'EG' }).bytes);
    expect(text).toMatch(/ re B/); // walls with their outline
    expect(text).toMatch(/ l S/); // dimension lines, jambs
    expect(text).not.toContain('0 0 m 0 0 l S'); // a line whose coordinates were not read
    expect(text).toMatch(/\[60 40\] 0 d/); // door lines dashed
  });

  it('encodes German text in WinAnsi and measures it with Helvetica', () => {
    expect(winAnsi('Küche ² · – €')).toEqual([75, 0xfc, 99, 104, 101, 32, 0xb2, 32, 0xb7, 32, 0x96, 32, 0x80]);
    expect(winAnsi('→')).toEqual([63]);
    expect(textWidth(winAnsi('WC'))).toBeCloseTo((944 + 722) / 1000);
    expect(textWidth(winAnsi('N'), true)).toBeCloseTo(0.722);
  });

  it('names the file after floor, variant and version', () => {
    expect(planPdfName(read('ist-EG.svg'))).toBe('grundriss-eg-bestand-v0.27.pdf');
    expect(planPdfName(read('soll-KG.svg'))).toMatch(/^grundriss-kg-plan-v[\d.]+\.pdf$/);
  });

  it('refuses something that is not a plan', () => {
    expect(() => buildPlanPdf('<div/>', { paper: 'A4', title: 'x' })).toThrow();
  });
});
