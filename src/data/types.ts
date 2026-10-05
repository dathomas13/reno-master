/**
 * Document shapes stored in Firestore. Every document carries the audit fields from
 * `BaseDoc`. Dates that belong to the real world (a diary day, an invoice date) are
 * ISO strings in local time, so sorting and display work offline without timezone math.
 */

import { LEGACY_LABELS } from './options';

export type Iso = string; // 'YYYY-MM-DD'
export type IsoDateTime = string; // 'YYYY-MM-DDTHH:mm:ss'
export type Floor = 'KG' | 'EG' | 'OG' | 'DACH' | 'GAR';

export interface BaseDoc {
  id: string;
  createdAt?: unknown; // Firestore Timestamp, set with serverTimestamp()
  updatedAt?: unknown;
  createdBy?: string; // e-mail
  updatedBy?: string;
}

/**
 * `createdAt` as milliseconds, for tie-breaking lists that sort by a coarser, user-facing
 * date (a day-only invoice or shoot date, where several entries share the same value).
 * A doc just written offline reads `createdAt` as `null` until the server resolves the
 * timestamp - treated as "now" so it still sorts to the top while offline, not to the
 * bottom of the tie.
 */
export function createdAtMillis(value: unknown): number {
  if (value && typeof value === 'object') {
    const stamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof stamp.toMillis === 'function') return stamp.toMillis();
    if (typeof stamp.seconds === 'number') return stamp.seconds * 1000;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * The values below are ids of an option set (see options.ts), stored as strings. The
 * constant arrays further down are the old display texts, kept only until every consumer
 * reads from `useOptions`.
 */
/** @deprecated old display texts; use the `weather` option set */
export const WEATHER: readonly string[] = LEGACY_LABELS.weather;
export type Weather = string;

export interface DiaryEntry extends BaseDoc {
  date: Iso;
  title: string;
  text: string;
  weather?: Weather;
  present: string[];
  defects: boolean;
  phaseId?: string;
  tradeIds: string[];
  roomIds: string[];
  photoIds: string[];
}

export type PhotoKind = 'photo' | 'receipt';

export interface Photo extends BaseDoc {
  entryId?: string;
  costId?: string;
  kind: PhotoKind;
  storagePath: string;
  thumbPath?: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
  takenAt?: IsoDateTime;
  originalName?: string;
  originalBytes?: number;
  /**
   * The untouched file in Cloud Storage. Set when the photo was archived, which is what
   * makes it survive a lost phone: the content:// URI below is an id in one device's
   * media database and means nothing on the next phone.
   */
  originalPath?: string;
  /** content:// URI of the untouched original in the phone gallery (APK only) */
  sourceUri?: string;
  /** which device holds that original */
  deviceId?: string;
  caption?: string;
  roomIds: string[];
  uploadState: 'pending' | 'uploaded' | 'failed';
}

/** @deprecated old stored texts; use the `paymentStatus` option set */
export const PAYMENT_STATUS: readonly string[] = LEGACY_LABELS.paymentStatus;
export type PaymentStatus = string;

/** @deprecated old display texts; use the `payers` option set */
export const PAID_BY: readonly string[] = LEGACY_LABELS.payers;
export type PaidBy = string;

/** @deprecated old display texts; use the `paymentMethods` option set */
export const PAYMENT_METHOD: readonly string[] = LEGACY_LABELS.paymentMethods;
export type PaymentMethod = string;

export interface CostExtraction {
  /** stays in step with ReceiptFields['engine'] in platform/ocr/types.ts */
  engine: 'mlkit' | 'claude' | 'gemini' | 'none';
  at: IsoDateTime;
  confidence?: number;
  rawText?: string;
}

export interface Cost extends BaseDoc {
  date: Iso;
  vendor: string;
  description: string;
  amountGross: number;
  amountNet?: number;
  vatRate?: number | null;
  vatAmount?: number;
  category: string;
  tradeId?: string;
  roomIds: string[];
  paymentStatus: PaymentStatus;
  paidBy?: PaidBy;
  paymentMethod?: PaymentMethod;
  invoiceNumber?: string;
  receiptPhotoIds: string[];
  extraction?: CostExtraction;
  notes?: string;
}

/** @deprecated old display texts; use the `taskStatus` option set */
export const TASK_STATUS: readonly string[] = LEGACY_LABELS.taskStatus;
export type TaskStatus = string;

/** @deprecated old display texts; use the `priority` option set */
export const PRIORITY: readonly string[] = LEGACY_LABELS.priority;
export type Priority = string;

/** @deprecated old display texts; assignees are ids of the `people` option set now */
export const ASSIGNEES: readonly string[] = ['Thomas', 'Sarah', 'Handwerker', 'Beide'];
export type Assignee = string;

export interface Task extends BaseDoc {
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: Priority;
  due?: Iso;
  /** ids of the `people` option set */
  assignees: Assignee[];
  area?: string;
  tradeId?: string;
  phaseId?: string;
  roomIds: string[];
  doneAt?: IsoDateTime;
  reminderAt?: IsoDateTime;
}

export interface Note extends BaseDoc {
  text: string;
  /** when it was written; set once on creation, so offline sorting never waits for the server */
  at: IsoDateTime;
  roomIds: string[];
  pinned: boolean;
}

/** @deprecated old display texts; use the `contactStatus` option set */
export const CONTACT_STATUS: readonly string[] = LEGACY_LABELS.contactStatus;
export type ContactStatus = string;

export interface Contact extends BaseDoc {
  name: string;
  company?: string;
  /** @deprecated replaced by `roles`; only read for contacts saved before that change */
  role?: string;
  roles: string[];
  phone?: string;
  email?: string;
  tradeIds: string[];
  status?: ContactStatus;
  rating?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
}

/** @deprecated old display texts; use the `contactChannels` option set */
export const CONTACT_LOG_CHANNELS: readonly string[] = LEGACY_LABELS.contactChannels;
export type ContactLogChannel = string;

/** one dated entry of a Gesprächsprotokoll; several belong to one contact via `contactId` */
export interface ContactLog extends BaseDoc {
  contactId: string;
  at: IsoDateTime;
  channel?: ContactLogChannel;
  text: string;
}

/** @deprecated old display texts; use the `tradeStatus` option set */
export const TRADE_STATUS: readonly string[] = LEGACY_LABELS.tradeStatus;
export type TradeStatus = string;

export interface Trade extends BaseDoc {
  name: string;
  status: TradeStatus;
  priority: Priority;
  budgetPlanned?: number;
  offer?: number;
  notes?: string;
  /** hidden from the pickers, kept for entries that still point at it */
  archived?: boolean;
}

/** @deprecated old display texts; use the `phaseStatus` option set */
export const PHASE_STATUS: readonly string[] = LEGACY_LABELS.phaseStatus;
export type PhaseStatus = string;

export interface Phase extends BaseDoc {
  name: string;
  status: PhaseStatus;
  start?: Iso;
  end?: Iso;
  order: number;
  /** hidden from the pickers, kept for entries that still point at it */
  archived?: boolean;
}

export interface Lists {
  people: string[];
  weather: string[];
  costCategories: string[];
  taskAreas: string[];
  contactRoles: string[];
}

export type ListKey = keyof Lists;

export interface Plan extends BaseDoc {
  title: string;
  floor?: Floor | 'GESAMT';
  variant: 'original' | 'ist' | 'aktuell' | 'soll';
  kind: 'svg' | 'pdf' | 'image';
  source: 'bundled' | 'upload';
  /** bundled: path relative to the app base; upload: Firebase Storage path */
  path: string;
  pages?: number;
  bytes?: number;
  order: number;
  notes?: string;
  offline?: boolean;
}

export interface UserProfile {
  email: string;
  displayName: string;
  reminderEnabled: boolean;
  /** 'HH:mm' in Europe/Berlin */
  reminderTime: string;
  fcmTokens: string[];
  tz: string;
}

/** collection names, used by the repositories and the security rules */
export const COL = {
  diary: 'diary',
  photos: 'photos',
  costs: 'costs',
  tasks: 'tasks',
  notes: 'notes',
  contacts: 'contacts',
  trades: 'trades',
  phases: 'phases',
  plans: 'plans',
  users: 'users',
  meta: 'meta',
  contactLogs: 'contactLogs',
} as const;
