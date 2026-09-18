import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Photo } from '@/data/types';
import CostEditorPage from './CostEditorPage';

const mocks = vi.hoisted(() => ({
  photos: [] as Photo[],
  saveCost: vi.fn().mockResolvedValue('cost-1'),
  attachment: {} as {
    costId: string;
    photos: Photo[];
    onAdded(photo: Photo): void;
    onBusyChange?(busy: boolean): void;
    onDuplicate?(photo: Photo): void;
  },
}));

vi.mock('@/components/TopBar', () => ({ TopBar: ({ action }: { action: ReactNode }) => <header>{action}</header> }));
vi.mock('@/components/Pickers', () => ({ RoomPicker: () => null, TradeSelect: () => null }));
vi.mock('@/modules/diary/PhotoAttach', () => ({
  PhotoAttach: (props: typeof mocks.attachment) => {
    mocks.attachment = props;
    return null;
  },
}));
vi.mock('@/data/hooks', () => ({
  useDocument: (_collection: string, id?: string) => ({
    data: id === 'other-cost' ? {
      id, date: '2026-09-16', vendor: 'Vorhandener Haendler', description: '', amountGross: 25,
      category: '', roomIds: [], paymentStatus: 'bezahlt', receiptPhotoIds: [],
    } : null,
    loading: false,
  }),
  useCollection: (collection: string) => ({ data: collection === 'photos' ? mocks.photos : [], loading: false }),
}));
vi.mock('@/data/useLists', () => ({ useLists: () => ({ lists: { costCategories: [] } }) }));
vi.mock('@/firebase/db', () => ({ where: vi.fn() }));
vi.mock('@/data/repos', () => ({
  emptyCost: () => ({
    id: 'cost-1', date: '2026-09-17', vendor: '', description: '', amountGross: 0,
    category: '', roomIds: [], paymentStatus: 'bezahlt', receiptPhotoIds: [],
  }),
  saveCost: mocks.saveCost,
  deleteCost: vi.fn(),
}));
vi.mock('@/platform/ocr', () => ({ activeExtractor: vi.fn().mockResolvedValue(null) }));

beforeEach(() => {
  mocks.photos = [];
  mocks.saveCost.mockClear();
});
afterEach(cleanup);

describe('receipt attachment', () => {
  it('keeps local attachments through a late snapshot and deduplicates acknowledgements', async () => {
    const view = render(<MemoryRouter><CostEditorPage /></MemoryRouter>);
    await act(async () => {});
    const photo = { id: 'receipt-1', costId: 'cost-1' } as Photo;
    act(() => mocks.attachment.onAdded(photo));
    mocks.photos = [];
    view.rerender(<MemoryRouter><CostEditorPage /></MemoryRouter>);
    expect(mocks.attachment.photos).toEqual([photo]);
    mocks.photos = [photo];
    view.rerender(<MemoryRouter><CostEditorPage /></MemoryRouter>);
    act(() => mocks.attachment.onAdded(photo));
    expect(mocks.attachment.photos).toEqual([photo]);
  });

  it('links to the existing invoice and blocks saving a duplicate', async () => {
    render(
      <MemoryRouter initialEntries={['/kosten/neu']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/kosten/neu" element={<CostEditorPage />} />
          <Route path="/kosten/:id" element={<CostEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => {});
    act(() => mocks.attachment.onDuplicate?.({ id: 'receipt-1', costId: 'other-cost' } as Photo));
    expect(screen.getByRole('link', { name: 'Vorhandene Rechnung öffnen' })).toHaveAttribute('href', '/kosten/other-cost');
    for (const button of screen.getAllByRole('button', { name: 'Speichern' })) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(mocks.saveCost).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: 'Vorhandene Rechnung öffnen' }));
    await waitFor(() => expect(screen.getByDisplayValue('Vorhandener Haendler')).toBeInTheDocument());
    expect(mocks.attachment.costId).toBe('other-cost');
    expect(screen.queryByRole('link', { name: 'Vorhandene Rechnung öffnen' })).not.toBeInTheDocument();
  });

  it('blocks saving until the receipt has been attached and saves its reference', async () => {
    render(<MemoryRouter><CostEditorPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Speichern' })).toHaveLength(2));

    act(() => mocks.attachment.onBusyChange?.(true));
    for (const button of screen.getAllByRole('button', { name: 'Speichern' })) {
      expect(button).toBeDisabled();
    }
    expect(mocks.saveCost).not.toHaveBeenCalled();

    act(() => {
      mocks.attachment.onAdded({ id: 'receipt-1', costId: mocks.attachment.costId } as Photo);
      mocks.attachment.onBusyChange?.(false);
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Speichern' })[0]);
    await waitFor(() => expect(mocks.saveCost).toHaveBeenCalledWith(expect.objectContaining({
      id: 'cost-1', receiptPhotoIds: ['receipt-1'],
    })));
  });
});