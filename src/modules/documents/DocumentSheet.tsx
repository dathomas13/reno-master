import { useEffect, useMemo, useState } from 'react';
import { Sheet } from '@/components/Sheet';
import { Field } from '@/components/Fields';
import { Icon } from '@/components/Icon';
import { MoreFields } from '@/components/MoreFields';
import { OptionChips } from '@/components/OptionFields';
import { RoomPicker, TradeSelect } from '@/components/Pickers';
import { useToast } from '@/components/Toast';
import { useCollection } from '@/data/hooks';
import { COL, type Contact, type Cost, type ProjectDocument } from '@/data/types';
import {
  addDocument,
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  emptyDocumentFacts,
  isAcceptedDocumentFile,
  saveDocumentFacts,
  titleFromFileName,
  type DocumentFacts,
} from '@/data/documents';
import { pickFiles } from '@/platform/photos';
import { formatBytes } from '@/lib/image';
import { formatAmount, parseAmount, round2 } from '@/lib/money';

export type DocumentSheetTarget =
  | { mode: 'new'; roomIds?: string[] }
  | { mode: 'edit'; document: ProjectDocument };

function factsOf(document: ProjectDocument): DocumentFacts {
  const { title, docType, date, vendor, amount, tradeId, roomIds, notes } = document;
  return { title, docType, date, vendor, amount, tradeId, roomIds: roomIds ?? [], notes };
}

/** names worth suggesting for "Von": contacts' companies and names, vendors of costs and documents */
function useVendorSuggestions(documents: readonly ProjectDocument[]): string[] {
  const { data: contacts } = useCollection<Contact>(COL.contacts);
  const { data: costs } = useCollection<Cost>(COL.costs);
  return useMemo(() => {
    const names = new Set<string>();
    for (const contact of contacts) {
      if (contact.company?.trim()) names.add(contact.company.trim());
      else if (contact.name?.trim()) names.add(contact.name.trim());
    }
    for (const cost of costs) if (cost.vendor?.trim()) names.add(cost.vendor.trim());
    for (const document of documents) if (document.vendor?.trim()) names.add(document.vendor.trim());
    return [...names].sort((a, b) => a.localeCompare(b, 'de'));
  }, [contacts, costs, documents]);
}

/**
 * Filing a new document (pick the file, then say what it is) and changing the facts of
 * one already filed. The file of a filed document stays; a different file is a new document.
 */
