/**
 * What the document list shows, without React: filter by type, room and text, newest
 * first. Kept apart so it tests without a browser.
 */
import { createdAtMillis, type ProjectDocument } from '@/data/types';
import { normalize, terms } from '@/search/normalize';

export interface DocumentFilter {
  /** id of the `documentTypes` set, or null for all */
  type: string | null;
  /** room id, compared with the caller's room matcher (Bestand and Planung ids) */
  room: string | null;
  text: string;
}

/** newest document date first; same day: the later upload first */
export function sortDocuments(documents: readonly ProjectDocument[]): ProjectDocument[] {
  return [...documents].sort((a, b) => b.date.localeCompare(a.date) || createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt));
}

/** every typed word has to occur in the title, the sender, the notes, the file name or the type name */
export function matchesText(document: ProjectDocument, text: string, typeLabel: string): boolean {
  const words = terms(text);
  if (!words.length) return true;
  const haystack = normalize(
    [document.title, document.vendor, document.notes, document.originalName, typeLabel].filter(Boolean).join(' '),
  );
  return words.every((word) => haystack.includes(word));
}

export function filterDocuments(
  documents: readonly ProjectDocument[],
  filter: DocumentFilter,
  typeLabel: (id: string) => string,
  roomMatches: (roomIds: string[], room: string) => boolean,
): ProjectDocument[] {
  return sortDocuments(
    documents.filter(
      (document) =>
        (!filter.type || document.docType === filter.type) &&
        (!filter.room || roomMatches(document.roomIds ?? [], filter.room)) &&
        matchesText(document, filter.text, typeLabel(document.docType)),
    ),
  );
}

/** how many documents each type has, for the chips; types without any are left out */
export function countByType(documents: readonly ProjectDocument[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const document of documents) counts.set(document.docType, (counts.get(document.docType) ?? 0) + 1);
  return counts;
}
