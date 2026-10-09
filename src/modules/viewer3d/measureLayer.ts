/**
 * What the tape measure draws into the scene: the two end points, the line between
 * them and the cursor that shows where the next point would land.
 *
 * Everything keeps its size on screen and stays visible through walls - a point on the
 * far side of the house is still a point. The part of the line hidden behind the model
 * is drawn faint, the visible part bright, so it is clear what lies in front.
 */
import type * as THREE_NS from 'three';
import type { ThreeNamespace } from './houseScene';

const POINT_COLOR = 0xc9a86a;
const SNAP_COLOR = 0xffffff;
const POINT_PX = 14;
const CURSOR_PX = 18;

export interface MeasureLayer {
  /** the placed points in world coordinates; null where none is set */
  setPoints(a: THREE_NS.Vector3 | null, b: THREE_NS.Vector3 | null): void;
  /** the point the next tap or click would set; `snapped` when it sits on a corner */
  setCursor(point: THREE_NS.Vector3 | null, snapped: boolean): void;
  dispose(): void;
}

/** a round point sprite, drawn once */
function discTexture(THREE: ThreeNamespace): THREE_NS.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.beginPath();
  ctx.arc(32, 32, 26, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1d2126';
  ctx.stroke();
  return new THREE.CanvasTexture(canvas);
}

export function createMeasureLayer(THREE: ThreeNamespace, scene: THREE_NS.Scene): MeasureLayer {
  const group = new THREE.Group();
  group.name = 'measure';
  scene.add(group);
  const texture = discTexture(THREE);

  // with sizeAttenuation off the size is in CSS pixels - three multiplies in the pixel ratio
  const pointMaterial = (color: number, size: number) =>
    new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: false,
      map: texture,
      transparent: true,
      alphaTest: 0.5,
      depthTest: false,
      depthWrite: false,
    });

  const endsGeometry = new THREE.BufferGeometry();
  endsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const endsMaterial = pointMaterial(POINT_COLOR, POINT_PX);
  const ends = new THREE.Points(endsGeometry, endsMaterial);
  ends.renderOrder = 1002;
  ends.frustumCulled = false;

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const frontMaterial = new THREE.LineBasicMaterial({ color: POINT_COLOR });
  const hiddenMaterial = new THREE.LineBasicMaterial({
    color: POINT_COLOR,
    transparent: true,
    opacity: 0.4,
    depthTest: false,
    depthWrite: false,
  });
  const front = new THREE.Line(lineGeometry, frontMaterial);
  const hidden = new THREE.Line(lineGeometry, hiddenMaterial);
  front.renderOrder = 1001;
  hidden.renderOrder = 1000;
  front.frustumCulled = hidden.frustumCulled = false;

  const cursorGeometry = new THREE.BufferGeometry();
  cursorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3), 3));
  const cursorMaterial = pointMaterial(POINT_COLOR, CURSOR_PX);
  const cursor = new THREE.Points(cursorGeometry, cursorMaterial);
  cursor.renderOrder = 1003;
  cursor.frustumCulled = false;
  cursor.visible = false;

  group.add(hidden, front, ends, cursor);

  const write = (geometry: THREE_NS.BufferGeometry, points: THREE_NS.Vector3[]) => {
    const attribute = geometry.getAttribute('position') as THREE_NS.BufferAttribute;
    points.forEach((point, index) => attribute.setXYZ(index, point.x, point.y, point.z));
    attribute.needsUpdate = true;
    geometry.setDrawRange(0, points.length);
  };

  const layer: MeasureLayer = {
    setPoints(a, b) {
      const set = [a, b].filter((point): point is THREE_NS.Vector3 => !!point);
      write(endsGeometry, set);
      ends.visible = set.length > 0;
      if (a && b) write(lineGeometry, [a, b]);
      front.visible = hidden.visible = !!(a && b);
    },
    setCursor(point, snapped) {
      cursor.visible = !!point;
      if (!point) return;
      write(cursorGeometry, [point]);
      cursorMaterial.color.setHex(snapped ? SNAP_COLOR : POINT_COLOR);
    },
    dispose() {
      scene.remove(group);
      for (const item of [endsGeometry, lineGeometry, cursorGeometry, endsMaterial, cursorMaterial, frontMaterial, hiddenMaterial]) {
        item.dispose();
      }
      texture?.dispose();
    },
  };
  layer.setPoints(null, null);
  return layer;
}
