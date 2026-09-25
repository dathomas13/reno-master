import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { ZipWriter, crc32 } from '../zip';
import { looksLikeZip, readZip } from '../unzip';

const text = (data: Uint8Array) => new TextDecoder().decode(data);

async function stored(files: Record<string, string>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const zip = new ZipWriter((chunk) => {
    chunks.push(new Uint8Array(chunk));
  });
  for (const [name, content] of Object.entries(files)) await zip.add(name, new TextEncoder().encode(content));
  await zip.finish();
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** one deflated entry, as other tools write them */
function deflated(name: string, content: string): Uint8Array {
  const plain = new TextEncoder().encode(content);
  const packed = new Uint8Array(deflateRawSync(plain));
  const encodedName = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + encodedName.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(8, 8, true);
  lv.setUint32(14, crc32(plain), true);
  lv.setUint32(18, packed.length, true);
  lv.setUint32(22, plain.length, true);
  lv.setUint16(26, encodedName.length, true);
  local.set(encodedName, 30);
  const central = new Uint8Array(46 + encodedName.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(16, crc32(plain), true);
  cv.setUint32(20, packed.length, true);
  cv.setUint32(24, plain.length, true);
  cv.setUint16(28, encodedName.length, true);
  cv.setUint32(42, 0, true);
  central.set(encodedName, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length + packed.length, true);
  const out = new Uint8Array(local.length + packed.length + central.length + end.length);
  out.set(local, 0);
  out.set(packed, local.length);
  out.set(central, local.length + packed.length);
  out.set(end, local.length + packed.length + central.length);
  return out;
}

describe('readZip', () => {
  it('reads back what ZipWriter wrote', async () => {
    const bytes = await stored({ 'ANLEITUNG.md': '# Hallo', 'haus-ist.json': '{"a": "Küche"}' });
    expect(looksLikeZip(bytes)).toBe(true);
    const entries = await readZip(bytes);
    expect(entries.map((e) => e.name)).toEqual(['ANLEITUNG.md', 'haus-ist.json']);
    expect(text(entries[1].data)).toBe('{"a": "Küche"}');
  });

  it('inflates a deflated entry', async () => {
    const content = JSON.stringify({ walls: Array.from({ length: 50 }, (_, i) => ({ id: `w${i}` })) });
    const entries = await readZip(deflated('modell/haus-soll.json', content));
    expect(entries[0].name).toBe('modell/haus-soll.json');
    expect(text(entries[0].data)).toBe(content);
  });

  it('refuses something that is not a ZIP', async () => {
    let message = '';
    try {
      await readZip(new TextEncoder().encode('{"format": "reno-haus/1"}'));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch('kein vollständiges ZIP');
  });
});
