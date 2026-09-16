/**
 * Reads the Notion export of the Bautagebuch and writes it into the app.
 *
 * The one-off script in `tools/import` does the same from a command line, but it needs a
 * service account, a reachable Firebase and two npm packages. In the app none of that is
 * needed: the browser is already signed in, resizes the pictures itself and hands the
 * uploads to the outbox. So the import runs where the data is supposed to end up.
 *
 * Nothing in here talks to Firestore. The caller passes what to do with an entry, which
 * keeps the whole matching logic testable and follows the rule that only `src/data/*`
 * writes documents.
 */
import type { DiaryEntry, Phase, Photo, Trade, Weather } from './types';
import { WEATHER } from './types';

export interface NotionPhoto {
  /** path inside the export, e.g. 'files/20260828_191245.jpg' */
  file: string;
  takenAt?: string | null;
}

export interface NotionEntry {
  notionId: string;
  date: string;
  title?: string;
  text?: string;
  weather?: string | null;
  present?: string[];
  defects?: boolean;
  /** the names, matched against the phases and trades the app already has */
  phaseName?: string | null;
  tradeNames?: string[];
  photos?: NotionPhoto[];
}

/** the file name without its folder, which is how a file picker hands pictures over */
export function baseName(file: string): string {
  const parts = file.split(/[\\/]/);
  return parts[parts.length - 1] ?? file;
}

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFormatError';
  }
}

/**
 * Turns the text of diary.json into entries. Refuses anything that would end up as a
 * broken entry later, and says which one, because a silent skip in an import of 19 days
 * is worse than no import at all.
 */
export function parseEntries(text: string): NotionEntry[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportFormatError('Die Datei ist kein gültiges JSON.');
  }
  if (!Array.isArray(raw)) throw new ImportFormatError('Die Datei muss eine Liste von Einträgen enthalten.');

  return raw.map((value, index) => {
    const row = value as Record<string, unknown>;
    const where = `Eintrag ${index + 1}`;
    const date = row.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ImportFormatError(`${where}: "date" fehlt oder ist kein Datum im Format JJJJ-MM-TT.`);
    }
    if (typeof row.notionId !== 'string' || row.notionId === '') {
      throw new ImportFormatError(`${where} (${date}): "notionId" fehlt.`);
    }
    const photos = Array.isArray(row.photos) ? row.photos : [];
    for (const photo of photos) {
      if (typeof (photo as NotionPhoto)?.file !== 'string') {
        throw new ImportFormatError(`${where} (${date}): ein Foto ohne "file".`);
      }
    }
    return {
      notionId: row.notionId,
      date,
      title: typeof row.title === 'string' ? row.title : undefined,
      text: typeof row.text === 'string' ? row.text : '',
      weather: typeof row.weather === 'string' ? row.weather : null,
      present: Array.isArray(row.present) ? row.present.filter((n): n is string => typeof n === 'string') : [],
      defects: row.defects === true,
      phaseName: typeof row.phaseName === 'string' ? row.phaseName : null,
      tradeNames: Array.isArray(row.tradeNames)
        ? row.tradeNames.filter((n): n is string => typeof n === 'string')
        : [],
      photos: photos as NotionPhoto[],
    };
  });
}

export interface ImportPlan {
  entries: NotionEntry[];
  /** how many pictures the entries ask for */
  photos: number;
  /** picture file names the entries ask for but nobody handed over */
  missing: string[];
  /** picked files no entry asks for */
  unused: string[];
  /** weather values the app does not know; they would end up as an empty chip */
  unknownWeather: string[];
  /** phase and trade names that match nothing in the app */
  unknownRelations: string[];
  /** entries in the app that would be removed when replacing */
  replaces: number;
}

export interface PlanInput {
  entries: NotionEntry[];
  /** the picked picture files, by their name */
  files: Set<string>;
  phases: Pick<Phase, 'id' | 'name'>[];
  trades: Pick<Trade, 'id' | 'name'>[];
  existing: number;
}

function byName<T extends { id: string; name: string }>(rows: T[]): Map<string, string> {
  return new Map(rows.map((row) => [row.name.trim().toLowerCase(), row.id]));
}

