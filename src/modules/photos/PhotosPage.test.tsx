import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Cost, DiaryEntry, Phase, Photo } from '@/data/types';
import PhotosPage from './PhotosPage';

const phases: Phase[] = [
  { id: 'phase-2', name: 'Phase 2: Entkernung & Rückbau', status: 'Abgeschlossen', order: 2 },
  { id: 'phase-3', name: 'Phase 3: Rohbau & Keller', status: 'In Arbeit', order: 3 },
];
const entries: DiaryEntry[] = [
  { id: 'entry-1', date: '2026-09-17', title: 'Rückbau', text: '', present: [], defects: false, phaseId: 'phase-2', tradeIds: [], roomIds: [], photoIds: [] },
  { id: 'entry-2', date: '2026-09-18', title: 'Keller', text: '', present: [], defects: false, phaseId: 'phase-3', tradeIds: [], roomIds: [], photoIds: [] },
];
const photos: Photo[] = [
  { id: 'photo-1', entryId: 'entry-1', kind: 'photo', storagePath: 'photos/1.jpg', contentType: 'image/jpeg', width: 1, height: 1, bytes: 1, roomIds: [], uploadState: 'uploaded' },
  { id: 'photo-2', entryId: 'entry-2', kind: 'photo', storagePath: 'photos/2.jpg', contentType: 'image/jpeg', width: 1, height: 1, bytes: 1, roomIds: [], uploadState: 'uploaded' },
  { id: 'receipt-1', costId: 'cost-1', kind: 'receipt', storagePath: 'receipts/1.jpg', contentType: 'image/jpeg', width: 1, height: 1, bytes: 1, roomIds: [], uploadState: 'uploaded' },
];
const costs: Cost[] = [
  { id: 'cost-1', date: '2026-09-19', vendor: 'Baumarkt', description: '', amountGross: 1, category: '', roomIds: [], paymentStatus: 'bezahlt', receiptPhotoIds: ['receipt-1'] },
];

vi.mock('@/components/TopBar', () => ({ TopBar: ({ title, subtitle }: { title: string; subtitle?: string }) => <header><h1>{title}</h1><p>{subtitle}</p></header> }));
vi.mock('@/components/PhotoView', () => ({
  PhotoImage: ({ photo }: { photo: Photo }) => <img alt={photo.id} />,
  Lightbox: ({ photos, index }: { photos: Photo[]; index: number }) => <div role="dialog">{photos[index]?.id}</div>,
}));
vi.mock('@/data/hooks', () => ({
  useCollection: (collection: string) => ({
    data: collection === 'photos' ? photos : collection === 'diary' ? entries : collection === 'costs' ? costs : collection === 'phases' ? phases : [],
    loading: false,
  }),
}));
vi.mock('@/firebase/db', () => ({ orderBy: vi.fn() }));
vi.mock('@/data/RoomsContext', () => ({ useRooms: () => ({ name: (id: string) => id }) }));

afterEach(cleanup);

function renderPhotos() {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PhotosPage /></MemoryRouter>);
}

describe('photos page phase grouping', () => {
  it('groups photos by diary phase by default and leaves receipts out', () => {
    renderPhotos();

    expect(screen.getByRole('button', { name: 'Nach Phase' })).toHaveClass('chip-on');
    expect(screen.getByText('Phase 2: Entkernung & Rückbau')).toBeInTheDocument();
    expect(screen.getByText('Phase 3: Rohbau & Keller')).toBeInTheDocument();
    expect(screen.getByAltText('photo-1')).toBeInTheDocument();
    expect(screen.getByAltText('photo-2')).toBeInTheDocument();
    expect(screen.queryByAltText('receipt-1')).not.toBeInTheDocument();
  });

  it('can switch back to month grouping', () => {
    renderPhotos();

    fireEvent.click(screen.getByRole('button', { name: 'Nach Monat' }));

    expect(screen.getByText('September 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nach Monat' })).toHaveClass('chip-on');
  });
});