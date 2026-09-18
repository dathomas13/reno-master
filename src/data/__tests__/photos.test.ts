import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addPhoto, ReceiptAlreadyLinkedError } from '@/data/photos';
import { saveCost } from '@/data/repos';
import type { Cost, Photo } from '@/data/types';

const mocks = vi.hoisted(() => ({
  saveDoc: vi.fn().mockResolvedValue('new-photo'),
  patchDoc: vi.fn().mockResolvedValue(undefined),
  enqueue: vi.fn().mockResolvedValue(undefined),
  resizeImage: vi.fn(),
  readTakenAt: vi.fn().mockResolvedValue('2026-09-17T12:00:00'),
}));
vi.mock('@/firebase/db', () => ({ ...mocks, removeDoc: vi.fn() }));
vi.mock('@/offline/outbox', () => ({
  enqueue: mocks.enqueue, putLocalBlob: vi.fn(), dropLocalBlob: vi.fn(), removeJobsForPaths: vi.fn(),
}));
vi.mock('@/platform/fileStore', () => ({ deleteFile: vi.fn() }));
vi.mock('@/lib/image', () => ({
  resizeImage: mocks.resizeImage, makeThumbnail: vi.fn(), readTakenAt: mocks.readTakenAt,
  PHOTO_MAX_EDGE: 1600, RECEIPT_MAX_EDGE: 2000,
}));

const file = new File(['receipt'], 'rechnung.pdf', { type: 'application/pdf' });
const receipt: Photo = {
  id: 'receipt-1', costId: 'cost-1', kind: 'receipt', storagePath: 'receipts/cost-1/receipt-1.pdf',
  contentType: 'application/pdf', width: 0, height: 0, bytes: file.size,
  originalName: file.name, originalBytes: file.size, takenAt: '2026-09-17T12:00:00',
  roomIds: [], uploadState: 'uploaded',
};
const input = {
  file, kind: 'receipt' as const, costId: 'cost-1', originalName: file.name, existingPhotos: [receipt],
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('receipt deduplication', () => {
  it('reuses an attached receipt without writing or uploading again', async () => {
    expect(await addPhoto(input)).toEqual(receipt);
    expect(mocks.saveDoc).not.toHaveBeenCalled();
    expect(mocks.patchDoc).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.resizeImage).not.toHaveBeenCalled();
  });

  it('reports the existing owner instead of moving or copying its receipt', async () => {
    const operation = addPhoto({ ...input, costId: 'cost-2' });
    await expect(operation).rejects.toBeInstanceOf(ReceiptAlreadyLinkedError);
    await expect(operation).rejects.toMatchObject({ photo: receipt });
    expect(mocks.saveDoc).not.toHaveBeenCalled();
    expect(mocks.patchDoc).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('links an unassigned receipt without uploading it again', async () => {
    const photo = await addPhoto({ ...input, existingPhotos: [{ ...receipt, costId: undefined }] });
    expect(photo).toEqual(receipt);
    expect(mocks.patchDoc).toHaveBeenCalledWith('photos', receipt.id, { costId: 'cost-1' });
    expect(mocks.saveDoc).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('recovers an attachment from an abandoned draft', async () => {
    const photo = await addPhoto({ ...input, costId: 'new-cost', existingCosts: [] });
    expect(photo.costId).toBe('new-cost');
    expect(mocks.patchDoc).toHaveBeenCalledWith('photos', receipt.id, { costId: 'new-cost' });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('protects a receipt referenced only by the existing cost', async () => {
    await expect(addPhoto({
      ...input, costId: 'new-cost', existingPhotos: [{ ...receipt, costId: undefined }],
      existingCosts: [{ id: 'cost-1', receiptPhotoIds: [receipt.id] } as Cost],
    })).rejects.toMatchObject({ photo: expect.objectContaining({ costId: 'cost-1' }) });
    expect(mocks.patchDoc).not.toHaveBeenCalled();
  });

  it('queues the receipt file even when Firestore is waiting for a connection', async () => {
    vi.useFakeTimers();
    mocks.saveDoc.mockImplementationOnce(() => new Promise(() => {}));
    const operation = addPhoto({ ...input, existingPhotos: [] });
    await vi.advanceTimersByTimeAsync(10_000);
    const photo = await operation;
    expect(photo.costId).toBe('cost-1');
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ docId: photo.id }));
  });

  it('finishes saving a cost locally when the server does not acknowledge', async () => {
    vi.useFakeTimers();
    mocks.saveDoc.mockImplementationOnce(() => new Promise(() => {}));
    const operation = saveCost({ id: 'cost-1', receiptPhotoIds: [receipt.id] } as Cost);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(operation).resolves.toBe('cost-1');
    expect(mocks.saveDoc).toHaveBeenCalledWith('costs', expect.objectContaining({ receiptPhotoIds: [receipt.id] }));
  });

  it('does not hide a rejected cost write', async () => {
    mocks.saveDoc.mockRejectedValueOnce(new Error('Keine Berechtigung'));
    await expect(saveCost({ id: 'cost-1' } as Cost)).rejects.toThrow('Keine Berechtigung');
  });

  it.each([
    { originalBytes: file.size + 1 },
    { takenAt: '2026-09-16T12:00:00' },
    { originalName: 'andere-rechnung.pdf' },
    { contentType: 'image/jpeg' },
    { kind: 'photo' as const },
  ])('keeps distinct files separate: %j', async (patch) => {
    const photo = await addPhoto({ ...input, existingPhotos: [{ ...receipt, ...patch }] });
    expect(photo.id).not.toBe(receipt.id);
    expect(photo.costId).toBe('cost-1');
    expect(mocks.saveDoc).toHaveBeenCalledWith('photos', expect.objectContaining({
      id: photo.id, costId: 'cost-1', originalName: file.name, originalBytes: file.size,
    }));
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });
});