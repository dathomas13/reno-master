import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState } from '@/components/Fields';
import { useCollection } from '@/data/hooks';
import { COL, type Contact, type ContactLog } from '@/data/types';
import { formatDateTime } from '@/lib/date';

/**
 * All Gesprächsprotokoll entries in one place, across every contact - the per-contact list
 * (`ContactLogSection`) only shows one contact's own. Tapping an entry opens that contact,
 * where the entry itself lives and can be edited.
 */
export default function ContactLogsPage() {
  const { data: logs } = useCollection<ContactLog>(COL.contactLogs);
  const { data: contacts } = useCollection<Contact>(COL.contacts);
  const [search, setSearch] = useState('');

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
        {filtered.map((log) => (
          <li key={log.id} className="list-row">
            <Link to={`/kontakte?kontakt=${log.contactId}`} className="flex-1 min-w-0 text-left">
              <span className="block truncate font-medium">
                {contactName.get(log.contactId) ?? 'Unbekannter Kontakt'}
              </span>
              <span className="block text-xs text-muted truncate">
                {[formatDateTime(log.at), log.channel].filter(Boolean).join(' · ')}
              </span>
              <span className="block text-xs text-muted truncate">{log.text.split('\n')[0] || '(kein Text)'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
