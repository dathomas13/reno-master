import { useMemo } from 'react';
import { useCollection } from './hooks';
import { COL, type DiaryEntry, type Task } from './types';

export interface PhaseUsageSources {
  diary?: Pick<DiaryEntry, 'phaseId'>[];
  tasks?: Pick<Task, 'phaseId'>[];
}

/** how many records reference each phase id (diary entries and tasks carry a `phaseId`) */
export function countPhaseUsage(sources: PhaseUsageSources): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string | undefined) => {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  sources.diary?.forEach((entry) => bump(entry.phaseId));
  sources.tasks?.forEach((task) => bump(task.phaseId));
  return counts;
}

/** live usage counts per phase id over the cached collections */
export function usePhaseUsage(): Map<string, number> {
  const diary = useCollection<DiaryEntry>(COL.diary);
  const tasks = useCollection<Task>(COL.tasks);
  return useMemo(() => countPhaseUsage({ diary: diary.data, tasks: tasks.data }), [diary.data, tasks.data]);
}
