import { describe, expect, it } from 'vitest';
import type { Task } from '@/data/types';
import {
  isTaskReminderId,
  parseTaskReminderAt,
  planTaskReminders,
  taskReminderId,
} from '../taskReminderPlan';

function task(patch: Partial<Task>): Task {
  return {
    id: 'task-1',
    title: 'Fenster pruefen',
    status: 'Offen',
    priority: 'Mittel',
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
        task({ id: 'done', status: 'Erledigt', reminderAt: '2026-09-20T08:00:00' }),
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

  it('uses stable notification ids in its own range', () => {
    expect(taskReminderId('abc')).toBe(taskReminderId('abc'));
    expect(isTaskReminderId(taskReminderId('abc'))).toBe(true);
  });

  it('ignores invalid reminder dates', () => {
    expect(parseTaskReminderAt(undefined)).toBeNull();
    expect(parseTaskReminderAt('kein datum')).toBeNull();
  });
});
