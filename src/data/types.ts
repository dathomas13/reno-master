/**
 * Document shapes stored in Firestore. Every document carries the audit fields from
 * `BaseDoc`. Dates that belong to the real world (a diary day, an invoice date) are
 * ISO strings in local time, so sorting and display work offline without timezone math.
 */

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

export const WEATHER = ['Sonnig', 'Bewölkt', 'Regen', 'Frost', 'Schnee'] as const;
export type Weather = (typeof WEATHER)[number];

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
  source: 'app' | 'notion';
  notionId?: string;
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
  /** content:// URI of the untouched original in the phone gallery (APK only) */
  sourceUri?: string;
  /** which device holds that original */
  deviceId?: string;
  caption?: string;
  roomIds: string[];
  uploadState: 'pending' | 'uploaded' | 'failed';
}

export const PAYMENT_STATUS = ['offen', 'bezahlt', 'erstattet'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

export const PAID_BY = ['Thomas', 'Sarah', 'Gemeinsam'] as const;
export type PaidBy = (typeof PAID_BY)[number];

export const PAYMENT_METHOD = ['Karte', 'Bar', 'Überweisung', 'PayPal'] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[number];

export interface CostExtraction {
  engine: 'mlkit' | 'claude' | 'none';
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

export const TASK_STATUS = ['Offen', 'In Arbeit', 'Wartet auf', 'Erledigt'] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export const PRIORITY = ['Hoch', 'Mittel', 'Niedrig'] as const;
export type Priority = (typeof PRIORITY)[number];

export const ASSIGNEES = ['Thomas', 'Sarah', 'Handwerker', 'Beide'] as const;
export type Assignee = (typeof ASSIGNEES)[number];

export interface Task extends BaseDoc {
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: Priority;
  due?: Iso;
  assignees: Assignee[];
  area?: string;
  tradeId?: string;
  phaseId?: string;
  roomIds: string[];
  doneAt?: IsoDateTime;
  source: 'app' | 'notion';
  notionId?: string;
}

export const CONTACT_STATUS = [
  'Angefragt',
  'Angebot erhalten',
  'Beauftragt',
  'Aktiv',
  'Abgeschlossen',
  'Abgelehnt',
] as const;
export type ContactStatus = (typeof CONTACT_STATUS)[number];

export interface Contact extends BaseDoc {
  name: string;
  company?: string;
  role?: string;
  phone?: string;
  email?: string;
  tradeIds: string[];
  status?: ContactStatus;
  rating?: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  source: 'app' | 'notion';
  notionId?: string;
}

export const TRADE_STATUS = [
  'Noch offen',
  'Geplant',
  'Angebot einholen',
  'Angebote vergleichen',
  'Beauftragt',
  'In Arbeit',
  'Abnahme',
  'Fertig',
] as const;
export type TradeStatus = (typeof TRADE_STATUS)[number];

export interface Trade extends BaseDoc {
  name: string;
  status: TradeStatus;
  priority: Priority;
  budgetPlanned?: number;
  offer?: number;
  notes?: string;
  notionId?: string;
}

export const PHASE_STATUS = ['Geplant', 'In Arbeit', 'Abgeschlossen', 'Blockiert'] as const;
export type PhaseStatus = (typeof PHASE_STATUS)[number];

export interface Phase extends BaseDoc {
  name: string;
  status: PhaseStatus;
  start?: Iso;
  end?: Iso;
  order: number;
  notionId?: string;
}

export interface Lists {
  people: string[];
  weather: string[];
  costCategories: string[];
  taskAreas: string[];
  contactRoles: string[];
}

export interface Plan extends BaseDoc {
  title: string;
  floor?: Floor | 'GESAMT';
  variant: 'original' | 'ist' | 'soll';
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
  contacts: 'contacts',
  trades: 'trades',
  phases: 'phases',
  plans: 'plans',
  users: 'users',
  meta: 'meta',
} as const;
