import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Field, ChipSelect, Spinner } from '@/components/Fields';
import { RoomPicker, TradeSelect } from '@/components/Pickers';
import { PhotoAttach } from '@/modules/diary/PhotoAttach';
import { useCollection, useDocument } from '@/data/hooks';
import { useLists } from '@/data/useLists';
import {
  COL, PAID_BY, PAYMENT_METHOD, PAYMENT_STATUS,
  type Cost, type PaidBy, type PaymentMethod, type PaymentStatus, type Photo,
} from '@/data/types';
import { emptyCost, saveCost, deleteCost } from '@/data/repos';
import { parseAmount, formatAmount, splitGross, round2 } from '@/lib/money';
import { toIsoDateTime, today } from '@/lib/date';
import { activeExtractor, type ReceiptFields } from '@/platform/ocr';
import { friendlyOcrError } from '@/platform/ocr/errors';

/** which fields were filled by the extractor, so they can be marked in the form */
type AutoFilled = Partial<Record<keyof Cost, boolean>>;

export default function CostEditorPage() {
  const { id } = useParams();
  return <CostEditor key={id ?? 'new'} />;
}

function CostEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;

  const { data: existing, loading } = useDocument<Cost>(COL.costs, id);
  const { lists } = useLists();
  const [cost, setCost] = useState<Cost>(() => emptyCost(today()));
  const [addedPhotos, setAddedPhotos] = useState<Photo[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [duplicateCostId, setDuplicateCostId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ready, setReady] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [auto, setAuto] = useState<AutoFilled>({});
  const [ocrState, setOcrState] = useState<'idle' | 'running' | 'done' | 'error' | 'unavailable'>('idle');
  const [ocrMessage, setOcrMessage] = useState<string | null>(null);
  const [engineLabel, setEngineLabel] = useState<string | null>(null);

  useEffect(() => {
    if (existing && !ready) {
      setCost(existing);
      setAmountText(existing.amountGross ? formatAmount(existing.amountGross) : '');
      setReady(true);
    }
  }, [existing, ready]);

  const { data: allPhotos, loading: photosLoading, error: photosError } = useCollection<Photo>(COL.photos);
  const { data: allCosts, loading: costsLoading, error: costsError } = useCollection<Cost>(COL.costs);
  const costPhotos = allPhotos.filter((photo) => photo.costId === cost.id || cost.receiptPhotoIds.includes(photo.id));
  const photos = [...new Map([...addedPhotos, ...costPhotos].map((photo) => [photo.id, photo])).values()]
    .filter((photo) => !removedPhotoIds.includes(photo.id));
  const importBlocked = saving || photosLoading || costsLoading || Boolean(photosError || costsError);
  const saveBlocked = importBlocked || attaching || Boolean(duplicateCostId);

  useEffect(() => {
    setAddedPhotos((current) => current.filter((photo) => !allPhotos.some((item) => item.id === photo.id)));
  }, [allPhotos]);

  useEffect(() => {
    void activeExtractor().then((extractor) => {
      setEngineLabel(extractor?.label ?? null);
      if (!extractor) setOcrState('unavailable');
    });
  }, []);

  function update(patch: Partial<Cost>) {
    setCost((current) => ({ ...current, ...patch }));
  }

  /** runs the extractor over a freshly attached receipt and prefills empty fields */
  async function runExtraction(file: Blob, contentType: string) {
    const extractor = await activeExtractor();
    if (!extractor) {
      setOcrState('unavailable');
      return;
    }
    setOcrState('running');
    setOcrMessage(null);
    try {
      const fields: ReceiptFields = await extractor.extract({
        file,
        contentType,
        categories: lists.costCategories,
      });
      const filled: AutoFilled = {};
      const patch: Partial<Cost> = {};
      // never overwrite something the user already typed
      if (fields.date && !cost.date) {
        patch.date = fields.date;
        filled.date = true;
      } else if (fields.date && cost.date === today()) {
        patch.date = fields.date;
        filled.date = true;
      }
      if (fields.vendor && !cost.vendor) {
        patch.vendor = fields.vendor;
        filled.vendor = true;
      }
      if (fields.amountGross !== undefined && !cost.amountGross) {
        patch.amountGross = fields.amountGross;
        setAmountText(formatAmount(fields.amountGross));
        filled.amountGross = true;
      }
      if (fields.amountNet !== undefined && cost.amountNet === undefined) patch.amountNet = fields.amountNet;
      if (fields.vatRate !== undefined && cost.vatRate === undefined) {
        patch.vatRate = fields.vatRate;
        filled.vatRate = true;
      }
      if (fields.vatAmount !== undefined && cost.vatAmount === undefined) patch.vatAmount = fields.vatAmount;
      if (fields.invoiceNumber && !cost.invoiceNumber) {
        patch.invoiceNumber = fields.invoiceNumber;
        filled.invoiceNumber = true;
      }
      if (fields.description && !cost.description) {
        patch.description = fields.description;
        filled.description = true;
      }
      if (fields.category && !cost.category && lists.costCategories.includes(fields.category)) {
        patch.category = fields.category;
        filled.category = true;
      }
      patch.extraction = {
        engine: fields.engine,
        at: toIsoDateTime(),
        confidence: fields.confidence,
        rawText: fields.rawText?.slice(0, 4000),
      };
      update(patch);
      setAuto((current) => ({ ...current, ...filled }));
      setOcrState('done');
      setOcrMessage(
        Object.keys(filled).length
          ? `${Object.keys(filled).length} Felder automatisch erkannt – bitte prüfen.`
          : 'Nichts Verwertbares erkannt – bitte von Hand ausfüllen.',
      );
    } catch (cause) {
      setOcrState('error');
      setOcrMessage(friendlyOcrError(cause));
    }
  }

  function setGross(text: string) {
    setAmountText(text);
    const value = parseAmount(text);
    if (value === null) return;
    const patch: Partial<Cost> = { amountGross: round2(value) };
    if (cost.vatRate) {
      const { net, vat } = splitGross(value, cost.vatRate);
      patch.amountNet = net;
      patch.vatAmount = vat;
    }
    update(patch);
    setAuto((current) => ({ ...current, amountGross: false }));
  }

  function setVatRate(rate: number | null) {
    const patch: Partial<Cost> = { vatRate: rate };
    if (rate && cost.amountGross) {
      const { net, vat } = splitGross(cost.amountGross, rate);
      patch.amountNet = net;
      patch.vatAmount = vat;
    }
    update(patch);
  }

  async function save() {
    if (saveBlocked) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveCost({ ...cost, receiptPhotoIds: photos.map((photo) => photo.id) });
      navigate('/kosten', { replace: true });
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Rechnung konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('Diese Position löschen?')) return;
    await deleteCost(cost.id);
    navigate('/kosten', { replace: true });
  }

  const autoMark = (key: keyof Cost) =>
    auto[key] ? <span className="text-[10px] text-accent ml-2">automatisch erkannt</span> : null;

  if (!isNew && loading && !ready) return <Spinner />;

  return (
    <>
      <TopBar
        title={isNew ? 'Neue Rechnung' : 'Rechnung'}
        back="/kosten"
        action={
          <button type="button" className="btn btn-primary px-3 min-h-0 py-2" onClick={() => void save()} disabled={saveBlocked}>
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
        }
      />

      <div className="p-4 max-w-3xl">
        <Field
          label="Beleg"
          hint={
            engineLabel
              ? `Automatisches Auslesen über ${engineLabel}.`
              : 'Automatisches Auslesen ist nicht eingerichtet – Felder bitte selbst ausfüllen (Einstellungen → Beleg-Auslesen).'
          }
        >
          <PhotoAttach
            photos={photos}
            costId={cost.id}
            kind="receipt"
            existingPhotos={[...new Map([...allPhotos, ...photos].map((photo) => [photo.id, photo])).values()]}
            existingCosts={allCosts}
            disabled={importBlocked}
            onAdded={(photo) => {
              setAddedPhotos((current) => [...current.filter((item) => item.id !== photo.id), photo]);
              setRemovedPhotoIds((current) => current.filter((photoId) => photoId !== photo.id));
              setDuplicateCostId(null);
            }}
            onRemoved={(photo) => {
              setAddedPhotos((current) => current.filter((item) => item.id !== photo.id));
              setRemovedPhotoIds((current) => [...current, photo.id]);
            }}
            onBusyChange={setAttaching}
            onDuplicate={(photo) => setDuplicateCostId(photo.costId ?? null)}
            onFileChosen={runExtraction}
            autoCapture={params.get('capture') === '1'}
          />
          {duplicateCostId && (
            <Link className="text-accent text-sm block mt-2" to={`/kosten/${duplicateCostId}`}>
              Vorhandene Rechnung öffnen
            </Link>
          )}
          {(photosError || costsError) && (
            <p className="text-bad text-sm mt-2">Belege konnten nicht geladen werden: {(photosError || costsError)?.message}</p>
          )}
          {saveError && <p role="alert" className="text-bad text-sm mt-2">{saveError}</p>}
          {ocrState === 'running' && <p className="text-muted text-sm mt-2">Beleg wird gelesen…</p>}
          {ocrMessage && (
            <p className={`text-sm mt-2 ${ocrState === 'error' ? 'text-bad' : 'text-muted'}`}>{ocrMessage}</p>
          )}
        </Field>

        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Datum">
              <input
                className="field"
                type="date"
                value={cost.date}
                onChange={(event) => {
                  update({ date: event.target.value });
                  setAuto((current) => ({ ...current, date: false }));
                }}
              />
              {autoMark('date')}
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Betrag brutto">
              <input
                className="field text-right"
                inputMode="decimal"
                placeholder="0,00"
                value={amountText}
                onChange={(event) => setGross(event.target.value)}
              />
              {autoMark('amountGross')}
            </Field>
          </div>
        </div>

        <Field label="Händler / Firma">
          <input
            className="field"
            value={cost.vendor}
            onChange={(event) => {
              update({ vendor: event.target.value });
              setAuto((current) => ({ ...current, vendor: false }));
            }}
          />
          {autoMark('vendor')}
        </Field>

        <Field label="Beschreibung">
          <input
            className="field"
            value={cost.description}
            placeholder="Perimeterdämmung, Kleber, Dichtschlämme"
            onChange={(event) => update({ description: event.target.value })}
          />
        </Field>

        <Field label="Kategorie">
          <ChipSelect
            options={lists.costCategories}
            value={cost.category ? [cost.category] : []}
            multiple={false}
            onChange={(value) => update({ category: value[0] ?? '' })}
          />
          {autoMark('category')}
        </Field>

        <Field label="MwSt">
          <div className="flex gap-2 items-center">
            {[19, 7, 0].map((rate) => (
              <button
                key={rate}
                type="button"
                className={`chip ${cost.vatRate === rate ? 'chip-on' : ''}`}
                onClick={() => setVatRate(cost.vatRate === rate ? null : rate)}
              >
                {rate} %
              </button>
            ))}
            {cost.amountNet !== undefined && (
              <span className="text-xs text-muted ml-2">
                netto {formatAmount(cost.amountNet)} · MwSt {formatAmount(cost.vatAmount ?? 0)}
              </span>
            )}
          </div>
        </Field>

        <Field label="Status">
          <ChipSelect
            options={PAYMENT_STATUS}
            value={[cost.paymentStatus]}
            multiple={false}
            allowEmpty={false}
            onChange={(value) => update({ paymentStatus: (value[0] ?? 'bezahlt') as PaymentStatus })}
          />
        </Field>

        <Field label="Bezahlt von">
          <ChipSelect
            options={PAID_BY}
            value={cost.paidBy ? [cost.paidBy] : []}
            multiple={false}
            onChange={(value) => update({ paidBy: value[0] as PaidBy | undefined })}
          />
        </Field>

        <Field label="Zahlungsart">
          <ChipSelect
            options={PAYMENT_METHOD}
            value={cost.paymentMethod ? [cost.paymentMethod] : []}
            multiple={false}
            onChange={(value) => update({ paymentMethod: value[0] as PaymentMethod | undefined })}
          />
        </Field>

        <Field label="Gewerk">
          <TradeSelect value={cost.tradeId} onChange={(value) => update({ tradeId: value })} />
        </Field>

        <Field label="Räume">
          <RoomPicker value={cost.roomIds} onChange={(value) => update({ roomIds: value })} />
        </Field>

        <Field label="Rechnungsnummer">
          <input
            className="field"
            value={cost.invoiceNumber ?? ''}
            onChange={(event) => update({ invoiceNumber: event.target.value })}
          />
          {autoMark('invoiceNumber')}
        </Field>

        <Field label="Notizen">
          <textarea
            className="field min-h-[5rem]"
            value={cost.notes ?? ''}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </Field>

        <div className="flex gap-3 mt-4">
          <button type="button" className="btn btn-primary flex-1" onClick={() => void save()} disabled={saveBlocked}>
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
          {!isNew && (
            <button type="button" className="btn btn-danger" onClick={() => void remove()}>
              Löschen
            </button>
          )}
        </div>
      </div>
    </>
  );
}
