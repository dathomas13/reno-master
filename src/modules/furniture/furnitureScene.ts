/**
 * Puts the furniture of the planned house into the 3D scene.
 *
 * Catalog pieces are built from their parts (catalog.ts), model files are loaded with
 * three's glTF loader and fitted into the size of the piece. Each piece hangs in the
 * group of its storey, so hiding a storey hides its furniture as well.
 *
 * Model coordinates are millimetres (x east, y north, z up); three counts metres with
 * y up, a point maps as (x, z, -y) * 0.001 - the same as houseScene.ts.
 */
import type * as THREE_NS from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Layer, ThreeNamespace } from '@/modules/viewer3d/houseScene';
import { buildParts, FINISH_COLOR, type Finish, type Part } from './catalog';
import { FLOOR_Z, FURNITURE_FLOORS, type FurnitureItem, type FurnitureModel } from './placement';

const MM = 0.001;
const SHININESS: Partial<Record<Finish, number>> = {
  ceramic: 60,
  chrome: 120,
  steel: 90,
  mirror: 140,
  blackglass: 120,
  worktop: 20,
  basin: 40,
};
const OUTLINE = 0xc9a86a;
const OUTLINE_WARN = 0xe0603f;

export interface FurnitureLayer {
  /** meshes the raycaster may hit; kept current as pieces come and go */
  pickables: THREE_NS.Object3D[];
  /** brings the scene in line with the stored furniture */
  sync(items: readonly FurnitureItem[], models: readonly FurnitureModel[]): void;
  /** moves and turns a piece without rebuilding it - for dragging */
  move(item: FurnitureItem): void;
  select(id: string | null, warn?: boolean): void;
  setVisible(on: boolean): void;
  /** the id of the piece an object belongs to */
  resolve(object: THREE_NS.Object3D): string | null;
  dispose(): void;
}

interface Entry {
  key: string;
  group: THREE_NS.Group;
  meshes: THREE_NS.Object3D[];
  geometries: THREE_NS.BufferGeometry[];
}

type ModelReader = (model: FurnitureModel) => Promise<ArrayBuffer | null>;

