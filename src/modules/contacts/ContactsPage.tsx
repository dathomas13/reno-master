import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { Field, ChipSelect, EmptyState } from '@/components/Fields';
import { TradePicker, RolePicker } from '@/components/Pickers';
import { useCollection } from '@/data/hooks';
import { useLists } from '@/data/useLists';
import { COL, CONTACT_STATUS, type Contact, type ContactStatus } from '@/data/types';
import { contactRoleNames } from '@/data/contactRoles';
import { emptyContact, saveContact, deleteContact } from '@/data/repos';
import { ContactImportSheet } from './ContactImportSheet';
import { ContactLogSection } from './ContactLogSection';

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function whatsappHref(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '').replace(/^0/, '49');
  return `https://wa.me/${digits}`;
}

export default function ContactsPage() {
  const [params, setParams] = useSearchParams();
  const { data: contacts } = useCollection<Contact>(COL.contacts);
  const { lists, addTo } = useLists();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Contact | null>(null);
  const [importing, setImporting] = useState(false);

  const wanted = params.get('kontakt');

  // a search result links straight to one contact: open its sheet as soon as it is loaded
  useEffect(() => {
    if (!wanted) return;
    const contact = contacts.find((item) => item.id === wanted);
    if (contact) setEditing(contact);
  }, [wanted, contacts]);

  function close() {
    setEditing(null);
    if (wanted) {
      const next = new URLSearchParams(params);
      next.delete('kontakt');
      setParams(next, { replace: true });
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = needle
      ? contacts.filter((contact) =>
          [contact.name, contact.company, ...contactRoleNames(contact), contact.notes]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : contacts;
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [contacts, search]);

  return (
    <>
      <TopBar
        title="Kontakte"
        subtitle={`${contacts.length} Handwerker und Firmen`}
        action={
          <div className="flex gap-2">
            <button type="button" className="btn px-3 min-h-0 py-2" onClick={() => setImporting(true)}>
              Importieren
            </button>
            <button
              type="button"
              className="btn btn-primary px-3 min-h-0 py-2"
              onClick={() => setEditing(emptyContact())}
            >
              Neu
            </button>
          </div>
        }
      />

      <div className="p-3">
        <input
          className="field"
          type="search"
          placeholder="Suchen…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {filtered.length === 0 && <EmptyState title="Keine Kontakte" />}

      <ul>
        {filtered.map((contact) => (
          <li key={contact.id} className="list-row">
            <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setEditing(contact)}>
              <span className="block truncate">{contact.name}</span>
              <span className="block text-xs text-muted truncate">
                {[contactRoleNames(contact).join(', '), contact.company, contact.status]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
            {contact.phone && (
              <>
                <a
                  className="btn btn-ghost px-2 min-h-0 py-1 text-accent"
                  href={telHref(contact.phone)}
                  aria-label="Anrufen"
                >
                  Anruf
                </a>
                <a
                  className="btn btn-ghost px-2 min-h-0 py-1 text-good"
                  href={whatsappHref(contact.phone)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp"
                >
                  WA
                </a>
              </>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <ContactSheet
          contact={editing}
          isNew={!contacts.some((item) => item.id === editing.id)}
          roles={lists.contactRoles}
          onAddRole={(role) => void addTo('contactRoles', role)}
          onClose={close}
          onSave={async (contact) => {
            await saveContact(contact);
            close();
          }}
          onDelete={async (contact) => {
            await deleteContact(contact.id);
            close();
          }}
        />
      )}

      {importing && (
        <ContactImportSheet
          existingNames={contacts.map((contact) => contact.name)}
          onClose={() => setImporting(false)}
        />
      )}
    </>
  );
}

function ContactSheet({
  contact,
  isNew,
  roles,
  onAddRole,
  onClose,
  onSave,
  onDelete,
}: {
  contact: Contact;
  isNew: boolean;
  roles: string[];
  onAddRole(role: string): void;
  onClose(): void;
  onSave(contact: Contact): Promise<void>;
  onDelete(contact: Contact): Promise<void>;
}) {
  const [draft, setDraft] = useState<Contact>(contact);

  useEffect(() => {
    setDraft((current) => (current.id !== contact.id ? contact : current));
  }, [contact]);

  const update = (patch: Partial<Contact>) => setDraft({ ...draft, ...patch });

  return (
    <Sheet open onClose={onClose} onDone={() => void onSave(draft)} title="Kontakt">
      <div className="p-4">
        <Field label="Name">
          <input
            className="field"
            value={draft.name}
            onChange={(event) => update({ name: event.target.value })}
          />
        </Field>
        <Field label="Firma">
          <input
            className="field"
            value={draft.company ?? ''}
            onChange={(event) => update({ company: event.target.value })}
          />
        </Field>
        <Field label="Rollen">
          <RolePicker
            options={roles}
            value={contactRoleNames(draft)}
            onChange={(value) => update({ roles: value })}
            onAdd={() => {
              const role = prompt('Neue Rolle?')?.trim();
              if (!role) return;
              onAddRole(role);
              update({ roles: [...contactRoleNames(draft), role] });
            }}
          />
        </Field>
        <Field label="Telefon">
          <input
            className="field"
            type="tel"
            inputMode="tel"
            value={draft.phone ?? ''}
            onChange={(event) => update({ phone: event.target.value })}
          />
        </Field>
        <Field label="E-Mail">
          <input
            className="field"
            type="email"
            value={draft.email ?? ''}
            onChange={(event) => update({ email: event.target.value })}
          />
        </Field>
        <Field label="Status">
          <ChipSelect
            options={CONTACT_STATUS}
            value={draft.status ? [draft.status] : []}
            multiple={false}
            onChange={(value) => update({ status: value[0] as ContactStatus | undefined })}
          />
        </Field>
        <Field label="Bewertung">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((stars) => (
              <button
                key={stars}
                type="button"
                className={`text-2xl ${(draft.rating ?? 0) >= stars ? 'text-accent' : 'text-line'}`}
                onClick={() => update({ rating: stars as 1 | 2 | 3 | 4 | 5 })}
                aria-label={`${stars} Sterne`}
              >
                ★
              </button>
            ))}
          </div>
        </Field>
        <Field label="Gewerke">
          <TradePicker value={draft.tradeIds} onChange={(value) => update({ tradeIds: value })} />
        </Field>
        <Field label="Notizen">
          <textarea
            className="field min-h-[5rem]"
            value={draft.notes ?? ''}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </Field>
        {isNew ? (
          <p className="text-xs text-muted mb-4">
            Gesprächseinträge gibt es, sobald der Kontakt einmal gespeichert ist.
          </p>
        ) : (
          <ContactLogSection contactId={draft.id} />
        )}
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
