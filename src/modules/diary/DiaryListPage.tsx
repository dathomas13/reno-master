import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { EmptyState, Spinner } from '@/components/Fields';
import { PhotoImage } from '@/components/PhotoView';
import { useCollection } from '@/data/hooks';
import { COL, type DiaryEntry, type Phase, type Photo } from '@/data/types';
import { orderBy } from '@/firebase/db';
import { formatDateWithWeekday, formatMonth, monthKey, today } from '@/lib/date';
import { useRooms } from '@/data/RoomsContext';

const WEATHER_ICON: Record<string, string> = {
  Sonnig: '☀️',
  Bewölkt: '⛅',
  Regen: '🌧️',
  Frost: '❄️',
  Schnee: '🌨️',
};

export default function DiaryListPage() {
  const [params, setParams] = useSearchParams();
  const { data: entries, loading } = useCollection<DiaryEntry>(COL.diary, [orderBy('date', 'desc')]);
  const { data: photos } = useCollection<Photo>(COL.photos);
  const { data: phases } = useCollection<Phase>(COL.phases);
  const { shortLabel: roomLabel, matches } = useRooms();
  const [search, setSearch] = useState('');

  // the room panel in the 3D view and the search link here with a filter
  const roomFilter = params.get('raum');
  const phaseFilter = params.get('phase');
  const filterLabel = roomFilter
    ? roomLabel(roomFilter)
    : (phases.find((phase) => phase.id === phaseFilter)?.name ?? phaseFilter);

  const photosByEntry = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const photo of photos) {
      if (!photo.entryId) continue;
      map.set(photo.entryId, [...(map.get(photo.entryId) ?? []), photo]);
    }
    return map;
  }, [photos]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (roomFilter && !matches(entry.roomIds, roomFilter)) return false;
      if (phaseFilter && entry.phaseId !== phaseFilter) return false;
      if (!needle) return true;
      return [entry.title, entry.text, ...entry.present].join(' ').toLowerCase().includes(needle);
    });
  }, [entries, search, roomFilter, phaseFilter, matches]);

  const hasToday = entries.some((entry) => entry.date === today());

  return (
    <>
      <TopBar
        title="Bautagebuch"
        subtitle={
          roomFilter || phaseFilter
            ? `${filtered.length} von ${entries.length} Einträgen`
            : `${entries.length} Einträge`
        }
        action={
          <Link className="btn btn-primary px-3 min-h-0 py-2" to="/tagebuch/neu">
            Neu
          </Link>
        }
      />

      <div className="p-3">
        <input
          className="field"
          type="search"
          placeholder="Suchen…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {(roomFilter || phaseFilter) && (
        <div className="px-3 pb-3">
          <button
            type="button"
            className="chip chip-on"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          >
            Filter: {filterLabel} ×
          </button>
        </div>
      )}

      {!hasToday && !search && !roomFilter && !phaseFilter && (
        <Link to="/tagebuch/neu" className="mx-3 mb-3 card p-4 flex items-center gap-3 active:bg-panel2">
          <span className="text-2xl">📝</span>
          <span className="flex-1">
            <span className="block">Für heute gibt es noch keinen Eintrag</span>
            <span className="block text-xs text-muted">{formatDateWithWeekday(today())}</span>
          </span>
          <span className="text-accent">›</span>
        </Link>
      )}

      {loading && entries.length === 0 && <Spinner label="Einträge werden geladen…" />}

      {!loading && filtered.length === 0 && (
        <EmptyState
          title={search ? 'Nichts gefunden' : 'Noch keine Einträge'}
          hint={search ? undefined : 'Jeden Abend kurz festhalten, was passiert ist.'}
        />
      )}

      <ul>
        {filtered.map((entry, index) => {
          const previous = filtered[index - 1];
          const showMonth = !previous || monthKey(previous.date) !== monthKey(entry.date);
          const entryPhotos = (photosByEntry.get(entry.id) ?? []).slice(0, 3);
          return (
            <li key={entry.id}>
              {showMonth && <div className="section-title">{formatMonth(entry.date)}</div>}
              <Link to={`/tagebuch/${entry.id}`} className="list-row">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{entry.title}</span>
                    {entry.weather && <span aria-hidden>{WEATHER_ICON[entry.weather]}</span>}
                    {entry.defects && <span className="text-bad text-xs">Mängel</span>}
                  </div>
                  <div className="text-xs text-muted">{formatDateWithWeekday(entry.date)}</div>
                  {entry.text && <p className="text-sm text-muted truncate mt-0.5">{entry.text.split('\n')[0]}</p>}
                  {entry.present.length > 0 && (
                    <div className="text-xs text-muted mt-1 truncate">{entry.present.join(' · ')}</div>
                  )}
                </div>
                {entryPhotos.length > 0 && (
                  <div className="flex gap-1 shrink-0">
                    {entryPhotos.map((photo) => (
                      <PhotoImage
                        key={photo.id}
                        photo={photo}
                        thumb
                        className="w-12 h-12 object-cover rounded-lg bg-panel2"
                      />
                    ))}
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
