/**
 * The live index. Every collection is a normal `onSnapshot` query, so the search works
 * offline out of the Firestore cache like every other screen.
 *
 * The index is rebuilt when the data changes, not when the query changes - typing only
 * runs `search()`, which is the whole point of the pre-folded index in `engine.ts`.
 * It is built where it is used (the search screen), so the app does not carry it around
 * while nobody is searching.
 */
import { useMemo } from 'react';
import { useCollection } from '@/data/hooks';
import { useRooms } from '@/data/RoomsContext';
import {
  COL,
  type Contact,
  type Cost,
  type DiaryEntry,
  type Note,
  type Phase,
  type Photo,
  type Plan,
  type Task,
  type Trade,
} from '@/data/types';
import { LAYER_LABEL, type Layer } from '@/modules/viewer3d/houseScene';
import { buildIndex, type SearchIndex } from './engine';
import { buildRecords, type RoomLike } from './records';

export function useSearchIndex(): { index: SearchIndex; count: number; loading: boolean } {
  const diary = useCollection<DiaryEntry>(COL.diary);
  const costs = useCollection<Cost>(COL.costs);
  const tasks = useCollection<Task>(COL.tasks);
  const notes = useCollection<Note>(COL.notes);
  const contacts = useCollection<Contact>(COL.contacts);
  const trades = useCollection<Trade>(COL.trades);
  const phases = useCollection<Phase>(COL.phases);
  const plans = useCollection<Plan>(COL.plans);
  const photos = useCollection<Photo>(COL.photos);
  const { rooms, aliases } = useRooms();

  const roomsForSearch = useMemo<RoomLike[]>(
    () =>
      rooms.map((room) => ({
        id: room.id,
        name: room.name,
        floor: room.floor,
        floorLabel: LAYER_LABEL[room.floor as Layer] ?? room.floor,
        areaM2: room.areaM2,
        aliases: aliases(room.id),
      })),
    [rooms, aliases],
  );

  const records = useMemo(
    () =>
      buildRecords({
        diary: diary.data,
        costs: costs.data,
        tasks: tasks.data,
        notes: notes.data,
        contacts: contacts.data,
        trades: trades.data,
        phases: phases.data,
        plans: plans.data,
        photos: photos.data,
        rooms: roomsForSearch,
      }),
    [
      diary.data,
      costs.data,
      tasks.data,
      notes.data,
      contacts.data,
      trades.data,
      phases.data,
      plans.data,
      photos.data,
      roomsForSearch,
    ],
  );

  const index = useMemo(() => buildIndex(records), [records]);

  const loading =
    diary.loading || costs.loading || tasks.loading || notes.loading || contacts.loading || trades.loading;

  return { index, count: records.length, loading };
}
