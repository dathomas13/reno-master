/**
 * Plans the archive of the whole diary.
 *
 * The point of this export is the day the app, Firebase and this phone are all gone and
 * a folder on a hard drive is all that is left. So it contains three things at once: the
 * photos as files with speaking names, the diary as plain text anyone can read without
 * software, and the raw data as JSON for anything that wants to import it later.
 *
 * Planning is separated from writing so the list of files can be tested, and so the
 * caller can show what is going to happen before a gigabyte starts moving.
 */
import type { Contact, Cost, DiaryEntry, Photo, Task, Trade } from './types';
import { formatDate } from '@/lib/date';

export interface ExportSource {
  entries: DiaryEntry[];
  photos: Photo[];
  costs: Cost[];
  tasks: Task[];
  contacts: Contact[];
  trades: Trade[];
}

export interface ExportFile {
  /** path inside the archive */
  name: string;
  /** text files are written straight from here */
  text?: string;
  /** everything else is fetched from storage under this path */
  storagePath?: string;
  /** what we expect it to weigh, for the progress display */
  bytes: number;
  /** true when this is the untouched original rather than the working copy */
  original?: boolean;
  /** what to write it as; a folder export has to name the type up front */
  mime?: string;
  /**
   * The gallery entry this photo came from. Only the folder export uses it, and only on
   * the phone that took the picture: there it yields the full resolution original
   * without any upload having happened.
   */
  sourceUri?: string;
  /** which device holds that gallery entry */
  deviceId?: string;
}

export interface ExportPlan {
  files: ExportFile[];
  /** files that carry bytes from storage, which is what takes the time */
  fileCount: number;
  totalBytes: number;
  /** photos whose original was never archived - they go in at 1600 px */
  withoutOriginal: number;
}

/** keeps a file name usable on every operating system, including Windows */
export function safeName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  // a name of nothing but replacement dashes is no name at all
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : fallback;
}

function extensionOf(photo: Photo): string {
  if (photo.contentType === 'application/pdf') return 'pdf';
  if (photo.contentType === 'image/png') return 'png';
  return 'jpg';
}

/**
 * Where a photo lands in the archive: sorted by day, numbered in the order of the entry,
 * with the name the camera gave it. Two photos of one day can carry the same name, so
 * the running number comes first.
 */
