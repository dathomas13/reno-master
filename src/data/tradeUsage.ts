import { useMemo } from 'react';
import { useCollection } from './hooks';
import { COL, type Contact, type Cost, type DiaryEntry, type Task } from './types';

export interface TradeUsageSources {
  diary?: Pick<DiaryEntry, 'tradeIds'>[];
  costs?: Pick<Cost, 'tradeId'>[];
  tasks?: Pick<Task, 'tradeId'>[];
  contacts?: Pick<Contact, 'tradeIds'>[];
}

/** how many records reference each trade id (a record counts once per trade) */
export function countTradeUsage(sources: TradeUsageSources): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string | undefined) => {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  sources.diary?.forEach((entry) => new Set(entry.tradeIds ?? []).forEach(bump));
  sources.contacts?.forEach((contact) => new Set(contact.tradeIds ?? []).forEach(bump));
  sources.costs?.forEach((cost) => bump(cost.tradeId));
  sources.tasks?.forEach((task) => bump(task.tradeId));
  return counts;
}

/** live usage counts per trade id over the cached collections */
export function useTradeUsage(): Map<string, number> {
  const diary = useCollection<DiaryEntry>(COL.diary);
  const costs = useCollection<Cost>(COL.costs);
  const tasks = useCollection<Task>(COL.tasks);
  const contacts = useCollection<Contact>(COL.contacts);
  return useMemo(
    () => countTradeUsage({ diary: diary.data, costs: costs.data, tasks: tasks.data, contacts: contacts.data }),
    [diary.data, costs.data, tasks.data, contacts.data],
  );
}
