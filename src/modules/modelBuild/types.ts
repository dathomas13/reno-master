/**
 * The shapes the builder produces. They match ScenePrim/SceneDoc and Room/RoomDoc in
 * src/modules/viewer3d/houseScene.ts structurally; they are repeated here so this module
 * stays free of three.js and runs in a worker and in the plain-Node test fallback.
 */
export type Layer = 'KG' | 'EG' | 'OG' | 'DACH' | 'GAR';
export type PrimKind = 'wall' | 'slab' | 'roof' | 'glass' | 'door' | 'stair' | 'rail';
export type Confidence = 'A' | 'B' | 'C';

export interface BuiltPrim {
  layer: Layer;
  name: string;
  kind: PrimKind;
  tag: Confidence;
  tragend: boolean;
  v: number[];
  t: number[];
  bb: number[];
}

export interface BuiltScene {
  prims: BuiltPrim[];
  meta: {
    variant: string;
    version: string;
    generatedAt: string;
    note: string;
    house_w: number;
    house_d: number;
    ridge: number;
    source: string;
  };
}

export interface BuiltRoom {
  id: string;
  name: string;
  floor: 'KG' | 'EG' | 'OG' | 'GAR';
  rects: number[][];
  areaM2: number;
}

export interface BuiltRooms {
  variant: string;
  generatedAt: string;
  rooms: BuiltRoom[];
}
