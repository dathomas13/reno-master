import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { Field, ChipSelect, EmptyState } from '@/components/Fields';
import { RoomPicker, TradeSelect, PhaseSelect } from '@/components/Pickers';
import { useCollection } from '@/data/hooks';
import { useLists } from '@/data/useLists';
import { COL, ASSIGNEES, PRIORITY, TASK_STATUS, type Assignee, type Priority, type Task, type TaskStatus } from '@/data/types';
import { emptyTask, saveTask, toggleTaskDone, deleteTask } from '@/data/repos';
import { dueBucket, DUE_BUCKET_LABEL, formatRelativeDay, type DueBucket } from '@/lib/date';
import { useRooms } from '@/data/RoomsContext';

const BUCKETS: DueBucket[] = ['overdue', 'today', 'week', 'later', 'none'];
const PRIORITY_COLOR: Record<Priority, string> = {
  Hoch: 'text-bad',
  Mittel: 'text-warn',
  Niedrig: 'text-muted',
};

export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const { data: tasks } = useCollection<Task>(COL.tasks);
  const { lists } = useLists();
  const { name: roomName } = useRooms();
  const [filter, setFilter] = useState<'offen' | 'alle' | 'erledigt'>('offen');
  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [quick, setQuick] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);

  const roomFilter = params.get('raum');
  const wanted = params.get('aufgabe');

  // a search result links straight to one task: open its sheet as soon as it is loaded
  useEffect(() => {
    if (!wanted) return;
    const task = tasks.find((item) => item.id === wanted);
    if (task) setEditing(task);
  }, [wanted, tasks]);

  function dropWanted() {
    if (!wanted) return;
    const next = new URLSearchParams(params);
    next.delete('aufgabe');
    setParams(next, { replace: true });
  }

  const visible = useMemo(() => {
    return tasks.filter((task) => {
      if (roomFilter && !task.roomIds.includes(roomFilter)) return false;
      if (assignee && !task.assignees.includes(assignee) && !task.assignees.includes('Beide')) return false;
      if (filter === 'offen') return task.status !== 'Erledigt';
      if (filter === 'erledigt') return task.status === 'Erledigt';
      return true;
    });
  }, [tasks, filter, assignee, roomFilter]);

  const grouped = useMemo(() => {
    const map = new Map<DueBucket, Task[]>();
    for (const task of visible) {
      const bucket = task.status === 'Erledigt' ? 'none' : dueBucket(task.due);
      map.set(bucket, [...(map.get(bucket) ?? []), task]);
    }
    for (const [, rows] of map) {
      rows.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title, 'de'));
    }
    return map;
  }, [visible]);

  async function addQuick() {
    const title = quick.trim();
    if (!title) return;
    setQuick('');
    // a task added while a room filter is active must land in that room, or it vanishes from view
    await saveTask({ ...emptyTask(), title, roomIds: roomFilter ? [roomFilter] : [] });
  }

  return (
    <>
      <TopBar title="Aufgaben" subtitle={`${visible.length} angezeigt`} />

      <div className="p-3 flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            className="field"
            placeholder="Neue Aufgabe…"
            value={quick}
            onChange={(event) => setQuick(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addQuick();
            }}
          />
          <button type="button" className="btn btn-primary px-4" onClick={() => void addQuick()}>
            +
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['offen', 'alle', 'erledigt'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`chip ${filter === item ? 'chip-on' : ''}`}
              onClick={() => setFilter(item)}
            >
              {item === 'offen' ? 'Offen' : item === 'alle' ? 'Alle' : 'Erledigt'}
            </button>
          ))}
          <span className="w-px bg-line mx-1" />
          {(['Thomas', 'Sarah'] as Assignee[]).map((person) => (
            <button
              key={person}
              type="button"
              className={`chip ${assignee === person ? 'chip-on' : ''}`}
              onClick={() => setAssignee(assignee === person ? null : person)}
            >
              {person}
            </button>
          ))}
          {roomFilter && (
            <button type="button" className="chip chip-on" onClick={() => setParams(new URLSearchParams())}>
              {roomName(roomFilter)} ×
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 && <EmptyState title="Nichts offen" hint="Alles erledigt oder noch nichts angelegt." />}

      {BUCKETS.map((bucket) => {
        const rows = grouped.get(bucket);
        if (!rows?.length) return null;
        return (
          <section key={bucket}>
            <div className="section-title">{DUE_BUCKET_LABEL[bucket]}</div>
            <ul>
              {rows.map((task) => (
                <li key={task.id} className="list-row">
                  <button
                    type="button"
                    aria-label={task.status === 'Erledigt' ? 'Wieder öffnen' : 'Erledigt'}
                    className={`w-6 h-6 rounded-md border shrink-0 ${
                      task.status === 'Erledigt' ? 'bg-accent border-accent text-bg' : 'border-line'
                    }`}
                    onClick={() => void toggleTaskDone(task)}
                  >
                    {task.status === 'Erledigt' ? '✓' : ''}
                  </button>
                  <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setEditing(task)}>
                    <span className={`block truncate ${task.status === 'Erledigt' ? 'line-through text-muted' : ''}`}>
                      {task.title}
                    </span>
                    <span className="block text-xs text-muted truncate">
                      <span className={PRIORITY_COLOR[task.priority]}>{task.priority}</span>
                      {task.area ? ` · ${task.area}` : ''}
                      {task.assignees.length ? ` · ${task.assignees.join(', ')}` : ''}
                      {task.due ? ` · ${formatRelativeDay(task.due)}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <TaskSheet
        task={editing}
        areas={lists.taskAreas}
        onClose={() => {
          setEditing(null);
          dropWanted();
        }}
        onSave={async (task) => {
          await saveTask(task);
          setEditing(null);
          dropWanted();
        }}
        onDelete={async (task) => {
          await deleteTask(task.id);
          setEditing(null);
          dropWanted();
        }}
      />
    </>
  );
}

function TaskSheet({
  task,
  areas,
  onClose,
  onSave,
  onDelete,
}: {
  task: Task | null;
  areas: string[];
  onClose(): void;
  onSave(task: Task): Promise<void>;
  onDelete(task: Task): Promise<void>;
}) {
  const [draft, setDraft] = useState<Task | null>(task);
  if (task && draft?.id !== task.id) setDraft(task);
  if (!task || !draft) return null;

  const update = (patch: Partial<Task>) => setDraft({ ...draft, ...patch });

  return (
    <Sheet open onClose={onClose} title="Aufgabe">
      <div className="p-4">
        <Field label="Titel">
          <input className="field" value={draft.title} onChange={(event) => update({ title: event.target.value })} />
        </Field>
        <Field label="Notizen">
          <textarea
            className="field min-h-[5rem]"
            value={draft.notes ?? ''}
            onChange={(event) => update({ notes: event.target.value })}
          />
        </Field>
        <Field label="Status">
          <ChipSelect
            options={TASK_STATUS}
            value={[draft.status]}
            multiple={false}
            allowEmpty={false}
            onChange={(value) => update({ status: (value[0] ?? 'Offen') as TaskStatus })}
          />
        </Field>
        <Field label="Priorität">
          <ChipSelect
            options={PRIORITY}
            value={[draft.priority]}
            multiple={false}
            allowEmpty={false}
            onChange={(value) => update({ priority: (value[0] ?? 'Mittel') as Priority })}
          />
        </Field>
        <Field label="Zuständig">
          <ChipSelect
            options={ASSIGNEES}
            value={draft.assignees}
            onChange={(value) => update({ assignees: value as Assignee[] })}
          />
        </Field>
        <Field label="Fällig am">
          <input
            className="field"
            type="date"
            value={draft.due ?? ''}
            onChange={(event) => update({ due: event.target.value || undefined })}
          />
        </Field>
        <Field label="Bereich">
          <ChipSelect
            options={areas}
            value={draft.area ? [draft.area] : []}
            multiple={false}
            onChange={(value) => update({ area: value[0] })}
          />
        </Field>
        <Field label="Gewerk">
          <TradeSelect value={draft.tradeId} onChange={(value) => update({ tradeId: value })} />
        </Field>
        <Field label="Phase">
          <PhaseSelect value={draft.phaseId} onChange={(value) => update({ phaseId: value })} />
        </Field>
        <Field label="Räume">
          <RoomPicker value={draft.roomIds} onChange={(value) => update({ roomIds: value })} />
        </Field>
        <div className="flex gap-3">
          <button type="button" className="btn btn-primary flex-1" onClick={() => void onSave(draft)}>
            Speichern
          </button>
          <button type="button" className="btn btn-danger" onClick={() => void onDelete(draft)}>
            Löschen
          </button>
        </div>
      </div>
    </Sheet>
  );
}
