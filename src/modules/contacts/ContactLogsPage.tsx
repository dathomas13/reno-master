import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { EmptyState, Spinner } from '@/components/Fields';
import { useToast, useUndoableDelete } from '@/components/Toast';
import { useRowActions } from '@/components/RowActions';
import { useCollection } from '@/data/hooks';
import { COL, type Contact, type ContactLog } from '@/data/types';
import { saveContactLog, deleteContactLog, emptyContactLog } from '@/data/repos';
import { useOptions } from '@/data/useOptions';
import { formatDateTime } from '@/lib/date';
import { ContactLogEditor, logPreview } from './ContactLogSection';
import { AREA_TABS, SectionTabs } from '@/components/SectionTabs';

/**
 * All Gesprächsprotokoll entries in one place, across every contact - the per-contact list
 * (`ContactLogSection`) only shows one contact's own. Tapping an entry opens the entry
 * itself right here, not its contact. The editor carries a "Kontakt" field: an entry may have
 * no contact at all, get a new one created on the spot, or be moved to another contact -
 * which is also how an orphaned entry (deleting a contact does not delete its log entries)
 * gets a new home rather than staying stuck.
 */
export default function ContactLogsPage() {
  const { data: logs, loading } = useCollection<ContactLog>(COL.contactLogs);
  const toast = useToast();
  const undoableDelete = useUndoableDelete();
  const rowActions = useRowActions();

  function removeLog(log: ContactLog) {
    const stored = logs.find((item) => item.id === log.id);
    if (!stored) return;
    undoableDelete('Gesprächseintrag gelöscht', () => deleteContactLog(stored.id), () => saveContactLog(stored));
  }
  const { data: contacts } = useCollection<Contact>(COL.contacts);
  const { label } = useOptions();
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

  // a new entry from the capture button or after a call (?neu=1&kontakt=…&kanal=…)
  useEffect(() => {
    if (params.get('neu') !== '1') return;
    const log = emptyContactLog(params.get('kontakt') ?? '');
    const channel = params.get('kanal');
    setOpen(channel ? { ...log, channel } : log);
    const next = new URLSearchParams(params);
    for (const key of ['neu', 'kontakt', 'kanal']) next.delete(key);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

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
          [contactName.get(log.contactId) ?? '', log.channel ? label('contactChannels', log.channel) : '', log.text]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : logs;
    return [...rows].sort((a, b) => b.at.localeCompare(a.at));
  }, [logs, search, contactName, label]);

  return (
    <>
      <TopBar
        title="Gespräche"
        subtitle={`${logs.length} Einträge`}
        action={
          <button type="button" className="btn btn-primary px-3 min-h-11" onClick={() => setOpen(emptyContactLog(''))}>
            <Icon name="plus" className="w-5 h-5" />
            Neu
          </button>
        }
      />
      <SectionTabs label="Kontakte" tabs={AREA_TABS.contacts('logs')} />

      <div className="p-3">
        <input
          className="field"
          type="search"
          placeholder="Suchen…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loading && logs.length === 0 && <Spinner label="Gespräche werden geladen…" />}

      {!(loading && logs.length === 0) && filtered.length === 0 &&
        (search.trim() ? (
          <EmptyState title="Nichts gefunden" hint={`Kein Gespräch passt zu „${search.trim()}“.`} />
        ) : (
          <EmptyState
            title="Noch keine Gesprächseinträge"
            hint="Mit „Neu“ oben ein Gespräch eintragen – mit oder ohne Kontakt."
          />
        ))}

      <ul>
        {filtered.map((log) => {
          const orphaned = !!log.contactId && !contactName.has(log.contactId);
          const person = log.contactId ? (contactName.get(log.contactId) ?? 'Kontakt gelöscht') : 'Ohne Kontakt';
          return (
            <li
              key={log.id}
              {...rowActions.bind(person, [
                { label: 'Löschen', icon: 'trash', danger: true, onSelect: () => removeLog(log) },
              ])}
            >
              <button type="button" className="list-row w-full text-left" onClick={() => setOpen(log)}>
                <span className="flex-1 min-w-0">
                  <span
                    className={`block truncate font-medium ${orphaned ? 'text-bad' : log.contactId ? '' : 'text-muted'}`}
                  >
                    {person}
                  </span>
                  <span className="block text-xs text-muted truncate">
                    {[formatDateTime(log.at), log.channel ? label('contactChannels', log.channel) : '']
                      .filter(Boolean).join(' · ')}
                  </span>
                  <span className="block text-xs text-muted line-clamp-3">{logPreview(log.text)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {rowActions.sheet}

      {open && (
        <ContactLogEditor
          log={open}
          contacts={contacts}
          isNew={!logs.some((item) => item.id === open.id)}
          onClose={close}
          onSave={async (log) => {
            try {
              await saveContactLog(log);
            } catch {
              toast('Der Eintrag konnte nicht gespeichert werden.');
              return;
            }
            close();
          }}
          onDelete={(log) => {
            close();
            removeLog(log);
          }}
        />
      )}
    </>
  );
}
