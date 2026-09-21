/**
 * Turns everything the app stores into the flat records the index works on.
 *
 * One record per thing, with three zones: the title, the searchable extras (`meta`, not
 * all of which are shown) and the long text (`body`, which the snippet is cut from).
 * Anything worth *finding* something by belongs in `meta` - a room name, a status, the
 * German date, the amount - because that is what people actually type: 'Bad', 'offen',
 * 'September', '89,90'.
 *
 * The file stays free of React, Firestore and three.js on purpose: it is the part that
 * the unit tests can run without any package.
 */
import type {
  Contact,
  Cost,
  DiaryEntry,
  Note,
  Phase,
  Photo,
  Plan,
  Task,
  Trade,
} from '@/data/types';
import type { SearchKind, SearchRecord } from './engine';
import { formatDate, formatDateLong, formatDateWithWeekday } from '@/lib/date';
import { formatEuro } from '@/lib/money';

/** the room as the 3D model knows it, reduced to what the search needs */
export interface RoomLike {
  id: string;
  name: string;
  floor: string;
  floorLabel: string;
  /** missing for a Soll room without surveyed geometry yet */
  areaM2?: number;
  /** the counterpart name(s) - a merged predecessor's name, or the other side of a
   * rename (RoomsContext's `aliases()`) - so a search for the old name still finds
   * what is now filed under the new one, and the other way round */
  aliases?: string[];
}

export interface SearchSource {
  diary?: DiaryEntry[];
  costs?: Cost[];
  tasks?: Task[];
  notes?: Note[];
  contacts?: Contact[];
  trades?: Trade[];
  phases?: Phase[];
  plans?: Plan[];
  photos?: Photo[];
  rooms?: RoomLike[];
}

export const KIND_LABEL: Record<SearchKind, string> = {
  diary: 'Tagebuch',
  task: 'Aufgaben',
  note: 'Notizen',
  cost: 'Kosten',
  contact: 'Kontakte',
  room: 'Räume',
  trade: 'Gewerke',
  phase: 'Phasen',
  plan: 'Pläne',
  photo: 'Fotos',
};

/** singular, for the badge on a single row */
export const KIND_BADGE: Record<SearchKind, string> = {
  diary: 'Eintrag',
  task: 'Aufgabe',
  note: 'Notiz',
  cost: 'Beleg',
  contact: 'Kontakt',
  room: 'Raum',
  trade: 'Gewerk',
  phase: 'Phase',
  plan: 'Plan',
  photo: 'Foto',
};

/** the order of the filter chips */
export const KINDS: SearchKind[] = [
  'diary',
  'task',
  'note',
  'cost',
  'contact',
  'room',
  'trade',
  'phase',
  'plan',
  'photo',
];

/** every way a date is written in the app, so all of them can be typed into the search */
function dateWords(iso?: string): string[] {
  if (!iso) return [];
  return [iso, formatDate(iso), formatDateWithWeekday(iso), formatDateLong(iso)];
}

function names(ids: string[] | undefined, lookup: Map<string, string>): string[] {
  return (ids ?? []).map((id) => lookup.get(id)).filter((name): name is string => Boolean(name));
}

/** every room name AND its counterpart names (aliases) for a set of stored room ids -
 * an entry filed under "Öllager" stays findable under "Technikraum" once renamed, and
 * a search for the old name still finds an entry newly filed under "Technikraum" */
function roomWords(ids: string[] | undefined, roomName: Map<string, string>, roomAliases: Map<string, string[]>): string[] {
  const words = new Set<string>();
  for (const id of ids ?? []) {
    const name = roomName.get(id);
    if (name) words.add(name);
    for (const alias of roomAliases.get(id) ?? []) words.add(alias);
  }
  return [...words];
}

function amountWords(amount?: number): string[] {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) return [];
  return [formatEuro(amount), String(amount)];
}

