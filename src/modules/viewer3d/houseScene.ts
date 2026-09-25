/**
 * Builds the house model into a three.js scene.
 *
 * The three namespace is passed in instead of imported so the exact same code runs in
 * the app (`import * as THREE from 'three'`) and in the dependency-free verification
 * harness under tools/model/_verify (UMD build from the model handover).
 *
 * Model coordinates are millimetres (x east, y north, z up, z = 0 at the raw EG slab).
 * three uses metres with y up, so a point maps as (x, z, -y) * 0.001 - north is -Z.
 */
import type * as THREE_NS from 'three';

export type ThreeNamespace = typeof THREE_NS;

export type Layer = 'KG' | 'EG' | 'OG' | 'DACH' | 'GAR';
export type PrimKind = 'wall' | 'slab' | 'roof' | 'glass' | 'door' | 'stair' | 'rail';
export type Confidence = 'A' | 'B' | 'C';

export interface ScenePrim {
  layer: Layer;
  name: string;
  kind: PrimKind;
  tag: Confidence;
  tragend?: boolean;
  /** flat vertex list, 3 numbers per vertex, in mm */
  v: number[];
  /** triangle indices into v */
  t: number[];
  /** [xmin, ymin, zmin, xmax, ymax, zmax] in mm */
  bb: number[];
}

export interface SceneMeta {
  variant?: string;
  version?: string;
  generatedAt?: string;
  note?: string;
  house_w?: number;
  house_d?: number;
  ridge?: number;
}

export interface SceneDoc {
  meta?: SceneMeta;
  prims: ScenePrim[];
}

export interface Room {
  id: string;
  name: string;
  floor: Layer;
  /** axis aligned rectangles [x0, y0, x1, y1] in mm - empty when not surveyed yet */
  rects: number[][];
  /** missing when `rects` is empty: a room without geometry has no area */
  areaM2?: number;
}

export interface RoomDoc {
  variant: string;
  generatedAt?: string;
  rooms: Room[];
}

export const LAYERS: Layer[] = ['KG', 'EG', 'OG', 'DACH', 'GAR'];

export const LAYER_LABEL: Record<Layer, string> = {
  KG: 'Keller',
  EG: 'Erdgeschoss',
  OG: 'Obergeschoss',
  DACH: 'Dach + Gaube',
  GAR: 'Garage',
};

export const LAYER_SHORT: Record<Layer, string> = {
  KG: 'KG',
  EG: 'EG',
  OG: 'OG',
  DACH: 'Dach',
  GAR: 'Garage',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  A: 'Maßkette gelesen',
  B: 'abgeleitet',
  C: 'Annahme – prüfen',
};

const KIND_COLOR: Record<PrimKind, number> = {
  wall: 0xd9d3c5,
  slab: 0xb5b9bd,
  roof: 0x4a5563,
  glass: 0x8ec6e6,
  door: 0x7a5a3a,
  stair: 0xa88a5c,
  rail: 0x2b2f34,
};

const TAG_COLOR: Record<Confidence, number> = { A: 0xd9d3c5, B: 0xc9b990, C: 0xb8845a };

const STRUCTURAL_COLOR = { bearing: 0xc0392b, other: 0xe6e2d8 };
const EDGE_COLOR = 0x1d2126;
const ROOM_COLOR = 0xc9a86a;
const ROOM_OPACITY = 0.32;
const ROOM_OPACITY_ACTIVE = 0.62;
const MM = 0.001;

/** floor level (mm) a room polygon is drawn at, slightly above the raw slab */
const ROOM_Z: Record<Layer, number> = { KG: -2720, EG: 30, OG: 2780, DACH: 2780, GAR: -1330 };

export interface PickedPart {
  type: 'part';
  prim: ScenePrim;
}

export interface PickedRoom {
  type: 'room';
  room: Room;
}

export type Picked = PickedPart | PickedRoom;

export interface HouseScene {
  /** one group per layer, toggle .visible to show or hide a floor */
  groups: Record<Layer, THREE_NS.Group>;
  /** room polygons, one group per layer and a child of that layer's group */
  roomGroups: Record<Layer, THREE_NS.Group>;
  /** meshes that can be hit by the raycaster */
  pickables: THREE_NS.Mesh[];
  roomPickables: THREE_NS.Mesh[];
  meta: SceneMeta;
  /** centre of the building in three coordinates, used as the default camera target */
  center: THREE_NS.Vector3;
  setStructuralMode(on: boolean): void;
  setRoomsVisible(on: boolean): void;
  setSelected(object: THREE_NS.Object3D | null): void;
  highlightRoom(roomId: string | null): void;
  resolve(object: THREE_NS.Object3D): Picked | null;
  dispose(): void;
}

