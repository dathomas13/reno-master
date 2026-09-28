import { useEffect, useMemo } from 'react';
import { COL, type Task } from './types';
import { useCollection } from './hooks';
import { markTaskDone } from './repos';
import { applyTaskReminderPlan, planTaskReminders, watchTaskReminderActions } from '@/platform/taskReminder';

export function useTaskReminders(enabled: boolean): void {
  const { data: tasks, loading, error } = useCollection<Task>(COL.tasks);
  const scheduled = useMemo(() => planTaskReminders(tasks), [tasks]);
  const signature = scheduled.map((task) => `${task.taskId}:${task.at.getTime()}:${task.title}`).join('|');

  useEffect(() => {
    // before the first snapshot, or after a failed read, the list is empty, and applying it
    // would withdraw every alarm on the phone
    if (!enabled || loading || error) return;
    void applyTaskReminderPlan(scheduled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loading, error, signature]);

  useEffect(() => {
    if (!enabled) return;
    let stop: (() => void) | undefined;
    let gone = false;
    void watchTaskReminderActions((taskId) => markTaskDone(taskId)).then((remove) => {
      if (gone) remove();
      else stop = remove;
    });
    return () => {
      gone = true;
      stop?.();
    };
  }, [enabled]);
}
