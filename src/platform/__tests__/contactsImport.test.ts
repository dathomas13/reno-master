import { describe, expect, it } from 'vitest';
import { canPickDeviceContacts, parseVCard } from '../contactsImport';

describe('parseVCard', () => {
  it('reads name, phone, email and company from a single card', () => {
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Max Mustermann',
      'ORG:Mustermann Elektro GmbH;',
      'TEL;TYPE=CELL:+49 151 12345678',
      'EMAIL;TYPE=INTERNET:max@example.com',
      'END:VCARD',
    ].join('\n');

    expect(parseVCard(vcard)).toEqual([
      { name: 'Max Mustermann', phone: '+49 151 12345678', email: 'max@example.com', company: 'Mustermann Elektro GmbH' },
    ]);
  });

  it('falls back to the N field when FN is missing', () => {
    const vcard = ['BEGIN:VCARD', 'N:Mustermann;Erika;;;', 'END:VCARD'].join('\n');
    expect(parseVCard(vcard)).toEqual([{ name: 'Erika Mustermann' }]);
  });

  it('reads several cards from one file, skipping ones without a name', () => {
    const vcard = [
      'BEGIN:VCARD',
      'FN:Erste Person',
      'END:VCARD',
      'BEGIN:VCARD',
      'TEL:0123456',
      'END:VCARD',
      'BEGIN:VCARD',
      'FN:Zweite Person',
      'END:VCARD',
    ].join('\n');
    expect(parseVCard(vcard)).toEqual([{ name: 'Erste Person' }, { name: 'Zweite Person' }]);
  });

  it('un-folds a continuation line before reading it', () => {
    const vcard = ['BEGIN:VCARD', 'FN:Lange', ' r Name', 'END:VCARD'].join('\r\n');
    expect(parseVCard(vcard)).toEqual([{ name: 'Langer Name' }]);
  });

  it('returns nothing for text with no vCard in it', () => {
    expect(parseVCard('nichts hier')).toEqual([]);
  });
});

describe('canPickDeviceContacts', () => {
  it('is false outside of a Chromium contacts-picker browser', () => {
    expect(canPickDeviceContacts()).toBe(false);
  });
});
