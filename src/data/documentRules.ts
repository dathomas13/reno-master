/** What the document store takes and how a file name becomes a title. Pure, for the tests. */

/** what the store takes: the viewer shows PDFs and pictures, nothing else */
export const DOCUMENT_ACCEPT = 'application/pdf,image/*';

/** bigger files are refused before they sit in the outbox for ever */
export const DOCUMENT_MAX_BYTES = 30 * 1024 * 1024;

export function isAcceptedDocumentFile(file: { type: string; name: string }): boolean {
  if (file.type === 'application/pdf' || file.type.startsWith('image/')) return true;
  // some file pickers hand over a PDF without a type
  return !file.type && /\.pdf$/i.test(file.name);
}

/** the file name without its extension, the starting point for a title */
export function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[_]+/g, ' ').trim();
  return base || 'Dokument';
}