/** true when the object and every parent up to the scene are visible */
export function isVisible(object: THREE_NS.Object3D): boolean {
  let current: THREE_NS.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

/** model (x, y, z) in mm to three world coordinates in metres */
export function toWorld(THREE: ThreeNamespace, x: number, y: number, z: number): THREE_NS.Vector3 {
  return new THREE.Vector3(x * MM, z * MM, -y * MM);
}

export function formatDimensions(bb: number[]): string {
  return `${bb[3] - bb[0]} × ${bb[4] - bb[1]} × ${bb[5] - bb[2]} mm`;
}

export function describePart(prim: ScenePrim): string {
  const confidence = CONFIDENCE_LABEL[prim.tag] ?? '';
  if (prim.kind !== 'wall') return confidence;
  return `${confidence} · ${prim.tragend ? 'tragend' : 'nicht tragend'}`;
}

export interface BuildOptions {
  /** draw the ground plane and grid (off for floor plan views is not needed, it stays below) */
  ground?: boolean;
  /** draw the compass sprites */
  labels?: boolean;
  rooms?: RoomDoc | null;
}

export function buildHouse(
  THREE: ThreeNamespace,
  scene: THREE_NS.Scene,
  doc: SceneDoc,
  options: BuildOptions = {},
): HouseScene {
  const { ground = true, labels = true, rooms = null } = options;
  const meta = doc.meta ?? {};
  const disposables: { dispose(): void }[] = [];
  const groups = {} as Record<Layer, THREE_NS.Group>;
  const pickables: THREE_NS.Mesh[] = [];
  const roomPickables: THREE_NS.Mesh[] = [];
  const walls: THREE_NS.Mesh[] = [];
  let structural = false;
  let selected: THREE_NS.Mesh | null = null;

  const root = new THREE.Group();
  root.name = 'house';
  scene.add(root);

  for (const layer of LAYERS) {
    const group = new THREE.Group();
    group.name = layer;
    groups[layer] = group;
    root.add(group);
  }

  // every generated scene carries these; the fallback is the surveyed outer size (09/2026)
  const houseW = meta.house_w ?? 12995;
  const houseD = meta.house_d ?? 11815;
  const center = toWorld(THREE, houseW / 2, houseD / 2, 1000);

  // ---------------------------------------------------------------- lights
  // The intensities are the ones from the handover viewer. That viewer ran on a three
  // before r155, which multiplied every light by PI ("legacy lights"); newer versions
  // take the number as given and removed the switch, which made the same scene about
  // three times darker. The factor is applied here instead, so the numbers below stay
  // comparable with viewer_template.html.
  const LEGACY = Math.PI;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.85 * LEGACY);
  const sun = new THREE.DirectionalLight(0xffffff, 0.7 * LEGACY);
  sun.position.set(-10, 20, -8);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35 * LEGACY);
  fill.position.set(12, 8, 10);
  root.add(hemi, sun, fill);

  // ---------------------------------------------------------------- ground
  if (ground) {
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x2a3a2e });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -2.75 - 0.2 - 0.01;
    root.add(groundMesh);
    const grid = new THREE.GridHelper(60, 60, 0x3a4a3e, 0x2f3f33);
    grid.position.y = groundMesh.position.y + 0.005;
    root.add(grid);
    disposables.push(groundGeo, groundMat, grid);
  }

  // ---------------------------------------------------------------- compass
  if (labels) {
    const makeLabel = (text: string, x: number, y: number, z: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#c9a86a';
        ctx.font = '600 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(text, 128, 46);
      }
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(3, 0.75, 1);
      sprite.position.set(x, y, z);
      root.add(sprite);
      disposables.push(texture, material);
    };
    makeLabel('NORD / Garten', 6.6, -1.5, -14.5);
    makeLabel('SÜD / Straße', 6.6, -1.5, 2.5);
    makeLabel('WEST / Garage', -10, -0.8, -8.5);
  }

  // ---------------------------------------------------------------- parts
  const wallColor = (prim: ScenePrim): number => {
    if (structural) return prim.tragend ? STRUCTURAL_COLOR.bearing : STRUCTURAL_COLOR.other;
    return TAG_COLOR[prim.tag] ?? KIND_COLOR.wall;
  };

  const materialFor = (prim: ScenePrim) => {
    if (prim.kind === 'glass') {
      return new THREE.MeshPhongMaterial({
        color: KIND_COLOR.glass,
        transparent: true,
        opacity: 0.45,
        shininess: 80,
      });
    }
    const color = prim.kind === 'wall' ? wallColor(prim) : KIND_COLOR[prim.kind];
    return new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  };

  for (const prim of doc.prims) {
    const group = groups[prim.layer];
    if (!group) continue;

    const positions = new Float32Array(prim.v.length);
    for (let i = 0; i < prim.v.length; i += 3) {
      positions[i] = prim.v[i] * MM;
      positions[i + 1] = prim.v[i + 2] * MM;
      positions[i + 2] = -prim.v[i + 1] * MM;
    }
    let geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(prim.t);
    // flat shading: non indexed geometry keeps the hard edges of a raw building shell
    geometry = geometry.toNonIndexed();
    geometry.computeVertexNormals();

    const material = materialFor(prim);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { kind: 'part', prim };
    group.add(mesh);
    pickables.push(mesh);
    disposables.push(geometry, material);
    if (prim.kind === 'wall') walls.push(mesh);

    if (prim.kind !== 'glass') {
      const edgeGeo = new THREE.EdgesGeometry(geometry, 20);
      const edgeMat = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.6 });
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
      disposables.push(edgeGeo, edgeMat);
    }
  }

  // ---------------------------------------------------------------- rooms
  // Room areas live inside their floor group, so hiding a floor hides its rooms and
  // a floor plan view never picks a room from the storey above.
  const roomGroups = {} as Record<Layer, THREE_NS.Group>;
  for (const layer of LAYERS) {
    const group = new THREE.Group();
    group.name = `rooms-${layer}`;
    group.visible = false;
    groups[layer].add(group);
    roomGroups[layer] = group;
  }

  const roomMaterials = new Map<string, THREE_NS.MeshBasicMaterial>();
  if (rooms) {
    for (const room of rooms.rooms) {
      const parent = roomGroups[room.floor];
      if (!parent) continue;
      const z = ROOM_Z[room.floor] ?? 10;
      const material = new THREE.MeshBasicMaterial({
        color: ROOM_COLOR,
        transparent: true,
        opacity: ROOM_OPACITY,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      roomMaterials.set(room.id, material);
      disposables.push(material);
      for (const [x0, y0, x1, y1] of room.rects) {
        const geometry = new THREE.PlaneGeometry((x1 - x0) * MM, (y1 - y0) * MM);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        const mid = toWorld(THREE, (x0 + x1) / 2, (y0 + y1) / 2, z);
        mesh.position.copy(mid);
        mesh.userData = { kind: 'room', room };
        parent.add(mesh);
        roomPickables.push(mesh);
        disposables.push(geometry);

        // outline, so a room reads as an area even on a light slab
        const edgeGeo = new THREE.EdgesGeometry(geometry);
        const edgeMat = new THREE.LineBasicMaterial({ color: ROOM_COLOR, transparent: true, opacity: 0.9 });
        mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
        disposables.push(edgeGeo, edgeMat);
      }
    }
  }

  const api: HouseScene = {
    groups,
    roomGroups,
    pickables,
    roomPickables,
    meta,
    center,
    setStructuralMode(on: boolean) {
      structural = on;
      for (const mesh of walls) {
        const prim = (mesh.userData as { prim: ScenePrim }).prim;
        (mesh.material as THREE_NS.MeshLambertMaterial).color.setHex(wallColor(prim));
      }
    },
    setRoomsVisible(on: boolean) {
      for (const layer of LAYERS) roomGroups[layer].visible = on;
    },
    setSelected(object) {
      if (selected) {
        const previous = selected.material as THREE_NS.MeshLambertMaterial;
        if (previous.emissive) previous.emissive.setHex(0x000000);
        selected = null;
      }
      const mesh = object as THREE_NS.Mesh | null;
      if (mesh && (mesh.material as THREE_NS.MeshLambertMaterial)?.emissive) {
        (mesh.material as THREE_NS.MeshLambertMaterial).emissive.setHex(0x554422);
        selected = mesh;
      }
    },
    highlightRoom(roomId) {
      for (const [id, material] of roomMaterials) {
        material.opacity = id === roomId ? ROOM_OPACITY_ACTIVE : ROOM_OPACITY;
      }
    },
    resolve(object) {
      let current: THREE_NS.Object3D | null = object;
      while (current) {
        const data = current.userData as { kind?: string; prim?: ScenePrim; room?: Room };
        if (data?.kind === 'part' && data.prim) return { type: 'part', prim: data.prim };
        if (data?.kind === 'room' && data.room) return { type: 'room', room: data.room };
        current = current.parent;
      }
      return null;
    },
    dispose() {
      for (const item of disposables) item.dispose();
      scene.remove(root);
    },
  };

  return api;
}
