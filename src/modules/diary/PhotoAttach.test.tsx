import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Photo } from '@/data/types';
import { PhotoAttach } from './PhotoAttach';

const mocks = vi.hoisted(() => ({
  pickFiles: vi.fn(),
  saveDoc: vi.fn().mockResolvedValue('receipt-1'),
  enqueue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/firebase/db', () => ({ saveDoc: mocks.saveDoc, patchDoc: vi.fn(), removeDoc: vi.fn() }));
vi.mock('@/offline/outbox', () => ({
  enqueue: mocks.enqueue, putLocalBlob: vi.fn(), dropLocalBlob: vi.fn(), removeJobsForPaths: vi.fn(),
}));
vi.mock('@/platform/fileStore', () => ({ deleteFile: vi.fn() }));
vi.mock('@/platform/photos', () => ({ pickFiles: mocks.pickFiles, galleryPickerAvailable: () => false }));
vi.mock('@/lib/image', () => ({
  resizeImage: vi.fn(), makeThumbnail: vi.fn(), readTakenAt: vi.fn().mockResolvedValue('2026-09-17T12:00:00'),
  PHOTO_MAX_EDGE: 1600, RECEIPT_MAX_EDGE: 2000,
}));
vi.mock('@/components/PhotoView', () => ({ PhotoImage: () => null }));
vi.mock('@/components/Sheet', () => ({ Sheet: () => null }));

const file = new File(['receipt'], 'rechnung.pdf', { type: 'application/pdf' });
const receipt: Photo = {
  id: 'receipt-1', costId: 'other-cost', kind: 'receipt', storagePath: 'receipts/other-cost/receipt-1.pdf',
  contentType: 'application/pdf', width: 0, height: 0, bytes: file.size,
  originalName: file.name, originalBytes: file.size, takenAt: '2026-09-17T12:00:00',
  roomIds: [], uploadState: 'uploaded',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pickFiles.mockResolvedValue([file]);
});
afterEach(cleanup);

describe('receipt file picker', () => {
  it('reports duplicates before OCR or another upload', async () => {
    const onAdded = vi.fn();
    const onFileChosen = vi.fn();
    const onDuplicate = vi.fn();
    const onBusyChange = vi.fn();
    render(<PhotoAttach photos={[]} existingPhotos={[receipt]} costId="new-cost" kind="receipt"
      onAdded={onAdded} onRemoved={vi.fn()} onFileChosen={onFileChosen}
      onDuplicate={onDuplicate} onBusyChange={onBusyChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF / Datei' }));
    await waitFor(() => expect(onDuplicate).toHaveBeenCalledWith(receipt));
    expect(screen.getByText('Dieser Beleg ist bereits einer anderen Rechnung zugeordnet.')).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
    expect(onFileChosen).not.toHaveBeenCalled();
    expect(mocks.saveDoc).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it('deduplicates files in the same selection before snapshots arrive', async () => {
    mocks.pickFiles.mockResolvedValue([file, file]);
    const onAdded = vi.fn();
    const onFileChosen = vi.fn();
    render(<PhotoAttach photos={[]} costId="new-cost" kind="receipt"
      onAdded={onAdded} onRemoved={vi.fn()} onFileChosen={onFileChosen} />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF / Datei' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(2));
    expect(onAdded.mock.calls[0][0]).toEqual(onAdded.mock.calls[1][0]);
    expect(onAdded.mock.calls[0][0].costId).toBe('new-cost');
    expect(mocks.saveDoc).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(onFileChosen).toHaveBeenCalledTimes(1);
  });

  it('stays busy until both attachment and extraction finish', async () => {
    let finishSave!: (id: string) => void;
    let finishOcr!: () => void;
    mocks.saveDoc.mockImplementationOnce(() => new Promise<string>((resolve) => { finishSave = resolve; }));
    const onAdded = vi.fn();
    const onFileChosen = vi.fn(() => new Promise<void>((resolve) => { finishOcr = resolve; }));
    const onBusyChange = vi.fn();
    render(<PhotoAttach photos={[]} costId="new-cost" kind="receipt"
      onAdded={onAdded} onRemoved={vi.fn()} onFileChosen={onFileChosen} onBusyChange={onBusyChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF / Datei' }));
    await waitFor(() => expect(mocks.saveDoc).toHaveBeenCalledTimes(1));
    expect(onAdded).not.toHaveBeenCalled();
    expect(onFileChosen).not.toHaveBeenCalled();
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    await act(async () => finishSave('receipt-1'));
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(onFileChosen).toHaveBeenCalledTimes(1);
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    await act(async () => finishOcr());
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it('shows import failures and releases the controls without running OCR', async () => {
    mocks.saveDoc.mockRejectedValueOnce(new Error('Speicherzugriff verweigert'));
    const onFileChosen = vi.fn();
    render(<PhotoAttach photos={[]} costId="new-cost" kind="receipt"
      onAdded={vi.fn()} onRemoved={vi.fn()} onFileChosen={onFileChosen} />);
    fireEvent.click(screen.getByRole('button', { name: 'PDF / Datei' }));
    await waitFor(() => expect(screen.getByText('Speicherzugriff verweigert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'PDF / Datei' })).toBeEnabled();
    expect(onFileChosen).not.toHaveBeenCalled();
  });
});