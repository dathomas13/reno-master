import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Photo } from '@/data/types';
import { Lightbox } from './PhotoView';

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(), load: vi.fn(), getPage: vi.fn(), renderPage: vi.fn(), cancel: vi.fn(), destroy: vi.fn(),
}));
vi.mock('@/offline/fileUrls', () => ({ resolveFileUrl: mocks.resolve }));
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: mocks.load,
}));

const receipt = {
  id: 'receipt-1', kind: 'receipt', contentType: 'application/pdf',
  storagePath: 'receipts/cost-1/receipt-1.pdf', originalName: 'Rechnung.pdf',
} as Photo;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolve.mockResolvedValue('blob:receipt');
  mocks.destroy.mockResolvedValue(undefined);
  mocks.renderPage.mockImplementation(() => ({ promise: Promise.resolve(), cancel: mocks.cancel }));
  mocks.getPage.mockResolvedValue({
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: mocks.renderPage,
  });
  mocks.load.mockImplementation(() => ({
    promise: Promise.resolve({ numPages: 2, getPage: mocks.getPage }),
    destroy: mocks.destroy,
  }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('receipt lightbox', () => {
  it('renders a PDF page instead of the thumbnail placeholder', async () => {
    render(<Lightbox photos={[receipt]} index={0} onClose={vi.fn()} onIndexChange={vi.fn()} />);
    expect(await screen.findByLabelText('PDF-Seite 1')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.queryByText('PDF')).not.toBeInTheDocument();
    expect(mocks.resolve).toHaveBeenCalledWith(receipt.storagePath);
    expect(mocks.load).toHaveBeenCalledWith({ url: 'blob:receipt', isEvalSupported: false });
  });

  it('changes PDF pages within their bounds and zooms the rendered page', async () => {
    const onIndexChange = vi.fn();
    render(<Lightbox photos={[receipt]} index={0} onClose={vi.fn()} onIndexChange={onIndexChange} />);
    await waitFor(() => expect(mocks.renderPage).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Vorherige PDF-Seite' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Nächste PDF-Seite' }));
    await waitFor(() => expect(mocks.getPage).toHaveBeenLastCalledWith(2));
    expect(screen.getByRole('button', { name: 'Nächste PDF-Seite' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom vergrößern' }));
    await waitFor(() => expect(mocks.renderPage).toHaveBeenLastCalledWith(expect.objectContaining({
      viewport: { width: 480, height: 640 },
    })));
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('shows an unavailable offline file and allows retrying', async () => {
    mocks.resolve.mockResolvedValueOnce(null);
    render(<Lightbox photos={[receipt]} index={0} onClose={vi.fn()} onIndexChange={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Datei nicht auf diesem Gerät verfügbar');
    expect(mocks.load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByLabelText('PDF-Seite 1')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('reports broken PDFs without an endless loading indicator', async () => {
    mocks.load.mockImplementationOnce(() => ({
      promise: Promise.reject(new Error('Invalid PDF structure.')), destroy: mocks.destroy,
    }));
    render(<Lightbox photos={[receipt]} index={0} onClose={vi.fn()} onIndexChange={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('PDF konnte nicht geladen werden.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('stops waiting when file resolution stalls', async () => {
    vi.useFakeTimers();
    mocks.resolve.mockImplementationOnce(() => new Promise(() => {}));
    render(<Lightbox photos={[receipt]} index={0} onClose={vi.fn()} onIndexChange={vi.fn()} />);
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByRole('alert')).toHaveTextContent('Das Laden dauert zu lange');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reports password protection without leaving the loader pending', async () => {
    const task = { promise: new Promise(() => {}), destroy: mocks.destroy, onPassword: () => {} };
    mocks.load.mockReturnValueOnce(task);
    render(<Lightbox photos={[receipt]} index={0} onClose={vi.fn()} onIndexChange={vi.fn()} />);
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    act(() => task.onPassword());
    expect(screen.getByRole('alert')).toHaveTextContent('passwortgeschützt');
    expect(mocks.destroy).toHaveBeenCalled();
  });

  it('cancels rendering and destroys the worker when closed', async () => {
    mocks.renderPage.mockReturnValueOnce({ promise: new Promise(() => {}), cancel: mocks.cancel });
    const view = render(<Lightbox photos={[receipt]} index={0} onClose={vi.fn()} onIndexChange={vi.fn()} />);
    await waitFor(() => expect(mocks.renderPage).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(mocks.cancel).toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalled();
  });

  it('starts a different document on page one', async () => {
    const photos = [receipt, { ...receipt, id: 'receipt-2', storagePath: 'receipts/cost-2/receipt-2.pdf' }];
    const view = render(<Lightbox photos={photos} index={0} onClose={vi.fn()} onIndexChange={vi.fn()} />);
    await waitFor(() => expect(mocks.renderPage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Nächste PDF-Seite' }));
    await waitFor(() => expect(mocks.getPage).toHaveBeenLastCalledWith(2));
    view.rerender(<Lightbox photos={photos} index={1} onClose={vi.fn()} onIndexChange={vi.fn()} />);
    await waitFor(() => expect(mocks.getPage).toHaveBeenLastCalledWith(1));
    expect(mocks.destroy).toHaveBeenCalled();
    expect(mocks.resolve).toHaveBeenLastCalledWith(photos[1].storagePath);
  });

  it('does not switch receipts when a PDF is dragged', async () => {
    const onIndexChange = vi.fn();
    render(<Lightbox photos={[receipt, receipt]} index={0} onClose={vi.fn()} onIndexChange={onIndexChange} />);
    const page = await screen.findByLabelText('PDF-Seite 1');
    fireEvent.touchStart(page, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(page, { changedTouches: [{ clientX: 50 }] });
    expect(onIndexChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Nächste Datei' }));
    expect(onIndexChange).toHaveBeenCalledWith(1);
  });

  it('keeps images on the existing image viewer', async () => {
    render(<Lightbox photos={[{ ...receipt, contentType: 'image/jpeg' }]} index={0} onClose={vi.fn()} onIndexChange={vi.fn()} />);
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:receipt');
    expect(mocks.load).not.toHaveBeenCalled();
  });
});