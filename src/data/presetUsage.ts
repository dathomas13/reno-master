import { useMemo } from 'react';
import { useCollection } from './hooks';
import { contactRoleNames } from './contactRoles';
import type { OptionSetKey } from './options';
import {
  COL,
  type Contact,
  type ContactLog,
  type Cost,
  type DiaryEntry,
  type Phase,
  type Task,
  type Trade,
} from './types';

export interface UsageSources {
  diary?: Pick<DiaryEntry, 'present' | 'weather'>[];
  costs?: Pick<Cost, 'category' | 'paymentStatus' | 'paidBy' | 'paymentMethod'>[];
  tasks?: Pick<Task, 'status' | 'priority' | 'area' | 'assignees'>[];
  contacts?: Pick<Contact, 'roles' | 'status'>[];
  contactLogs?: Pick<ContactLog, 'channel'>[];
  trades?: Pick<Trade, 'status' | 'priority'>[];
  phases?: Pick<Phase, 'status'>[];
}

/**
 * How many records carry each entry of the set, keyed by entry id (a record counts once per
 * entry). A value no entry knows is counted under its raw id.
 */
export function countUsage(
  setKey: OptionSetKey,
  sources: UsageSources,
): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (id: string | undefined) => {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  };
  const bumpOne = bump;
  const bumpEach = (values: readonly (string | undefined)[] | undefined) => {
    new Set(values ?? []).forEach(bump);
  };

  switch (setKey) {
    case 'people':
      sources.diary?.forEach((entry) => bumpEach(entry.present));
      sources.tasks?.forEach((task) => bumpEach(task.assignees));
      break;
    case 'weather':
      sources.diary?.forEach((entry) => bumpOne(entry.weather));
      break;
    case 'costCategories':
      sources.costs?.forEach((cost) => bumpOne(cost.category));
      break;
    case 'payers':
      sources.costs?.forEach((cost) => bumpOne(cost.paidBy));
      break;
    case 'paymentMethods':
      sources.costs?.forEach((cost) => bumpOne(cost.paymentMethod));
      break;
    case 'paymentStatus':
      sources.costs?.forEach((cost) => bumpOne(cost.paymentStatus));
      break;
    case 'taskAreas':
      sources.tasks?.forEach((task) => bumpOne(task.area));
      break;
    case 'taskStatus':
      sources.tasks?.forEach((task) => bumpOne(task.status));
      break;
    case 'priority':
      sources.tasks?.forEach((task) => bumpOne(task.priority));
      sources.trades?.forEach((trade) => bumpOne(trade.priority));
      break;
    case 'tradeStatus':
      sources.trades?.forEach((trade) => bumpOne(trade.status));
      break;
    case 'phaseStatus':
      sources.phases?.forEach((phase) => bumpOne(phase.status));
      break;
    case 'contactRoles':
      sources.contacts?.forEach((contact) => bumpEach(contactRoleNames(contact)));
      break;
    case 'contactStatus':
      sources.contacts?.forEach((contact) => bumpOne(contact.status));
      break;
    case 'contactChannels':
      sources.contactLogs?.forEach((log) => bumpOne(log.channel));
      break;
  }
  return counts;
}

/** live usage counts per entry id over the cached collections the set is used in */
export function usePresetUsage(setKey: OptionSetKey): Map<string, number> {
  const diary = useCollection<DiaryEntry>(COL.diary);
  const costs = useCollection<Cost>(COL.costs);
  const tasks = useCollection<Task>(COL.tasks);
  const contacts = useCollection<Contact>(COL.contacts);
  const contactLogs = useCollection<ContactLog>(COL.contactLogs);
  const trades = useCollection<Trade>(COL.trades);
  const phases = useCollection<Phase>(COL.phases);
  return useMemo(
    () =>
      countUsage(setKey, {
        diary: diary.data,
        costs: costs.data,
        tasks: tasks.data,
        contacts: contacts.data,
        contactLogs: contactLogs.data,
        trades: trades.data,
        phases: phases.data,
      }),
    [setKey, diary.data, costs.data, tasks.data, contacts.data, contactLogs.data, trades.data, phases.data],
  );
}
