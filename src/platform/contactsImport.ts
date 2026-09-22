/**
 * Bringing contacts in from outside the app.
 *
 * Two ways in, both landing on the same shape:
 *  - the Contact Picker API (`navigator.contacts`), Chromium only - on the Galaxy S24
 *    that means Chrome, which is exactly the device this app is built for first.
 *  - a vCard (.vcf) file, which every phone's contacts app and Google Contacts can export,
 *    one contact or hundreds at once. That one has no platform requirement at all.
 *
 * The APK's WebView reports `navigator.contacts` as present too - the JS surface is there,
 * `getProperties()` even answers - but `select()` always rejects with "Unable to open a
 * contact selector": the WebView has no Activity wired up to host the picker UI the way a
 * full Chrome tab does. So this is web (PWA/browser tab) only, native or not.
 */
import { debugLog } from './debugLog';
import { isNative } from './index';

export interface ImportedContact {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
}

interface ContactsManager {
  select(
    properties: string[],
    options?: { multiple?: boolean },
  ): Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
  /** not every implementation has this; asking for a property it does not support makes
   *  `select` reject before any dialog opens, so this is checked first where it exists */
  getProperties?(): Promise<string[]>;
}

function contactsManager(): ContactsManager | null {
  const nav = navigator as Navigator & { contacts?: ContactsManager };
  return 'contacts' in navigator && 'ContactsManager' in window ? (nav.contacts ?? null) : null;
}

/** true when the browser can open the device's own contacts picker - web only, see above */
export function canPickDeviceContacts(): boolean {
  return !isNative() && contactsManager() !== null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** opens the native picker; resolves to [] if it is unavailable or the user cancels */
export async function pickDeviceContacts(): Promise<ImportedContact[]> {
  if (isNative()) {
    debugLog('kontakteimport', 'APK-WebView: Adressbuch-Auswahl übersprungen, nur vCard geht hier');
    return [];
  }
  const manager = contactsManager();
  if (!manager) {
    debugLog('kontakteimport', 'kein ContactsManager im Browser gefunden');
    return [];
  }

  let properties = ['name', 'tel', 'email'];
  if (manager.getProperties) {
    try {
      const supported = await manager.getProperties();
      debugLog('kontakteimport', `unterstützte Felder: ${supported.join(', ') || '(keine)'}`);
      properties = properties.filter((property) => supported.includes(property));
    } catch (error) {
      debugLog('kontakteimport', `getProperties() fehlgeschlagen: ${describeError(error)}`);
    }
  }
  if (properties.length === 0) {
    debugLog('kontakteimport', 'keines der gewünschten Felder (name, tel, email) wird unterstützt');
    return [];
  }

  debugLog('kontakteimport', `öffne die Auswahl mit Feldern: ${properties.join(', ')}`);
  try {
    const picked = await manager.select(properties, { multiple: true });
    debugLog('kontakteimport', `Auswahl lieferte ${picked.length} Eintrag/Einträge`);
    return picked
      .map((entry) => ({
        name: entry.name?.[0]?.trim() ?? '',
        phone: entry.tel?.[0]?.trim() || undefined,
        email: entry.email?.[0]?.trim() || undefined,
      }))
      .filter((contact) => contact.name);
  } catch (error) {
    debugLog('kontakteimport', `Auswahl fehlgeschlagen: ${describeError(error)}`);
    throw error;
  }
}

/** un-does vCard line folding: a continuation line starts with a space or tab */
function unfoldLines(text: string): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    if ((rawLine.startsWith(' ') || rawLine.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += rawLine.slice(1);
    } else {
      lines.push(rawLine);
    }
  }
  return lines;
}

/** parses one or more vCards (VCF 2.1/3.0/4.0) from a text file into the app's shape */
export function parseVCard(text: string): ImportedContact[] {
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  const contacts: ImportedContact[] = [];

  for (const card of cards) {
    const contact: ImportedContact = { name: '' };
    for (const line of unfoldLines(card)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const key = line.slice(0, colon).split(';')[0].trim().toUpperCase();
      const value = line.slice(colon + 1).trim();
      if (!value) continue;

      if (key === 'FN') {
        contact.name = value;
      } else if (key === 'N' && !contact.name) {
        // 'Nachname;Vorname;...' -> 'Vorname Nachname'
        contact.name = value.split(';').filter(Boolean).reverse().join(' ');
      } else if (key === 'TEL' && !contact.phone) {
        contact.phone = value;
      } else if (key === 'EMAIL' && !contact.email) {
        contact.email = value;
      } else if (key === 'ORG' && !contact.company) {
        contact.company = value.split(';')[0];
      }
    }
    if (contact.name) contacts.push(contact);
  }

  return contacts;
}
