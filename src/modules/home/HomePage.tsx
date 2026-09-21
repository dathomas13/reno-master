import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { PhotoImage } from '@/components/PhotoView';
import { Sheet } from '@/components/Sheet';
import { useCollection } from '@/data/hooks';
import { COL, type Cost, type DiaryEntry, type Phase, type Photo, type Task } from '@/data/types';
import { patchPhase } from '@/data/repos';
import { orderBy, limit } from '@/firebase/db';
import { formatDateWithWeekday, formatRelativeDay, monthKey, today } from '@/lib/date';
import { formatEuro } from '@/lib/money';

export default function HomePage() {
  const { data: entries } = useCollection<DiaryEntry>(COL.diary, [orderBy('date', 'desc'), limit(20)]);
  const { data: photos } = useCollection<Photo>(COL.photos);
  const { data: costs } = useCollection<Cost>(COL.costs);
  const { data: tasks } = useCollection<Task>(COL.tasks);
  const { data: phases } = useCollection<Phase>(COL.phases);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [phaseBusy, setPhaseBusy] = useState(false);

  const todayEntry = entries.find((entry) => entry.date === today());
  const recent = entries.slice(0, 3);
  const orderedPhases = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases]);
  const phase = orderedPhases.find((item) => item.status === 'In Arbeit');
  const total = costs.reduce((sum, cost) => sum + (cost.amountGross || 0), 0);
  const thisMonth = costs
    .filter((cost) => monthKey(cost.date) === monthKey(today()))
    .reduce((sum, cost) => sum + (cost.amountGross || 0), 0);
  const openTasks = tasks
    .filter((task) => task.status !== 'Erledigt')
    .filter((task) => task.priority === 'Hoch' || (task.due && task.due <= today()))
    .slice(0, 5);

  const photoFor = (entry: DiaryEntry) => photos.find((photo) => photo.entryId === entry.id);

  async function setCurrentPhase(next: Phase) {
    if (phaseBusy || next.id === phase?.id) {
      setPhaseOpen(false);
      return;
    }
    setPhaseBusy(true);
    const date = today();
    try {
      await Promise.all([
        ...orderedPhases
          .filter((item) => item.status === 'In Arbeit' && item.id !== next.id)
          .map((item) => patchPhase(item.id, { status: 'Abgeschlossen', end: item.end ?? date })),
        patchPhase(next.id, { status: 'In Arbeit', start: next.start ?? date, end: undefined }),
      ]);
      setPhaseOpen(false);
    } finally {
      setPhaseBusy(false);
    }
  }

  return (
    <>
      <TopBar title="Reno Master" subtitle={formatDateWithWeekday(today())} />

      <div className="p-3 flex flex-col gap-3 max-w-3xl">
        <Link to="/suche" className="field flex items-center gap-2 text-muted" aria-label="Suchen">
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor"
               strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5 21 21" />
          </svg>
          <span>Alles durchsuchen…</span>
        </Link>

        <div className="relative rounded-2xl overflow-hidden">
          <img
            src={`${import.meta.env.BASE_URL}img/nordansicht.jpg`}
            alt="Nordansicht des Hauses vom Garten"
            className="w-full h-40 object-cover"
            onError={(event) => {
              (event.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
          <div className="absolute bottom-0 left-0 p-4">
            <div className="font-semibold">Schlesierstraße 31</div>
            {orderedPhases.length > 0 ? (
              <button
                type="button"
                className="text-xs text-muted underline decoration-line underline-offset-2 text-left"
                onClick={() => setPhaseOpen(true)}
              >
                {phase?.name ?? 'Phase setzen'}
              </button>
            ) : (
              <div className="text-xs text-muted">Kernsanierung</div>
            )}
          </div>
        </div>

        <Sheet open={phaseOpen} onClose={() => setPhaseOpen(false)} title="Aktuelle Phase">
          <div className="p-3">
            <ul className="flex flex-col">
              {orderedPhases.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="list-row w-full text-left last:border-0"
                    onClick={() => void setCurrentPhase(item)}
                    disabled={phaseBusy}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{item.name}</span>
                      <span className="block text-xs text-muted">{item.status}</span>
                    </span>
                    {item.id === phase?.id && <span className="text-accent text-sm">Aktuell</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Sheet>

        {todayEntry ? (
          <Link to={`/tagebuch/${todayEntry.id}`} className="card p-4">
            <div className="text-xs text-muted uppercase tracking-wide mb-1">Heute</div>
            <div className="font-medium">{todayEntry.title}</div>
            <p className="text-sm text-muted line-clamp-2">{todayEntry.text || 'Noch kein Text'}</p>
          </Link>
        ) : (
          <Link to="/tagebuch/neu" className="card p-4 border-accent/40 flex items-center gap-3">
            <span className="text-2xl">📝</span>
            <span className="flex-1">
              <span className="block font-medium">Tagebuch-Eintrag für heute</span>
              <span className="block text-xs text-muted">Kurz festhalten, was passiert ist</span>
            </span>
            <span className="text-accent">›</span>
          </Link>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Link to="/kosten/neu?capture=1" className="card p-3 text-center">
            <div className="text-xl">🧾</div>
            <div className="text-xs mt-1">Beleg</div>
          </Link>
          <Link to="/3d" className="card p-3 text-center">
            <div className="text-xl">🏠</div>
            <div className="text-xs mt-1">3D-Modell</div>
          </Link>
          <Link to="/aufgaben" className="card p-3 text-center">
            <div className="text-xl">✅</div>
            <div className="text-xs mt-1">Aufgaben</div>
          </Link>
        </div>

        <Link to="/kosten" className="card p-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="text-xs text-muted uppercase tracking-wide">Kosten gesamt</div>
            <div className="text-2xl font-semibold">{formatEuro(total)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted">diesen Monat</div>
            <div>{formatEuro(thisMonth)}</div>
          </div>
        </Link>

        {openTasks.length > 0 && (
          <section className="card">
            <div className="section-title">Dringend</div>
            <ul>
              {openTasks.map((task) => (
                <li key={task.id}>
                  <Link to={`/aufgaben?aufgabe=${task.id}`} className="list-row last:border-0">
                    <span className="flex-1 min-w-0 truncate">{task.title}</span>
                    {task.due && <span className="text-xs text-muted shrink-0">{formatRelativeDay(task.due)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recent.length > 0 && (
          <section className="card">
            <div className="section-title">Zuletzt im Tagebuch</div>
            <ul>
              {recent.map((entry) => {
                const photo = photoFor(entry);
                return (
                  <li key={entry.id}>
                    <Link to={`/tagebuch/${entry.id}`} className="list-row last:border-0">
                      {photo ? (
                        <PhotoImage photo={photo} thumb className="w-10 h-10 rounded-lg object-cover bg-panel2" />
                      ) : (
                        <span className="w-10 h-10 rounded-lg bg-panel2" />
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{entry.title}</span>
                        <span className="block text-xs text-muted">{formatRelativeDay(entry.date)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
