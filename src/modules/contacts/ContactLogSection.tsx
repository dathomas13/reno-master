import { useMemo, useState } from 'react';
import { where } from '@/firebase/db';
import { useCollection } from '@/data/hooks';
import { useOptions } from '@/data/useOptions';
import { OptionChips, OptionMultiPicker } from '@/components/OptionFields';
import { LOG_DEFAULT_PEOPLE } from '@/data/options';
import { COL, type Contact, type ContactLog } from '@/data/types';
import { emptyContact, emptyContactLog, saveContact, saveContactLog, deleteContactLog } from '@/data/repos';
import { Field } from '@/components/Fields';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { useToast, useUndoableDelete } from '@/components/Toast';
import { formatDateTime } from '@/lib/date';

/** the dated call/meeting log of one contact - what used to just pile up in the notes field */
export function ContactLogSection({ contactId }: { contactId: string }) {
  const { data } = useCollection<ContactLog>(COL.contactLogs, [where('contactId', '==', contactId)], [contactId]);
  const logs = useMemo(() => [...data].sort((a, b) => b.at.localeCompare(a.at)), [data]);
  const [open, setOpen] = useState<ContactLog | null>(null);
  const { label } = useOptions();
  const toast = useToast();
  const undoableDelete = useUndoableDelete();

  return (
    <Field label="Gesprächsprotokoll">
      {logs.length === 0 && <p className="text-sm text-muted mb-2">Noch keine Einträge</p>}
      {logs.length > 0 && (
        <ul className="mb-2">
          {logs.map((log) => (
            <li key={log.id}>
              <button type="button" className="list-row w-full text-left" onClick={() => setOpen(log)}>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs text-muted">
                    {formatDateTime(log.at)}
                    {log.channel ? ` · ${label('contactChannels', log.channel)}` : ''}
                    {log.participants?.length
                      ? ` · ${log.participants.map((person) => label('people', person)).join(', ')}`
                      : ''}
                  </span>
                  <span className="block line-clamp-3">{logPreview(log.text)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn w-full" onClick={() => setOpen(emptyContactLog(contactId))}>
        <Icon name="plus" className="w-5 h-5" />
        Gesprächseintrag
      </button>
      {open && (
        <ContactLogEditor
          log={open}
          onClose={() => setOpen(null)}
          isNew={!data.some((item) => item.id === open.id)}
          onSave={async (log) => {
            try {
              await saveContactLog(log);
            } catch {
              toast('Der Eintrag konnte nicht gespeichert werden.');
              return;
            }
            setOpen(null);
          }}
          onDelete={(log) => {
            const stored = data.find((item) => item.id === log.id);
            setOpen(null);
            if (!stored) return;
            undoableDelete('Gesprächseintrag gelöscht', () => deleteContactLog(stored.id), () => saveContactLog(stored));
          }}
        />
      )}
    </Field>
  );
}

/**
 * list preview of a log's text: line breaks folded into spaces, so a note that starts with
 * a single word and then a new paragraph does not shrink to that one word; the list clamps
 * it to a few lines
 */
export function logPreview(text: string): string {
  return text.replace(/\s+/g, ' ').trim() || '(kein Text)';
}

function toDateTimeInput(value: string): string {
  return value.slice(0, 16);
}

function fromDateTimeInput(value: string): string {
  return value ? `${value}:00` : value;
}

/** select value that switches the "Kontakt" field to a name input for a new contact */
const NEW_CONTACT = '__neu__';

/**
 * `contacts` is passed from the cross-contact list (`ContactLogsPage`) - then the sheet shows
 * a "Kontakt" field: an entry may stay without a contact (`contactId` empty), get a contact
 * created right here by name, or be moved to another one - which also gives an entry whose
 * contact was deleted a new home. Editing from inside a contact's own sheet
 * (`ContactLogSection` above) never passes it: the contact there is fixed by context.
 */
export function ContactLogEditor({
  log,
  contacts,
  onClose,
  onSave,
  onDelete,
  isNew = false,
}: {
  log: ContactLog;
  contacts?: Contact[];
  onClose(): void;
  onSave(log: ContactLog): Promise<void>;
  onDelete(log: ContactLog): void;
  /** a log not stored yet: nothing to delete, and leaving it empty saves nothing */
  isNew?: boolean;
}) {
  const [draft, setDraft] = useState(log);
  const [newName, setNewName] = useState<string | null>(null);
  const toast = useToast();
  const { sets, label } = useOptions();
  const participants = draft.participants ?? [];
  // the usual people (those still in the list) plus whoever is set here - the rest behind "+ Person"
  const peopleChips = [
    ...new Set([
      ...LOG_DEFAULT_PEOPLE.filter((id) => sets.people.some((person) => person.id === id && !person.archived)),
      ...participants,
    ]),
  ];
  const update = (patch: Partial<ContactLog>) => setDraft({ ...draft, ...patch });
  const orphaned = !!contacts && !!draft.contactId && !contacts.some((contact) => contact.id === draft.contactId);
  const nameMissing = newName !== null && newName.trim().length === 0;
  const canSave =
    !nameMissing &&
    (!isNew || draft.text.trim().length > 0 || !!draft.channel || !!draft.participants?.length || newName !== null);

  function save() {
    if (newName === null) {
      void onSave(draft);
      return;
    }
    const contact = { ...emptyContact(), name: newName.trim() };
    // not awaited: offline the write only settles once the device is back online
    saveContact(contact).catch(() => toast('Der neue Kontakt konnte nicht gespeichert werden.'));
    void onSave({ ...draft, contactId: contact.id });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      onDone={canSave ? save : onClose}
      title="Gesprächseintrag"
    >
      <div className="p-4">
        {contacts && (
          <Field label="Kontakt">
            <select
              className="field"
              value={newName !== null ? NEW_CONTACT : draft.contactId}
              onChange={(event) => {
                const value = event.target.value;
                if (value === NEW_CONTACT) {
                  setNewName('');
                  return;
                }
                setNewName(null);
                update({ contactId: value });
              }}
            >
              <option value="">Ohne Kontakt</option>
              {orphaned && (
                <option value={draft.contactId} disabled>
                  Kontakt gelöscht
                </option>
              )}
              {[...contacts]
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))
                .map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name || '(ohne Namen)'}
                  </option>
                ))}
              <option value={NEW_CONTACT}>+ Neuer Kontakt…</option>
            </select>
            {newName !== null && (
              <input
                className="field mt-2"
                autoFocus
                placeholder="Name des neuen Kontakts"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            )}
          </Field>
        )}
        <Field label="Wann">
          <input
            className="field"
            type="datetime-local"
            value={toDateTimeInput(draft.at)}
            onChange={(event) => update({ at: fromDateTimeInput(event.target.value) })}
          />
        </Field>
        <Field label="Art">
          <OptionChips setKey="contactChannels" value={draft.channel} onChange={(value) => update({ channel: value })} />
        </Field>
        <Field label="Beteiligt">
          <div className="flex flex-wrap gap-2">
            {peopleChips.map((person) => {
              const on = participants.includes(person);
              return (
                <button
                  key={person}
                  type="button"
                  aria-pressed={on}
                  className={`chip ${on ? 'chip-on' : ''}`}
                  onClick={() =>
                    update({
                      participants: on ? participants.filter((item) => item !== person) : [...participants, person],
                    })
                  }
                >
                  {label('people', person)}
                </button>
              );
            })}
            <OptionMultiPicker
              setKey="people"
              label="Beteiligt"
              chipLabel="Person"
              value={participants}
              onChange={(value) => update({ participants: value })}
            />
          </div>
        </Field>
        <Field label="Notiz">
          <textarea
            className="field min-h-[7rem]"
            autoFocus
            value={draft.text}
            onChange={(event) => update({ text: event.target.value })}
          />
        </Field>
        <div className="flex gap-3">
          <button
            type="button"
            className="btn btn-primary flex-1"
            disabled={!canSave}
            onClick={save}
          >
            Speichern
          </button>
          {!isNew && (
            <button type="button" className="btn btn-danger" onClick={() => onDelete(draft)}>
              Löschen
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
