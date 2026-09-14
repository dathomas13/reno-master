/**
 * Touch first orbit control, ported from the model handover viewer.
 *
 * Deliberately not three's OrbitControls: this one is tuned for one handed use on a
 * phone (drag to turn, two fingers to zoom and pan, tap to select) and keeps the exact
 * feel of the viewer Thomas already uses.
 */
import type * as THREE_NS from 'three';

export interface OrbitState {
  theta: number;
  phi: number;
  distance: number;
  target: THREE_NS.Vector3;
}

export interface OrbitOptions {
  minDistance?: number;
  maxDistance?: number;
  /** called after every change so the caller can request a frame */
  onChange?: () => void;
  /** called on a tap or click that did not move the camera */
  onTap?: (clientX: number, clientY: number) => void;
}

export interface OrbitControls {
  state: OrbitState;
  apply(): void;
  set(view: Partial<Omit<OrbitState, 'target'>> & { target?: THREE_NS.Vector3 }): void;
  dispose(): void;
}

const MOVE_THRESHOLD = 2; // px before a tap counts as a drag

export function createOrbitControls(
  canvas: HTMLCanvasElement,
  camera: THREE_NS.PerspectiveCamera,
  THREE: typeof THREE_NS,
  initial: OrbitState,
  options: OrbitOptions = {},
): OrbitControls {
  const { minDistance = 4, maxDistance = 120, onChange, onTap } = options;
  const state: OrbitState = {
    theta: initial.theta,
    phi: initial.phi,
    distance: initial.distance,
    target: initial.target.clone(),
  };

  const pointers = new Map<number, { x: number; y: number }>();
  let lastPinch = 0;
  let lastMid: { x: number; y: number } | null = null;
  let moved = false;

  const apply = () => {
    const { theta, phi, distance, target } = state;
    camera.position.set(
      target.x + distance * Math.sin(phi) * Math.sin(theta),
      target.y + distance * Math.cos(phi),
      target.z + distance * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(target);
    onChange?.();
  };

  const pan = (dx: number, dy: number) => {
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    camera.matrix.extractBasis(right, up, new THREE.Vector3());
    const k = state.distance * 0.0015;
    state.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
  };

  const clampDistance = (value: number) => Math.min(Math.max(value, minDistance), maxDistance);

  const onPointerDown = (event: PointerEvent) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved = false;
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    lastMid = null;
    lastPinch = 0;
    if (!moved) onTap?.(event.clientX, event.clientY);
  };

  const onPointerCancel = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    lastMid = null;
    lastPinch = 0;
  };

  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (Math.abs(dx) + Math.abs(dy) > MOVE_THRESHOLD) moved = true;

    if (pointers.size === 1) {
      if (event.shiftKey || event.buttons === 2 || event.buttons === 4) {
        pan(dx, dy);
      } else {
        state.theta -= dx * 0.006;
        state.phi = Math.min(Math.max(state.phi - dy * 0.006, 0.08), Math.PI / 2 - 0.02);
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const pinch = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (lastPinch) state.distance = clampDistance((state.distance * lastPinch) / pinch);
      if (lastMid) pan(mid.x - lastMid.x, mid.y - lastMid.y);
      lastPinch = pinch;
      lastMid = mid;
    }
    apply();
  };

  const onWheel = (event: WheelEvent) => {
    state.distance = clampDistance(state.distance * (1 + event.deltaY * 0.001));
    apply();
  };

  const onContextMenu = (event: Event) => event.preventDefault();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('wheel', onWheel, { passive: true });
  canvas.addEventListener('contextmenu', onContextMenu);

  apply();

  return {
    state,
    apply,
    set(view) {
      if (view.theta !== undefined) state.theta = view.theta;
      if (view.phi !== undefined) state.phi = view.phi;
      if (view.distance !== undefined) state.distance = clampDistance(view.distance);
      if (view.target) state.target.copy(view.target);
      apply();
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      pointers.clear();
    },
  };
}

export interface ViewPreset {
  label: string;
  layers: Record<string, boolean> | null;
  theta: number;
  phi: number;
  distance: number;
  /** target in three coordinates */
  target: [number, number, number];
  rooms?: boolean;
}

/** the four presets from the handover viewer, plus room display for the floor plans */
export const VIEW_PRESETS: ViewPreset[] = [
  {
    label: 'Außen',
    layers: null,
    theta: -0.75,
    phi: 1.05,
    distance: 46,
    target: [6.6, 1.0, -5.9],
    rooms: false,
  },
  {
    label: 'EG-Grundriss',
    layers: { KG: false, EG: true, OG: false, DACH: false, GAR: false },
    theta: 0,
    phi: 0.12,
    distance: 36,
    target: [6.6, 0, -5.9],
    rooms: true,
  },
  {
    label: 'OG-Grundriss',
    layers: { KG: false, EG: false, OG: true, DACH: false, GAR: false },
    theta: 0,
    phi: 0.12,
    distance: 36,
    target: [6.6, 2.75, -5.9],
    rooms: true,
  },
  {
    label: 'KG-Grundriss',
    layers: { KG: true, EG: false, OG: false, DACH: false, GAR: false },
    theta: 0,
    phi: 0.12,
    distance: 36,
    target: [6.6, -2.75, -5.9],
    rooms: true,
  },
];
