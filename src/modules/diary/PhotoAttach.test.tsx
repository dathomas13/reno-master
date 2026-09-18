import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Photo } from '@/data/types';
import { PhotoAttach } from './PhotoAttach';

const mocks = vi.hoisted(() => ({
  galleryAvailable: false,
  listGallery: vi.fn(),
  thumbnail: vi.fn().mockResolvedValue(null),
  readGallery: vi.fn(),
  readOriginal: vi.fn().mockResolvedValue(null),
  resizeImage: vi.fn(),
  makeThumbnail: vi.fn(),
  pickFiles: vi.fn(),
  pickPhotos: vi.fn(),
  saveDoc: vi.fn().mockResolvedValue('receipt-1'),
  enqueue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/firebase/db', () => ({ saveDoc: mocks.saveDoc, patchDoc: vi.fn(), removeDoc: vi.fn() }));
vi.mock('@/offline/outbox', () => ({
  enqueue: mocks.enqueue, putLocalBlob: vi.fn(), dropLocalBlob: vi.fn(), removeJobsForPaths: vi.fn(),
}));
vi.mock('@/platform/fileStore', () => ({ deleteFile: vi.fn() }));
vi.mock('@/platform/photos', () => ({
  pickFiles: mocks.pickFiles, galleryPickerAvailable: () => mocks.galleryAvailable,
  pickPhotos: mocks.pickPhotos,
  listGalleryPhotosForDay: mocks.listGallery, galleryThumbnail: mocks.thumbnail,
  readGalleryPhoto: mocks.readGallery,
  readGalleryOriginal: mocks.readOriginal,
}));
vi.mock('@/lib/image', () => ({
  resizeImage: mocks.resizeImage, makeThumbnail: mocks.makeThumbnail, readTakenAt: vi.fn().mockResolvedValue('2026-09-17T12:00:00'),
  PHOTO_MAX_EDGE: 1600, RECEIPT_MAX_EDGE: 2000,
}));
vi.mock('@/components/PhotoView', () => ({
  PhotoImage: () => null,
  Lightbox: ({ photos, index, onClose }: { photos: Photo[]; index: number; onClose(): void }) => (
    <div role="dialog" aria-label={photos[index].originalName}>
      <button type="button" onClick={onClose}>Schließen</button>
    </div>
  ),
}));
vi.mock('@/components/Sheet', () => ({ Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
  open ? <div role="dialog">{children}</div> : null }));

const file = new File(['receipt'], 'rechnung.pdf', { type: 'application/pdf' });
const receipt: Photo = {
  id: 'receipt-1', costId: 'other-cost', kind: 'receipt', storagePath: 'receipts/other-cost/receipt-1.pdf',
  contentType: 'application/pdf', width: 0, height: 0, bytes: file.size,
  originalName: file.name, originalBytes: file.size, takenAt: '2026-09-17T12:00:00',
  roomIds: [], uploadState: 'uploaded',
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.galleryAvailable = false;
  mocks.thumbnail.mockReset().mockResolvedValue(null);
  mocks.readGallery.mockReset();
  mocks.pickFiles.mockResolvedValue([file]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('receipt file picker', () => {
  it('prepares system-picker thumbnails before processing the photos', async () => {
    const image = new Blob(['photo'], { type: 'image/jpeg' });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:preview', revokeObjectURL: vi.fn() });
    mocks.pickPhotos.mockResolvedValue([
      { file: image, name: 'eins.jpg', otherDay: false },
      { file: image, name: 'zwei.jpg', otherDay: false },
    ]);
    mocks.makeThumbnail.mockResolvedValue({ blob: image });
    mocks.resizeImage.mockImplementation(async () => {
      expect(mocks.makeThumbnail).toHaveBeenCalledTimes(2);
      return { blob: image, width: 1600, height: 900, contentType: image.type };
    });
    const onAdded = vi.fn();
    render(<PhotoAttach photos={[]} entryId="entry-1" forDate="2026-09-19" onAdded={onAdded} onRemoved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aus Galerie' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(2));
    expect(mocks.pickPhotos).toHaveBeenCalledWith({ forDate: '2026-09-19', camera: false, deferMetadata: true });
    expect(screen.getByText('Die Auswahl enthält Fotos von einem anderen Tag.')).toBeInTheDocument();
  });
  it('selects multiple gallery photos without importing until confirmation', async () => {
    mocks.galleryAvailable = true;
    mocks.listGallery.mockResolvedValue([
      { uri: 'content://1', name: 'eins.jpg', takenAt: '2026-09-19T12:00:00' },
      { uri: 'content://2', name: 'zwei.jpg', takenAt: '2026-09-19T12:01:00' },
    ]);
    mocks.readGallery.mockReturnValue(new Promise(() => {}));
    render(<PhotoAttach photos={[]} entryId="entry-1" forDate="2026-09-19"
      onAdded={vi.fn()} onRemoved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fotos vom 19.09.' }));
    fireEvent.click(await screen.findByRole('button', { name: 'eins.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'zwei.jpg' }));
    expect(screen.getByRole('button', { name: 'eins.jpg' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'eins.jpg' }));
    expect(screen.getByRole('button', { name: 'Hochladen (1)' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'eins.jpg' }));
    expect(mocks.readGallery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen (2)' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Foto wird vorbereitet: eins.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Foto wird vorbereitet: zwei.jpg' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.readGallery).toHaveBeenCalledWith('content://1'));
  });

  it('shows all previews before reading images and queues every photo without a server response', async () => {
    mocks.galleryAvailable = true;
    mocks.listGallery.mockResolvedValue([
      { uri: 'content://1', name: 'eins.jpg', takenAt: '2026-09-19T12:00:00' },
      { uri: 'content://2', name: 'zwei.jpg', takenAt: '2026-09-19T12:01:00' },
    ]);
    const previewUrl = 'data:image/jpeg;base64,aW1hZ2U=';
    mocks.thumbnail.mockResolvedValue(previewUrl);
    const image = new Blob(['photo'], { type: 'image/jpeg' });
    mocks.resizeImage.mockResolvedValue({ blob: image, width: 1600, height: 900, contentType: image.type });
    mocks.makeThumbnail.mockResolvedValue({ blob: image });
    mocks.saveDoc.mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(() => new Promise(() => {}));
    let finishRead!: (blob: Blob) => void;
    mocks.readGallery.mockImplementationOnce(() => new Promise<Blob>((resolve) => { finishRead = resolve; }))
      .mockResolvedValue(image);
    const onAdded = vi.fn();
    const onBusyChange = vi.fn();
    const props = { photos: [] as Photo[], entryId: 'entry-1', forDate: '2026-09-19', onAdded, onBusyChange, onRemoved: vi.fn() };
    const view = render(<PhotoAttach {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fotos vom 19.09.' }));
    fireEvent.click(await screen.findByRole('button', { name: 'eins.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'zwei.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen (2)' }));
    await waitFor(() => expect(mocks.readGallery).toHaveBeenCalledTimes(1));
    expect(screen.getByAltText('eins.jpg')).toHaveAttribute('src', previewUrl);
    expect(screen.getByAltText('zwei.jpg')).toHaveAttribute('src', previewUrl);
    expect(mocks.saveDoc).not.toHaveBeenCalled();
    await act(async () => finishRead(image));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(2));
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
    const photos = onAdded.mock.calls.map(([photo]) => photo as Photo);
    view.rerender(<PhotoAttach {...props} photos={photos} />);
    expect(screen.getAllByRole('status', { name: /Upload ausstehend/ })).toHaveLength(2);
    view.rerender(<PhotoAttach {...props} photos={photos.map((photo) => ({ ...photo, uploadState: 'uploaded' }))} />);
    expect(screen.queryByRole('status', { name: /Upload ausstehend/ })).not.toBeInTheDocument();
  });

  it('continues after an unreadable gallery photo and lets that photo be retried', async () => {
    mocks.galleryAvailable = true;
    mocks.listGallery.mockResolvedValue([
      { uri: 'content://1', name: 'eins.jpg', takenAt: '2026-09-19T12:00:00' },
      { uri: 'content://2', name: 'zwei.jpg', takenAt: '2026-09-19T12:01:00' },
    ]);
    const image = new Blob(['photo'], { type: 'image/jpeg' });
    mocks.resizeImage.mockResolvedValue({ blob: image, width: 1600, height: 900, contentType: image.type });
    mocks.makeThumbnail.mockResolvedValue({ blob: image });
    mocks.readGallery.mockRejectedValueOnce(new Error('Foto nicht lesbar')).mockResolvedValue(image);
    const onAdded = vi.fn();
    render(<PhotoAttach photos={[]} entryId="entry-1" forDate="2026-09-19" onAdded={onAdded} onRemoved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fotos vom 19.09.' }));
    fireEvent.click(await screen.findByRole('button', { name: 'eins.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'zwei.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hochladen (2)' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    expect(onAdded.mock.calls[0][0].sourceUri).toBe('content://2');
    expect(screen.getByRole('alert')).toHaveTextContent('Foto nicht lesbar');
    fireEvent.click(screen.getByRole('button', { name: 'Erneut' }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('opens an attached PDF in the shared viewer without changing the attachment', async () => {
    const onRemoved = vi.fn();
    render(<PhotoAttach photos={[receipt]} costId="other-cost" kind="receipt" onAdded={vi.fn()} onRemoved={onRemoved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Beleg öffnen: rechnung.pdf' }));
    expect(screen.getByRole('dialog', { name: 'rechnung.pdf' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onRemoved).not.toHaveBeenCalled();
    expect(mocks.saveDoc).not.toHaveBeenCalled();
  });

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