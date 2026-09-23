import { describe, expect, it } from 'vitest';
import { buildRecords, KINDS, KIND_LABEL } from '../records';
import { buildIndex, search } from '../engine';
import type { Contact, ContactLog, Cost, DiaryEntry, Task, Trade } from '@/data/types';

const diary: DiaryEntry = {
  id: 'd1',
  date: '2026-09-09',
  title: 'Estrich im OG',
  text: 'Estrich gegossen, trocknet bis Freitag.',
  present: ['Thomas', 'Herr Weber'],
  defects: true,
  tradeIds: ['t1'],
  roomIds: ['og-bad'],
  photoIds: [],
};

const cost: Cost = {
  id: 'c1',
  date: '2026-09-13',
  vendor: 'Fliesen Müller',
  description: 'Bodenfliesen',
  amountGross: 1234.56,
  category: 'Material',
  tradeId: 't1',
  roomIds: ['og-bad'],
  paymentStatus: 'offen',
  receiptPhotoIds: [],
  extraction: { engine: 'claude', at: '2026-09-13T18:00:00', rawText: 'Feinsteinzeug Anthrazit 60x60' },
};

const task: Task = {
  id: 'a1',
  title: 'Angebot Heizung einholen',
  status: 'Offen',
  priority: 'Hoch',
  assignees: ['Sarah'],
  roomIds: [],
};

const contact: Contact = {
  id: 'k1',
  name: 'Sanitär Schröder',
  company: 'Schröder GmbH',
  roles: ['Sanitär'],
  tradeIds: ['t1'],
  notes: 'Telefonat 10.09.: kommt nach dem Estrich.',
};

const contactLog: ContactLog = {
  id: 'g1',
  contactId: 'k1',
  at: '2026-09-10T09:00:00',
  channel: 'Anruf',
  text: 'Kommt nach dem Estrich vorbei.',
};

const trade: Trade = { id: 't1', name: 'Fliesenarbeiten', status: 'Beauftragt', priority: 'Hoch' };

const records = buildRecords({
  diary: [diary],
  costs: [cost],
  tasks: [task],
  contacts: [contact],
  contactLogs: [contactLog],
  trades: [trade],
  rooms: [{ id: 'og-bad', name: 'Bad OG', floor: 'OG', floorLabel: 'Obergeschoss', areaM2: 8.4 }],
});
const index = buildIndex(records);

describe('buildRecords', () => {
  it('makes one record per thing, with a target to open', () => {
    expect(records).toHaveLength(7);
    const ids = records.map((record) => record.id);
    expect(ids).toContain('diary:d1');
    expect(ids).toContain('cost:c1');
    expect(ids).toContain('task:a1');
    expect(ids).toContain('contact:k1');
    expect(ids).toContain('contactLog:g1');
    expect(ids).toContain('trade:t1');
    expect(ids).toContain('room:og-bad');
    expect(records.find((record) => record.id === 'task:a1')?.to).toBe('/aufgaben?aufgabe=a1');
    expect(records.find((record) => record.id === 'contact:k1')?.to).toBe('/kontakte?kontakt=k1');
    expect(records.find((record) => record.id === 'contactLog:g1')?.to).toBe('/kontakte?kontakt=k1');
  });

  it('finds a contact by a role added through the extensible picker', () => {
    expect(search(index, 'sanitär').map((hit) => hit.record.id)).toContain('contact:k1');
  });

  it('finds a Gesprächsprotokoll entry by its text and links back to the contact', () => {
    expect(search(index, 'estrich vorbei').map((hit) => hit.record.id)).toContain('contactLog:g1');
  });

  it('finds an entry by the name of a room it is linked to', () => {
    expect(search(index, 'Bad OG').map((hit) => hit.record.id)).toContain('diary:d1');
  });

  it('finds a receipt by the text the scan read off the photo', () => {
    expect(search(index, 'feinsteinzeug').map((hit) => hit.record.id)).toEqual(['cost:c1']);
  });

  it('finds an entry by who was there and by defects', () => {
    expect(search(index, 'weber').map((hit) => hit.record.id)).toEqual(['diary:d1']);
    expect(search(index, 'mängel').map((hit) => hit.record.id)).toEqual(['diary:d1']);
  });

  it('finds things by their status', () => {
    expect(search(index, 'offen', { kinds: ['task'] }).map((hit) => hit.record.id)).toEqual(['task:a1']);
    expect(search(index, 'beauftragt').map((hit) => hit.record.id)).toEqual(['trade:t1']);
  });

  it('finds a cost by the month spelled out', () => {
    expect(search(index, 'september').map((hit) => hit.record.id)).toContain('cost:c1');
  });

  it('labels every kind', () => {
    for (const kind of KINDS) expect(KIND_LABEL[kind].length > 0).toBe(true);
  });
});

describe('buildRecords - room aliases', () => {
  // Heizung and Öllager merged into Technikraum; an entry filed under the new id must
  // still turn up when someone searches for the old name, and vice versa
  const entry: DiaryEntry = {
    id: 'd2',
    date: '2026-09-15',
    title: 'Rohre verlegt',
    text: '',
    present: [],
    defects: false,
    tradeIds: [],
    roomIds: ['kg-technik'],
    photoIds: [],
  };
  const aliasRecords = buildRecords({
    diary: [entry],
    rooms: [
      { id: 'kg-technik', name: 'Technikraum', floor: 'KG', floorLabel: 'Keller', aliases: ['Heizung', 'Öllager'] },
    ],
  });
  const aliasIndex = buildIndex(aliasRecords);

  it('finds a room by its own name', () => {
    expect(search(aliasIndex, 'Technikraum').map((hit) => hit.record.id)).toContain('room:kg-technik');
  });

  it('finds an entry filed under the new id by an old room name', () => {
    expect(search(aliasIndex, 'Öllager').map((hit) => hit.record.id)).toContain('diary:d2');
  });

  it('finds the room itself by an old name too', () => {
    expect(search(aliasIndex, 'Heizung').map((hit) => hit.record.id)).toContain('room:kg-technik');
  });

  it('never shows an alias in what the user reads - only in what they can type', () => {
    const record = aliasRecords.find((r) => r.id === 'room:kg-technik');
    expect(record?.title).toBe('Technikraum');
    expect(record?.subtitle).not.toContain('Heizung');
  });
});
