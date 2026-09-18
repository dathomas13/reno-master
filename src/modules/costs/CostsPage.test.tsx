import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CostsPage from './CostsPage';

const mocks = vi.hoisted(() => ({ native: false }));

vi.mock('@/components/TopBar', () => ({
  TopBar: ({ title, action }: { title: string; action?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {action}
    </header>
  ),
}));
vi.mock('@/data/hooks', () => ({
  useCollection: () => ({ data: [], loading: false }),
}));
vi.mock('@/firebase/db', () => ({ orderBy: vi.fn() }));
vi.mock('@/data/RoomsContext', () => ({ useRooms: () => ({ name: (id: string) => id }) }));
vi.mock('@/platform', () => ({ isNative: () => mocks.native }));

beforeEach(() => {
  mocks.native = false;
});
afterEach(cleanup);

function renderCosts() {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CostsPage />
    </MemoryRouter>,
  );
}

describe('cost CSV export', () => {
  it('shows the CSV download in the browser', () => {
    renderCosts();

    expect(screen.getByRole('button', { name: 'CSV' })).toBeInTheDocument();
  });

  it('hides the CSV download in the app', () => {
    mocks.native = true;

    renderCosts();

    expect(screen.queryByRole('button', { name: 'CSV' })).not.toBeInTheDocument();
  });
});