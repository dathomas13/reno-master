import { useEffect, useMemo } from 'react';
import { COL, type Task } from './types';
import { useCollection } from './hooks';
import { markTaskDone } from './repos';
import {
  applyTaskReminderPlan,
  planTaskReminders,
  setTaskReminderPerson,
  watchTaskReminderActions,
} from '@/platform/taskReminder';

/**
 * `personId` is the person the account is linked to: null when it is linked to nobody (every
 * reminder comes), undefined while the profile has not loaded - nothing is applied then, or
 * a start before the profile would briefly set the reminders of everyone else.
 */
export function useTaskReminders(enabled: boolean, personId: string | null | undefined): void {
  const { data: tasks, loading, error } = useCollection<Task>(COL.tasks);
  const scheduled = useMemo(() => planTaskReminders(tasks, new Date(), personId ?? null), [tasks, personId]);
  const signature = scheduled.map((task) => `${task.taskId}:${task.at.getTime()}:${task.title}`).join('|');
  const ready = enabled && personId !== undefined;

  useEffect(() => {
    if (ready) setTaskReminderPerson(personId ?? null);
  }, [ready, personId]);

  useEffect(() => {
    // before the first snapshot, or after a failed read, the list is empty, and applying it
    // would withdraw every alarm on the phone
    if (!ready || loading || error) return;
    void applyTaskReminderPlan(scheduled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loading, error, signature]);

  useEffect(() => {
    if (!enabled) return;
    return watchTaskReminderActions((taskId) => markTaskDone(taskId));
  }, [enabled]);
}
