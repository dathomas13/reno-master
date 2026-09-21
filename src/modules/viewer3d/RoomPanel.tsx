import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCollection } from '@/data/hooks';
import { COL, type Cost, type DiaryEntry, type Note, type Photo, type Task } from '@/data/types';
import { photosForRoom } from '@/data/photoRooms';
import { where } from '@/firebase/db';
import { formatEuroShort } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { isAuthenticated } from '@/firebase/auth';
import { LAYER_LABEL, type Layer, type Room } from './houseScene';

/**
 * What happened in this room: the link between the model and everything the app records.
 *
 * The panel positions nothing itself. It used to sit at `bottom-2` of the canvas, which
 * on the phone is *behind* the bottom navigation and underneath the layer chips - the
 * tiles were half hidden. Now the viewer stacks it above its controls and keeps the
 * distance to the navigation in one place.
 */
export function RoomPanel({ room, onClose }: { room: Room; onClose(): void }) {
  const roomFilter = [where('roomIds', 'array-contains', room.id)];
  const { data: entries } = useCollection<DiaryEntry>(COL.diary, roomFilter, [room.id]);
  const { data: costs } = useCollection<Cost>(COL.costs, roomFilter, [room.id]);
  const { data: tasks } = useCollection<Task>(COL.tasks, roomFilter, [room.id]);
  const { data: notes } = useCollection<Note>(COL.notes, roomFilter, [room.id]);
  // all of them, not the ones carrying this room: a photo gets its room from the entry
  // or the receipt it hangs on, never from itself (see photoRooms.ts)
  const { data: photos } = useCollection<Photo>(COL.photos);

  const openTasks = tasks.filter((task) => task.status !== 'Erledigt');
  const total = costs.reduce((sum, cost) => sum + (cost.amountGross || 0), 0);
  const roomPhotos = useMemo(
    () => photosForRoom(room.id, { photos, entries, costs }),
    [room.id, photos, entries, costs],
  );

  return (
    <div className="card p-3 pointer-events-auto max-h-[45dvh] overflow-y-auto">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{room.name}</h2>
          <p className="text-xs text-muted">
            {LAYER_LABEL[room.floor as Layer] ?? room.floor} · {room.areaM2.toFixed(1).replace('.', ',')} m²
          </p>
        </div>
        <button type="button" className="btn btn-ghost px-2 py-1 min-h-0" onClick={onClose}>
          ×
        </button>
      </div>

      {!isAuthenticated() && (
        <p className="text-xs text-muted mt-2">
          Einträge, Fotos und Kosten zu diesem Raum erscheinen nach der Anmeldung.
        </p>
      )}

      {isAuthenticated() && (
        // five tiles on 360 pixels: the number must be allowed to shrink, or '1.234 €'
        // pushes the row wider than the screen and the last tile leaves it
        <div className="grid grid-cols-5 gap-1.5 mt-3 text-center">
          <Link to={`/tagebuch?raum=${room.id}`} className="card py-2 px-1 min-w-0">
            <div className="text-base font-medium truncate">{entries.length}</div>
            <div className="text-[10px] text-muted truncate">Einträge</div>
          </Link>
          <Link to={`/fotos?raum=${room.id}`} className="card py-2 px-1 min-w-0">
            <div className="text-base font-medium truncate">{roomPhotos.length}</div>
            <div className="text-[10px] text-muted truncate">Fotos</div>
          </Link>
          <Link to={`/kosten?raum=${room.id}`} className="card py-2 px-1 min-w-0">
            <div className="text-base font-medium truncate">{costs.length ? formatEuroShort(total) : '0'}</div>
            <div className="text-[10px] text-muted truncate">Kosten</div>
          </Link>
          <Link to={`/aufgaben?raum=${room.id}`} className="card py-2 px-1 min-w-0">
            <div className="text-base font-medium truncate">{openTasks.length}</div>
            <div className="text-[10px] text-muted truncate">offen</div>
          </Link>
          <Link to={`/notizen?raum=${room.id}`} className="card py-2 px-1 min-w-0">
            <div className="text-base font-medium truncate">{notes.length}</div>
            <div className="text-[10px] text-muted truncate">Notizen</div>
          </Link>
        </div>
      )}

      {entries.length > 0 && (
        <ul className="mt-3 text-sm">
          {entries.slice(0, 3).map((entry) => (
            <li key={entry.id} className="truncate">
              <Link to={`/tagebuch/${entry.id}`} className="text-muted hover:text-ink">
                {formatDate(entry.date)} · {entry.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
