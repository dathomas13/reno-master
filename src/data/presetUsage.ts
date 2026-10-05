import { useMemo } from 'react';
import { useCollection } from './hooks';
import { contactRoleNames } from './contactRoles';
import { COL, type Contact, type Cost, type DiaryEntry, type ListKey, type Task } from './types';

export interface UsageSources {
  diary?: Pick<DiaryEntry, 'present' | 'weather'>[];
  costs?: Pick<Cost, 'category'>[];
  tasks?: Pick<Task, 'area'>[];
  contacts?: Pick<Contact, 'roles' | 'role'>[];
}

/** how many records carry each value of the list (a record counts once per value) */
export function countUsage(listKey: ListKey, sources: UsageSources): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (value: string | undefined) => {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  };
  switch (listKey) {
    case 'people':
      sources.diary?.forEach((entry) => new Set(entry.present ?? []).forEach(bump));
      break;
    case 'weather':
      sources.diary?.forEach((entry) => bump(entry.weather));
      break;
    case 'costCategories':
      sources.costs?.forEach((cost) => bump(cost.category));
      break;
    case 'taskAreas':
      sources.tasks?.forEach((task) => bump(task.area));
      break;
    case 'contactRoles':
      sources.contacts?.forEach((contact) => new Set(contactRoleNames(contact as Contact)).forEach(bump));
      break;
  }
  return counts;
}

/** live usage counts over the cached collections the lists are used in */
export function usePresetUsage(listKey: ListKey): Map<string, number> {
  const diary = useCollection<DiaryEntry>(COL.diary);
  const costs = useCollection<Cost>(COL.costs);
  const tasks = useCollection<Task>(COL.tasks);
  const contacts = useCollection<Contact>(COL.contacts);
  return useMemo(
    () => countUsage(listKey, { diary: diary.data, costs: costs.data, tasks: tasks.data, contacts: contacts.data }),
    [listKey, diary.data, costs.data, tasks.data, contacts.data],
  );
}
