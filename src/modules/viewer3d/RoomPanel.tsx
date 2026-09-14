import { Link } from 'react-router-dom';
import { useCollection } from '@/data/hooks';
import { COL, type Cost, type DiaryEntry, type Photo, type Task } from '@/data/types';
import { where } from '@/firebase/db';
import { formatEuroShort } from '@/lib/money';
import { LAYER_LABEL, type Layer, type Room } from './houseScene';

/**
 * What happened in this room: the link between the model and everything the app records.
 */
export function RoomPanel({ room, onClose }: { room: Room; onClose(): void }) {
  const roomFilter = [where('roomIds', 'array-contains', room.id)];
  const { data: entries } = useCollection<DiaryEntry>(COL.diary, roomFilter, [room.id]);
  const { data: costs } = useCollection<Cost>(COL.costs, roomFilter, [room.id]);
  const { data: tasks } = useCollection<Task>(COL.tasks, roomFilter, [room.id]);
  const { data: photos } = useCollection<Photo>(COL.photos, roomFilter, [room.id]);

  const openTasks = tasks.filter((task) => task.status !== 'Erledigt');
  const total = costs.reduce((sum, cost) => sum + (cost.amountGross || 0), 0);

  return (
    <div className="absolute left-2 right-2 bottom-2 z-20 card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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

      <div className="grid grid-cols-4 gap-2 mt-3 text-center">
        <Link to={`/tagebuch?raum=${room.id}`} className="card py-2">
          <div className="text-lg">{entries.length}</div>
          <div className="text-[11px] text-muted">Einträge</div>
        </Link>
        <div className="card py-2">
          <div className="text-lg">{photos.length}</div>
          <div className="text-[11px] text-muted">Fotos</div>
        </div>
        <Link to={`/kosten?raum=${room.id}`} className="card py-2">
          <div className="text-lg">{costs.length ? formatEuroShort(total) : '0'}</div>
          <div className="text-[11px] text-muted">Kosten</div>
        </Link>
        <Link to={`/aufgaben?raum=${room.id}`} className="card py-2">
          <div className="text-lg">{openTasks.length}</div>
          <div className="text-[11px] text-muted">offen</div>
        </Link>
      </div>

      {entries.length > 0 && (
        <ul className="mt-3 text-sm">
          {entries.slice(0, 3).map((entry) => (
            <li key={entry.id} className="truncate">
              <Link to={`/tagebuch/${entry.id}`} className="text-muted hover:text-ink">
                {entry.date} · {entry.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
