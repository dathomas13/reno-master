import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { DiaryEntry, Photo } from '@/data/types';
import DiaryEditorPage from './DiaryEditorPage';

const entries: DiaryEntry[] = [
  {
    id: 'entry-1',
    date: '2026-09-18',
    title: 'Erster Eintrag',
    text: 'alt',
    present: [],
    defects: false,
    tradeIds: [],
    roomIds: [],
    photoIds: [],
  },
  {
    id: 'entry-2',
    date: '2026-09-18',
    title: 'Zweiter Eintrag',
    text: 'neu',
    present: [],
    defects: false,
    tradeIds: [],
    roomIds: [],
    photoIds: [],
  },
];
const emptyRows: unknown[] = [];
const photoState = vi.hoisted(() => ({ rows: [] as Photo[] }));
const attachedPhoto = {
  id: 'photo-1', entryId: 'new-entry', originalName: 'test.jpg', uploadState: 'pending',
} as Photo;

vi.mock('@/components/TopBar', () => ({ TopBar: () => null }));
vi.mock('@/components/Pickers', () => ({
  RoomPicker: () => null,
  TradePicker: () => null,
  PhaseSelect: () => null,
}));
vi.mock('./PhotoAttach', () => ({ PhotoAttach: ({ photos, onAdded, onBusyChange }: {
  photos: Photo[]; onAdded(photo: Photo): void; onBusyChange(busy: boolean): void;
}) => <div>
  <button onClick={() => onBusyChange(true)}>Import starten</button>
  <button onClick={() => { onAdded(attachedPhoto); onBusyChange(false); }}>Import beenden</button>
  {photos.map((photo) => <span key={photo.id}>{photo.id}: {photo.uploadState}</span>)}
</div> }));
vi.mock('@/data/hooks', () => ({
  useDocument: (_collection: string, id?: string) => ({
    data: entries.find((entry) => entry.id === id) ?? null,
    loading: false,
  }),
  useCollection: (collection: string) => ({
    data: collection === 'diary' ? entries : collection === 'photos' ? photoState.rows : emptyRows,
    loading: false,
  }),
}));
vi.mock('@/data/useLists', () => ({
  useLists: () => ({ lists: { weather: [], people: [] }, addTo: vi.fn() }),
}));
vi.mock('@/firebase/db', () => ({ where: vi.fn() }));
vi.mock('@/data/repos', () => ({
  emptyDiaryEntry: (date = '2026-09-18') => ({
    id: 'new-entry',
    date,
    title: '',
    text: '',
    present: [],
    defects: false,
    tradeIds: [],
    roomIds: [],
    photoIds: [],
  }),
  saveDiaryEntry: vi.fn(),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  photoState.rows = [];
});

function renderNewEditor() {
  render(
    <MemoryRouter initialEntries={['/tagebuch/neu']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/tagebuch/neu" element={<DiaryEditorPage />} />
        <Route path="/tagebuch" element={<p>Bautagebuch Liste</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('diary editor', () => {
  it('keeps editing during import and reconciles local photos with delayed snapshots', () => {
    renderNewEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Import starten' }));
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
    const text = document.querySelector('textarea')!;
    fireEvent.change(text, { target: { value: 'Weitergeschrieben beim Import' } });
    expect(text).toHaveValue('Weitergeschrieben beim Import');
    fireEvent.click(screen.getByRole('button', { name: 'Import beenden' }));
    expect(screen.getByText('photo-1: pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeEnabled();
    photoState.rows = [];
    fireEvent.change(text, { target: { value: 'Späterer leerer Snapshot' } });
    expect(screen.getByText('photo-1: pending')).toBeInTheDocument();
    photoState.rows = [{ ...attachedPhoto, uploadState: 'uploaded' }];
    fireEvent.change(text, { target: { value: 'Foto synchronisiert' } });
    expect(screen.getAllByText('photo-1: uploaded')).toHaveLength(1);
    expect(screen.queryByText('photo-1: pending')).not.toBeInTheDocument();
  });
  it('loads the new entry when navigating between entry ids in the editor', async () => {
    render(
      <MemoryRouter
        initialEntries={['/tagebuch/entry-1/bearbeiten']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/tagebuch/:id/bearbeiten" element={<DiaryEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByDisplayValue('Erster Eintrag')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Diesen öffnen' }));
    });
    await waitFor(() => expect(screen.getByDisplayValue('Zweiter Eintrag')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('Erster Eintrag')).not.toBeInTheDocument();
  });

  it('keeps a started new entry as a draft and restores it', async () => {
    renderNewEditor();
    fireEvent.change(screen.getByPlaceholderText(/Was ist heute passiert|Kurzer Stand|Heute festhalten|Notizen zum Tag|Haus verändert|nachvollziehbar/), {
      target: { value: 'Putz im Flur vorbereitet.' },
    });
    await waitFor(() => expect(localStorage.getItem('reno.diary.draft.v1')).toContain('Putz im Flur'));

    cleanup();
    renderNewEditor();

    expect(screen.getByDisplayValue('Putz im Flur vorbereitet.')).toBeInTheDocument();
  });

  it('discards the draft explicitly and closes the editor', async () => {
    renderNewEditor();
    fireEvent.change(screen.getByPlaceholderText(/Was ist heute passiert|Kurzer Stand|Heute festhalten|Notizen zum Tag|Haus verändert|nachvollziehbar/), {
      target: { value: 'Nur als Entwurf.' },
    });
    await waitFor(() => expect(localStorage.getItem('reno.diary.draft.v1')).toContain('Nur als Entwurf'));

    fireEvent.click(screen.getByRole('button', { name: 'Verwerfen und schließen' }));

    expect(localStorage.getItem('reno.diary.draft.v1')).toBeNull();
    expect(screen.getByText('Bautagebuch Liste')).toBeInTheDocument();
  });
});
