import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import type { Phase, Task } from '@/data/types';

const patchPhase = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const toggleTaskDone = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const phases: Phase[] = [
  { id: 'phase-2', name: 'Phase 2: Entkernung & Rückbau', status: 'in-arbeit', start: '2026-06-15', order: 2 },
  { id: 'phase-3', name: 'Phase 3: Rohbau & Keller', status: 'geplant', order: 3 },
];
const tasks: Task[] = [
  { id: 'task-1', title: 'Fenster pruefen', status: 'offen', priority: 'hoch', assignees: [], roomIds: [] },
];

vi.mock('@/components/PhotoView', () => ({ PhotoImage: () => null }));
vi.mock('@/data/hooks', () => ({
  useCollection: (collection: string) => ({
    data: collection === 'phases' ? phases : collection === 'tasks' ? tasks : [],
    loading: false,
  }),
}));
vi.mock('@/data/repos', () => ({ patchPhase, toggleTaskDone }));
vi.mock('@/data/useOptions', async () => {
  const options = await vi.importActual<typeof import('@/data/options')>('@/data/options');
  const sets = options.normalizeSets();
  return {
    useOptions: () => ({
      sets,
      label: (key: string, stored: string) => options.labelOf(sets[key as keyof typeof sets], stored),
      active: (key: string) => options.activeEntries(sets[key as keyof typeof sets]),
      add: () => '',
    }),
  };
});
vi.mock('@/firebase/db', () => ({ orderBy: vi.fn(), limit: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
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
    expect(patchPhase).toHaveBeenCalledWith('phase-2', expect.objectContaining({ status: 'abgeschlossen' }));
    expect(patchPhase).toHaveBeenCalledWith('phase-3', expect.objectContaining({ status: 'in-arbeit' }));
  });

  it('ticks an urgent task off right on the start page', async () => {
    renderHome();
    fireEvent.click(screen.getByRole('button', { name: 'Erledigt: Fenster pruefen' }));
    await waitFor(() => expect(toggleTaskDone).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' })));
    expect(screen.queryByRole('link', { name: 'Fenster pruefen' })).not.toBeInTheDocument();
  });

  it('links urgent tasks to their task sheet', () => {
    renderHome();

    expect(screen.getByRole('link', { name: 'Fenster pruefen' })).toHaveAttribute(
      'href',
      '/aufgaben?aufgabe=task-1',
    );
  });

  it('shows only the blocks chosen in the settings, in their order', () => {
    localStorage.setItem(
      'reno.settings',
      JSON.stringify({ homeLayout: { order: ['urgent', 'search'], hidden: ['house', 'costs'] } }),
    );
    renderHome();

    expect(screen.queryByRole('button', { name: 'Phase 2: Entkernung & Rückbau' })).not.toBeInTheDocument();
    expect(screen.queryByText('Kosten gesamt')).not.toBeInTheDocument();
    const urgent = screen.getByText('Dringend');
    const search = screen.getByRole('link', { name: 'Suchen' });
    expect(urgent.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows the quick access tiles chosen in the settings', () => {
    renderHome();
    expect(screen.getByRole('link', { name: 'Notizen' })).toHaveAttribute('href', '/notizen');
    cleanup();

    localStorage.setItem('reno.settings', JSON.stringify({ shortcuts: { order: ['haus', 'notizen'], shown: 1 } }));
    renderHome();
    expect(screen.getByRole('link', { name: '3D-Modell' })).toHaveAttribute('href', '/3d');
    expect(screen.queryByRole('link', { name: 'Notizen' })).not.toBeInTheDocument();
  });
});