export function createFurnitureLayer(
  THREE: ThreeNamespace,
  groups: Record<Layer, THREE_NS.Group>,
  options: { readModel: ModelReader; onChange(): void },
): FurnitureLayer {
  const floorGroups = new Map<string, THREE_NS.Group>();
  for (const floor of FURNITURE_FLOORS) {
    const group = new THREE.Group();
    group.name = `moebel-${floor}`;
    groups[floor].add(group);
    floorGroups.set(floor, group);
  }

  const materials = new Map<Finish, THREE_NS.Material>();
  const materialFor = (finish: Finish): THREE_NS.Material => {
    let material = materials.get(finish);
    if (!material) {
      const color = FINISH_COLOR[finish];
      if (finish === 'glass') {
        material = new THREE.MeshPhongMaterial({
          color,
          transparent: true,
          opacity: 0.28,
          shininess: 100,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      } else if (SHININESS[finish]) {
        material = new THREE.MeshPhongMaterial({ color, shininess: SHININESS[finish], side: THREE.DoubleSide });
      } else {
        material = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
      }
      materials.set(finish, material);
    }
    return material;
  };
  const placeholderMaterial = new THREE.MeshLambertMaterial({ color: 0x9aa5b1, transparent: true, opacity: 0.35 });

  const entries = new Map<string, Entry>();
  const pickables: THREE_NS.Object3D[] = [];
  let selected: { id: string; warn: boolean } | null = null;
  let outline: THREE_NS.LineSegments | null = null;
  let disposed = false;

  const refreshPickables = () => {
    pickables.length = 0;
    for (const entry of entries.values()) pickables.push(...entry.meshes);
  };

  const place = (group: THREE_NS.Group, item: FurnitureItem) => {
    group.position.set(item.x * MM, (FLOOR_Z[item.floor] + item.z) * MM, -item.y * MM);
    group.rotation.set(0, (item.rot * Math.PI) / 180, 0);
  };

  const dropOutline = () => {
    if (!outline) return;
    outline.parent?.remove(outline);
    outline.geometry.dispose();
    (outline.material as THREE_NS.Material).dispose();
    outline = null;
  };

  const drawOutline = () => {
    dropOutline();
    if (!selected) return;
    const entry = entries.get(selected.id);
    const item = entry?.group.userData.item as FurnitureItem | undefined;
    if (!entry || !item) return;
    const pad = 0.015;
    const frame = new THREE.BoxGeometry(item.w * MM + pad, item.h * MM + pad, item.d * MM + pad);
    const geometry = new THREE.EdgesGeometry(frame);
    frame.dispose();
    const material = new THREE.LineBasicMaterial({
      color: selected.warn ? OUTLINE_WARN : OUTLINE,
      depthTest: false,
      transparent: true,
    });
    outline = new THREE.LineSegments(geometry, material);
    outline.position.set(0, (item.h * MM) / 2, 0);
    outline.renderOrder = 10;
    entry.group.add(outline);
  };

  const remove = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    if (outline && outline.parent === entry.group) dropOutline();
    entry.group.parent?.remove(entry.group);
    for (const geometry of entry.geometries) geometry.dispose();
    entries.delete(id);
  };

  const build = (item: FurnitureItem, model: FurnitureModel | undefined, key: string) => {
    const group = new THREE.Group();
    group.name = `moebel-${item.id}`;
    group.userData = { kind: 'furniture', id: item.id, item };
    const entry: Entry = { key, group, meshes: [], geometries: [] };

    if (item.type === 'model') {
      // a see-through box stands in until the file is read, and stays when it cannot be
      const geometry = new THREE.BoxGeometry(item.w * MM, item.h * MM, item.d * MM);
      geometry.translate(0, (item.h * MM) / 2, 0);
      const placeholder = new THREE.Mesh(geometry, placeholderMaterial);
      group.add(placeholder);
      entry.meshes.push(placeholder);
      entry.geometries.push(geometry);
      if (model) {
        void loadModelObject(THREE, model, options.readModel).then((source) => {
          if (disposed || !source || entries.get(item.id) !== entry) return;
          group.remove(placeholder);
          const fitted = fitModel(THREE, source, item);
          group.add(fitted);
          entry.meshes = [];
          fitted.traverse((child) => {
            if ((child as THREE_NS.Mesh).isMesh) entry.meshes.push(child);
          });
          refreshPickables();
          options.onChange();
        });
      }
    } else {
      for (const part of buildParts(item.type, item)) {
        const geometry = partGeometry(THREE, part);
        const mesh = new THREE.Mesh(geometry, materialFor(part.f));
        group.add(mesh);
        entry.meshes.push(mesh);
        entry.geometries.push(geometry);
      }
    }

    place(group, item);
    floorGroups.get(item.floor)?.add(group);
    entries.set(item.id, entry);
  };

  const keyOf = (item: FurnitureItem, model: FurnitureModel | undefined) =>
    JSON.stringify([item.type, item.modelId ?? '', item.floor, item.w, item.d, item.h, model?.storagePath ?? '']);

  return {
    pickables,
    sync(items, models) {
      const wanted = new Set(items.map((item) => item.id));
      for (const id of [...entries.keys()]) if (!wanted.has(id)) remove(id);
      for (const item of items) {
        const model = item.type === 'model' ? models.find((candidate) => candidate.id === item.modelId) : undefined;
        const key = keyOf(item, model);
        const existing = entries.get(item.id);
        if (existing && existing.key === key) {
          existing.group.userData.item = item;
          place(existing.group, item);
          continue;
        }
        remove(item.id);
        build(item, model, key);
      }
      refreshPickables();
      drawOutline();
    },
    move(item) {
      const entry = entries.get(item.id);
      if (!entry) return;
      entry.group.userData.item = item;
      place(entry.group, item);
    },
    select(id, warn = false) {
      selected = id ? { id, warn } : null;
      drawOutline();
    },
    setVisible(on) {
      for (const group of floorGroups.values()) group.visible = on;
    },
    resolve(object) {
      let current: THREE_NS.Object3D | null = object;
      while (current) {
        const data = current.userData as { kind?: string; id?: string };
        if (data?.kind === 'furniture' && data.id) return data.id;
        current = current.parent;
      }
      return null;
    },
    dispose() {
      disposed = true;
      dropOutline();
      for (const id of [...entries.keys()]) remove(id);
      for (const material of materials.values()) material.dispose();
      placeholderMaterial.dispose();
      for (const group of floorGroups.values()) group.parent?.remove(group);
    },
  };
}

// ------------------------------------------------------------------ parts

function roundedRect(THREE: ThreeNamespace, w: number, d: number, r: number): THREE_NS.Shape {
  const shape = new THREE.Shape();
  const x0 = -w / 2;
  const y0 = -d / 2;
  shape.moveTo(x0 + r, y0);
  shape.lineTo(x0 + w - r, y0);
  shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  shape.lineTo(x0 + w, y0 + d - r);
  shape.quadraticCurveTo(x0 + w, y0 + d, x0 + w - r, y0 + d);
  shape.lineTo(x0 + r, y0 + d);
  shape.quadraticCurveTo(x0, y0 + d, x0, y0 + d - r);
  shape.lineTo(x0, y0 + r);
  shape.quadraticCurveTo(x0, y0, x0 + r, y0);
  return shape;
}

/**
 * A box with rounded edges, standing on y = 0 and centred on its footprint (metres).
 * Half the radius rounds the corners of the plan, the other half is the bevel all
 * round - a cushion reads as a cushion, not as a brick.
 */
function roundedBox(THREE: ThreeNamespace, w: number, d: number, h: number, r: number): THREE_NS.BufferGeometry {
  const b = Math.min(r, w / 2, d / 2, h / 2) / 2 - 1e-5;
  if (b <= 0.0005) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.translate(0, h / 2, 0);
    return geometry;
  }
  const sw = w - 2 * b;
  const sd = d - 2 * b;
  const shape = roundedRect(THREE, sw, sd, Math.min(b, sw / 2, sd / 2));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(h - 2 * b, 1e-4),
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 2,
    curveSegments: 4,
  });
  // the shape lies in the plan (x east, y north), the extrusion goes up
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, b, 0);
  return geometry;
}

