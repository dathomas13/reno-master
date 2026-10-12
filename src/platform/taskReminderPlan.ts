import type { Task } from '@/data/types';
import { isTaskDone } from '@/data/options';

const TASK_REMINDER_ID_BASE = 8_000_000;
const TASK_REMINDER_ID_SPAN = 1_000_000;

export interface PlannedTaskReminder {
  id: number;
  taskId: string;
  title: string;
  at: Date;
}

export function taskReminderId(taskId: string): number {
  let hash = 0;
  for (let index = 0; index < taskId.length; index += 1) {
    hash = (hash * 31 + taskId.charCodeAt(index)) >>> 0;
  }
  return TASK_REMINDER_ID_BASE + (hash % TASK_REMINDER_ID_SPAN);
}

export function isTaskReminderId(id: number): boolean {
  return id >= TASK_REMINDER_ID_BASE && id < TASK_REMINDER_ID_BASE + TASK_REMINDER_ID_SPAN;
}

export function parseTaskReminderAt(value: string | undefined): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Whether a task's reminder belongs on the devices of `personId` (the person the signed-in
 * account is linked to): tasks for that person and tasks for nobody. Without a linked
 * person every reminder comes, as before the link existed.
 */
export function isTaskForPerson(task: Pick<Task, 'assignees'>, personId: string | null | undefined): boolean {
  if (!personId) return true;
  const assignees = task.assignees ?? [];
  return assignees.length === 0 || assignees.includes(personId);
}

export function planTaskReminders(
  tasks: readonly Task[],
  now = new Date(),
  personId: string | null = null,
): PlannedTaskReminder[] {
  return tasks
    .flatMap((task): PlannedTaskReminder[] => {
      if (isTaskDone(task) || !isTaskForPerson(task, personId)) return [];
      const at = parseTaskReminderAt(task.reminderAt);
      if (!at || at.getTime() <= now.getTime()) return [];
      return [{ id: taskReminderId(task.id), taskId: task.id, title: task.title, at }];
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
