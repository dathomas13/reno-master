import { useMemo, useState } from 'react';
import { where } from '@/firebase/db';
import { useCollection } from '@/data/hooks';
import { COL, CONTACT_LOG_CHANNELS, type ContactLog, type ContactLogChannel } from '@/data/types';
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

function ContactLogEditor({
  log,
  onClose,
  onSave,
  onDelete,
}: {
  log: ContactLog;
  onClose(): void;
  onSave(log: ContactLog): Promise<void>;
  onDelete(log: ContactLog): Promise<void>;
}) {
  const [draft, setDraft] = useState(log);
  const update = (patch: Partial<ContactLog>) => setDraft({ ...draft, ...patch });

  return (
    <Sheet open onClose={onClose} onDone={() => void onSave(draft)} title="Gesprächseintrag">
      <div className="p-4">
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
          <button type="button" className="btn btn-primary flex-1" onClick={() => void onSave(draft)}>
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