export function planImport(input: PlanInput): ImportPlan {
  const phases = byName(input.phases);
  const trades = byName(input.trades);
  const wanted = new Set<string>();
  const missing: string[] = [];
  const unknownWeather = new Set<string>();
  const unknownRelations = new Set<string>();
  let photos = 0;

  for (const entry of input.entries) {
    for (const photo of entry.photos ?? []) {
      const name = baseName(photo.file);
      photos += 1;
      wanted.add(name);
      if (!input.files.has(name)) missing.push(name);
    }
    if (entry.weather && !(WEATHER as readonly string[]).includes(entry.weather)) {
      unknownWeather.add(entry.weather);
    }
    if (entry.phaseName && !phases.has(entry.phaseName.trim().toLowerCase())) {
      unknownRelations.add(entry.phaseName);
    }
    for (const trade of entry.tradeNames ?? []) {
      if (!trades.has(trade.trim().toLowerCase())) unknownRelations.add(trade);
    }
  }

  return {
    entries: input.entries,
    photos,
    missing,
    unused: [...input.files].filter((name) => !wanted.has(name)),
    unknownWeather: [...unknownWeather],
    unknownRelations: [...unknownRelations],
    replaces: input.existing,
  };
}

export interface ImportProgress {
  done: number;
  total: number;
  label: string;
}

export interface ImportDeps {
  saveEntry: (entry: DiaryEntry) => Promise<string>;
  /** stores one picture and answers with its id */
  addPhoto: (input: { file: Blob; entryId: string; originalName: string; takenAt?: string }) => Promise<string>;
  deleteEntry: (id: string) => Promise<void>;
  deletePhoto: (photo: Photo) => Promise<void>;
  newId: () => string;
  /**
   * Fetches a picture that was not picked, by its file name. On a phone picking 27 files
   * out of a download folder is the worst part of the whole import, so the pictures may
   * also come from an address. Answers null when it is not there.
   */
  fetchPhoto?: (name: string) => Promise<Blob | null>;
}

export interface RunInput extends PlanInput {
  /** the picked files themselves */
  blobs: Map<string, Blob>;
  /** what is in the app right now, for replacing */
  current: { entries: DiaryEntry[]; photos: Photo[] };
  replace: boolean;
}

export interface ImportResult {
  entries: number;
  photos: number;
  deleted: number;
  /** pictures an entry asked for that were not there */
  skipped: string[];
}

/**
 * Writes the entries. Pictures come first, because an entry carries the ids of its
 * photos: writing the entry first would leave it pointing at nothing if the run stops
 * halfway.
 */
export async function runImport(
  input: RunInput,
  deps: ImportDeps,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  const phases = byName(input.phases);
  const trades = byName(input.trades);
  const result: ImportResult = { entries: 0, photos: 0, deleted: 0, skipped: [] };

  const total =
    input.entries.length +
    input.entries.reduce((sum, entry) => sum + (entry.photos ?? []).length, 0) +
    (input.replace ? input.current.entries.length : 0);
  let done = 0;
  const step = (label: string) => onProgress?.({ done: (done += 1), total, label });

  if (input.replace) {
    // the pictures go with their entry, otherwise they stay behind as documents that
    // nothing points to and that no screen would ever show again
    const entryIds = new Set(input.current.entries.map((entry) => entry.id));
    for (const photo of input.current.photos) {
      if (photo.kind === 'photo' && photo.entryId && entryIds.has(photo.entryId)) {
        await deps.deletePhoto(photo);
        result.deleted += 1;
      }
    }
    for (const entry of input.current.entries) {
      await deps.deleteEntry(entry.id);
      result.deleted += 1;
      step('Alte Einträge entfernen');
    }
  }

  for (const entry of input.entries) {
    const id = deps.newId();
    const photoIds: string[] = [];

    for (const photo of entry.photos ?? []) {
      const name = baseName(photo.file);
      const blob = input.blobs.get(name) ?? (await deps.fetchPhoto?.(name).catch(() => null)) ?? null;
      if (!blob) {
        result.skipped.push(name);
        step(name);
        continue;
      }
      photoIds.push(
        await deps.addPhoto({
          file: blob,
          entryId: id,
          originalName: name,
          takenAt: photo.takenAt ?? undefined,
        }),
      );
      result.photos += 1;
      step(name);
    }

    const weather = entry.weather && (WEATHER as readonly string[]).includes(entry.weather)
      ? (entry.weather as Weather)
      : undefined;
    const phaseId = entry.phaseName ? phases.get(entry.phaseName.trim().toLowerCase()) : undefined;

    await deps.saveEntry({
      id,
      date: entry.date,
      title: entry.title ?? `Tagebuch ${entry.date}`,
      text: entry.text ?? '',
      weather,
      present: entry.present ?? [],
      defects: entry.defects === true,
      phaseId,
      tradeIds: (entry.tradeNames ?? [])
        .map((name) => trades.get(name.trim().toLowerCase()))
        .filter((value): value is string => Boolean(value)),
      roomIds: [],
      photoIds,
      source: 'notion',
      notionId: entry.notionId,
    });
    result.entries += 1;
    step(entry.title ?? entry.date);
  }

  return result;
}
