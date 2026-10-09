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
import { formatDate, formatDateWithWeekday, today } from '@/lib/date';
import { MoreFields } from '@/components/MoreFields';
import { diaryTextPlaceholder } from './diaryPlaceholder';
import { useRooms } from '@/data/RoomsContext';
import { clearDiaryDraft, loadDiaryDraft, saveDiaryDraft } from './diaryDraft';
import { useToast } from '@/components/Toast';

export default function DiaryEditorPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
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

  // the latest entry before this day: its people, rooms, trades and weather are the best guess
  const previous = useMemo(
    () =>
      allEntries
        .filter((other) => other.id !== entry.id && other.date < entry.date)
        .sort((a, b) => b.date.localeCompare(a.date))[0],
    [allEntries, entry.id, entry.date],
  );
  const [tookOver, setTookOver] = useState(false);

  /** fills only what is still empty - nothing typed in is overwritten */
  function takeOverPrevious() {
    if (!previous) return;
    setEntry((current) => ({
      ...current,
      present: current.present.length ? current.present : [...previous.present],
      roomIds: current.roomIds.length ? current.roomIds : [...previous.roomIds],
      tradeIds: current.tradeIds.length ? current.tradeIds : [...previous.tradeIds],
      weather: current.weather ?? previous.weather,
    }));
    setTookOver(true);
  }

  const detailsFilled = [
    !!entry.title.trim(),
    !!entry.weather,
    entry.present.length > 0,
    entry.roomIds.length > 0,
    entry.tradeIds.length > 0,
    entry.defects,
  ].filter(Boolean).length;

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
        {/* the day in one line - the text below is what the screen is for */}
        <div className="flex items-center gap-3 mb-3">
          <input
            className="field w-auto py-2"
            type="date"
            aria-label="Datum"
            value={entry.date}
            onChange={(event) => update({ date: event.target.value })}
          />
          <span className="text-sm text-muted truncate">
            {entry.date === today() ? 'Heute, ' : ''}
            {formatDateWithWeekday(entry.date)}
          </span>
        </div>

        {sameDay && (
          <p className="card p-3 mb-4 text-sm text-muted">
            Für diesen Tag gibt es schon einen Eintrag – ein weiterer ist in Ordnung.{' '}
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
            autoFocus={isNew && !pickDay}
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
            onDayOpened={() => {
              // once is enough: back/forward or a re-render must not open the gallery again
              const next = new URLSearchParams(params);
              next.delete('fotos');
              setParams(next, { replace: true });
            }}
            onAdded={(photo) => setAddedPhotos((current) => [...current.filter((item) => item.id !== photo.id), photo])}
            onRemoved={(photo) => setRemovedPhotoIds((current) => [...current, photo.id])}
          />
        </Field>

        {isNew && previous && (
          <div className="mb-4 flex items-center gap-3">
            <button type="button" className="btn" onClick={takeOverPrevious}>
              Wie beim letzten Mal
            </button>
            <span className="text-xs text-muted">
              {tookOver ? `Übernommen vom ${formatDate(previous.date)}` : 'Anwesende, Räume, Gewerke, Wetter'}
            </span>
          </div>
        )}

        <MoreFields title="Details" filled={detailsFilled}>
          <Field label="Titel">
            <input
              className="field"
              value={entry.title}
              placeholder={`Tagebuch ${formatDate(entry.date).slice(0, 6)}`}
              onChange={(event) => update({ title: event.target.value })}
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
        </MoreFields>

        {saveError && (
          <p role="alert" className="text-sm text-bad mt-4">
            {saveError}
          </p>
        )}
        {/* "Speichern" sits in the top bar only; down here the quiet way out of a new draft */}
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
