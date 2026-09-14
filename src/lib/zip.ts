/**
 * A ZIP writer, without a library and without compression.
 *
 * The export of the diary is mostly JPEGs. They are already compressed, so deflating
 * them again would cost minutes of phone battery and save nothing - every entry is
 * stored as is. What is left is the container format, which is small enough to write
 * by hand and, unlike a dependency, can be tested in this repository.
 *
 * Entries are handed to a sink one chunk at a time instead of being collected in a
 * single blob: an export with originals can be several gigabytes, which no phone holds
 * in memory.
 *
 * ZIP64 is written where the plain format runs out - past 4 GB of archive, past 4 GB in
 * one file, or past 65535 entries. Without it such an archive silently unpacks wrong.
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const ZIP64_END_OF_CENTRAL = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
/** "the value does not fit, look in the zip64 extra field" */
const NEEDS_ZIP64 = 0xffffffff;
const UINT16_MAX = 0xffff;
/** bit 11: the name is UTF-8, not the ancient code page */
const UTF8_FLAG = 0x0800;
const VERSION_STORE = 20;
const VERSION_ZIP64 = 45;

export type ZipSink = (chunk: Uint8Array) => void | Promise<void>;

export interface ZipOptions {
  /**
   * Write the ZIP64 records even for a small archive. The format only switches over
   * past 4 GB, which is nothing a test can produce, so this is how that path stays
   * covered.
   */
  forceZip64?: boolean;
}

interface CentralEntry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