export function buildRecords(source: SearchSource): SearchRecord[] {
  const roomName = new Map((source.rooms ?? []).map((room) => [room.id, room.name]));
  const roomAliases = new Map((source.rooms ?? []).map((room) => [room.id, room.aliases ?? []]));
  const tradeName = new Map((source.trades ?? []).map((trade) => [trade.id, trade.name]));
  const phaseName = new Map((source.phases ?? []).map((phase) => [phase.id, phase.name]));

  const records: SearchRecord[] = [];

  // ------------------------------------------------------------------ Tagebuch
  for (const entry of source.diary ?? []) {
    records.push({
      id: `diary:${entry.id}`,
      kind: 'diary',
      title: entry.title,
      subtitle: formatDateWithWeekday(entry.date),
      body: entry.text,
      meta: [
        ...dateWords(entry.date),
        entry.weather ?? '',
        entry.defects ? 'Mängel' : '',
        ...(entry.present ?? []),
        ...roomWords(entry.roomIds, roomName, roomAliases),
        ...names(entry.tradeIds, tradeName),
        phaseName.get(entry.phaseId ?? '') ?? '',
      ].filter(Boolean),
      date: entry.date,
      to: `/tagebuch/${entry.id}`,
    });
  }

  // ------------------------------------------------------------------ Kosten und Belege
  for (const cost of source.costs ?? []) {
    records.push({
      id: `cost:${cost.id}`,
      kind: 'cost',
      title: cost.vendor || cost.description || 'Beleg',
      subtitle: [formatDate(cost.date), cost.category, cost.description]
        .filter(Boolean)
        .join(' · '),
      // the text the receipt scan pulled out of the photo is searchable as well
      body: [cost.description, cost.notes, cost.extraction?.rawText].filter(Boolean).join('\n'),
      meta: [
        ...dateWords(cost.date),
        cost.category,
        cost.invoiceNumber ?? '',
        cost.paymentStatus,
        cost.paidBy ?? '',
        cost.paymentMethod ?? '',
        ...amountWords(cost.amountGross),
        tradeName.get(cost.tradeId ?? '') ?? '',
        ...roomWords(cost.roomIds, roomName, roomAliases),
      ].filter(Boolean),
      date: cost.date,
      badge: formatEuro(cost.amountGross || 0),
      to: `/kosten/${cost.id}`,
    });
  }

  // ------------------------------------------------------------------ Aufgaben
  for (const task of source.tasks ?? []) {
    records.push({
      id: `task:${task.id}`,
      kind: 'task',
      title: task.title,
      subtitle: [task.status, task.priority, task.area, task.due ? formatDate(task.due) : '']
        .filter(Boolean)
        .join(' · '),
      body: task.notes ?? '',
      meta: [
        task.status,
        task.priority,
        task.area ?? '',
        ...(task.assignees ?? []),
        ...dateWords(task.due),
        tradeName.get(task.tradeId ?? '') ?? '',
        phaseName.get(task.phaseId ?? '') ?? '',
        ...roomWords(task.roomIds, roomName, roomAliases),
      ].filter(Boolean),
      date: task.due,
      to: `/aufgaben?aufgabe=${task.id}`,
    });
  }

  // ------------------------------------------------------------------ Notizen
  for (const note of source.notes ?? []) {
    const rooms = names(note.roomIds, roomName);
    const firstLine = note.text.split('\n')[0].trim() || 'Notiz';
    records.push({
      id: `note:${note.id}`,
      kind: 'note',
      title: firstLine,
      subtitle: [note.pinned ? 'Angeheftet' : '', ...rooms].filter(Boolean).join(' · '),
      body: note.text,
      meta: [
        note.pinned ? 'Angeheftet' : '',
        ...dateWords(note.at.slice(0, 10)),
        ...roomWords(note.roomIds, roomName, roomAliases),
      ].filter(Boolean),
      date: note.at.slice(0, 10),
      to: `/notizen?notiz=${note.id}`,
    });
  }

  // ------------------------------------------------------------------ Kontakte
  for (const contact of source.contacts ?? []) {
    records.push({
      id: `contact:${contact.id}`,
      kind: 'contact',
      title: contact.name,
      subtitle: [contact.role, contact.company, contact.status].filter(Boolean).join(' · '),
      // the notes are where the phone calls end up, so they are searched like a text
      body: contact.notes ?? '',
      meta: [
        contact.company ?? '',
        contact.role ?? '',
        contact.phone ?? '',
        contact.email ?? '',
        contact.status ?? '',
        ...names(contact.tradeIds, tradeName),
      ].filter(Boolean),
      to: `/kontakte?kontakt=${contact.id}`,
    });
  }

  // ------------------------------------------------------------------ Gewerke
  for (const trade of source.trades ?? []) {
    records.push({
      id: `trade:${trade.id}`,
      kind: 'trade',
      title: trade.name,
      subtitle: [trade.status, trade.priority].filter(Boolean).join(' · '),
      body: trade.notes ?? '',
      meta: [
        trade.status,
        trade.priority,
        ...amountWords(trade.budgetPlanned),
        ...amountWords(trade.offer),
      ].filter(Boolean),
      badge: trade.budgetPlanned ? formatEuro(trade.budgetPlanned) : undefined,
      to: `/kosten?gewerk=${trade.id}`,
    });
  }

  // ------------------------------------------------------------------ Phasen
  for (const phase of source.phases ?? []) {
    records.push({
      id: `phase:${phase.id}`,
      kind: 'phase',
      title: phase.name,
      subtitle: [phase.status, phase.start ? formatDate(phase.start) : ''].filter(Boolean).join(' · '),
      meta: [phase.status, ...dateWords(phase.start), ...dateWords(phase.end)].filter(Boolean),
      date: phase.start,
      to: `/tagebuch?phase=${phase.id}`,
    });
  }

  // ------------------------------------------------------------------ Räume
  for (const room of source.rooms ?? []) {
    records.push({
      id: `room:${room.id}`,
      kind: 'room',
      title: room.name,
      subtitle:
        room.areaM2 === undefined
          ? room.floorLabel
          : `${room.floorLabel} · ${room.areaM2.toFixed(1).replace('.', ',')} m²`,
      meta: [room.floorLabel, room.floor, room.id, ...(room.aliases ?? [])],
      to: `/3d?raum=${room.id}`,
    });
  }

  // ------------------------------------------------------------------ Pläne
  for (const plan of source.plans ?? []) {
    records.push({
      id: `plan:${plan.id}`,
      kind: 'plan',
      title: plan.title,
      subtitle: [plan.floor, plan.variant].filter(Boolean).join(' · '),
      body: plan.notes ?? '',
      meta: [plan.floor ?? '', plan.variant, plan.kind].filter(Boolean),
      to: `/plaene/${plan.id}`,
    });
  }

  // ------------------------------------------------------------------ Fotos
  for (const photo of source.photos ?? []) {
    const label = photo.caption || photo.originalName;
    if (!label) continue; // a photo without a word on it is nothing to find by text
    records.push({
      id: `photo:${photo.id}`,
      kind: 'photo',
      title: label,
      subtitle: [photo.kind === 'receipt' ? 'Beleg' : 'Foto', photo.takenAt?.slice(0, 10) ?? '']
        .filter(Boolean)
        .join(' · '),
      meta: [
        photo.originalName ?? '',
        photo.kind === 'receipt' ? 'Beleg' : 'Foto',
        ...dateWords(photo.takenAt?.slice(0, 10)),
        ...roomWords(photo.roomIds, roomName, roomAliases),
      ].filter(Boolean),
      date: photo.takenAt?.slice(0, 10),
      to: photo.entryId
        ? `/tagebuch/${photo.entryId}`
        : photo.costId
          ? `/kosten/${photo.costId}`
          : '/fotos',
    });
  }

  return records;
}
