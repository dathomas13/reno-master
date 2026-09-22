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
});

describe('pickDeviceContacts (native)', () => {
  function installNative(plugin: Record<string, unknown> | null) {
    (globalThis as unknown as {
      Capacitor: { isNativePlatform(): boolean; Plugins: Record<string, unknown> };
    }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: plugin ? { Contacts: plugin } : {},
    };
  }

  it('is true once the app runs natively and the plugin is there - not the web Contact Picker check', () => {
    installNative({});
    expect(canPickDeviceContacts()).toBe(true);
  });

  it('is false when the app runs natively but an older build lacks the plugin', () => {
    installNative(null);
    expect(canPickDeviceContacts()).toBe(false);
  });

  it('reads the address book straight away once permission is already granted', async () => {
    const listContacts = vi.fn(() => Promise.resolve({ contacts: [{ name: 'Erika Mustermann' }] }));
    const requestPermission = vi.fn();
    installNative({
      hasPermission: () => Promise.resolve({ granted: true }),
      requestPermission,
      listContacts,
    });

    const result = await pickDeviceContacts();

    expect(result).toEqual([{ name: 'Erika Mustermann' }]);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('asks for permission first when it is missing, then reads the address book', async () => {
    const listContacts = vi.fn(() => Promise.resolve({ contacts: [] }));
    const requestPermission = vi.fn(() => Promise.resolve({ granted: true }));
    installNative({
      hasPermission: () => Promise.resolve({ granted: false }),
      requestPermission,
      listContacts,
    });

    await pickDeviceContacts();

    expect(requestPermission).toHaveBeenCalled();
    expect(listContacts).toHaveBeenCalled();
  });

  it('gives up quietly when permission is refused, without reading anything', async () => {
    const listContacts = vi.fn();
    installNative({
      hasPermission: () => Promise.resolve({ granted: false }),
      requestPermission: () => Promise.resolve({ granted: false }),
      listContacts,
    });

    expect(await pickDeviceContacts()).toEqual([]);
    expect(listContacts).not.toHaveBeenCalled();
  });
});
