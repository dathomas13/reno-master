import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState } from '@/components/Fields';
import { useCollection } from '@/data/hooks';
import { COL, type Contact, type ContactLog } from '@/data/types';
import { saveContactLog, deleteContactLog } from '@/data/repos';
import { formatDateTime } from '@/lib/date';
import { ContactLogEditor, logPreview } from './ContactLogSection';

/**
 * All Gesprächsprotokoll entries in one place, across every contact - the per-contact list
 * (`ContactLogSection`) only shows one contact's own. Tapping an entry opens the entry
 * itself right here, not its contact. The editor carries a "Kontakt" field, so an entry can
 * be moved to another contact - which is also how an orphaned entry (deleting a contact
 * does not delete its log entries) gets a new home rather than staying stuck.
 */
export default function ContactLogsPage() {
  const { data: logs } = useCollection<ContactLog>(COL.contactLogs);
  const { data: contacts } = useCollection<Contact>(COL.contacts);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<ContactLog | null>(null);
  const [params, setParams] = useSearchParams();
  const wanted = params.get('eintrag');

  // a search result links straight to one entry: open it as soon as it is loaded
  useEffect(() => {
    if (!wanted) return;
    const log = logs.find((item) => item.id === wanted);
    if (log) setOpen(log);
  }, [wanted, logs]);

  function close() {
    setOpen(null);
    if (!wanted) return;
    const next = new URLSearchParams(params);
    next.delete('eintrag');
    setParams(next, { replace: true });
  }

  const contactName = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact.name])), [contacts]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = needle
      ? logs.filter((log) =>
          [contactName.get(log.contactId) ?? '', log.channel ?? '', log.text]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : logs;
    return [...rows].sort((a, b) => b.at.localeCompare(a.at));
  }, [logs, search, contactName]);

  return (
    <>
      <TopBar title="Gespräche" subtitle={`${logs.length} Einträge`} />

      <div className="p-3">
        <input
          className="field"
          type="search"
          placeholder="Suchen…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {filtered.length === 0 && (
        <EmptyState
          title="Keine Gesprächseinträge"
          hint="Steht bei einem Kontakt unter „Gesprächsprotokoll“."
        />
      )}

      <ul>
        {filtered.map((log) => {
          const orphaned = !contactName.has(log.contactId);
          return (
            <li key={log.id}>
              <button type="button" className="list-row w-full text-left" onClick={() => setOpen(log)}>
                <span className="flex-1 min-w-0">
                  <span className={`block truncate font-medium ${orphaned ? 'text-bad' : ''}`}>
                    {contactName.get(log.contactId) ?? 'Kontakt gelöscht'}
                  </span>
                  <span className="block text-xs text-muted truncate">
                    {[formatDateTime(log.at), log.channel].filter(Boolean).join(' · ')}
                  </span>
                  <span className="block text-xs text-muted line-clamp-3">{logPreview(log.text)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {open && (
        <ContactLogEditor
          log={open}
          contacts={contacts}
          onClose={close}
          onSave={async (log) => {
            await saveContactLog(log);
            close();
          }}
          onDelete={async (log) => {
            await deleteContactLog(log.id);
            close();
          }}
        />
      )}
    </>
  );
}
