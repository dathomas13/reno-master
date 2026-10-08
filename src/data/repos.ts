/**
 * One place for every write. Components call these, never Firestore directly, so the
 * shape of a document is defined in exactly one file per entity.
 */
import {
  COL,
  type Contact,
  type ContactLog,
  type Cost,
  type DiaryEntry,
  type Note,
  type Plan,
  type Task,
  type Trade,
  type Phase,
} from './types';
import { PAYMENT_PAID, TASK_DONE, TASK_OPEN, PRIORITY_MEDIUM, TRADE_STATUS_DEFAULT, isTaskDone } from './options';
import { saveDoc, patchDoc, removeDoc } from '@/firebase/db';
import { deleteField } from 'firebase/firestore';
import { newId } from '@/lib/ids';
import { today, toIsoDateTime, formatDate } from '@/lib/date';
import { pendingWrite } from './pendingWrite';
import { rememberDiaryReminderDate } from '@/platform/diaryReminderMarker';
import { cancelDiaryReminderForDate } from '@/platform/reminder';
import { debugLog } from '@/platform/debugLog';
import { applyTaskReminderForTask, cancelTaskReminderForTask } from '@/platform/taskReminder';

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
  };
}

export async function saveDiaryEntry(entry: DiaryEntry): Promise<string> {
  const saved = saveDoc<DiaryEntry>(
    COL.diary,
    clean(entry as unknown as Record<string, unknown>) as unknown as DiaryEntry,
  );
  debugLog('erinnerung', `Tagebucheintrag für ${entry.date} gespeichert`);
  void rememberDiaryReminderDate(entry.date);
  void cancelDiaryReminderForDate(entry.date);
  return saved;
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
    paymentStatus: PAYMENT_PAID,
    receiptPhotoIds: [],
  };
}

export async function saveCost(cost: Cost): Promise<string> {
  await pendingWrite(
    saveDoc<Cost>(COL.costs, clean(cost as unknown as Record<string, unknown>) as unknown as Cost),
  );
  return cost.id;
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
    status: TASK_OPEN,
    priority: PRIORITY_MEDIUM,
    assignees: [],
    roomIds: [],
  };
}

export async function saveTask(task: Task): Promise<string> {
  const optional: (keyof Task)[] = ['notes', 'due', 'area', 'tradeId', 'phaseId', 'doneAt', 'reminderAt'];
  const value = clean(task as unknown as Record<string, unknown>);
  for (const key of optional) {
    if (task[key] === undefined) value[key] = deleteField();
  }
  const saved = saveDoc<Task>(COL.tasks, value as unknown as Task);
  void applyTaskReminderForTask(task);
  void saved.catch(() => cancelTaskReminderForTask(task.id));
  return saved;
}

export async function patchTask(id: string, patch: Partial<Task>): Promise<void> {
  await patchDoc(COL.tasks, id, patch as Record<string, unknown>);
}

export async function toggleTaskDone(task: Task): Promise<void> {
  const done = !isTaskDone(task);
  if (done) void cancelTaskReminderForTask(task.id);
  await patchTask(task.id, {
    status: done ? TASK_DONE : TASK_OPEN,
    doneAt: done ? toIsoDateTime() : deleteField(),
    ...(done ? { reminderAt: deleteField() } : {}),
  } as unknown as Partial<Task>);
}

export async function markTaskDone(id: string): Promise<void> {
  void cancelTaskReminderForTask(id);
  await patchDoc(COL.tasks, id, {
    status: TASK_DONE,
    doneAt: toIsoDateTime(),
    reminderAt: deleteField(),
  });
}

export async function deleteTask(id: string): Promise<void> {
  void cancelTaskReminderForTask(id);
  await removeDoc(COL.tasks, id);
}

// ------------------------------------------------------------------ notes
export function emptyNote(roomIds: string[] = []): Note {
  return { id: newId(), text: '', at: toIsoDateTime(), roomIds, pinned: false };
}

export async function saveNote(note: Note): Promise<string> {
  return saveDoc<Note>(COL.notes, clean(note as unknown as Record<string, unknown>) as unknown as Note);
}

