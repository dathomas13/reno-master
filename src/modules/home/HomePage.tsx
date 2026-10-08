import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { PhotoImage } from '@/components/PhotoView';
import { Sheet } from '@/components/Sheet';
import { Icon, type IconName } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { useCollection } from '@/data/hooks';
import { COL, type Cost, type DiaryEntry, type Note, type Phase, type Photo, type Task } from '@/data/types';
import { patchPhase } from '@/data/repos';
import { useOptions } from '@/data/useOptions';
import { isHighPriority, isPhaseActive, isTaskDone, PHASE_ACTIVE, PHASE_DONE } from '@/data/options';
import { orderBy, limit } from '@/firebase/db';
import { formatDateWithWeekday, formatRelativeDay, monthKey, today } from '@/lib/date';
import { formatEuro } from '@/lib/money';
import { loadSettings } from '@/lib/settings';
import { normalizeHomeLayout, visibleHomeBlocks } from '@/lib/homeLayout';

const SHORTCUTS: { to: string; icon: IconName; label: string }[] = [
  { to: '/kosten/neu?capture=1', icon: 'receipt', label: 'Beleg' },
  { to: '/3d', icon: 'cube', label: '3D-Modell' },
  { to: '/aufgaben', icon: 'task', label: 'Aufgaben' },
];

export default function HomePage() {
  const { data: entries } = useCollection<DiaryEntry>(COL.diary, [orderBy('date', 'desc'), limit(20)]);
  const { data: photos } = useCollection<Photo>(COL.photos);
  const { data: costs } = useCollection<Cost>(COL.costs);
  const { data: tasks } = useCollection<Task>(COL.tasks);
  const { data: notes } = useCollection<Note>(COL.notes);
  const { data: phases } = useCollection<Phase>(COL.phases);
  const { label } = useOptions();
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [phaseBusy, setPhaseBusy] = useState(false);
  const toast = useToast();
  // read on mount: the layout only changes on the settings screen, and coming back remounts this page
  const [homeLayout] = useState(() => normalizeHomeLayout(loadSettings().homeLayout));

  const todayEntry = entries.find((entry) => entry.date === today());
  const recent = entries.slice(0, 3);
  const orderedPhases = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases]);
  const phase = orderedPhases.find((item) => isPhaseActive(item));
  const total = costs.reduce((sum, cost) => sum + (cost.amountGross || 0), 0);
  const thisMonth = costs
    .filter((cost) => monthKey(cost.date) === monthKey(today()))
    .reduce((sum, cost) => sum + (cost.amountGross || 0), 0);
  const openTasks = tasks
    .filter((task) => !isTaskDone(task))
    .filter((task) => isHighPriority(task.priority) || (task.due && task.due <= today()))
    .slice(0, 5);

  const pinnedNotes = notes
    .filter((note) => note.pinned)
    .sort((a, b) => b.at.localeCompare(a.at));

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
          .filter((item) => isPhaseActive(item) && item.id !== next.id)
          .map((item) => patchPhase(item.id, { status: PHASE_DONE, end: item.end ?? date })),
        patchPhase(next.id, { status: PHASE_ACTIVE, start: next.start ?? date, end: undefined }),
      ]);
      setPhaseOpen(false);
    } catch {
      toast('Die Phase konnte nicht gesetzt werden.');
    } finally {
      setPhaseBusy(false);
    }
  }

  const blocks: Record<string, ReactNode> = {
    search: (
      <Link to="/suche" className="field flex items-center gap-2 text-muted" aria-label="Suchen">
        <Icon name="search" className="w-5 h-5 shrink-0" />
        <span>Alles durchsuchen…</span>
      </Link>
    ),
    house: (
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
              className="flex items-center gap-1 py-2 -my-2 pr-2 text-xs text-muted text-left"
              title="Aktuelle Phase ändern"
              onClick={() => setPhaseOpen(true)}
            >
              <span className="underline decoration-line underline-offset-2">{phase?.name ?? 'Phase setzen'}</span>
              <Icon name="chevronDown" className="w-3 h-3 shrink-0" />
            </button>
          ) : (
            <div className="text-xs text-muted">Kernsanierung</div>
          )}
        </div>
      </div>
    ),
    today: (
      <>
        {todayEntry ? (
          <Link to={`/tagebuch/${todayEntry.id}`} className="card p-4">
            <div className="text-xs text-muted uppercase tracking-wide mb-1">Heute</div>
            <div className="font-medium">{todayEntry.title}</div>
            <p className="text-sm text-muted line-clamp-2">{todayEntry.text || 'Noch kein Text'}</p>
          </Link>
        ) : (
          <Link to="/tagebuch/neu" className="card p-4 border-accent/40 flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-accent/15 text-accent grid place-items-center shrink-0">
              <Icon name="diary" className="w-5 h-5" />
            </span>
            <span className="flex-1">
              <span className="block font-medium">Tagebuch-Eintrag für heute</span>
              <span className="block text-xs text-muted">Kurz festhalten, was passiert ist</span>
            </span>
            <span className="text-accent"><Icon name="chevronRight" className="w-5 h-5" /></span>
          </Link>
        )}
      </>
    ),
    pinned: (
      <>
        {pinnedNotes.length > 0 && (
          <section className="card">
            <div className="section-title flex items-center gap-1.5">
              <Icon name="pin" className="w-4 h-4" />
              Angepinnte Notizen
            </div>
            <ul>
              {pinnedNotes.map((note) => (
                <li key={note.id}>
                  <Link to={`/notizen?notiz=${note.id}`} className="list-row last:border-0">
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{note.text.split('\n')[0].trim() || 'Notiz'}</span>
                      {note.text.includes('\n') && (
                        <span className="block text-xs text-muted line-clamp-2 whitespace-pre-line">
                          {note.text.split('\n').slice(1).join('\n').trim()}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    ),
    shortcuts: (
      <div className="grid grid-cols-3 gap-2">
        {SHORTCUTS.map((shortcut) => (
          <Link
            key={shortcut.to}
            to={shortcut.to}
            className="card p-3 min-h-16 flex flex-col items-center justify-center gap-1.5 active:bg-panel2"
          >
            <Icon name={shortcut.icon} className="w-6 h-6 text-accent" />
            <span className="text-sm">{shortcut.label}</span>
          </Link>
        ))}
      </div>
    ),
    costs: (
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
    ),
    urgent: (
      <>
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
      </>
    ),
    recent: (
      <>
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
      </>
    ),
  };

  return (
    <>
      <TopBar title="Reno Master" subtitle={formatDateWithWeekday(today())} />

      <div className="p-3 flex flex-col gap-3 max-w-3xl">
        {visibleHomeBlocks(homeLayout).map((id) => (
          <Fragment key={id}>{blocks[id]}</Fragment>
        ))}

        <Sheet open={phaseOpen} onClose={() => setPhaseOpen(false)} title="Aktuelle Phase" doneLabel="Abbrechen">
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
                      <span className="block text-xs text-muted">{label('phaseStatus', item.status)}</span>
                    </span>
                    {item.id === phase?.id && <span className="text-accent text-sm">Aktuell</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Sheet>
      </div>
    </>
  );
}