export function partGeometry(THREE: ThreeNamespace, part: Part): THREE_NS.BufferGeometry {
  const cx = part.c[0] * MM;
  const cz = -part.c[1] * MM;
  const z = part.z * MM;
  switch (part.shape) {
    case 'box': {
      const [w, d, h] = part.s.map((value) => Math.max(value, 0.5) * MM);
      const geometry = part.r ? roundedBox(THREE, w, d, h, part.r * MM) : new THREE.BoxGeometry(w, h, d);
      if (!part.r) geometry.translate(0, h / 2, 0);
      geometry.translate(cx, z, cz);
      return geometry;
    }
    case 'cyl': {
      const bottom = part.r * MM;
      const top = (part.r2 ?? part.r) * MM;
      const length = part.h * MM;
      const geometry = new THREE.CylinderGeometry(top, bottom, length, 24);
      if (part.axis === 'x') {
        geometry.rotateZ(Math.PI / 2);
      } else if (part.axis === 'y') {
        geometry.rotateX(Math.PI / 2);
      } else {
        geometry.translate(0, length / 2, 0);
        geometry.scale(part.sx ?? 1, 1, part.sy ?? 1);
      }
      geometry.translate(cx, z, cz);
      return geometry;
    }
    case 'lathe': {
      const points = part.profile.map(([r, height]) => new THREE.Vector2(r * MM, height * MM));
      const geometry = new THREE.LatheGeometry(points, 32);
      geometry.scale(part.sx ?? 1, 1, part.sy ?? 1);
      geometry.translate(cx, z, cz);
      return geometry;
    }
    case 'sphere': {
      const geometry = new THREE.SphereGeometry(part.r * MM, 24, 16);
      geometry.scale(1, part.sz ?? 1, 1);
      geometry.translate(cx, z, cz);
      return geometry;
    }
  }
}

// ------------------------------------------------------------------ model files

export interface InspectedModel {
  object: THREE_NS.Object3D;
  /** bounding box in file units: x, y (up), z */
  size: [number, number, number];
  triangles: number;
}

