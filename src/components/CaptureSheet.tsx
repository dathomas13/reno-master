import { useLocation, useNavigate } from 'react-router-dom';
import { Sheet } from './Sheet';
import { Icon, type IconName } from './Icon';
import { useCollection } from '@/data/hooks';
import { useRooms } from '@/data/RoomsContext';
import { COL, type DiaryEntry } from '@/data/types';
import { where } from '@/firebase/db';
import { today } from '@/lib/date';
import { openRoom } from '@/lib/openRoom';
import { entriesOfDay } from '@/modules/diary/entriesOfDay';

interface Tile {
  icon: IconName;
  label: string;
  hint: string;
  to: string;
}

/** `?raum=x` added to a path that may already carry a query */
function withRoom(path: string, room: string | null): string {
  if (!room) return path;
  return `${path}${path.includes('?') ? '&' : '?'}raum=${encodeURIComponent(room)}`;
}

/**
 * Everything that gets recorded, one tap from anywhere: the place in the app no longer
 * decides where a thing is filed. A room that is open right now (a room filter, a room
 * picked in 3D) goes along, so the new entry already belongs to it.
 */
export function CaptureSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { shortLabel } = useRooms();
  const date = today();
  // mounted with the shell, so today's entry is known before the button is ever tapped -
  // opened fresh, the first frame had no data and "Tagebuch heute" started a second entry
  const { data: todays, loading } = useCollection<DiaryEntry>(COL.diary, [where('date', '==', date)], [date]);
  const todayEntry = entriesOfDay(todays, date)[0];
  const room = new URLSearchParams(location.search).get('raum') ?? openRoom();

  const diary = todayEntry ? `/tagebuch/${todayEntry.id}/bearbeiten` : '/tagebuch/neu';
  const tiles: Tile[] = [
    {
      icon: 'diary',
      label: todayEntry ? 'Tagebuch ergänzen' : 'Tagebuch heute',
      hint: todayEntry ? 'Heutigen Eintrag weiterschreiben' : 'Kurz festhalten, was war',
      to: todayEntry ? diary : withRoom(diary, room),
    },
    {
      icon: 'photo',
      label: 'Fotos von heute',
      hint: 'In den heutigen Eintrag',
      to: todayEntry ? `${diary}?fotos=heute` : withRoom(`${diary}?fotos=heute`, room),
    },
    { icon: 'receipt', label: 'Beleg', hint: 'Fotografieren und auslesen', to: withRoom('/kosten/neu?capture=1', room) },
    { icon: 'task', label: 'Aufgabe', hint: 'Etwas, das zu tun ist', to: withRoom('/aufgaben?neu=1', room) },
    { icon: 'note', label: 'Notiz', hint: 'Kurzer Gedanke', to: withRoom('/notizen?neu=1', room) },
    { icon: 'chat', label: 'Gespräch', hint: 'Was besprochen wurde', to: '/gespraeche?neu=1' },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="Erfassen" doneLabel="Schließen">
      <div className="p-3 pb-4">
        {room && (
          <p className="text-xs text-muted px-1 pb-2">
            Gehört zu <span className="text-accent">{shortLabel(room)}</span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((tile) => (
            <button
              key={tile.label}
              type="button"
              className="card p-3 min-h-20 flex items-start gap-3 text-left active:bg-panel2 disabled:opacity-50"
              disabled={loading && (tile.icon === 'diary' || tile.icon === 'photo')}
              onClick={() => {
                onClose();
                navigate(tile.to);
              }}
            >
              <span className="w-9 h-9 rounded-full bg-accent/15 text-accent grid place-items-center shrink-0">
                <Icon name={tile.icon} className="w-5 h-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium leading-tight">{tile.label}</span>
                <span className="block text-xs text-muted mt-0.5">{tile.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {todayEntry && (
          // several entries a day are fine: "ergänzen" continues the newest, this starts another
          <button
            type="button"
            className="btn btn-ghost w-full mt-2 text-accent"
            onClick={() => {
              onClose();
              navigate(withRoom('/tagebuch/neu', room));
            }}
          >
            <Icon name="plus" className="w-5 h-5" />
            Weiteren Tagebucheintrag für heute
          </button>
        )}
      </div>
    </Sheet>
  );
}