/** CRC-32 as ZIP wants it; can be fed in chunks */
export function crc32(data: Uint8Array, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i += 1) {
    crc = (CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** date and time in the format MS-DOS used in 1980, which ZIP never left behind */
export function dosDateTime(when: Date): { date: number; time: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    date: (((year - 1980) & 0x7f) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
  };
}

function writeUint64(view: DataView, offset: number, value: number): void {
  // JavaScript numbers are exact up to 2^53, which is far beyond any archive we write
  view.setUint32(offset, value >>> 0, true);
  view.setUint32(offset + 4, Math.floor(value / 0x100000000), true);
}

/**
 * Writes one ZIP archive into a sink.
 *
 * ```ts
 * const zip = new ZipWriter((chunk) => stream.write(chunk));
 * await zip.add('Bautagebuch.md', text);
 * await zip.finish();
 * ```
 */
export class ZipWriter {
  private readonly entries: CentralEntry[] = [];
  private offset = 0;
  private closed = false;

  private readonly sink: ZipSink;
  private readonly forceZip64: boolean;

  constructor(sink: ZipSink, options: ZipOptions = {}) {
    this.sink = sink;
    this.forceZip64 = options.forceZip64 === true;
  }

  private async push(chunk: Uint8Array): Promise<void> {
    await this.sink(chunk);
    this.offset += chunk.length;
  }

  /** bytes written so far, so a caller can show progress */
  get bytesWritten(): number {
    return this.offset;
  }

  async add(name: string, data: Uint8Array, modified = new Date()): Promise<void> {
    if (this.closed) throw new Error('Das Archiv ist bereits abgeschlossen');
    const encodedName = new TextEncoder().encode(name.replace(/\\/g, '/'));
    const { date, time } = dosDateTime(modified);
    const crc = crc32(data);
    const large = this.forceZip64 || data.length > NEEDS_ZIP64;

    // local file header: with the sizes known up front there is no data descriptor
    const extraLength = large ? 20 : 0;
    const header = new Uint8Array(30 + encodedName.length + extraLength);
    const view = new DataView(header.buffer);
    view.setUint32(0, LOCAL_HEADER, true);
    view.setUint16(4, large ? VERSION_ZIP64 : VERSION_STORE, true);
    view.setUint16(6, UTF8_FLAG, true);
    view.setUint16(8, 0, true); // stored
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, large ? NEEDS_ZIP64 : data.length, true);
    view.setUint32(22, large ? NEEDS_ZIP64 : data.length, true);
    view.setUint16(26, encodedName.length, true);
    view.setUint16(28, extraLength, true);
    header.set(encodedName, 30);
    if (large) {
      const extra = new DataView(header.buffer, 30 + encodedName.length, 20);
      extra.setUint16(0, 0x0001, true);
      extra.setUint16(2, 16, true);
      writeUint64(extra, 4, data.length);
      writeUint64(extra, 12, data.length);
    }

    const offset = this.offset;
    await this.push(header);
    await this.push(data);
    this.entries.push({ name: encodedName, crc, size: data.length, offset, time, date });
  }

  /** writes the central directory; nothing may be added afterwards */
  async finish(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const directoryStart = this.offset;

    for (const entry of this.entries) {
      const needsSize = this.forceZip64 || entry.size > NEEDS_ZIP64;
      const needsOffset = this.forceZip64 || entry.offset > NEEDS_ZIP64;
      // the zip64 field carries what did not fit, in a fixed order
      const extraLength = needsSize || needsOffset ? 4 + (needsSize ? 16 : 0) + (needsOffset ? 8 : 0) : 0;
      const record = new Uint8Array(46 + entry.name.length + extraLength);
      const view = new DataView(record.buffer);
      view.setUint32(0, CENTRAL_HEADER, true);
      view.setUint16(4, extraLength ? VERSION_ZIP64 : VERSION_STORE, true); // made by
      view.setUint16(6, extraLength ? VERSION_ZIP64 : VERSION_STORE, true); // needed
      view.setUint16(8, UTF8_FLAG, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, entry.time, true);
      view.setUint16(14, entry.date, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, needsSize ? NEEDS_ZIP64 : entry.size, true);
      view.setUint32(24, needsSize ? NEEDS_ZIP64 : entry.size, true);
      view.setUint16(28, entry.name.length, true);
      view.setUint16(30, extraLength, true);
      view.setUint16(32, 0, true); // comment
      view.setUint16(34, 0, true); // disk
      view.setUint16(36, 0, true); // internal attributes
      view.setUint32(38, 0, true); // external attributes
      view.setUint32(42, needsOffset ? NEEDS_ZIP64 : entry.offset, true);
      record.set(entry.name, 46);
      if (extraLength) {
        const extra = new DataView(record.buffer, 46 + entry.name.length, extraLength);
        extra.setUint16(0, 0x0001, true);
        extra.setUint16(2, extraLength - 4, true);
        let at = 4;
        if (needsSize) {
          writeUint64(extra, at, entry.size);
          writeUint64(extra, at + 8, entry.size);
          at += 16;
        }
        if (needsOffset) writeUint64(extra, at, entry.offset);
      }
      await this.push(record);
    }

    const directorySize = this.offset - directoryStart;
    const zip64 =
      this.forceZip64 ||
      this.entries.length > UINT16_MAX ||
      directoryStart > NEEDS_ZIP64 ||
      directorySize > NEEDS_ZIP64;

    if (zip64) {
      const record = new Uint8Array(56 + 20);
      const view = new DataView(record.buffer);
      view.setUint32(0, ZIP64_END_OF_CENTRAL, true);
      writeUint64(view, 4, 44); // size of this record, excluding the first 12 bytes
      view.setUint16(12, VERSION_ZIP64, true);
      view.setUint16(14, VERSION_ZIP64, true);
      view.setUint32(16, 0, true);
      view.setUint32(20, 0, true);
      writeUint64(view, 24, this.entries.length);
      writeUint64(view, 32, this.entries.length);
      writeUint64(view, 40, directorySize);
      writeUint64(view, 48, directoryStart);
      // locator: tells the reader where the record above starts
      view.setUint32(56, ZIP64_LOCATOR, true);
      view.setUint32(60, 0, true);
      writeUint64(view, 64, this.offset);
      view.setUint32(72, 1, true);
      await this.push(record);
    }

    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    const count = Math.min(this.entries.length, UINT16_MAX);
    view.setUint32(0, END_OF_CENTRAL, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, count, true);
    view.setUint16(10, count, true);
    view.setUint32(12, zip64 ? NEEDS_ZIP64 : directorySize, true);
    view.setUint32(16, zip64 ? NEEDS_ZIP64 : directoryStart, true);
    view.setUint16(20, 0, true);
    await this.push(end);
  }
}
