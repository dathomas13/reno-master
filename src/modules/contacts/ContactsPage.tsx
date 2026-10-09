import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { Field, EmptyState, Spinner } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { useToast, useUndoableDelete } from '@/components/Toast';
import { useRowActions } from '@/components/RowActions';
import { TradePicker } from '@/components/Pickers';
import { OptionChips, OptionMultiPicker } from '@/components/OptionFields';
import { useCollection } from '@/data/hooks';
import { useOptions } from '@/data/useOptions';
import { COL, type Contact } from '@/data/types';
import { contactRoleLabels, contactRoleNames } from '@/data/contactRoles';
import { emptyContact, saveContact, deleteContact } from '@/data/repos';
import { ContactImportSheet } from './ContactImportSheet';
import { ContactLogSection } from './ContactLogSection';
import { rememberCall } from './callFollowUp';
import { CHANNEL_CALL, CHANNEL_MESSAGE } from '@/data/options';
import { AREA_TABS, SectionTabs } from '@/components/SectionTabs';

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function whatsappHref(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '').replace(/^0/, '49');
  return `https://wa.me/${digits}`;
}

export default function ContactsPage() {
  const [params, setParams] = useSearchParams();
  const { data: contacts, loading } = useCollection<Contact>(COL.contacts);
  const toast = useToast();
  const undoableDelete = useUndoableDelete();
  const rowActions = useRowActions();

  function removeContact(contact: Contact) {
    const stored = contacts.find((item) => item.id === contact.id);
    if (!stored) return;
    undoableDelete(`„${stored.name || 'Kontakt'}“ gelöscht`, () => deleteContact(stored.id), () => saveContact(stored));
  }
  const { label } = useOptions();
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

  const roleLabel = useCallback((stored: string) => label('contactRoles', stored), [label]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = needle
      ? contacts.filter((contact) =>
          [contact.name, contact.company, ...contactRoleLabels(contact, roleLabel), contact.notes]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : contacts;
    return [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
  }, [contacts, search, roleLabel]);

  return (
    <>
      <TopBar
        title="Kontakte"
        subtitle={`${contacts.length} Handwerker und Firmen`}
        action={
          <div className="flex gap-2">
            <button type="button" className="btn px-3 min-h-11" onClick={() => setImporting(true)}>
              Importieren
            </button>
            <button
              type="button"
              className="btn btn-primary px-3 min-h-11"
              onClick={() => setEditing(emptyContact())}
            >
              <Icon name="plus" className="w-5 h-5" />
              Neu
            </button>
          </div>
        }
      />
      <SectionTabs label="Kontakte" tabs={AREA_TABS.contacts('contacts')} />

      <div className="p-3">
        <input
          className="field"
          type="search"
          placeholder="Suchen…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loading && contacts.length === 0 && <Spinner label="Kontakte werden geladen…" />}

      {!(loading && contacts.length === 0) && filtered.length === 0 &&
        (search.trim() ? (
          <EmptyState title="Nichts gefunden" hint={`Kein Kontakt passt zu „${search.trim()}“.`} />
        ) : (
          <EmptyState title="Noch keine Kontakte" hint="Oben über „Neu“ anlegen oder aus dem Adressbuch importieren." />
        ))}

      <ul>
        {filtered.map((contact) => (
          <li
            key={contact.id}
            className="list-row"
            {...rowActions.bind(contact.name || 'Kontakt', [
              { label: 'Löschen', icon: 'trash', danger: true, onSelect: () => removeContact(contact) },
            ])}
          >
            <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setEditing(contact)}>
              <span className={`block truncate ${contact.name ? '' : 'italic text-muted'}`}>
                {contact.name || '(ohne Namen)'}
              </span>
              <span className="block text-xs text-muted truncate">
                {[
                  contactRoleLabels(contact, roleLabel).join(', '),
                  contact.company,
                  contact.status ? label('contactStatus', contact.status) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
            {contact.phone && (
              <>
                <a
                  className="btn btn-ghost w-11 px-0 text-accent shrink-0"
                  href={telHref(contact.phone)}
                  onClick={() =>
                    rememberCall({ contactId: contact.id, name: contact.name, channel: CHANNEL_CALL, at: Date.now() })
                  }
                  aria-label={`${contact.name || 'Kontakt'} anrufen`}
                  title="Anrufen"
                >
                  <Icon name="phone" className="w-5 h-5" />
                </a>
                <a
                  className="btn btn-ghost w-11 px-0 text-good shrink-0"
                  href={whatsappHref(contact.phone)}
                  onClick={() =>
                    rememberCall({ contactId: contact.id, name: contact.name, channel: CHANNEL_MESSAGE, at: Date.now() })
                  }
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`WhatsApp an ${contact.name || 'Kontakt'}`}
                  title="WhatsApp"
                >
                  <Icon name="chat" className="w-5 h-5" />
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
      {rowActions.sheet}

      {editing && (
        <ContactSheet
          contact={editing}
          isNew={!contacts.some((item) => item.id === editing.id)}
          onClose={close}
          onSave={async (contact) => {
            try {
              await saveContact(contact);
            } catch {
              toast('Der Kontakt konnte nicht gespeichert werden.');
              return;
            }
            close();
          }}
          onDelete={(contact) => {
            close();
            removeContact(contact);
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
  onClose,
  onSave,
  onDelete,
}: {
  contact: Contact;
  isNew: boolean;
  onClose(): void;
  onSave(contact: Contact): Promise<void>;
  onDelete(contact: Contact): void;
}) {
  const [draft, setDraft] = useState<Contact>(contact);

  useEffect(() => {
    setDraft((current) => (current.id !== contact.id ? contact : current));
  }, [contact]);

  const update = (patch: Partial<Contact>) => setDraft({ ...draft, ...patch });
  const canSave = draft.name.trim().length > 0;

  return (
    <Sheet open onClose={onClose} onDone={canSave ? () => void onSave(draft) : onClose} title="Kontakt">
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
          <OptionMultiPicker
            setKey="contactRoles"
            label="Rollen"
            value={contactRoleNames(draft)}
            onChange={(value) => update({ roles: value })}
            emptyLabel="keine Rolle"
            addLabel="Rolle hinzufügen"
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
          <OptionChips setKey="contactStatus" value={draft.status} onChange={(value) => update({ status: value })} />
        </Field>
        <Field label="Bewertung">
          <div className="flex -ml-2.5">
            {[1, 2, 3, 4, 5].map((stars) => (
              <button
                key={stars}
                type="button"
                className={`w-11 h-11 grid place-items-center ${(draft.rating ?? 0) >= stars ? 'text-accent' : 'text-line'}`}
                // the star that is already set takes the rating away again
                onClick={() =>
                  update({ rating: draft.rating === stars ? undefined : (stars as 1 | 2 | 3 | 4 | 5) })
                }
                aria-label={`${stars} ${stars === 1 ? 'Stern' : 'Sterne'}`}
                aria-pressed={draft.rating === stars}
              >
                <Icon name="star" filled={(draft.rating ?? 0) >= stars} className="w-7 h-7" />
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
          <button
            type="button"
            className="btn btn-primary flex-1"
            disabled={!canSave}
            onClick={() => void onSave(draft)}
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
