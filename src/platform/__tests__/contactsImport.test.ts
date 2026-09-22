import { describe, expect, it, vi } from 'vitest';
import { canPickDeviceContacts, parseVCard, pickDeviceContacts } from '../contactsImport';

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

describe('pickDeviceContacts', () => {
  function installManager(contacts: { select: unknown; getProperties?: unknown }) {
    (window as unknown as { ContactsManager: unknown }).ContactsManager = function () {
      /* only its presence is checked */
    };
    (navigator as unknown as { contacts: unknown }).contacts = contacts;
  }

  it('drops fields the device does not support so the picker does not reject before it opens', async () => {
    const select = vi.fn((_properties: string[]) => Promise.resolve([{ name: ['Erika Mustermann'] }]));
    installManager({ select, getProperties: () => Promise.resolve(['name', 'tel']) });

    const result = await pickDeviceContacts();

    expect(select.mock.calls[0][0]).toEqual(['name', 'tel']);
    expect(result).toEqual([{ name: 'Erika Mustermann', phone: undefined, email: undefined }]);
  });

  it('lets a rejected selection surface instead of the caller seeing nothing happen', async () => {
    installManager({
      select: () => Promise.reject(new TypeError('Unsupported property: email')),
      getProperties: () => Promise.resolve(['name', 'tel', 'email']),
    });

    await expect(pickDeviceContacts()).rejects.toThrow('Unsupported property: email');
  });

  it('still asks for the full field list when the browser has no getProperties', async () => {
    const select = vi.fn((_properties: string[]) => Promise.resolve([]));
    installManager({ select });

    await pickDeviceContacts();

    expect(select.mock.calls[0][0]).toEqual(['name', 'tel', 'email']);
  });

  it('skips the APK WebView instead of hitting its "Unable to open a contact selector"', async () => {
    const select = vi.fn((_properties: string[]) => Promise.resolve([{ name: ['Erika Mustermann'] }]));
    installManager({ select, getProperties: () => Promise.resolve(['name', 'tel', 'email']) });
    (globalThis as unknown as { Capacitor: { isNativePlatform(): boolean } }).Capacitor = {
      isNativePlatform: () => true,
    };

    expect(canPickDeviceContacts()).toBe(false);
    expect(await pickDeviceContacts()).toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });
});
