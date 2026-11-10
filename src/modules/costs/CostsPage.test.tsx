import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CostsPage from './CostsPage';

const mocks = vi.hoisted(() => ({ costs: [] as unknown[] }));

vi.mock('@/components/TopBar', () => ({
  TopBar: ({ title, action }: { title: string; action?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {action}
    </header>
  ),
}));
vi.mock('@/data/hooks', () => ({
  useCollection: (name: string) => ({ data: name === 'costs' ? mocks.costs : [], loading: false }),
}));
vi.mock('@/data/useOptions', async () => {
  const options = await import('@/data/options');
  const { DEFAULT_OPTIONS: sets } = options;
  const value = {
    sets,
    label: (key: keyof typeof sets, stored: string) => options.labelOf(sets[key], stored),
    active: (key: keyof typeof sets) => options.activeEntries(sets[key]),
    add: () => '',
  };
  return { useOptions: () => value };
});
vi.mock('@/firebase/db', () => ({ orderBy: vi.fn(), where: vi.fn() }));
vi.mock('@/data/exportFiles', () => ({ readFromStorage: vi.fn() }));
vi.mock('@/platform/shareFile', () => ({ handOverFile: vi.fn() }));
vi.mock('@/data/repos', () => ({ deleteCost: vi.fn(), saveCost: vi.fn() }));
vi.mock('@/data/RoomsContext', () => ({
  useRooms: () => ({
    name: (id: string) => id,
    shortLabel: (id: string) => id,
    matches: (roomIds: string[], filterId: string) => roomIds.includes(filterId),
    idsFor: (id: string) => [id],
    writeId: (id: string) => id,
  }),
}));

beforeEach(() => {
  mocks.costs = [];
});
afterEach(cleanup);

function renderCosts() {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CostsPage />
    </MemoryRouter>,
  );
}

function cost(id: string, vendor: string, marks?: string[]) {
  return {
    id, vendor, marks, date: '2026-09-01', description: '', amountGross: 10, category: '',
    roomIds: [], paymentStatus: 'bezahlt', receiptPhotoIds: [],
  };
}

describe('cost export', () => {
  it('offers the export in the browser and in the app alike', () => {
    mocks.costs = [cost('a', 'Hornbach')];
    renderCosts();

    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
  });

  it('has nothing to export in an empty list', () => {
    renderCosts();

    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });
});

describe('cost marks', () => {
  it('shows no mark filter while no cost carries a mark', () => {
    mocks.costs = [cost('a', 'Hornbach')];
    renderCosts();

    expect(screen.queryByRole('button', { name: 'KfW' })).not.toBeInTheDocument();
  });

  it('filters by a mark once one is in use', () => {
    mocks.costs = [cost('a', 'Hornbach'), cost('b', 'Fenster Müller', ['kfw'])];
    renderCosts();

    const chip = screen.getByRole('button', { name: 'KfW' });
    expect(screen.queryByRole('button', { name: 'Absetzbar' })).not.toBeInTheDocument();
    expect(screen.getByText('Hornbach')).toBeInTheDocument();

    fireEvent.click(chip);

    expect(screen.getByRole('button', { name: 'KfW', pressed: true })).toBeInTheDocument();
    expect(screen.queryByText('Hornbach')).not.toBeInTheDocument();
    expect(screen.getByText('Fenster Müller')).toBeInTheDocument();
  });
});
