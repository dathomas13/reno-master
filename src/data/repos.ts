/**
 * One place for every write. Components call these, never Firestore directly, so the
 * shape of a document is defined in exactly one file per entity.
 */
import {
  COL,
  type Contact,
  type Cost,
  type DiaryEntry,
  type Note,
  type Plan,
  type Task,
  type Trade,
  type Phase,
} from './types';
import { saveDoc, patchDoc, removeDoc } from '@/firebase/db';
import { deleteField } from 'firebase/firestore';
import { newId } from '@/lib/ids';
import { today, toIsoDateTime, formatDate } from '@/lib/date';
import { pendingWrite } from './pendingWrite';
import { rememberDiaryReminderDate } from '@/platform/diaryReminderMarker';
import { cancelDiaryReminderForDate } from '@/platform/reminder';
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
    paymentStatus: 'bezahlt',
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
    status: 'Offen',
    priority: 'Mittel',
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
  const done = task.status !== 'Erledigt';
  if (done) void cancelTaskReminderForTask(task.id);
  await patchTask(task.id, {
    status: done ? 'Erledigt' : 'Offen',
    doneAt: done ? toIsoDateTime() : deleteField(),
    ...(done ? { reminderAt: deleteField() } : {}),
  } as unknown as Partial<Task>);
}

export async function markTaskDone(id: string): Promise<void> {
  void cancelTaskReminderForTask(id);
  await patchDoc(COL.tasks, id, {
    status: 'Erledigt',
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
  return { id: newId(), name: '', tradeIds: [] };
}

export async function saveContact(contact: Contact): Promise<string> {
  return saveDoc<Contact>(
    COL.contacts,
    clean(contact as unknown as Record<string, unknown>) as unknown as Contact,
  );
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
