import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Field, Spinner } from '@/components/Fields';
import { RoomPicker, TradePicker, PeoplePicker } from '@/components/Pickers';
import { PhotoAttach } from './PhotoAttach';
import { useCollection, useDocument } from '@/data/hooks';
import { useLists } from '@/data/useLists';
import { COL, WEATHER, type DiaryEntry, type Phase, type Photo, type Weather } from '@/data/types';
import { where } from '@/firebase/db';
import { emptyDiaryEntry, saveDiaryEntry } from '@/data/repos';
import { formatDate, today } from '@/lib/date';
import { diaryTextPlaceholder } from './diaryPlaceholder';
import { clearDiaryDraft, loadDiaryDraft, saveDiaryDraft } from './diaryDraft';

export default function DiaryEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;
  const dateParam = params.get('date');
  const initialDate = dateParam ?? today();

  const { data: existing, loading } = useDocument<DiaryEntry>(COL.diary, id);
  const { data: allEntries } = useCollection<DiaryEntry>(COL.diary);
  const { data: phases } = useCollection<Phase>(COL.phases);
  const { lists, addTo } = useLists();
  const activePhase = phases.find((phase) => phase.status === 'In Arbeit');

  const [entry, setEntry] = useState<DiaryEntry>(() => loadDiaryDraft(dateParam ?? undefined) ?? emptyDiaryEntry(initialDate));
  const entryPhase = phases.find((phase) => phase.id === entry.phaseId);
  const [addedPhotos, setAddedPhotos] = useState<Photo[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(isNew);
  const closingWithoutDraft = useRef(false);

  useEffect(() => {
    if (!isNew) {
      setReady(false);
      return;
    }
    setEntry(loadDiaryDraft(dateParam ?? undefined) ?? emptyDiaryEntry(initialDate));
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
    closingWithoutDraft.current = true;
    clearDiaryDraft();
    navigate('/tagebuch', { replace: true });
  }

  async function save() {
    if (attaching || saving) return;
    setSaving(true);
    try {
      const title = entry.title.trim() || `Tagebuch ${formatDate(entry.date).slice(0, 6)}`;
      await saveDiaryEntry({ ...entry, title, photoIds: photos.map((photo) => photo.id) });
      closingWithoutDraft.current = true;
      clearDiaryDraft();
      navigate(`/tagebuch/${entry.id}`, { replace: true });
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
          <div className="flex gap-2">
            {isNew && (
              <button type="button" className="btn btn-danger px-3 min-h-0 py-2" onClick={discardAndClose} disabled={saving || attaching}>
                Verwerfen
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary px-3 min-h-0 py-2"
              onClick={() => void save()}
              disabled={saving || attaching}
            >
              {saving ? 'Speichert…' : 'Speichern'}
            </button>
          </div>
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
            onAdded={(photo) => setAddedPhotos((current) => [...current.filter((item) => item.id !== photo.id), photo])}
            onRemoved={(photo) => setRemovedPhotoIds((current) => [...current, photo.id])}
          />
        </Field>

        <Field label="Wetter">
          <select
            className="field"
            aria-label="Wetter"
            value={entry.weather ?? ''}
            onChange={(event) => update({ weather: (event.target.value || undefined) as Weather | undefined })}
          >
            <option value="">kein Wetter</option>
            {(lists.weather.length ? lists.weather : WEATHER).map((weather) => (
              <option key={weather} value={weather}>{weather}</option>
            ))}
          </select>
        </Field>

        <Field label="Anwesend">
          <PeoplePicker
            options={lists.people}
            value={entry.present}
            onChange={(value) => update({ present: value })}
            onAdd={() => {
              const name = prompt('Wer war dabei?')?.trim();
              if (!name) return;
              void addTo('people', name);
              update({ present: [...entry.present, name] });
            }}
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

        <label className="flex items-center gap-3 py-2">
          <input
            type="checkbox"
            className="w-5 h-5 accent-[#c9a86a]"
            checked={entry.defects}
            onChange={(event) => update({ defects: event.target.checked })}
          />
          <span>Mängel festgestellt</span>
        </label>

        <button
          type="button"
          className="btn btn-primary w-full mt-4"
          onClick={() => void save()}
          disabled={saving || attaching}
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
        {isNew && (
          <button type="button" className="btn btn-danger w-full mt-2" onClick={discardAndClose} disabled={saving || attaching}>
            Verwerfen und schließen
          </button>
        )}
      </div>
    </>
  );
}
