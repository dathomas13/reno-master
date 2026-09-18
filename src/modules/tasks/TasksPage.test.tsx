import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Task } from '@/data/types';
import TasksPage from './TasksPage';

const mocks = vi.hoisted(() => ({
  tasks: [] as Task[],
  saveTask: vi.fn().mockResolvedValue('task-1'),
  toggleTaskDone: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/TopBar', () => ({ TopBar: () => null }));
vi.mock('@/components/Pickers', () => ({
  RoomPicker: () => null,
  TradeSelect: () => null,
  PhaseSelect: () => null,
}));
vi.mock('@/data/hooks', () => ({
  useCollection: () => ({ data: mocks.tasks, loading: false }),
}));
vi.mock('@/data/useLists', () => ({ useLists: () => ({ lists: { taskAreas: [] } }) }));
vi.mock('@/data/RoomsContext', () => ({ useRooms: () => ({ name: (id: string) => id }) }));
vi.mock('@/data/repos', () => ({
  emptyTask: () => ({
    id: 'new-task',
    title: '',
    status: 'Offen',
    priority: 'Mittel',
    assignees: [],
    roomIds: [],
  }),
  saveTask: mocks.saveTask,
  toggleTaskDone: mocks.toggleTaskDone,
  deleteTask: vi.fn(),
}));

beforeEach(() => {
  mocks.tasks = [
    {
      id: 'task-1',
      title: 'Fenster pruefen',
      status: 'Offen',
      priority: 'Mittel',
      assignees: [],
      roomIds: [],
      reminderAt: '2026-09-24T19:30:00',
    },
  ];
  mocks.saveTask.mockClear();
  mocks.toggleTaskDone.mockClear();
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
      fireEvent.click(screen.getByRole('button', { name: 'Alle' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Fenster pruefen/ }));
    });
    expect(
      within(screen.getByRole('dialog', { name: 'Aufgabe' })).getByRole('button', { name: 'Offen' }),
    ).toHaveClass('chip-on');
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: 'Aufgabe' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Erledigt' })[1]);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Fenster pruefen/ }));
    });

    const dialog = screen.getByRole('dialog', { name: 'Aufgabe' });
    expect(within(dialog).getByRole('button', { name: 'Erledigt' })).toHaveClass('chip-on');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Fertig' }));
    });
    expect(mocks.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1', status: 'Erledigt' }),
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
      fireEvent.click(screen.getByRole('button', { name: /Fenster pruefen/ }));
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
      fireEvent.click(screen.getByRole('button', { name: '+' }));
    });

    const dialog = screen.getByRole('dialog', { name: 'Aufgabe' });
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeDisabled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Fertig' }));
    });

    expect(mocks.saveTask).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Aufgabe' })).not.toBeInTheDocument();
  });
});
