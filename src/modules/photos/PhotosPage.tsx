import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import { PhotoImage, Lightbox } from '@/components/PhotoView';
import { useCollection } from '@/data/hooks';
import { COL, type Cost, type DiaryEntry, type Phase, type Photo } from '@/data/types';
import { photoDate, photosForRoom, sortByDate, type PhotoSource } from '@/data/photoRooms';
import { formatDate, formatMonth, monthKey } from '@/lib/date';
import { useRooms } from '@/data/RoomsContext';

type Grouping = 'phase' | 'month';

/**
 * Every photo in one place, filtered by room when asked.
 *
 * This is where the "Fotos" tile of a room leads. The room comes from the diary entry or
 * the receipt a picture hangs on (see `photoRooms.ts`), not from the picture itself.
 */
export default function PhotosPage() {
  const [params, setParams] = useSearchParams();
  const { data: photos, loading } = useCollection<Photo>(COL.photos);
  const { data: entries } = useCollection<DiaryEntry>(COL.diary);
  const { data: costs } = useCollection<Cost>(COL.costs);
  const { data: phases } = useCollection<Phase>(COL.phases);
  const { name: roomName } = useRooms();
  const [open, setOpen] = useState<number | null>(null);
  const [grouping, setGrouping] = useState<Grouping>('phase');

  const roomFilter = params.get('raum');

  const source = useMemo<PhotoSource>(() => ({ photos, entries, costs }), [photos, entries, costs]);

  const visible = useMemo(() => {
    const rows = roomFilter ? photosForRoom(roomFilter, source) : sortByDate(photos, source);
    return rows.filter((photo) => photo.kind === 'photo');
  }, [roomFilter, photos, source]);

  const phaseById = useMemo(() => new Map(phases.map((phase) => [phase.id, phase])), [phases]);
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  const groups = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const photo of visible) {
      const entry = photo.entryId ? entryById.get(photo.entryId) : undefined;
      const key = grouping === 'phase' ? (entry?.phaseId ?? '') : monthKey(photoDate(photo, source));
      const rows = map.get(key);
      if (rows) rows.push(photo);
      else map.set(key, [photo]);
    }
    const rows = [...map.entries()].map(([key, items]) => ({
      key,
      title: grouping === 'phase'
        ? (phaseById.get(key)?.name ?? 'Ohne Phase')
        : (key ? formatMonth(`${key}-01`) : 'Ohne Datum'),
      order: grouping === 'phase' ? (phaseById.get(key)?.order ?? Number.MAX_SAFE_INTEGER) : 0,
      photos: sortByDate(items, source),
    }));
    return rows.sort((a, b) => grouping === 'phase' ? a.order - b.order || a.title.localeCompare(b.title) : b.key.localeCompare(a.key));
  }, [visible, source, grouping, entryById, phaseById]);

  const lightboxPhotos = useMemo(() => groups.flatMap((group) => group.photos), [groups]);

  const title = roomFilter ? roomName(roomFilter) : 'Fotos';

  return (
    <>
      <TopBar
        title={title}
        back={roomFilter ? `/3d?raum=${roomFilter}` : '/dateien'}
        subtitle={`${visible.length} ${visible.length === 1 ? 'Bild' : 'Bilder'}`}
      />

      {roomFilter && (
        <div className="flex gap-2 overflow-x-auto p-3 no-scrollbar">
          <button type="button" className="chip chip-on shrink-0" onClick={() => setParams({}, { replace: true })}>
            {roomName(roomFilter)} ×
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 pt-3 no-scrollbar">
          {(['phase', 'month'] as Grouping[]).map((item) => (
            <button
              key={item}
              type="button"
              className={`chip shrink-0 ${grouping === item ? 'chip-on' : ''}`}
              onClick={() => setGrouping(item)}
            >
              {item === 'phase' ? 'Nach Phase' : 'Nach Monat'}
            </button>
          ))}
        </div>
      )}

      {loading && photos.length === 0 && <Spinner label="Bilder werden geladen…" />}

      {!loading && visible.length === 0 && (
        <EmptyState
          title="Keine Bilder"
          hint={
            roomFilter
              ? 'Fotos gehören über den Tagebuch-Eintrag oder den Beleg zu einem Raum. Setz dort den Raum, dann tauchen sie hier auf.'
              : 'Fotos entstehen im Tagebuch.'
          }
        />
      )}

      {groups.map((group) => (
        <section key={group.key || 'ohne'}>
          <div className="section-title">{group.title}</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 px-3">
            {group.photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                className="aspect-square relative"
                onClick={() => setOpen(lightboxPhotos.indexOf(photo))}
              >
                <PhotoImage photo={photo} thumb className="w-full h-full object-cover rounded-lg bg-panel2" />
              </button>
            ))}
          </div>
        </section>
      ))}

      {open !== null && lightboxPhotos[open] && (
        <Lightbox
          photos={lightboxPhotos}
          index={open}
          onClose={() => setOpen(null)}
          onIndexChange={setOpen}
          footer={(photo) => {
            const date = photoDate(photo, source);
            const entry = photo.entryId ? entries.find((item) => item.id === photo.entryId) : undefined;
            const cost = photo.costId ? costs.find((item) => item.id === photo.costId) : undefined;
            return (
              <div className="flex flex-col gap-1">
                {photo.caption && <span className="text-ink">{photo.caption}</span>}
                <span>
                  {date ? formatDate(date) : 'ohne Datum'}
                  {photo.originalName ? ` · ${photo.originalName}` : ''}
                </span>
                {entry && (
                  <Link to={`/tagebuch/${entry.id}`} className="text-accent" onClick={() => setOpen(null)}>
                    {entry.title} ›
                  </Link>
                )}
                {cost && (
                  <Link to={`/kosten/${cost.id}`} className="text-accent" onClick={() => setOpen(null)}>
                    {cost.vendor || 'Beleg'} ›
                  </Link>
                )}
              </div>
            );
          }}
        />
      )}
    </>
  );
}
