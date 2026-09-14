/**
 * One place for every write. Components call these, never Firestore directly, so the
 * shape of a document is defined in exactly one file per entity.
 */
import { COL, type Contact, type Cost, type DiaryEntry, type Plan, type Task, type Trade, type Phase } from './types';
import { saveDoc, patchDoc, removeDoc } from '@/firebase/db';
import { newId } from '@/lib/ids';
import { today, toIsoDateTime, formatDate } from '@/lib/date';

/** removes undefined values, which Firestore refuses to store */
function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

// ------------------------------------------------------------------ diary
export function emptyDiaryEntry(date = today()): DiaryEntry {
  return {
    id: newId(),
    date,
    title: `Tagebuch ${formatDate(date).slice(0, 6)}`,
    text: '',
    present: [],
    defects: false,
    tradeIds: [],
    roomIds: [],
    photoIds: [],
    source: 'app',
  };
}

export async function saveDiaryEntry(entry: DiaryEntry): Promise<string> {
  return saveDoc<DiaryEntry>(COL.diary, clean(entry as unknown as Record<string, unknown>) as unknown as DiaryEntry);
}

export async function patchDiaryEntry(id: string, patch: Partial<DiaryEntry>): Promise<void> {
  await patchDoc(COL.diary, id, patch as Record<string, unknown>);
}

export async function deleteDiaryEntry(id: string): Promise<void> {
  await removeDoc(COL.diary, id);
}

// ------------------------------------------------------------------ costs
export function emptyCost(date = today()): Cost {
  return {
    id: newId(),
    date,
    vendor: '',
    description: '',
    amountGross: 0,
    category: '',
    roomIds: [],
    paymentStatus: 'bezahlt',
    receiptPhotoIds: [],
  };
}

export async function saveCost(cost: Cost): Promise<string> {
  return saveDoc<Cost>(COL.costs, clean(cost as unknown as Record<string, unknown>) as unknown as Cost);
}

export async function patchCost(id: string, patch: Partial<Cost>): Promise<void> {
  await patchDoc(COL.costs, id, patch as Record<string, unknown>);
}

export async function deleteCost(id: string): Promise<void> {
  await removeDoc(COL.costs, id);
}

// ------------------------------------------------------------------ tasks
export function emptyTask(): Task {
  return {
    id: newId(),
    title: '',
    status: 'Offen',
    priority: 'Mittel',
    assignees: [],
    roomIds: [],
    source: 'app',
  };
}

export async function saveTask(task: Task): Promise<string> {
  return saveDoc<Task>(COL.tasks, clean(task as unknown as Record<string, unknown>) as unknown as Task);
}

export async function patchTask(id: string, patch: Partial<Task>): Promise<void> {
  await patchDoc(COL.tasks, id, patch as Record<string, unknown>);
}

export async function toggleTaskDone(task: Task): Promise<void> {
  const done = task.status !== 'Erledigt';
  await patchTask(task.id, {
    status: done ? 'Erledigt' : 'Offen',
    doneAt: done ? toIsoDateTime() : undefined,
  });
}

export async function deleteTask(id: string): Promise<void> {
  await removeDoc(COL.tasks, id);
}

// ------------------------------------------------------------------ contacts
export function emptyContact(): Contact {
  return { id: newId(), name: '', tradeIds: [], source: 'app' };
}

export async function saveContact(contact: Contact): Promise<string> {
  return saveDoc<Contact>(COL.contacts, clean(contact as unknown as Record<string, unknown>) as unknown as Contact);
}

export async function deleteContact(id: string): Promise<void> {
  await removeDoc(COL.contacts, id);
}

// ------------------------------------------------------------------ plans, trades, phases
export async function savePlan(plan: Plan): Promise<string> {
  return saveDoc<Plan>(COL.plans, clean(plan as unknown as Record<string, unknown>) as unknown as Plan);
}

export async function deletePlan(id: string): Promise<void> {
  await removeDoc(COL.plans, id);
}

export async function patchTrade(id: string, patch: Partial<Trade>): Promise<void> {
  await patchDoc(COL.trades, id, patch as Record<string, unknown>);
}

export async function patchPhase(id: string, patch: Partial<Phase>): Promise<void> {
  await patchDoc(COL.phases, id, patch as Record<string, unknown>);
}
