/**
 * The document store: offers, calculations, contracts, data sheets. A document is one
 * file plus a few facts about it. The file takes the same way as a photo - local copy,
 * document written at once with uploadState 'pending', bytes through the outbox - so a
 * PDF filed in the cellar shows up on the other phone as soon as there is reception.
 */
import { COL, type ProjectDocument } from './types';
import { DOCUMENT_TYPE_DEFAULT } from './options';
import { saveDoc, removeDoc } from '@/firebase/db';
import { deleteField } from 'firebase/firestore';
import { enqueue, putLocalBlob, dropLocalBlob, removeJobsForPaths } from '@/offline/outbox';
import { deleteFile } from '@/platform/fileStore';
import { resizeImage, makeThumbnail, RECEIPT_MAX_EDGE } from '@/lib/image';
import { newId } from '@/lib/ids';
import { today } from '@/lib/date';

export { DOCUMENT_ACCEPT, DOCUMENT_MAX_BYTES, isAcceptedDocumentFile, titleFromFileName } from './documentRules';

/** the facts of a document that a person fills in; the file comes separately */
export type DocumentFacts = Pick<
  ProjectDocument,
  'title' | 'docType' | 'date' | 'vendor' | 'amount' | 'tradeId' | 'roomIds' | 'notes'
>;

export function emptyDocumentFacts(roomIds: string[] = []): DocumentFacts {
  return { title: '', docType: DOCUMENT_TYPE_DEFAULT, date: today(), roomIds };
}

const OPTIONAL: (keyof DocumentFacts)[] = ['vendor', 'amount', 'tradeId', 'notes'];

/** strips undefined (Firestore refuses it) and blank text */
function cleanFacts(facts: DocumentFacts): Record<string, unknown> {
  const value: Record<string, unknown> = {
    title: facts.title.trim() || 'Dokument',
    docType: facts.docType || DOCUMENT_TYPE_DEFAULT,
    date: facts.date || today(),
    roomIds: facts.roomIds,
  };
  const vendor = facts.vendor?.trim();
  if (vendor) value.vendor = vendor;
  if (typeof facts.amount === 'number' && Number.isFinite(facts.amount)) value.amount = facts.amount;
  if (facts.tradeId) value.tradeId = facts.tradeId;
  const notes = facts.notes?.trim();
  if (notes) value.notes = notes;
  return value;
}

/**
 * Files a new document. Pictures are shrunk like receipts (still readable) and get a
 * thumbnail; PDFs go up unchanged. Does not wait for the server: Firestore queues the
 * write, the outbox the bytes.
 */
export async function addDocument(file: File, facts: DocumentFacts): Promise<ProjectDocument> {
  const isPdf = file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name));
  const id = newId();
  const main = isPdf
    ? { blob: file as Blob, contentType: 'application/pdf' }
    : await resizeImage(file, RECEIPT_MAX_EDGE);
  const storagePath = `documents/${id}.${isPdf ? 'pdf' : 'jpg'}`;

  const document = {
    id,
    ...cleanFacts(facts),
    storagePath,
    contentType: main.contentType,
    bytes: main.blob.size,
    originalName: file.name || undefined,
    uploadState: 'pending',
  } as ProjectDocument;

  if (!isPdf) {
    const thumbnail = (await makeThumbnail(main.blob)).blob;
    document.thumbPath = `documents/${id}_thumb.jpg`;
    await putLocalBlob(document.thumbPath, thumbnail);
    await enqueue({ id: `${id}-thumb`, storagePath: document.thumbPath, contentType: 'image/jpeg', blob: thumbnail });
  }

  const value = Object.fromEntries(Object.entries(document).filter(([, v]) => v !== undefined));
  // queued locally right away; the promise itself only settles once the server has it
  void saveDoc<ProjectDocument>(COL.documents, value as unknown as ProjectDocument).catch(() => undefined);

  await enqueue({
    id,
    storagePath,
    contentType: main.contentType,
    blob: main.blob,
    docCollection: COL.documents,
    docId: id,
    docField: 'uploadState',
  });
  return document;
}

/** changes the facts; the file stays as it is */
export async function saveDocumentFacts(id: string, facts: DocumentFacts): Promise<void> {
  const value = cleanFacts(facts);
  // the document is merged: a field emptied in the form has to be removed explicitly
  for (const key of OPTIONAL) {
    if (!(key in value)) value[key] = deleteField();
  }
  await saveDoc<ProjectDocument>(COL.documents, { id, ...value } as unknown as ProjectDocument);
}

/**
 * How long a deleted document's file waits before it goes too. Deleting offers
 * "Rückgängig" for a few seconds; with the file already gone, the way back would bring
 * back a document that cannot be opened any more.
 */
const FILE_GRACE_MS = 30_000;
const restored = new Set<string>();

export async function deleteDocument(document: ProjectDocument): Promise<void> {
  restored.delete(document.id);
  await removeDoc(COL.documents, document.id);
  window.setTimeout(() => {
    if (restored.has(document.id)) return;
    const paths = [document.storagePath, document.thumbPath];
    void removeJobsForPaths(paths);
    for (const path of paths) {
      if (!path) continue;
      void dropLocalBlob(path);
      // an orphaned file is the lesser evil, so a failure here is not reported
      void deleteFile(path).catch(() => undefined);
    }
  }, FILE_GRACE_MS);
}

/** the way back from deleteDocument: same id, same file */
export async function restoreDocument(document: ProjectDocument): Promise<void> {
  restored.add(document.id);
  const value = Object.fromEntries(
    Object.entries(document).filter(([key, v]) => v !== undefined && key !== 'createdAt' && key !== 'updatedAt'),
  );
  await saveDoc<ProjectDocument>(COL.documents, value as unknown as ProjectDocument);
}
