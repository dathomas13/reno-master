import { describe, expect, it } from 'vitest';
import { countByType, filterDocuments, matchesText, sortDocuments } from '../documentList';
import { isAcceptedDocumentFile, titleFromFileName } from '@/data/documentRules';
import type { ProjectDocument } from '@/data/types';

function doc(patch: Partial<ProjectDocument> & { id: string }): ProjectDocument {
  return {
    title: 'Dokument',
    docType: 'sonstiges',
    date: '2026-10-01',
    roomIds: [],
    storagePath: `documents/${patch.id}.pdf`,
    contentType: 'application/pdf',
    bytes: 1000,
    uploadState: 'uploaded',
    ...patch,
  };
}

const uwert = doc({
  id: 'u',
  title: 'U-Wert Gaubendämmung',
  docType: 'berechnung-nachweis',
  date: '2026-10-15',
  roomIds: ['dg-gaube'],
});
const angebot = doc({ id: 'a', title: 'Angebot Dach', docType: 'angebot', vendor: 'Dachdecker Weber', date: '2026-09-20' });
const vertrag = doc({ id: 'v', title: 'Werkvertrag', docType: 'vertrag-auftrag', notes: 'Abschlag nach Rohbau', date: '2026-09-20' });
const all = [angebot, vertrag, uwert];
const label = (id: string) => ({ angebot: 'Angebot', 'berechnung-nachweis': 'Berechnung/Nachweis' })[id] ?? id;
const roomMatches = (ids: string[], room: string) => ids.includes(room);

describe('document list', () => {
  it('shows the newest document date first', () => {
    expect(sortDocuments(all).map((d) => d.id)[0]).toBe('u');
  });

  it('finds by title, sender, notes and type name, ignoring umlauts and case', () => {
    expect(matchesText(uwert, 'gaubendaemmung', label(uwert.docType))).toBe(true);
    expect(matchesText(angebot, 'weber dach', label(angebot.docType))).toBe(true);
    expect(matchesText(vertrag, 'abschlag', '')).toBe(true);
    expect(matchesText(uwert, 'nachweis', label(uwert.docType))).toBe(true);
    expect(matchesText(uwert, 'fenster', label(uwert.docType))).toBe(false);
  });

  it('filters by type and room', () => {
    expect(filterDocuments(all, { type: 'angebot', room: null, text: '' }, label, roomMatches)).toEqual([angebot]);
    expect(filterDocuments(all, { type: null, room: 'dg-gaube', text: '' }, label, roomMatches)).toEqual([uwert]);
    expect(filterDocuments(all, { type: null, room: null, text: '' }, label, roomMatches)).toHaveLength(3);
  });

  it('counts per type for the chips', () => {
    const counts = countByType([...all, doc({ id: 'b', docType: 'angebot' })]);
    expect(counts.get('angebot')).toBe(2);
    expect(counts.has('lieferschein')).toBe(false);
  });
});

describe('document files', () => {
  it('takes PDFs and pictures, also a PDF without a type', () => {
    expect(isAcceptedDocumentFile({ type: 'application/pdf', name: 'a.pdf' })).toBe(true);
    expect(isAcceptedDocumentFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe(true);
    expect(isAcceptedDocumentFile({ type: '', name: 'U-Wert.PDF' })).toBe(true);
    expect(isAcceptedDocumentFile({ type: 'application/zip', name: 'a.zip' })).toBe(false);
  });

  it('makes a title from the file name', () => {
    expect(titleFromFileName('U-Wert_Gaube_Nord.pdf')).toBe('U-Wert Gaube Nord');
    expect(titleFromFileName('.pdf')).toBe('.pdf');
    expect(titleFromFileName('')).toBe('Dokument');
  });
});
