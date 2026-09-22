import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState } from '@/components/Fields';
import { useCollection } from '@/data/hooks';
import { COL, type Contact, type ContactLog } from '@/data/types';
import { saveContactLog, deleteContactLog } from '@/data/repos';
import { formatDateTime } from '@/lib/date';
import { ContactLogEditor } from './ContactLogSection';

/**
 * All Gesprächsprotokoll entries in one place, across every contact - the per-contact list
 * (`ContactLogSection`) only shows one contact's own. Tapping an entry opens that contact,
 * where the entry itself lives and can be edited. Deleting a contact does not delete its
 * log entries (nothing here cascades that), so an entry can outlive its contact - tapping
 * such an orphaned entry opens it right here instead, with a "Kontakt" field to give it a
 * new home rather than leaving it stuck.
 */
export default function ContactLogsPage() {
  const { data: logs } = useCollection<ContactLog>(COL.contactLogs);
  const { data: contacts } = useCollection<Contact>(COL.contacts);
  const [search, setSearch] = useState('');
  const [reassigning, setReassigning] = useState<ContactLog | null>(null);

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
          const body = (
            <>
              <span className={`block truncate font-medium ${orphaned ? 'text-bad' : ''}`}>
                {contactName.get(log.contactId) ?? 'Kontakt gelöscht'}
              </span>
              <span className="block text-xs text-muted truncate">
                {[formatDateTime(log.at), log.channel].filter(Boolean).join(' · ')}
              </span>
              <span className="block text-xs text-muted truncate">{log.text.split('\n')[0] || '(kein Text)'}</span>
            </>
          );
          return (
            <li key={log.id} className="list-row">
              {orphaned ? (
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => setReassigning(log)}
                >
                  {body}
                </button>
              ) : (
                <Link to={`/kontakte?kontakt=${log.contactId}`} className="flex-1 min-w-0 text-left">
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {reassigning && (
        <ContactLogEditor
          log={reassigning}
          contacts={contacts}
          onClose={() => setReassigning(null)}
          onSave={async (log) => {
            await saveContactLog(log);
            setReassigning(null);
          }}
          onDelete={async (log) => {
            await deleteContactLog(log.id);
            setReassigning(null);
          }}
        />
      )}
    </>
  );
}
