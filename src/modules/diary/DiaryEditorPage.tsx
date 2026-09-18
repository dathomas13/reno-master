import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Field, ChipSelect, Spinner } from '@/components/Fields';
import { RoomPicker, TradePicker, PhaseSelect } from '@/components/Pickers';
import { PhotoAttach } from './PhotoAttach';
import { useCollection, useDocument } from '@/data/hooks';
import { useLists } from '@/data/useLists';
import { COL, type DiaryEntry, type Phase, type Photo, type Weather } from '@/data/types';
import { where } from '@/firebase/db';
import { emptyDiaryEntry, saveDiaryEntry } from '@/data/repos';
import { formatDate, today } from '@/lib/date';

export default function DiaryEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id;
  const dateParam = params.get('date');

  const { data: existing, loading } = useDocument<DiaryEntry>(COL.diary, id);
  const { data: allEntries } = useCollection<DiaryEntry>(COL.diary);
  const { data: phases } = useCollection<Phase>(COL.phases);
  const { lists, addTo } = useLists();

  const [entry, setEntry] = useState<DiaryEntry>(() => emptyDiaryEntry(params.get('date') ?? today()));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(isNew);

  useEffect(() => {
    if (!isNew) {
      setReady(false);
      return;
    }
    setEntry(emptyDiaryEntry(dateParam ?? today()));
    setReady(true);
  }, [id, isNew, dateParam]);

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
    const running = phases.find((phase) => phase.status === 'In Arbeit');
    if (running) setEntry((current) => ({ ...current, phaseId: running.id }));
  }, [isNew, phases, entry.phaseId]);

  const { data: entryPhotos } = useCollection<Photo>(
    COL.photos,
    [where('entryId', '==', entry.id)],
    [entry.id],
  );
  useEffect(() => setPhotos(entryPhotos), [entryPhotos]);

  // a second entry for the same day is usually a mistake - point at the existing one
  const sameDay = useMemo(
    () => allEntries.find((other) => other.date === entry.date && other.id !== entry.id),
    [allEntries, entry.date, entry.id],
  );

  function update(patch: Partial<DiaryEntry>) {
    setEntry((current) => ({ ...current, ...patch }));
  }

  async function save() {
    setSaving(true);
    try {
      const title = entry.title.trim() || `Tagebuch ${formatDate(entry.date).slice(0, 6)}`;
      await saveDiaryEntry({ ...entry, title, photoIds: photos.map((photo) => photo.id) });
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
          <button
            type="button"
            className="btn btn-primary px-3 min-h-0 py-2"
            onClick={() => void save()}
            disabled={saving}
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
            placeholder="Wolfgang hat die Perimeterdämmung auf der Nordseite angebracht…"
            onChange={(event) => update({ text: event.target.value })}
          />
        </Field>

        <Field label="Fotos">
          <PhotoAttach
            photos={photos}
            entryId={entry.id}
            forDate={entry.date}
            onAdded={(photo) => setPhotos((current) => [...current, photo])}
            onRemoved={(photo) => setPhotos((current) => current.filter((item) => item.id !== photo.id))}
          />
        </Field>

        <Field label="Wetter">
          <ChipSelect
            options={lists.weather as Weather[]}
            value={entry.weather ? [entry.weather] : []}
            multiple={false}
            onChange={(value) => update({ weather: value[0] })}
          />
        </Field>

        <Field label="Anwesend">
          <ChipSelect
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

        <Field label="Phase">
          <PhaseSelect value={entry.phaseId} onChange={(value) => update({ phaseId: value })} />
        </Field>

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
          disabled={saving}
        >
          {saving ? 'Speichert…' : 'Speichern'}
        </button>
      </div>
    </>
  );
}
