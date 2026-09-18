import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import type { Phase } from '@/data/types';

const patchPhase = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const phases: Phase[] = [
  { id: 'phase-2', name: 'Phase 2: Entkernung & Rückbau', status: 'In Arbeit', start: '2026-06-15', order: 2 },
  { id: 'phase-3', name: 'Phase 3: Rohbau & Keller', status: 'Geplant', order: 3 },
];

vi.mock('@/components/PhotoView', () => ({ PhotoImage: () => null }));
vi.mock('@/data/hooks', () => ({
  useCollection: (collection: string) => ({
    data: collection === 'phases' ? phases : [],
    loading: false,
  }),
}));
vi.mock('@/data/repos', () => ({ patchPhase }));
vi.mock('@/firebase/db', () => ({ orderBy: vi.fn(), limit: vi.fn() }));

beforeEach(() => {
  patchPhase.mockClear();
});
afterEach(cleanup);

function renderHome() {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <HomePage />
    </MemoryRouter>,
  );
}

describe('home phase', () => {
  it('keeps the phase subtle in the hero and lets it be changed', async () => {
    renderHome();

    fireEvent.click(screen.getByRole('button', { name: 'Phase 2: Entkernung & Rückbau' }));
    fireEvent.click(screen.getByRole('button', { name: /Phase 3: Rohbau & Keller/ }));

    await waitFor(() => expect(patchPhase).toHaveBeenCalledTimes(2));
    expect(patchPhase).toHaveBeenCalledWith('phase-2', expect.objectContaining({ status: 'Abgeschlossen' }));
    expect(patchPhase).toHaveBeenCalledWith('phase-3', expect.objectContaining({ status: 'In Arbeit' }));
  });
});