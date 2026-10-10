import { describe, expect, it } from 'vitest';
import type { Task } from '@/data/types';
import {
  isTaskForPerson,
  isTaskReminderId,
  parseTaskReminderAt,
  planTaskReminders,
  taskReminderId,
} from '../taskReminderPlan';

function task(patch: Partial<Task>): Task {
  return {
    id: 'task-1',
    title: 'Fenster pruefen',
    status: 'offen',
    priority: 'mittel',
    assignees: [],
    roomIds: [],
    ...patch,
  };
}

describe('task reminder plan', () => {
  it('plans only future reminders for open tasks', () => {
    const plan = planTaskReminders(
      [
        task({ id: 'future', reminderAt: '2026-09-19T08:00:00' }),
        task({ id: 'past', reminderAt: '2026-09-17T08:00:00' }),
        task({ id: 'done', status: 'erledigt', reminderAt: '2026-09-20T08:00:00' }),
        task({ id: 'done-id', status: 'erledigt', reminderAt: '2026-09-20T08:00:00' }),
        task({ id: 'none', reminderAt: undefined }),
      ],
      new Date('2026-09-18T12:00:00'),
    );

    expect(plan).toEqual([
      expect.objectContaining({
        taskId: 'future',
        title: 'Fenster pruefen',
        at: new Date('2026-09-19T08:00:00'),
      }),
    ]);
  });

  it('plans only the tasks for the linked person and for nobody', () => {
    const tasks = [
      task({ id: 'sarah', assignees: ['sarah'], reminderAt: '2026-09-19T08:00:00' }),
      task({ id: 'thomas', assignees: ['thomas'], reminderAt: '2026-09-19T09:00:00' }),
      task({ id: 'both', assignees: ['thomas', 'sarah'], reminderAt: '2026-09-19T10:00:00' }),
      task({ id: 'nobody', assignees: [], reminderAt: '2026-09-19T11:00:00' }),
    ];
    const now = new Date('2026-09-18T12:00:00');

    expect(planTaskReminders(tasks, now, 'sarah').map((item) => item.taskId)).toEqual([
      'sarah',
      'both',
      'nobody',
    ]);
    // not linked: every reminder, as before
    expect(planTaskReminders(tasks, now, null)).toHaveLength(4);
  });

  it('treats a task without an assignee list as one for everybody', () => {
    expect(isTaskForPerson({ assignees: undefined as unknown as string[] }, 'sarah')).toBe(true);
    expect(isTaskForPerson({ assignees: ['thomas'] }, 'sarah')).toBe(false);
    expect(isTaskForPerson({ assignees: ['thomas'] }, null)).toBe(true);
  });

  it('uses stable notification ids in its own range', () => {
    expect(taskReminderId('abc')).toBe(taskReminderId('abc'));
    expect(isTaskReminderId(taskReminderId('abc'))).toBe(true);
  });

  it('ignores invalid reminder dates', () => {
    expect(parseTaskReminderAt(undefined)).toBeNull();
    expect(parseTaskReminderAt('kein datum')).toBeNull();
  });
});
