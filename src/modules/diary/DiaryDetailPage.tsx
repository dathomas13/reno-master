import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Spinner } from '@/components/Fields';
import { PhotoImage, Lightbox } from '@/components/PhotoView';
import { useCollection, useDocument } from '@/data/hooks';
import { COL, type DiaryEntry, type Phase, type Photo, type Trade } from '@/data/types';
import { where } from '@/firebase/db';
import { deleteDiaryEntry, saveDiaryEntry } from '@/data/repos';
import { useUndoableDelete } from '@/components/Toast';
import { EmptyState } from '@/components/Fields';
import { formatDateWithWeekday, formatDate } from '@/lib/date';
import { formatBytes } from '@/lib/image';
import { useRooms } from '@/data/RoomsContext';
import { useOptions } from '@/data/useOptions';
import { weatherIcon } from './weatherIcons';
import { openOriginalInGallery } from '@/platform/photos';

export default function DiaryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const undoableDelete = useUndoableDelete();
  const { data: entry, loading } = useDocument<DiaryEntry>(COL.diary, id);
  const { data: photos } = useCollection<Photo>(COL.photos, id ? [where('entryId', '==', id)] : [], [id]);
  const { data: trades } = useCollection<Trade>(COL.trades);
  const { data: phases } = useCollection<Phase>(COL.phases);
  const { shortLabels } = useRooms();
  const { label } = useOptions();
  const [lightbox, setLightbox] = useState<number | null>(null);

  const ordered = useMemo(() => {
    if (!entry) return photos;
    const index = new Map(entry.photoIds.map((photoId, position) => [photoId, position]));
    return [...photos].sort((a, b) => (index.get(a.id) ?? 999) - (index.get(b.id) ?? 999));
  }, [photos, entry]);

  if (loading) return <Spinner label="Eintrag wird geladen…" />;
  if (!entry) {
    return (
      <>
        <TopBar title="Eintrag" back="/tagebuch" />
        <EmptyState title="Diesen Eintrag gibt es nicht mehr." hint="Er wurde gelöscht." />
      </>
    );
  }

  const tradeNames = entry.tradeIds
    .map((tradeId) => trades.find((trade) => trade.id === tradeId)?.name)
    .filter(Boolean);
  const phaseName = phases.find((phase) => phase.id === entry.phaseId)?.name;

  function remove() {
    if (!entry) return;
    const stored = entry;
    // the photos keep their entryId, so writing the entry again brings everything back
    undoableDelete('Eintrag gelöscht', () => deleteDiaryEntry(stored.id), () => saveDiaryEntry(stored));
    if (location.key !== 'default') navigate(-1);
    else navigate('/tagebuch', { replace: true });
  }

  return (
    <>
      <TopBar
        title={entry.title}
        subtitle={formatDateWithWeekday(entry.date)}
        back="/tagebuch"
        action={
          <Link className="btn btn-ghost px-3 min-h-11 text-accent" to={`/tagebuch/${entry.id}/bearbeiten`}>
            Bearbeiten
          </Link>
        }
      />

      <div className="p-4 flex flex-col gap-4 max-w-3xl">
        {entry.text && <p className="whitespace-pre-wrap leading-relaxed">{entry.text}</p>}

        {ordered.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {ordered.map((photo, index) => (
              <button key={photo.id} type="button" onClick={() => setLightbox(index)} className="aspect-square">
                <PhotoImage photo={photo} thumb className="w-full h-full object-cover rounded-lg bg-panel2" />
              </button>
            ))}
          </div>
        )}

        <dl className="text-sm flex flex-col gap-2">
          {entry.weather && (
            <div className="flex gap-2">
              <dt className="text-muted w-28">Wetter</dt>
              <dd>
                {weatherIcon(entry.weather) ? `${weatherIcon(entry.weather)} ` : ''}
                {label('weather', entry.weather)}
              </dd>
            </div>
          )}
          {entry.present.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-muted w-28">Anwesend</dt>
              <dd>{entry.present.map((person) => label('people', person)).join(', ')}</dd>
            </div>
          )}
          {entry.roomIds.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-muted w-28">Räume</dt>
              <dd>{shortLabels(entry.roomIds).join(', ')}</dd>
            </div>
          )}
          {tradeNames.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-muted w-28">Gewerke</dt>
              <dd>{tradeNames.join(', ')}</dd>
            </div>
          )}
          {phaseName && (
            <div className="flex gap-2">
              <dt className="text-muted w-28">Phase</dt>
              <dd>{phaseName}</dd>
            </div>
          )}
          {entry.defects && (
            <div className="flex gap-2">
              <dt className="text-muted w-28">Mängel</dt>
              <dd className="text-bad">ja</dd>
            </div>
          )}
        </dl>

        <button type="button" className="btn btn-danger self-start" onClick={remove}>
          Eintrag löschen
        </button>
      </div>

      {lightbox !== null && (
        <Lightbox
          photos={ordered}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
          footer={(photo) => (
            <div className="flex items-center gap-3 flex-wrap">
              <span>
                {photo.originalName ?? 'Foto'} · {formatBytes(photo.originalBytes ?? photo.bytes)}
                {photo.takenAt ? ` · ${formatDate(photo.takenAt)}` : ''}
              </span>
              {photo.sourceUri && (
                <button
                  type="button"
                  className="btn btn-ghost px-3"
                  onClick={() => void openOriginalInGallery(photo.sourceUri!)}
                >
                  Original in Galerie
                </button>
              )}
            </div>
          )}
        />
      )}
    </>
  );
}
