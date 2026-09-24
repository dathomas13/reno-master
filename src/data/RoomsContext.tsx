import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadAllRooms, MODEL_EVENT, sortRooms } from './models';
import type { Room } from '@/modules/viewer3d/houseScene';

interface RoomsValue {
  rooms: Room[];
  byId: Map<string, Room>;
  name(id: string): string;
  names(ids: string[]): string[];
}

const RoomsContext = createContext<RoomsValue>({
  rooms: [],
  byId: new Map(),
  name: (id) => id,
  names: () => [],
});

export function RoomsProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    let active = true;
    const load = () => {
      void loadAllRooms().then((loaded) => {
        if (active) setRooms(sortRooms(loaded));
      });
    };
    load();
    // the model comes from the database, so on a fresh device the rooms arrive a moment
    // after the start - and with every model published later
    window.addEventListener(MODEL_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(MODEL_EVENT, load);
    };
  }, []);

  const value = useMemo<RoomsValue>(() => {
    const byId = new Map(rooms.map((room) => [room.id, room]));
    return {
      rooms,
      byId,
      name: (id) => byId.get(id)?.name ?? id,
      names: (ids) => ids.map((id) => byId.get(id)?.name ?? id),
    };
  }, [rooms]);

  return <RoomsContext.Provider value={value}>{children}</RoomsContext.Provider>;
}

export function useRooms(): RoomsValue {
  return useContext(RoomsContext);
}
