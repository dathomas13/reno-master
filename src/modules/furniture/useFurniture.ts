import { useEffect, useState } from 'react';
import { isAuthenticated } from '@/firebase/auth';
import { watchFurniture } from '@/data/furniture';
import { debugLog } from '@/platform/debugLog';
import type { FurnitureState } from './placement';

const EMPTY: FurnitureState = { items: [], models: [] };

/** the furniture of the planned house, live; empty while `enabled` is false */
export function useFurniture(enabled: boolean): FurnitureState {
  const [state, setState] = useState<FurnitureState>(EMPTY);
  useEffect(() => {
    if (!enabled || !isAuthenticated()) {
      setState(EMPTY);
      return;
    }
    return watchFurniture(setState, (error) => debugLog('moebel', `Lesen fehlgeschlagen: ${error.message}`));
  }, [enabled]);
  return state;
}
