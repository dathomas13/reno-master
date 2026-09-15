import { describe, expect, it, vi } from 'vitest';
import {
  alreadyThere,
  describeResult,
  planOrder,
  runFolderExport,
  sourceFor,
  type FolderEffects,
} from '@/data/exportFolder';
import type { ExportFile, ExportPlan } from '@/data/exportArchive';

const THIS_PHONE = 'geraet-1';

function file(patch: Partial<ExportFile> & { name: string }): ExportFile {
  return { bytes: 100, ...patch };
}

function plan(files: ExportFile[]): ExportPlan {
  return { files, fileCount: files.length, totalBytes: 0, withoutOriginal: 0 };
}

function effects(overrides: Partial<FolderEffects> = {}): FolderEffects {
  return {
    copyFromGallery: vi.fn(async () => 4_000_000),
    writeBytes: vi.fn(async (_path: string, data: Uint8Array) => data.length),
    readCloud: vi.fn(async () => new Uint8Array(300_000)),
    ...overrides,
  };
}

describe('sourceFor', () => {
  it('takes the gallery original when this phone made the picture', () => {
    const photo = file({ name: 'fotos/a.jpg', sourceUri: 'content://1', deviceId: THIS_PHONE });
    expect(sourceFor(photo, THIS_PHONE)).toBe('gallery');
  });

  it('falls back to the cloud for a photo of the other phone', () => {
    const photo = file({ name: 'fotos/a.jpg', sourceUri: 'content://1', deviceId: 'geraet-2' });
    expect(sourceFor(photo, THIS_PHONE)).toBe('cloud');
  });

  it('falls back to the cloud when there is no gallery entry at all', () => {
    expect(sourceFor(file({ name: 'fotos/a.jpg', storagePath: 'photos/a.jpg' }), THIS_PHONE)).toBe('cloud');
  });

  it('knows a generated text when it sees one', () => {
    expect(sourceFor(file({ name: 'Bautagebuch.md', text: '# x' }), THIS_PHONE)).toBe('text');
  });
});

describe('alreadyThere', () => {
  it('skips a cloud file of the expected size', () => {
    const photo = file({ name: 'fotos/a.jpg', bytes: 300 });
    expect(alreadyThere(photo, { 'fotos/a.jpg': 300 }, 'cloud')).toBe(true);
  });

  it('writes again when the earlier attempt stopped half way', () => {
    const photo = file({ name: 'fotos/a.jpg', bytes: 300 });
    expect(alreadyThere(photo, { 'fotos/a.jpg': 120 }, 'cloud')).toBe(false);
  });

  it('accepts any size for a gallery original, whose size the plan cannot know', () => {
    const photo = file({ name: 'fotos/a.jpg', bytes: 300 });
    expect(alreadyThere(photo, { 'fotos/a.jpg': 4_000_000 }, 'gallery')).toBe(true);
  });

  it('is false for a file the folder has never seen', () => {
    expect(alreadyThere(file({ name: 'fotos/b.jpg' }), {}, 'cloud')).toBe(false);
  });
});

describe('planOrder', () => {
  it('writes the texts last, so a half finished export has no misleading diary', () => {
    const ordered = planOrder(
      plan([
        file({ name: 'Bautagebuch.md', text: 'x' }),
        file({ name: 'fotos/a.jpg', storagePath: 'photos/a.jpg' }),
      ]),
    );
    expect(ordered.map((entry) => entry.name)).toEqual(['fotos/a.jpg', 'Bautagebuch.md']);
  });
});

describe('runFolderExport', () => {
  it('copies from the gallery and fetches the rest from the cloud', async () => {
    const acting = effects();
    const { result, index } = await runFolderExport(
      plan([
        file({ name: 'fotos/a.jpg', sourceUri: 'content://1', deviceId: THIS_PHONE, mime: 'image/jpeg' }),
        file({ name: 'fotos/b.jpg', storagePath: 'photos/b.jpg', bytes: 300_000 }),
        file({ name: 'LIESMICH.txt', text: 'hallo' }),
      ]),
      {},
      THIS_PHONE,
      acting,
      () => {},
    );

    expect(result.fromGallery).toBe(1);
    expect(result.fromCloud).toBe(1);
    expect(result.failed).toEqual([]);
    expect(acting.copyFromGallery).toHaveBeenCalledWith('fotos/a.jpg', 'content://1', 'image/jpeg');
    expect(index['fotos/a.jpg']).toBe(4_000_000);
    expect(index['LIESMICH.txt']).toBe(5);
  });

  it('leaves files alone that a previous run already wrote', async () => {
    const acting = effects();
    const { result } = await runFolderExport(
      plan([file({ name: 'fotos/b.jpg', storagePath: 'photos/b.jpg', bytes: 300_000 })]),
      { 'fotos/b.jpg': 300_000 },
      THIS_PHONE,
      acting,
      () => {},
    );
    expect(result.skipped).toBe(1);
    expect(acting.readCloud).not.toHaveBeenCalled();
  });

  it('notes a photo it cannot get and carries on', async () => {
    const acting = effects({
      copyFromGallery: vi.fn(async () => {
        throw new Error('Quelle nicht lesbar');
      }),
    });
    const { result } = await runFolderExport(
      plan([
        file({ name: 'fotos/a.jpg', sourceUri: 'content://weg', deviceId: THIS_PHONE }),
        file({ name: 'fotos/b.jpg', storagePath: 'photos/b.jpg' }),
      ]),
      {},
      THIS_PHONE,
      acting,
      () => {},
    );
    expect(result.failed).toEqual([{ name: 'fotos/a.jpg', reason: 'Quelle nicht lesbar' }]);
    expect(result.fromCloud).toBe(1);
  });

  it('rewrites the texts even when they are in the index', async () => {
    const acting = effects();
    const { result } = await runFolderExport(
      plan([file({ name: 'Bautagebuch.md', text: 'neu' })]),
      { 'Bautagebuch.md': 3 },
      THIS_PHONE,
      acting,
      () => {},
    );
    expect(result.skipped).toBe(0);
    expect(acting.writeBytes).toHaveBeenCalled();
  });

  it('reports its way through and ends on nothing', async () => {
    const steps: string[] = [];
    await runFolderExport(
      plan([file({ name: 'fotos/a.jpg', storagePath: 'photos/a.jpg' })]),
      {},
      THIS_PHONE,
      effects(),
      (progress) => steps.push(progress.current),
    );
    expect(steps[0]).toBe('fotos/a.jpg');
    expect(steps.at(-1)).toBe('');
  });
});

describe('describeResult', () => {
  it('says what happened in one line', () => {
    expect(
      describeResult({ fromGallery: 412, fromCloud: 18, skipped: 0, failed: [{ name: 'x', reason: 'y' }], bytes: 0 }),
    ).toBe('412 Foto(s) im Original, 18 aus der Cloud, 1 nicht auffindbar');
  });

  it('keeps quiet about what did not happen', () => {
    expect(describeResult({ fromGallery: 5, fromCloud: 0, skipped: 0, failed: [], bytes: 0 })).toBe(
      '5 Foto(s) im Original',
    );
  });
});
