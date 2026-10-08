import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Field, Spinner } from '@/components/Fields';
import { RoomPicker, TradePicker } from '@/components/Pickers';
import { OptionMultiPicker, OptionSelect } from '@/components/OptionFields';
import { PhotoAttach } from './PhotoAttach';
import { useCollection, useDocument } from '@/data/hooks';
import { isPhaseActive } from '@/data/options';
import { COL, type DiaryEntry, type Phase, type Photo } from '@/data/types';
import { where } from '@/firebase/db';
import { emptyDiaryEntry, saveDiaryEntry } from '@/data/repos';
import { formatDate, today } from '@/lib/date';
import { diaryTextPlaceholder } from './diaryPlaceholder';
import { useRooms } from '@/data/RoomsContext';
import { clearDiaryDraft, loadDiaryDraft, saveDiaryDraft } from './diaryDraft';
import { useToast } from '@/components/Toast';

export default function DiaryEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const isNew = !id;
  const dateParam = params.get('date');
  // from the capture button: a room to file the entry under, and "open today's photos"
  const roomParam = params.get('raum');
  const pickDay = params.get('fotos') === 'heute';
  const initialDate = dateParam ?? today();

  const { data: existing, loading } = useDocument<DiaryEntry>(COL.diary, id);
  const { data: allEntries } = useCollection<DiaryEntry>(COL.diary);
  const { data: phases } = useCollection<Phase>(COL.phases);
  const activePhase = phases.find((phase) => isPhaseActive(phase));

  const { writeId } = useRooms();
  const fresh = () => ({ ...emptyDiaryEntry(initialDate), roomIds: roomParam ? [writeId(roomParam)] : [] });
  const [entry, setEntry] = useState<DiaryEntry>(() => loadDiaryDraft(dateParam ?? undefined) ?? fresh());
  const entryPhase = phases.find((phase) => phase.id === entry.phaseId);
  const [addedPhotos, setAddedPhotos] = useState<Photo[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [ready, setReady] = useState(isNew);
  const closingWithoutDraft = useRef(false);

  useEffect(() => {
    if (!isNew) {
      setReady(false);
      return;
    }
    setEntry(loadDiaryDraft(dateParam ?? undefined) ?? fresh());
    setReady(true);
  }, [id, isNew, dateParam, initialDate]);

  // load an existing entry once
  useEffect(() => {
    if (existing && !ready) {
      setEntry(existing);
      setReady(true);
    }
  }, [existing, ready]);

  // default phase: the one that is currently running
  useEffect(() => {
    if (!isNew || entry.phaseId) return;
    if (activePhase) setEntry((current) => ({ ...current, phaseId: activePhase.id }));
  }, [isNew, activePhase, entry.phaseId]);

  const { data: entryPhotos } = useCollection<Photo>(
    COL.photos,
    [where('entryId', '==', entry.id)],
    [entry.id],
  );
  const photos = [...new Map([
    ...addedPhotos.filter((photo) => photo.entryId === entry.id),
    ...entryPhotos.filter((photo) => photo.entryId === entry.id),
  ].map((photo) => [photo.id, photo])).values()]
    .filter((photo) => !removedPhotoIds.includes(photo.id));
  useEffect(() => {
    setAddedPhotos((current) => current.filter((photo) => !entryPhotos.some((item) => item.id === photo.id)));
  }, [entryPhotos]);

  // a second entry for the same day is usually a mistake - point at the existing one
  const sameDay = useMemo(
    () => allEntries.find((other) => other.date === entry.date && other.id !== entry.id),
    [allEntries, entry.date, entry.id],
  );

  function update(patch: Partial<DiaryEntry>) {
    setEntry((current) => ({ ...current, ...patch }));
  }

  useEffect(() => {
    if (!isNew || !ready || closingWithoutDraft.current) return;
    saveDiaryDraft({ ...entry, photoIds: photos.map((photo) => photo.id) }, initialDate);
  }, [isNew, ready, entry, photos, initialDate]);

  function discardAndClose() {
    if (attaching || saving) return;
    const discarded = { ...entry, photoIds: photos.map((photo) => photo.id) };
    const hadContent = !!(entry.text.trim() || entry.title.trim() || photos.length);
    closingWithoutDraft.current = true;
    clearDiaryDraft();
    navigate('/tagebuch', { replace: true });
    // the draft only lived on this device - the way back puts it there again
    if (hadContent) {
      toast('Entwurf verworfen', {
        actionLabel: 'Rückgängig',
        onAction: () => {
          saveDiaryDraft(discarded, initialDate);
          navigate(`/tagebuch/neu${dateParam ? `?date=${dateParam}` : ''}`);
        },
      });
    }
  }

  async function save() {
    if (attaching || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const title = entry.title.trim() || `Tagebuch ${formatDate(entry.date).slice(0, 6)}`;
      await saveDiaryEntry({ ...entry, title, photoIds: photos.map((photo) => photo.id) });
      closingWithoutDraft.current = true;
      clearDiaryDraft();
      toast('Eintrag gespeichert');
      // an edit goes back to the page it came from; a new entry turns into its own page
      if (!isNew && location.key !== 'default') navigate(-1);
      else navigate(`/tagebuch/${entry.id}`, { replace: true });
    } catch (problem) {
      setSaveError(
        problem instanceof Error && problem.message
          ? `Speichern hat nicht geklappt: ${problem.message}`
          : 'Speichern hat nicht geklappt.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && loading && !ready) return <Spinner />;

  return (
    <>
      <TopBar
        title={isNew ? 'Neuer Eintrag' : 'Eintrag bearbeiten'}
        back
        action={
          <button
            type="button"
            className="btn btn-primary px-3 min-h-11"
            onClick={() => void save()}
            disabled={saving || attaching}
          >
            {saving ? 'Speichert…' : 'Speichern'}
          </button>
        }
      />

      <div className="p-4 max-w-3xl">
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="Datum">
              <input
                className="field"
                type="date"
                value={entry.date}
                onChange={(event) => update({ date: event.target.value })}
              />
            </Field>
          </div>
          <div className="flex-[2]">
            <Field label="Titel">
              <input
                className="field"
                value={entry.title}
                placeholder={`Tagebuch ${formatDate(entry.date).slice(0, 6)}`}
                onChange={(event) => update({ title: event.target.value })}
              />
            </Field>
          </div>
        </div>

        {sameDay && (
          <p className="card p-3 mb-4 text-sm">
            Für diesen Tag gibt es schon einen Eintrag.{' '}
            <button
              type="button"
              className="text-accent underline"
              onClick={() => navigate(`/tagebuch/${sameDay.id}/bearbeiten`)}
            >
              Diesen öffnen
            </button>
          </p>
        )}

        <Field label="Was war heute?">
          <textarea
            className="field min-h-[9rem]"
            value={entry.text}
            placeholder={diaryTextPlaceholder(entry.date)}
            onChange={(event) => update({ text: event.target.value })}
          />
        </Field>

        <Field label="Fotos">
          <PhotoAttach
            key={entry.id}
            photos={photos}
            entryId={entry.id}
            forDate={entry.date}
            disabled={saving}
            onBusyChange={setAttaching}
            openDay={pickDay && ready}
            onAdded={(photo) => setAddedPhotos((current) => [...current.filter((item) => item.id !== photo.id), photo])}
            onRemoved={(photo) => setRemovedPhotoIds((current) => [...current, photo.id])}
          />
        </Field>

        <Field label="Wetter">
          <OptionSelect
            setKey="weather"
            ariaLabel="Wetter"
            emptyLabel="kein Wetter"
            value={entry.weather}
            onChange={(value) => update({ weather: value })}
          />
        </Field>

        <Field label="Anwesend">
          <OptionMultiPicker
            setKey="people"
            label="Anwesend"
            emptyLabel="niemand ausgewählt"
            addLabel="Person hinzufügen"
            value={entry.present}
            onChange={(value) => update({ present: value })}
          />
        </Field>

        <Field label="Räume">
          <RoomPicker value={entry.roomIds} onChange={(value) => update({ roomIds: value })} />
        </Field>

        <Field label="Gewerke">
          <TradePicker value={entry.tradeIds} onChange={(value) => update({ tradeIds: value })} />
        </Field>

        <div className="mb-4">
          <span className="label">Phase</span>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span className="w-2 h-2 rounded-full bg-accent" aria-hidden="true" />
            <span className="truncate">{entryPhase?.name ?? activePhase?.name ?? 'keine aktive Phase'}</span>
          </p>
        </div>

        <label className="flex items-center gap-3 min-h-11">
          <input
            type="checkbox"
            className="w-5 h-5 accent-accent"
            checked={entry.defects}
            onChange={(event) => update({ defects: event.target.checked })}
          />
          <span>Mängel festgestellt</span>
        </label>

        {saveError && (
          <p role="alert" className="text-sm text-bad mt-4">
            {saveError}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary w-full mt-4"
          onClick={() => void save()}
          disabled={saving || attaching}
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
        {/* far from "Speichern" and quiet: throwing a draft away is the rare case */}
        {isNew && (
          <button
            type="button"
            className="btn btn-ghost text-bad w-full mt-6"
            onClick={discardAndClose}
            disabled={saving || attaching}
          >
            Verwerfen und schließen
          </button>
        )}
      </div>
    </>
  );
}
