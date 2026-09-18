import { useEffect, useMemo } from 'react';
import { COL, type Task } from './types';
import { useCollection } from './hooks';
import { markTaskDone } from './repos';
import { applyTaskReminderPlan, planTaskReminders, watchTaskReminderActions } from '@/platform/taskReminder';

export function useTaskReminders(enabled: boolean): void {
  const { data: tasks } = useCollection<Task>(COL.tasks);
  const scheduled = useMemo(() => planTaskReminders(tasks), [tasks]);
  const signature = scheduled.map((task) => `${task.taskId}:${task.at.getTime()}:${task.title}`).join('|');

  useEffect(() => {
    if (!enabled) return;
    void applyTaskReminderPlan(scheduled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, signature]);

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
