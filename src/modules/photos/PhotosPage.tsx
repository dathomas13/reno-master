import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import { PhotoImage, Lightbox } from '@/components/PhotoView';
import { useCollection } from '@/data/hooks';
import { COL, type Cost, type DiaryEntry, type Photo } from '@/data/types';
import { photoDate, photosForRoom, sortByDate, type PhotoSource } from '@/data/photoRooms';
import { formatDate, formatMonth, monthKey } from '@/lib/date';
import { useRooms } from '@/data/RoomsContext';

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
  const { name: roomName } = useRooms();
  const [open, setOpen] = useState<number | null>(null);

  const roomFilter = params.get('raum');

  const source = useMemo<PhotoSource>(() => ({ photos, entries, costs }), [photos, entries, costs]);

  const visible = useMemo(() => {
    const rows = roomFilter ? photosForRoom(roomFilter, source) : sortByDate(photos, source);
    return rows.filter((photo) => photo.kind === 'photo');
  }, [roomFilter, photos, source]);

  /** the pictures of one month under one heading, like the diary list */
  const months = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const photo of visible) {
      const date = photoDate(photo, source);
      const key = date ? monthKey(date) : '';
      const rows = map.get(key);
      if (rows) rows.push(photo);
      else map.set(key, [photo]);
    }
    return [...map.entries()];
  }, [visible, source]);

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

      {months.map(([key, rows]) => (
        <section key={key || 'ohne'}>
          <div className="section-title">{key ? formatMonth(`${key}-01`) : 'Ohne Datum'}</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5 px-3">
            {rows.map((photo) => (
              <button
                key={photo.id}
                type="button"
                className="aspect-square relative"
                onClick={() => setOpen(visible.indexOf(photo))}
              >
                <PhotoImage photo={photo} thumb className="w-full h-full object-cover rounded-lg bg-panel2" />
              </button>
            ))}
          </div>
        </section>
      ))}

      {open !== null && visible[open] && (
        <Lightbox
          photos={visible}
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
