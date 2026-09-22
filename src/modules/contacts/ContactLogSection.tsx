import { useMemo, useState } from 'react';
import { where } from '@/firebase/db';
import { useCollection } from '@/data/hooks';
import { COL, CONTACT_LOG_CHANNELS, type Contact, type ContactLog, type ContactLogChannel } from '@/data/types';
import { emptyContactLog, saveContactLog, deleteContactLog } from '@/data/repos';
import { Field, ChipSelect } from '@/components/Fields';
import { Sheet } from '@/components/Sheet';
import { formatDateTime } from '@/lib/date';

/** the dated call/meeting log of one contact - what used to just pile up in the notes field */
export function ContactLogSection({ contactId }: { contactId: string }) {
  const { data } = useCollection<ContactLog>(COL.contactLogs, [where('contactId', '==', contactId)], [contactId]);
  const logs = useMemo(() => [...data].sort((a, b) => b.at.localeCompare(a.at)), [data]);
  const [open, setOpen] = useState<ContactLog | null>(null);

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
                    {log.channel ? ` · ${log.channel}` : ''}
                  </span>
                  <span className="block truncate">{log.text.split('\n')[0] || '(kein Text)'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn w-full" onClick={() => setOpen(emptyContactLog(contactId))}>
        + Gesprächseintrag
      </button>
      {open && (
        <ContactLogEditor
          log={open}
          onClose={() => setOpen(null)}
          onSave={async (log) => {
            await saveContactLog(log);
            setOpen(null);
          }}
          onDelete={async (log) => {
            await deleteContactLog(log.id);
            setOpen(null);
          }}
        />
      )}
    </Field>
  );
}

function toDateTimeInput(value: string): string {
  return value.slice(0, 16);
}

function fromDateTimeInput(value: string): string {
  return value ? `${value}:00` : value;
}

/**
 * `contacts` is only passed when a log's own contact is gone (`ContactLogsPage`, after the
 * contact behind it was deleted) - then the sheet shows a "Kontakt" field to pick a new home
 * for the entry instead of leaving it orphaned. Editing from inside a contact's own sheet
 * (`ContactLogSection` above) never passes it: the contact there is fixed by context.
 */
export function ContactLogEditor({
  log,
  contacts,
  onClose,
  onSave,
  onDelete,
}: {
  log: ContactLog;
  contacts?: Contact[];
  onClose(): void;
  onSave(log: ContactLog): Promise<void>;
  onDelete(log: ContactLog): Promise<void>;
}) {
  const [draft, setDraft] = useState(log);
  const update = (patch: Partial<ContactLog>) => setDraft({ ...draft, ...patch });
  const contactPicked = !contacts || contacts.some((contact) => contact.id === draft.contactId);

  return (
    <Sheet
      open
      onClose={onClose}
      onDone={contactPicked ? () => void onSave(draft) : onClose}
      title="Gesprächseintrag"
    >
      <div className="p-4">
        {contacts && (
          <Field label="Kontakt">
            <select
              className="field"
              value={contactPicked ? draft.contactId : ''}
              onChange={(event) => update({ contactId: event.target.value })}
            >
              {!contactPicked && (
                <option value="" disabled>
                  Kontakt wählen…
                </option>
              )}
              {[...contacts]
                .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))
                .map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name || '(ohne Namen)'}
                  </option>
                ))}
            </select>
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
          <ChipSelect
            options={CONTACT_LOG_CHANNELS}
            value={draft.channel ? [draft.channel] : []}
            multiple={false}
            onChange={(value) => update({ channel: value[0] as ContactLogChannel | undefined })}
          />
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
            disabled={!contactPicked}
            onClick={() => void onSave(draft)}
          >
            Speichern
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void onDelete(draft)}>
            Löschen
          </button>
        </div>
      </div>
    </Sheet>
  );
}
