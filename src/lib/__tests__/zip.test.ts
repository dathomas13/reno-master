import { describe, expect, it } from 'vitest';
import { crc32, dosDateTime, ZipWriter } from '@/lib/zip';

const text = (value: string) => new TextEncoder().encode(value);

async function build(options?: { forceZip64: boolean }): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const zip = new ZipWriter((chunk) => {
    chunks.push(chunk);
  }, options);
  await zip.add('Bautagebuch.md', text('Eintrag mit Umlauten: äöüß'), new Date(2026, 8, 14, 21, 30, 0));
  await zip.add('fotos/bild.jpg', new Uint8Array([1, 2, 3]));
  await zip.finish();
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

function readUint32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
}

describe('crc32', () => {
  it('matches the value every zip tool expects', () => {
    // the check value from the CRC-32 specification
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for nothing', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('can be fed in pieces', () => {
    const whole = crc32(text('Schlesierstraße 31'));
    const piece = crc32(text('Schlesier'));
    expect(crc32(text('straße 31'), piece)).toBe(whole);
  });
});

describe('dosDateTime', () => {
  it('packs a date the way ZIP has done since 1980', () => {
    const { date, time } = dosDateTime(new Date(2026, 8, 14, 21, 30, 4));
    expect((date >> 9) + 1980).toBe(2026);
    expect((date >> 5) & 0x0f).toBe(9);
    expect(date & 0x1f).toBe(14);
    expect(time >> 11).toBe(21);
    expect((time >> 5) & 0x3f).toBe(30);
    expect((time & 0x1f) * 2).toBe(4); // seconds have two second resolution
  });

  it('does not fall below the first year the format knows', () => {
    expect(dosDateTime(new Date(1970, 0, 1)).date >> 9).toBe(0);
  });
});

describe('ZipWriter', () => {
  it('writes a readable archive', async () => {
    const archive = await build();
    expect(readUint32(archive, 0)).toBe(0x04034b50); // local file header
    // the end record sits in the last 22 bytes when there is no comment
    expect(readUint32(archive, archive.length - 22)).toBe(0x06054b50);
    const count = new DataView(archive.buffer).getUint16(archive.length - 22 + 10, true);
    expect(count).toBe(2);
  });

  it('adds the zip64 records when asked', async () => {
    const plain = await build();
    const large = await build({ forceZip64: true });
    expect(large.length).toBeGreaterThan(plain.length);
    // the zip64 end record comes before the locator and the classic end record
    expect(readUint32(large, large.length - 22 - 20 - 56)).toBe(0x06064b50);
    expect(readUint32(large, large.length - 22 - 20)).toBe(0x07064b50);
  });

  it('refuses to add anything after it was closed', async () => {
    const zip = new ZipWriter(() => {});
    await zip.finish();
    await expect(zip.add('zu spät.txt', text('x'))).rejects.toThrow();
  });

  it('turns backslashes into the separator zip uses', async () => {
    const chunks: Uint8Array[] = [];
    const zip = new ZipWriter((chunk) => {
      chunks.push(chunk);
    });
    await zip.add('fotos\\bild.jpg', new Uint8Array([1]));
    const header = chunks[0]!;
    const name = new TextDecoder().decode(header.slice(30));
    expect(name).toBe('fotos/bild.jpg');
  });
});