export async function deleteNote(id: string): Promise<void> {
  await removeDoc(COL.notes, id);
}

// ------------------------------------------------------------------ contacts
export function emptyContact(): Contact {
  return { id: newId(), name: '', tradeIds: [], roles: [] };
}

export async function saveContact(contact: Contact): Promise<string> {
  const value = clean(contact as unknown as Record<string, unknown>);
  // the document is merged, so a rating taken away has to be removed explicitly
  if (contact.rating === undefined) value.rating = deleteField();
  return saveDoc<Contact>(COL.contacts, value as unknown as Contact);
}

export async function deleteContact(id: string): Promise<void> {
  await removeDoc(COL.contacts, id);
}

// ------------------------------------------------------------------ contact logs (Gesprächsprotokoll)
export function emptyContactLog(contactId: string): ContactLog {
  return { id: newId(), contactId, at: toIsoDateTime(), text: '' };
}

export async function saveContactLog(log: ContactLog): Promise<string> {
  return saveDoc<ContactLog>(
    COL.contactLogs,
    clean(log as unknown as Record<string, unknown>) as unknown as ContactLog,
  );
}

export async function deleteContactLog(id: string): Promise<void> {
  await removeDoc(COL.contactLogs, id);
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

/** creates a trade in the Firestore queue (offline safe, does not wait for the server) */
export function createTrade(name: string): string {
  const id = newId();
  void saveDoc<Trade>(COL.trades, { id, name: name.trim(), status: TRADE_STATUS_DEFAULT, priority: PRIORITY_MEDIUM }).catch(() => {
    /* queued write failed locally; the snapshot simply never shows the trade */
  });
  return id;
}

/** an explicitly undefined field means "remove it" */
export function saveTrade(id: string, patch: Partial<Omit<Trade, 'id'>>): void {
  const value: Record<string, unknown> = { ...patch };
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) value[key] = deleteField();
  }
  void patchDoc(COL.trades, id, value).catch(() => undefined);
}

export function setTradeArchived(id: string, archived: boolean): void {
  void patchDoc(COL.trades, id, { archived }).catch(() => undefined);
}

export function deleteTrade(id: string): void {
  void removeDoc(COL.trades, id).catch(() => undefined);
}

export async function patchPhase(id: string, patch: Partial<Phase>): Promise<void> {
  // Firestore rejects `undefined`; an explicitly unset field means "remove it"
  const value: Record<string, unknown> = { ...patch };
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) value[key] = deleteField();
  }
  await patchDoc(COL.phases, id, value);
}

// ------------------------------------------------------------------ phases (settings)

/** creates a phase at the end of the list (offline safe, does not wait for the server) */
export function createPhase(name: string, order: number): string {
  const id = newId();
  void saveDoc<Phase>(COL.phases, { id, name: name.trim(), status: 'geplant', order }).catch(() => {
    /* queued write failed locally; the snapshot simply never shows the phase */
  });
  return id;
}

/** an explicitly undefined field (start, end) means "remove it" */
export function savePhase(id: string, patch: Partial<Omit<Phase, 'id'>>): void {
  void patchPhase(id, patch).catch(() => undefined);
}

export function setPhaseArchived(id: string, archived: boolean): void {
  void patchDoc(COL.phases, id, { archived }).catch(() => undefined);
}

export function deletePhase(id: string): void {
  void removeDoc(COL.phases, id).catch(() => undefined);
}

/**
 * Swaps the position of two neighbours; `first` is the one that comes first in the list
 * now. Two phases with the same `order` still end up in the new sequence.
 */
export function swapPhaseOrder(first: Pick<Phase, 'id' | 'order'>, second: Pick<Phase, 'id' | 'order'>): void {
  const tie = first.order === second.order;
  void patchDoc(COL.phases, first.id, { order: tie ? second.order + 1 : second.order }).catch(() => undefined);
  void patchDoc(COL.phases, second.id, { order: first.order }).catch(() => undefined);
}
