import { useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { pickFiles } from '@/platform/photos';
import {
  canPickDeviceContacts,
  parseVCard,
  pickDeviceContacts,
  type ImportedContact,
} from '@/platform/contactsImport';
import { debugLog, readDebugLog } from '@/platform/debugLog';
import { emptyContact, saveContact } from '@/data/repos';

/**
 * Bringing contacts in from outside the app: the device's own address book (native plugin
 * in the app, Contact Picker API in a supporting browser), a vCard file everywhere else.
 * Either way lands on the same review list, so the person picks who is actually worth a
 * new contact before anything is saved.
 */
export function ContactImportSheet({
  existingNames,
  onClose,
}: {
  existingNames: string[];
  onClose(): void;
}) {
  const [candidates, setCandidates] = useState<ImportedContact[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const known = new Set(existingNames.map((name) => name.trim().toLowerCase()));

  function showCandidates(found: ImportedContact[]) {
    if (found.length === 0) {
      setError('Keine Kontakte gefunden.');
      return;
    }
    setCandidates(found);
    // nothing pre-selected - an address book can hold hundreds of entries, and picking is
    // the whole point of this screen, not an afterthought to un-pick from
    setSelected(new Set());
    setFilter('');
    setError(null);
  }

  const needle = filter.trim().toLowerCase();
  const visibleIndexes =
    candidates && needle
      ? candidates
          .map((_, index) => index)
          .filter((index) => {
            const contact = candidates[index];
            return [contact.name, contact.phone, contact.email, contact.company]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(needle);
          })
      : (candidates?.map((_, index) => index) ?? []);

  async function fromDevice() {
    setBusy(true);
    setError(null);
    try {
      showCandidates(await pickDeviceContacts());
    } catch (err) {
      debugLog('kontakteimport', `fromDevice: ${err instanceof Error ? err.message : String(err)}`);
      setError('Die Adressbuch-Auswahl hat nicht geklappt. Details unter „Diagnose“.');
    } finally {
      setBusy(false);
      setLog(readDebugLog('kontakteimport').slice(-8));
    }
  }

  async function fromFile() {
    setBusy(true);
    setError(null);
    try {
      const files = await pickFiles('.vcf,text/vcard,text/x-vcard');
      if (files.length === 0) return;
      const texts = await Promise.all(files.map((file) => file.text()));
      showCandidates(texts.flatMap((text) => parseVCard(text)));
    } finally {
      setBusy(false);
    }
  }

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function commit() {
    if (!candidates) return;
    setBusy(true);
    try {
      const chosen = [...selected].map((index) => candidates[index]).filter((found) => found.name.trim());
      debugLog('kontakteimport', `importiere: ${chosen.map((found) => found.name).join(', ') || '(keine)'}`);
      for (const found of chosen) {
        await saveContact({
          ...emptyContact(),
          name: found.name,
          phone: found.phone,
          email: found.email,
          company: found.company,
        });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} doneLabel="Abbrechen" title="Kontakte importieren">
      <div className="p-4">
        {!candidates && (
          <div className="flex flex-col gap-3">
            {canPickDeviceContacts() && (
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={busy}
                onClick={() => void fromDevice()}
              >
                Aus dem Adressbuch wählen
              </button>
            )}
            <button type="button" className="btn w-full" disabled={busy} onClick={() => void fromFile()}>
              vCard-Datei (.vcf) wählen
            </button>
            {!canPickDeviceContacts() && (
              <p className="text-xs text-muted">
                Die direkte Adressbuch-Auswahl gibt es hier nicht. Kontakte stattdessen als vCard-Datei
                (.vcf) exportieren und hier auswählen.
              </p>
            )}
            {error && <p className="text-sm text-bad">{error}</p>}
            {log.length > 0 && (
              <details>
                <summary className="text-sm text-muted cursor-pointer">Diagnose</summary>
                <ul className="text-xs text-muted mt-2 flex flex-col gap-1">
                  {log.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {candidates && (
          <>
            <input
              className="field mb-3"
              type="search"
              placeholder="Suchen…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              autoFocus
            />
            {visibleIndexes.length === 0 && <p className="text-sm text-muted mb-3">Nichts gefunden.</p>}
            <ul className="mb-3">
              {visibleIndexes.map((index) => {
                const contact = candidates[index];
                const duplicate = known.has(contact.name.trim().toLowerCase());
                return (
                  <li key={index}>
                    <button type="button" className="list-row w-full text-left" onClick={() => toggle(index)}>
                      <span className={`w-5 ${selected.has(index) ? 'text-accent' : 'text-transparent'}`}>✓</span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{contact.name}</span>
                        <span className="block text-xs text-muted truncate">
                          {[contact.phone, contact.email, duplicate ? 'bereits vorhanden' : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={busy || selected.size === 0}
              onClick={() => void commit()}
            >
              {selected.size} {selected.size === 1 ? 'Kontakt' : 'Kontakte'} importieren
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
