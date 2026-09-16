/**
 * The view the user left behind.
 *
 * Coming back to the 3D screen used to start from the default view every time: the model
 * was rebuilt from scratch, and nothing remembered where the camera had been a moment
 * earlier. The scene has to be rebuilt - the renderer is disposed when the screen is left
 * - but the view is a handful of numbers, and those are worth keeping.
 *
 * The values live in this module for the trip to another screen and in `localStorage` for
 * the trip through a closed app. Anything that comes back from there is treated as
 * unknown: half written, from an older version, edited by hand. `parseViewerState` is the
 * gate, and it is the part that is tested.
 */
import type { Floor } from '@/data/types';

export interface ViewerCamera {
  theta: number;
  phi: number;
  distance: number;
  /** the point the camera looks at, in metres */
  target: [number, number, number];
}

export interface ViewerState {
  camera: ViewerCamera;
  layers: Record<Floor, boolean>;
  structural: boolean;
  showRooms: boolean;
  /** the entry of the view menu that was chosen last */
  viewLabel: string;
  /** the room whose panel was open */
  roomId?: string;
}

const KEY = 'reno.viewer.view';
const FLOORS: Floor[] = ['KG', 'EG', 'OG', 'DACH', 'GAR'];

/** the state of this session, which does not need storage to survive a navigation */
let current: ViewerState | null = null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Turns whatever was stored into a state, or into nothing.
 *
 * A single NaN in here would put the camera somewhere the model is not, and the screen
 * would come up black with no way to tell why - so everything is checked, and anything
 * doubtful means "no saved view", which is merely the default view.
 */
export function parseViewerState(value: unknown): ViewerState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const camera = raw.camera as Record<string, unknown> | undefined;
  if (!camera) return null;
  if (!isFiniteNumber(camera.theta) || !isFiniteNumber(camera.phi) || !isFiniteNumber(camera.distance)) {
    return null;
  }
  if (camera.distance <= 0) return null;
  const target = camera.target;
  if (!Array.isArray(target) || target.length !== 3 || !target.every(isFiniteNumber)) return null;

  const layersRaw = (raw.layers ?? {}) as Record<string, unknown>;
  const layers = {} as Record<Floor, boolean>;
  for (const floor of FLOORS) {
    layers[floor] = typeof layersRaw[floor] === 'boolean' ? (layersRaw[floor] as boolean) : true;
  }

  return {
    camera: {
      theta: camera.theta,
      phi: camera.phi,
      distance: camera.distance,
      target: [target[0] as number, target[1] as number, target[2] as number],
    },
    layers,
    structural: raw.structural === true,
    showRooms: raw.showRooms === true,
    viewLabel: typeof raw.viewLabel === 'string' ? raw.viewLabel : '',
    roomId: typeof raw.roomId === 'string' && raw.roomId ? raw.roomId : undefined,
  };
}

export function lastViewerState(): ViewerState | null {
  if (current) return current;
  try {
    const raw = localStorage.getItem(KEY);
    current = raw ? parseViewerState(JSON.parse(raw)) : null;
  } catch {
    current = null; // private mode, or something unreadable in there
  }
  return current;
}

export function rememberViewerState(state: ViewerState): void {
  const checked = parseViewerState(state);
  if (!checked) return;
  current = checked;
  try {
    localStorage.setItem(KEY, JSON.stringify(checked));
  } catch {
    // no storage: the view still survives inside this session
  }
}

/** only for the tests and for a reset; the viewer itself never forgets on purpose */
export function forgetViewerState(): void {
  current = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}