export function photoFileName(photo: Photo, index: number, entry?: DiaryEntry): string {
  const day = entry?.date ?? photo.takenAt?.slice(0, 10) ?? 'ohne-datum';
  const number = String(index + 1).padStart(2, '0');
  const extension = extensionOf(photo);
  const base = photo.originalName
    ? safeName(photo.originalName.replace(/\.[^.]+$/, ''), photo.id)
    : photo.id;
  const folder = photo.kind === 'receipt' ? 'belege' : 'fotos';
  return `${folder}/${day}/${number}_${base}.${extension}`;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** the diary as one readable document, in the order the work happened */
export function diaryToMarkdown(source: ExportSource, photoNames: Map<string, string>): string {
  const byDate = [...source.entries].sort((a, b) => a.date.localeCompare(b.date));
  const tradeName = new Map(source.trades.map((trade) => [trade.id, trade.name]));
  const lines: string[] = [
    '# Bautagebuch Schlesierstraße 31',
    '',
    `${byDate.length} Einträge`,
    byDate.length > 0 ? `von ${formatDate(byDate[0]!.date)} bis ${formatDate(byDate.at(-1)!.date)}` : '',
    '',
  ];

  for (const entry of byDate) {
    const weekday = WEEKDAYS[new Date(`${entry.date}T12:00:00`).getDay()] ?? '';
    lines.push(`## ${weekday}, ${formatDate(entry.date)} – ${entry.title}`, '');

    const facts: string[] = [];
    if (entry.weather) facts.push(`Wetter: ${entry.weather}`);
    if (entry.present.length) facts.push(`Anwesend: ${entry.present.join(', ')}`);
    const trades = entry.tradeIds.map((id) => tradeName.get(id) ?? id).filter(Boolean);
    if (trades.length) facts.push(`Gewerke: ${trades.join(', ')}`);
    if (entry.defects) facts.push('**Mängel festgehalten**');
    if (facts.length) lines.push(facts.join(' · '), '');

    if (entry.text.trim()) lines.push(entry.text.trim(), '');

    const names = entry.photoIds.map((id) => photoNames.get(id)).filter(Boolean) as string[];
    if (names.length) {
      lines.push(`Fotos (${names.length}):`);
      for (const name of names) lines.push(`- ${name}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

const READ_ME = `Bautagebuch Schlesierstraße 31 – Archiv

Bautagebuch.md   das ganze Tagebuch als Text, in zeitlicher Reihenfolge
fotos/<Tag>/     die Fotos des jeweiligen Tages, nummeriert wie im Eintrag
belege/<Tag>/    Rechnungen und Kassenzettel
daten/           dieselben Inhalte als JSON, falls sie einmal in ein anderes
                 Programm sollen

Fotos, die mit "Original sichern" aufgenommen wurden, liegen hier in voller
Auflösung. Bei allen anderen ist es die Fassung mit 1600 Pixel Kantenlänge;
das Original liegt dann nur in der Handy-Galerie beziehungsweise in deren
Sicherung.

Erzeugt von Reno Master.
`;

export function planExport(source: ExportSource, createdAt = new Date()): ExportPlan {
  const entryById = new Map(source.entries.map((entry) => [entry.id, entry]));
  const photoById = new Map(source.photos.map((photo) => [photo.id, photo]));
  const names = new Map<string, string>();
  const files: ExportFile[] = [];
  let withoutOriginal = 0;

  // photos in the order of their entry, so the numbering matches the diary text
  const placed = new Set<string>();
  const place = (photo: Photo, index: number, entry?: DiaryEntry) => {
    if (placed.has(photo.id)) return;
    placed.add(photo.id);
    const name = photoFileName(photo, index, entry);
    names.set(photo.id, name);
    if (photo.kind === 'photo' && !photo.originalPath) withoutOriginal += 1;
    files.push({
      name,
      storagePath: photo.originalPath ?? photo.storagePath,
      bytes: photo.originalPath ? (photo.originalBytes ?? photo.bytes) : photo.bytes,
      original: Boolean(photo.originalPath),
      mime: photo.contentType,
      sourceUri: photo.sourceUri,
      deviceId: photo.deviceId,
    });
  };

  for (const entry of [...source.entries].sort((a, b) => a.date.localeCompare(b.date))) {
    entry.photoIds.forEach((id, index) => {
      const photo = photoById.get(id);
      if (photo) place(photo, index, entry);
    });
  }
  // photos that hang on a cost entry, or on nothing at all
  for (const photo of source.photos) {
    if (placed.has(photo.id)) continue;
    const entry = photo.entryId ? entryById.get(photo.entryId) : undefined;
    place(photo, placed.size, entry);
  }

  const texts: ExportFile[] = [
    { name: 'LIESMICH.txt', text: READ_ME },
    { name: 'Bautagebuch.md', text: diaryToMarkdown(source, names) },
    { name: 'daten/tagebuch.json', text: JSON.stringify(source.entries, null, 2) },
    { name: 'daten/fotos.json', text: JSON.stringify(source.photos, null, 2) },
    { name: 'daten/kosten.json', text: JSON.stringify(source.costs, null, 2) },
    { name: 'daten/aufgaben.json', text: JSON.stringify(source.tasks, null, 2) },
    { name: 'daten/kontakte.json', text: JSON.stringify(source.contacts, null, 2) },
    { name: 'daten/gewerke.json', text: JSON.stringify(source.trades, null, 2) },
    {
      name: 'daten/export.json',
      text: JSON.stringify(
        { createdAt: createdAt.toISOString(), entries: source.entries.length, photos: source.photos.length },
        null,
        2,
      ),
    },
  ].map((file) => ({
    ...file,
    bytes: new TextEncoder().encode(file.text ?? '').length,
    mime: file.name.endsWith('.json') ? 'application/json' : 'text/plain',
  }));

  const all = [...texts, ...files];
  return {
    files: all,
    fileCount: files.length,
    totalBytes: all.reduce((sum, file) => sum + file.bytes, 0),
    withoutOriginal,
  };
}

/** "1,4 GB" - the number the user compares with the free space on the stick */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** the file name of the archive itself */
export function archiveName(createdAt = new Date()): string {
  const day = createdAt.toISOString().slice(0, 10);
  return `bautagebuch-schlesierstrasse-31-${day}.zip`;
}