export function DocumentSheet({
  target,
  documents,
  onClose,
}: {
  target: DocumentSheetTarget | null;
  /** the documents already filed, for the "Von" suggestions */
  documents: readonly ProjectDocument[];
  onClose(): void;
}) {
  const toast = useToast();
  const vendors = useVendorSuggestions(documents);
  const [facts, setFacts] = useState<DocumentFacts>(emptyDocumentFacts());
  const [amountText, setAmountText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const targetKey = target ? (target.mode === 'edit' ? `edit:${target.document.id}` : 'new') : '';
  useEffect(() => {
    if (!target) return;
    const start = target.mode === 'edit' ? factsOf(target.document) : emptyDocumentFacts(target.roomIds ?? []);
    setFacts(start);
    setAmountText(start.amount !== undefined ? formatAmount(start.amount) : '');
    setFile(null);
    setBusy(false);
    // only when another document (or a new one) is opened, not on every snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  if (!target) return null;
  const isNew = target.mode === 'new';
  const update = (patch: Partial<DocumentFacts>) => setFacts((current) => ({ ...current, ...patch }));

  async function choose() {
    const [picked] = await pickFiles(DOCUMENT_ACCEPT);
    if (!picked) return;
    if (!isAcceptedDocumentFile(picked)) {
      toast('Nur PDFs und Bilder lassen sich ablegen.');
      return;
    }
    if (picked.size > DOCUMENT_MAX_BYTES) {
      toast(`Die Datei ist zu groß (${formatBytes(picked.size)}, höchstens 30 MB).`);
      return;
    }
    setFile(picked);
    setFacts((current) => (current.title.trim() ? current : { ...current, title: titleFromFileName(picked.name) }));
  }

  function onAmount(text: string) {
    setAmountText(text);
    const value = parseAmount(text);
    update({ amount: value === null ? undefined : round2(value) });
  }

  const canSave = !busy && (isNew ? Boolean(file) : true);

  async function save() {
    if (!canSave || !target) return;
    setBusy(true);
    try {
      if (target.mode === 'new') {
        if (!file) return;
        await addDocument(file, facts);
      } else {
        // not awaited: offline the write only settles once the server has it
        void saveDocumentFacts(target.document.id, facts).catch(() =>
          toast('Das Dokument konnte nicht gespeichert werden.'),
        );
      }
    } catch {
      toast('Das Dokument konnte nicht abgelegt werden.');
      setBusy(false);
      return;
    }
    onClose();
  }

  const moreFilled = [facts.amount !== undefined, facts.tradeId, facts.roomIds.length > 0, facts.notes?.trim()].filter(Boolean).length;

  return (
    <Sheet
      open
      onClose={onClose}
      onDone={canSave ? () => void save() : onClose}
      doneLabel={canSave ? 'Fertig' : 'Abbrechen'}
      title={isNew ? 'Dokument ablegen' : 'Dokument'}
    >
      <div className="p-4">
        {isNew && (
          <Field label="Datei">
            <button type="button" className="btn w-full justify-start" onClick={() => void choose()}>
              <Icon name="paperclip" className="w-5 h-5 shrink-0" />
              <span className="truncate">
                {file ? `${file.name} · ${formatBytes(file.size)}` : 'PDF oder Bild wählen'}
              </span>
            </button>
          </Field>
        )}
        <Field label="Titel">
          <input
            className="field"
            value={facts.title}
            placeholder="z. B. U-Wert Gaubendämmung"
            onChange={(event) => update({ title: event.target.value })}
          />
        </Field>
        <Field label="Art">
          <OptionChips
            setKey="documentTypes"
            value={facts.docType}
            allowEmpty={false}
            onChange={(value) => update({ docType: value ?? facts.docType })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <input
              type="date"
              className="field"
              value={facts.date}
              onChange={(event) => update({ date: event.target.value })}
            />
          </Field>
          <Field label="Von">
            <input
              className="field"
              list="document-vendors"
              value={facts.vendor ?? ''}
              placeholder="Firma, Händler …"
              onChange={(event) => update({ vendor: event.target.value })}
            />
            <datalist id="document-vendors">
              {vendors.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
        </div>
        <MoreFields filled={moreFilled}>
          <Field label="Betrag (brutto)" hint="Etwa die Summe eines Angebots">
            <input
              className="field"
              inputMode="decimal"
              value={amountText}
              placeholder="0,00"
              onChange={(event) => onAmount(event.target.value)}
            />
          </Field>
          <Field label="Gewerk">
            <TradeSelect value={facts.tradeId} onChange={(value) => update({ tradeId: value })} />
          </Field>
          <Field label="Räume">
            <RoomPicker value={facts.roomIds} onChange={(value) => update({ roomIds: value })} />
          </Field>
          <Field label="Notizen">
            <textarea
              className="field min-h-[5rem]"
              value={facts.notes ?? ''}
              onChange={(event) => update({ notes: event.target.value })}
            />
          </Field>
        </MoreFields>
        <button type="button" className="btn btn-primary w-full mt-2" disabled={!canSave} onClick={() => void save()}>
          {busy ? 'Wird abgelegt…' : isNew ? 'Ablegen' : 'Speichern'}
        </button>
        {isNew && (
          <p className="text-xs text-muted mt-3">
            Die Datei wird sofort gespeichert und hochgeladen, sobald Netz da ist.
          </p>
        )}
      </div>
    </Sheet>
  );
}
