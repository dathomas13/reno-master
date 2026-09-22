/**
 * Bringing contacts in from outside the app.
 *
 * Two ways in, both landing on the same shape:
 *  - a vCard (.vcf) file, which every phone's contacts app and Google Contacts can export,
 *    one contact or hundreds at once. Works everywhere, web or app.
 *  - the device's own address book. In the browser that is the Contact Picker API
 *    (`navigator.contacts`), Chromium only. In the app it is the native `Contacts` plugin
 *    (`plugins/contacts`) instead: the WebView the app runs in reports `navigator.contacts`
 *    as present too, and even answers `getProperties()`, but `select()` always rejects with
 *    "Unable to open a contact selector" - the WebView has no Activity to host the picker
 *    dialog the way a normal Chrome tab does, and Android has no reliable multi-select
 *    picker Intent to fall back to either. The plugin reads the address book directly
 *    instead (like MediaStore reads the gallery) and hands back the same shape, so from
 *    here on the review screen does not care which path a contact came from.
 *
 * A contact can carry more than one phone number (Mobil, Arbeit, ...) - all of them come
 * back, labelled, in `phones`. `Contact` itself only has room for one, so the caller picks
 * with `primaryPhone` and is expected to keep the rest, e.g. in the notes.
 */
import { debugLog } from './debugLog';
import { isNative } from './index';

export interface ImportedPhone {
  label: string;
  number: string;
}

export interface ImportedContact {
  name: string;
  phones: ImportedPhone[];
  email?: string;
  company?: string;
}

/** the number meant for calling/WhatsApp - mobile first, else whichever came first */
export function primaryPhone(phones: ImportedPhone[]): ImportedPhone | undefined {
  return phones.find((phone) => /mobil|mobile|handy|cell/i.test(phone.label)) ?? phones[0];
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

interface NativeContactsPlugin {
  hasPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  listContacts(options?: { limit?: number }): Promise<{ contacts: ImportedContact[] }>;
}

/** per CLAUDE.md: native plugins go through Capacitor.Plugins, never a lazy `@capacitor/…` import */
function nativeContacts(): NativeContactsPlugin | null {
  const plugins = (globalThis as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  return (plugins?.Contacts as NativeContactsPlugin | undefined) ?? null;
}

/** true when this platform can hand over the device's own address book */
export function canPickDeviceContacts(): boolean {
  return isNative() ? nativeContacts() !== null : contactsManager() !== null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function pickNativeContacts(): Promise<ImportedContact[]> {
  const plugin = nativeContacts();
  if (!plugin) {
    debugLog('kontakteimport', 'kein natives Contacts-Plugin gefunden');
    return [];
  }
  try {
    let granted = (await plugin.hasPermission()).granted;
    if (!granted) {
      debugLog('kontakteimport', 'frage nach Zugriff aufs Adressbuch');
      granted = (await plugin.requestPermission()).granted;
    }
    if (!granted) {
      debugLog('kontakteimport', 'Zugriff aufs Adressbuch abgelehnt');
      return [];
    }
    debugLog('kontakteimport', 'lese das Adressbuch nativ');
    const { contacts } = await plugin.listContacts();
    debugLog('kontakteimport', `Adressbuch lieferte ${contacts.length} Eintrag/Einträge`);
    return contacts;
  } catch (error) {
    debugLog('kontakteimport', `natives Adressbuch fehlgeschlagen: ${describeError(error)}`);
    throw error;
  }
}

async function pickWebContacts(): Promise<ImportedContact[]> {
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
      .map((entry) => {
        // the API hands over bare numbers, no type - it is not lying to call them all
        // "Telefon", unlike the native address book which actually knows Mobil/Arbeit
        const numbers = (entry.tel ?? []).map((number) => number.trim()).filter(Boolean);
        return {
          name: entry.name?.[0]?.trim() ?? '',
          phones: numbers.map((number, index) => ({
            label: numbers.length > 1 ? `Telefon ${index + 1}` : 'Telefon',
            number,
          })),
          email: entry.email?.[0]?.trim() || undefined,
        };
      })
      .filter((contact) => contact.name);
  } catch (error) {
    debugLog('kontakteimport', `Auswahl fehlgeschlagen: ${describeError(error)}`);
    throw error;
  }
}

/** hands back the device's address book; resolves to [] if it is unavailable or refused */
export async function pickDeviceContacts(): Promise<ImportedContact[]> {
  return isNative() ? pickNativeContacts() : pickWebContacts();
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

/** "TEL;TYPE=WORK,VOICE" -> "Arbeit" - same words in every vCard version worth reading */
function vcardPhoneLabel(paramString: string): string {
  const upper = paramString.toUpperCase();
  if (upper.includes('CELL') || upper.includes('MOBILE')) return 'Mobil';
  if (upper.includes('WORK')) return 'Arbeit';
  if (upper.includes('HOME')) return 'Privat';
  if (upper.includes('FAX')) return 'Fax';
  if (upper.includes('MAIN')) return 'Haupt';
  if (upper.includes('PAGER')) return 'Pager';
  return 'Telefon';
}

/** parses one or more vCards (VCF 2.1/3.0/4.0) from a text file into the app's shape */
export function parseVCard(text: string): ImportedContact[] {
  const cards = text.split(/BEGIN:VCARD/i).slice(1);
  const contacts: ImportedContact[] = [];

  for (const card of cards) {
    const contact: ImportedContact = { name: '', phones: [] };
    for (const line of unfoldLines(card)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const paramString = line.slice(0, colon);
      const key = paramString.split(';')[0].trim().toUpperCase();
      const value = line.slice(colon + 1).trim();
      if (!value) continue;

      if (key === 'FN') {
        contact.name = value;
      } else if (key === 'N' && !contact.name) {
        // 'Nachname;Vorname;...' -> 'Vorname Nachname'
        contact.name = value.split(';').filter(Boolean).reverse().join(' ');
      } else if (key === 'TEL') {
        contact.phones.push({ label: vcardPhoneLabel(paramString), number: value });
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
