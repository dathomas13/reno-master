import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { DiaryEntry } from '@/data/types';
import DiaryListPage from './DiaryListPage';

const base = { text: '', present: [], tradeIds: [], roomIds: [], photoIds: [] };
const entries: DiaryEntry[] = [
  { ...base, id: 'entry-1', date: '2026-10-08', title: 'Estrich trocknet', defects: false },
  { ...base, id: 'entry-2', date: '2026-10-08', title: 'Riss im Putz', defects: true },
];

vi.mock('@/components/TopBar', () => ({ TopBar: ({ title }: { title: string }) => <header><h1>{title}</h1></header> }));
vi.mock('@/components/PhotoView', () => ({ PhotoImage: () => null }));
vi.mock('@/data/hooks', () => ({
  useCollection: (collection: string) => ({ data: collection === 'diary' ? entries : [], loading: false }),
}));
vi.mock('@/firebase/db', () => ({ orderBy: vi.fn() }));
vi.mock('@/data/useOptions', async () => {
  const options = await vi.importActual<typeof import('@/data/options')>('@/data/options');
  const sets = options.normalizeSets();
  return {
    useOptions: () => ({
      sets,
      label: (key: string, stored: string) => options.labelOf(sets[key as keyof typeof sets], stored),
    }),
  };
});
vi.mock('@/data/repos', () => ({ deleteDiaryEntry: vi.fn(), saveDiaryEntry: vi.fn() }));
vi.mock('@/data/RoomsContext', () => ({
  useRooms: () => ({ shortLabel: (id: string) => id, matches: (roomIds: string[], id: string) => roomIds.includes(id) }),
}));

afterEach(cleanup);

describe('diary list', () => {
  it('filters to the entries marked with defects and back', () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DiaryListPage /></MemoryRouter>);
    expect(screen.getByText('Estrich trocknet')).toBeInTheDocument();

    const chip = screen.getByRole('button', { name: 'Mängel' });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Estrich trocknet')).not.toBeInTheDocument();
    expect(screen.getByText('Riss im Putz')).toBeInTheDocument();

    fireEvent.click(chip);
    expect(screen.getByText('Estrich trocknet')).toBeInTheDocument();
  });
});