function germanLoadError(error: unknown): Error {
  const text = error instanceof Error ? error.message : String(error);
  if (/draco/i.test(text)) {
    return new Error('Das Modell ist mit Draco komprimiert. Bitte ohne Draco-Kompression als .glb exportieren.');
  }
  if (/ktx2|basis/i.test(text)) {
    return new Error('Das Modell nutzt KTX2-Texturen. Bitte mit PNG- oder JPEG-Texturen exportieren.');
  }
  if (/external|\.bin|uri/i.test(text)) {
    return new Error('Die Datei verweist auf weitere Dateien. Bitte als eine einzige .glb-Datei exportieren.');
  }
  return new Error(`Die Datei lässt sich nicht als glTF-Modell lesen (${text}).`);
}

/**
 * The house is lit for flat colours: colour management is off and the output is linear
 * (see ViewerPage). glTF colours and textures come in for a colour managed renderer, so
 * they would show far too dark - here they are turned into what this scene expects.
 * Without an environment map, metal renders black; it is toned down to stay readable.
 */
function prepareMaterials(THREE: ThreeNamespace, object: THREE_NS.Object3D): number {
  let triangles = 0;
  const seen = new Set<THREE_NS.Material>();
  object.traverse((child) => {
    const mesh = child as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    triangles += (geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0)) / 3;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      const standard = material as THREE_NS.MeshStandardMaterial;
      if (standard.color) standard.color.convertLinearToSRGB();
      if (standard.emissive) standard.emissive.convertLinearToSRGB();
      for (const map of [standard.map, standard.emissiveMap]) {
        if (map) {
          map.colorSpace = THREE.NoColorSpace;
          map.needsUpdate = true;
        }
      }
      if (typeof standard.metalness === 'number') standard.metalness = Math.min(standard.metalness, 0.35);
      material.side = THREE.DoubleSide;
    }
  });
  return Math.round(triangles);
}

/** reads a glTF file (binary .glb or self-contained .gltf); throws with a German message */
export async function inspectModelFile(THREE: ThreeNamespace, data: ArrayBuffer): Promise<InspectedModel> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let object: THREE_NS.Object3D;
  try {
    const gltf = await loader.parseAsync(data, '');
    object = gltf.scene;
  } catch (error) {
    throw germanLoadError(error);
  }
  const triangles = prepareMaterials(THREE, object);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty() || triangles === 0) throw new Error('In der Datei ist keine Geometrie.');
  const size = box.getSize(new THREE.Vector3());
  return { object, size: [size.x, size.y, size.z], triangles };
}

/** read files, by storage path; a failure is not kept, so the next sync tries again */
const modelCache = new Map<string, Promise<THREE_NS.Object3D | null>>();

export function loadModelObject(
  THREE: ThreeNamespace,
  model: FurnitureModel,
  read: ModelReader,
): Promise<THREE_NS.Object3D | null> {
  let pending = modelCache.get(model.storagePath);
  if (!pending) {
    pending = (async () => {
      const data = await read(model);
      if (!data) return null;
      try {
        return (await inspectModelFile(THREE, data)).object;
      } catch {
        return null;
      }
    })();
    modelCache.set(model.storagePath, pending);
    void pending.then((object) => {
      if (!object) modelCache.delete(model.storagePath);
    });
  }
  return pending;
}

/** a model just inspected for upload, so it is not read and parsed a second time */
export function rememberModelObject(storagePath: string, object: THREE_NS.Object3D): void {
  modelCache.set(storagePath, Promise.resolve(object));
}

/**
 * A copy of a loaded model, standing on the floor, centred on its footprint and stretched
 * to the size of the piece. Geometry and materials are shared with the loaded original.
 */
function fitModel(THREE: ThreeNamespace, source: THREE_NS.Object3D, item: FurnitureItem): THREE_NS.Object3D {
  const copy = source.clone(true);
  copy.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(copy);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  copy.position.x -= centre.x;
  copy.position.y -= box.min.y;
  copy.position.z -= centre.z;
  const outer = new THREE.Group();
  outer.add(copy);
  const scale = (target: number, actual: number) => (actual > 1e-9 ? (target * MM) / actual : 1);
  outer.scale.set(scale(item.w, size.x), scale(item.h, size.y), scale(item.d, size.z));
  return outer;
}
