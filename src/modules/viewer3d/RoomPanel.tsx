import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCollection } from '@/data/hooks';
import { isTaskDone } from '@/data/options';
import { useRooms } from '@/data/RoomsContext';
import { COL, type Cost, type DiaryEntry, type Note, type Photo, type Task } from '@/data/types';
import { photosForRoom } from '@/data/photoRooms';
import { where } from '@/firebase/db';
import { formatEuroShort } from '@/lib/money';
import { isAuthenticated } from '@/firebase/auth';
import { LAYER_LABEL, type Layer, type Room } from './houseScene';
import { Icon } from '@/components/Icon';

/**
 * What happened in this room: the link between the model and everything the app records.
 *
 * The panel positions nothing itself. It used to sit at `bottom-2` of the canvas, which
 * on the phone is *behind* the bottom navigation and underneath the layer chips - the
 * tiles were half hidden. Now the viewer stacks it above its controls and keeps the
 * distance to the navigation in one place.
 */
export function RoomPanel({ room, onClose }: { room: Room; onClose(): void }) {
  const { idsFor } = useRooms();
  // a merged room (Technikraum) must also find what was filed under its predecessors
  // (Heizung, Öllager) - idsFor gives every id that counts, one id when none merged
  const roomIds = idsFor(room.id);
  const roomFilter = [where('roomIds', 'array-contains-any', roomIds)];
  const { data: entries } = useCollection<DiaryEntry>(COL.diary, roomFilter, roomIds);
  const { data: costs } = useCollection<Cost>(COL.costs, roomFilter, roomIds);
  const { data: tasks } = useCollection<Task>(COL.tasks, roomFilter, roomIds);
  const { data: notes } = useCollection<Note>(COL.notes, roomFilter, roomIds);
  // all of them, not the ones carrying this room: a photo gets its room from the entry
  // or the receipt it hangs on, never from itself (see photoRooms.ts)
  const { data: photos } = useCollection<Photo>(COL.photos);

  const openTasks = tasks.filter((task) => !isTaskDone(task));
  const total = costs.reduce((sum, cost) => sum + (cost.amountGross || 0), 0);
  const roomPhotos = useMemo(
    () => photosForRoom(roomIds, { photos, entries, costs }),
    [roomIds, photos, entries, costs],
  );

  // only what exists, as small links into the filtered lists - five zero tiles told nothing
  // and took a third of the screen above the model
  const links = [
    { to: `/tagebuch?raum=${room.id}`, count: entries.length, label: `${entries.length} ${entries.length === 1 ? 'Eintrag' : 'Einträge'}` },
    { to: `/fotos?raum=${room.id}`, count: roomPhotos.length, label: `${roomPhotos.length} ${roomPhotos.length === 1 ? 'Foto' : 'Fotos'}` },
    { to: `/kosten?raum=${room.id}`, count: costs.length, label: formatEuroShort(total) },
    { to: `/aufgaben?raum=${room.id}`, count: openTasks.length, label: `${openTasks.length} offen` },
    { to: `/notizen?raum=${room.id}`, count: notes.length, label: `${notes.length} ${notes.length === 1 ? 'Notiz' : 'Notizen'}` },
  ].filter((link) => link.count > 0);

  return (
    <div className="card p-3 pointer-events-auto">
      <div className="flex items-center gap-2">
        <p className="flex-1 min-w-0 truncate">
          <span className="font-semibold">{room.name}</span>
          <span className="text-sm text-muted">
            {' · '}
            {LAYER_LABEL[room.floor as Layer] ?? room.floor}
            {room.areaM2 !== undefined && ` · ${room.areaM2.toFixed(1).replace('.', ',')} m²`}
          </span>
        </p>
        <button type="button" className="btn btn-ghost w-11 h-11 px-0 -my-2 -mr-2" aria-label="Raum schließen" onClick={onClose}>
          <Icon name="close" className="w-5 h-5" />
        </button>
      </div>

      {!isAuthenticated() ? (
        <p className="text-xs text-muted mt-2">
          Einträge, Fotos und Kosten zu diesem Raum erscheinen nach der Anmeldung.
        </p>
      ) : links.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {links.map((link) => (
            <Link key={link.to} to={link.to} className="chip">
              {link.label}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted mt-1">Noch nichts zu diesem Raum.</p>
      )}
    </div>
  );
}
