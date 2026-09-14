import { describe, expect, it } from 'vitest';
import { memoryTarget, writeArchive, type ExportProgress } from '@/data/runExport';
import type { ExportPlan } from '@/data/exportArchive';

function plan(files: ExportPlan['files']): ExportPlan {
  return {
    files,
    fileCount: files.filter((file) => file.storagePath).length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    withoutOriginal: 0,
  };
}

describe('writeArchive', () => {
  it('writes every file and reports its way through', async () => {
    const steps: ExportProgress[] = [];
    const result = await writeArchive(
      plan([
        { name: 'Bautagebuch.md', text: 'Hallo', bytes: 5 },
        { name: 'fotos/2026-09-14/01_bild.jpg', storagePath: 'photos/p1.jpg', bytes: 3 },
      ]),
      memoryTarget(),
      (progress) => steps.push(progress),
      async () => new Uint8Array([1, 2, 3]),
    );

    expect(result.done).toBe(2);
    expect(result.skipped).toEqual([]);
    expect(result.doneBytes).toBe(8);
    // the last report says the current file is done, not which one is next
    expect(steps.at(-1)?.current).toBe('');
  });

  it('skips a file it cannot fetch instead of losing the archive', async () => {
    const result = await writeArchive(
      plan([
        { name: 'fotos/a.jpg', storagePath: 'photos/a.jpg', bytes: 3 },
        { name: 'fotos/b.jpg', storagePath: 'photos/b.jpg', bytes: 3 },
      ]),
      memoryTarget(),
      () => {},
      async (path) => {
        if (path.endsWith('a.jpg')) throw new Error('Datei nicht gefunden');
        return new Uint8Array([9]);
      },
    );

    expect(result.done).toBe(2);
    expect(result.skipped).toEqual([{ name: 'fotos/a.jpg', reason: 'Datei nicht gefunden' }]);
  });

  it('produces an archive that starts and ends like a zip', async () => {
    const target = memoryTarget();
    await writeArchive(plan([{ name: 'a.txt', text: 'x', bytes: 1 }]), target, () => {}, async () => {
      throw new Error('kein Abruf nötig');
    });
    const blob = target.result();
    expect(blob).not.toBeNull();
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });

  it('gives a file inside the archive the date of its day', async () => {
    const target = memoryTarget();
    await writeArchive(
      plan([{ name: 'fotos/2026-08-22/01_bild.jpg', storagePath: 'photos/p.jpg', bytes: 1 }]),
      target,
      () => {},
      async () => new Uint8Array([1]),
    );
    const bytes = new Uint8Array(await target.result()!.arrayBuffer());
    const date = new DataView(bytes.buffer).getUint16(12, true);
    expect((date >> 9) + 1980).toBe(2026);
    expect((date >> 5) & 0x0f).toBe(8);
    expect(date & 0x1f).toBe(22);
  });
});
