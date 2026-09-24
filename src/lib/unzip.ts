/**
 * Reads a ZIP archive - the counterpart of zip.ts, for the model import.
 *
 * Small on purpose: the archives it reads are a few hundred kilobytes, either written by
 * the app itself (stored) or repacked by some other tool (deflated). Deflate is undone
 * with the browser's own DecompressionStream, so no library is needed. ZIP64 and
 * encryption are refused with a message instead of being half supported.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const END_OF_CENTRAL = 0x06054b50;
const CENTRAL_HEADER = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

/** true when the bytes start like a ZIP archive */
export function looksLikeZip(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Dieses Gerät kann gepackte ZIP-Dateien nicht öffnen. Bitte die JSON-Datei einzeln wählen.');
  }
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // the end record sits in the last 22 bytes plus a comment of at most 64 KB
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 0xffff); at -= 1) {
    if (view.getUint32(at, true) === END_OF_CENTRAL) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new Error('Die Datei ist kein vollständiges ZIP-Archiv.');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new Error('ZIP64-Archive werden nicht unterstützt.');

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(at, true) !== CENTRAL_HEADER) throw new Error('Das ZIP-Verzeichnis ist beschädigt.');
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith('/')) continue; // a folder
    if (flags & 1) throw new Error(`${name}: verschlüsselte ZIP-Dateien werden nicht unterstützt.`);
    if (view.getUint32(local, true) !== LOCAL_HEADER) throw new Error(`${name}: Eintrag beschädigt.`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) entries.push({ name, data: raw });
    else if (method === 8) entries.push({ name, data: await inflateRaw(raw) });
    else throw new Error(`${name}: Kompressionsverfahren ${method} wird nicht unterstützt.`);
  }
  return entries;
}
