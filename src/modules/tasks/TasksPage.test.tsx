import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Task } from '@/data/types';
import { ToastProvider } from '@/components/Toast';
import TasksPage from './TasksPage';

const mocks = vi.hoisted(() => ({
  tasks: [] as Task[],
  trades: [{ id: 'maler', name: 'Maler', status: 'offen', priority: 'mittel' }],
  saveTask: vi.fn().mockResolvedValue('task-1'),
  toggleTaskDone: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/TopBar', () => ({ TopBar: ({ action }: { action?: React.ReactNode }) => <>{action}</> }));
vi.mock('@/components/Pickers', () => ({
  RoomPicker: () => null,
  TradeSelect: () => null,
  PhaseSelect: () => null,
  MultiPicker: ({ chipLabel }: { chipLabel?: string }) => <button type="button">{chipLabel}</button>,
}));
vi.mock('@/data/hooks', () => ({
  useCollection: (name: string) => ({ data: name === 'trades' ? mocks.trades : mocks.tasks, loading: false }),
}));
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
vi.mock('@/data/RoomsContext', () => ({
  useRooms: () => ({
    name: (id: string) => id,
    shortLabel: (id: string) => id,
    matches: (roomIds: string[], filterId: string) => roomIds.includes(filterId),
    idsFor: (id: string) => [id],
    writeId: (id: string) => id,
    rooms: [{ id: 'eg-bad', name: 'Bad', floor: 'EG', rects: [] }],
  }),
}));
vi.mock('@/data/repos', () => ({
  emptyTask: () => ({
    id: 'new-task',
    title: '',
    status: 'offen',
    priority: 'mittel',
    assignees: [],
    roomIds: [],
  }),
  saveTask: mocks.saveTask,
  toggleTaskDone: mocks.toggleTaskDone,
  deleteTask: mocks.deleteTask,
}));

beforeEach(() => {
  mocks.tasks = [
    {
      id: 'task-1',
      title: 'Fenster pruefen',
      status: 'offen',
      priority: 'Mittel',
      assignees: [],
      roomIds: [],
      reminderAt: '2026-09-24T19:30:00',
    },
  ];
  mocks.saveTask.mockClear();
  mocks.toggleTaskDone.mockClear();
  mocks.deleteTask.mockClear();
});
afterEach(cleanup);

describe('tasks page', () => {
  it('keeps a just-completed task completed when opening and finishing the editor', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TasksPage />
      </MemoryRouter>,
    );
    await act(async () => {});

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Fenster pruefen/ }));
    });
    expect(
      within(screen.getByRole('dialog', { name: 'Aufgabe' })).getByRole('button', { name: 'Offen' }),
    ).toHaveClass('chip-on');
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: 'Aufgabe' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Erledigt: Fenster pruefen' }));
    });
    // done tasks leave the open list; the chip shows them
    expect(screen.queryByRole('button', { name: /^Fenster pruefen/ })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Erledigte' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Fenster pruefen/ }));
    });

    const dialog = screen.getByRole('dialog', { name: 'Aufgabe' });
    expect(within(dialog).getByRole('button', { name: 'Erledigt' })).toHaveClass('chip-on');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Fertig' }));
    });
    expect(mocks.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', status: 'erledigt' }),
    );
  });

  it('saves a task reminder from the editor', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TasksPage />
      </MemoryRouter>,
    );
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Fenster pruefen/ }));
    });

    const dialog = screen.getByRole('dialog', { name: 'Aufgabe' });
    const reminder = within(dialog).getByDisplayValue('2026-09-24T19:30');
    fireEvent.change(reminder, { target: { value: '2026-09-25T08:15' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    });

    expect(mocks.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', reminderAt: '2026-09-25T08:15:00' }),
    );
  });

  it('does not save an empty task from the sheet header', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TasksPage />
      </MemoryRouter>,
    );
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Neu' }));
    });

    const dialog = screen.getByRole('dialog', { name: 'Aufgabe' });
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Fertig' }));
    });

    expect(mocks.saveTask).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Aufgabe' })).not.toBeInTheDocument();
  });

  it('reads short-hand in the quick field and lets a hit be dropped', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TasksPage />
      </MemoryRouter>,
    );
    await act(async () => {});
    const field = screen.getByPlaceholderText(/Neue Aufgabe/);
    fireEvent.change(field, { target: { value: 'Silikon kaufen ! Maler Bad' } });

    expect(screen.getByRole('button', { name: 'Raum eg-bad nicht übernehmen' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gewerk Maler nicht übernehmen' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Aufgabe hinzufügen' }));
    });

    expect(mocks.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Silikon kaufen Maler', priority: 'hoch', roomIds: ['eg-bad'] }),
    );
    expect(mocks.saveTask.mock.calls[0]![0]).not.toHaveProperty('tradeId');
  });

  it('offers only the people who already have tasks as assignee chips', async () => {
    mocks.tasks = [{ ...mocks.tasks[0]!, assignees: ['thomas'] }];
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TasksPage />
      </MemoryRouter>,
    );
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Neu' }));
    });

    const dialog = screen.getByRole('dialog', { name: 'Aufgabe' });
    expect(within(dialog).getByRole('button', { name: 'Thomas' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).queryByRole('button', { name: 'Sarah' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Person' })).toBeInTheDocument();
  });

  it('opens a new task straight away from the capture button (?neu=1)', async () => {
    render(
      <MemoryRouter initialEntries={['/aufgaben?neu=1']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TasksPage />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: 'Aufgabe' })).toBeInTheDocument();
  });

  it('deletes a task and brings it back with "Rückgängig"', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <TasksPage />
        </ToastProvider>
      </MemoryRouter>,
    );
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Fenster pruefen/ }));
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Aufgabe' })).getByRole('button', { name: 'Löschen' }));
    });
    expect(mocks.deleteTask).toHaveBeenCalledWith('task-1');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    });
    expect(mocks.saveTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1', title: 'Fenster pruefen' }));
  });
});
