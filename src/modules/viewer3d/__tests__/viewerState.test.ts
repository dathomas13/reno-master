import { describe, expect, it } from 'vitest';
import {
  forgetViewerState,
  lastViewerState,
  parseViewerState,
  rememberViewerState,
  type ViewerState,
} from '@/modules/viewer3d/viewerState';

const good: ViewerState = {
  camera: { theta: 0.8, phi: 1.1, distance: 42, target: [0, 1.5, -2] },
  layers: { KG: false, EG: true, OG: true, DACH: false, GAR: true },
  structural: true,
  showRooms: true,
  viewLabel: 'OG-Grundriss',
  roomId: 'og.bad',
};

describe('parseViewerState', () => {
  it('lets a complete state through unchanged', () => {
    expect(parseViewerState(good)).toEqual(good);
  });

  it('survives the trip through JSON', () => {
    expect(parseViewerState(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it('refuses anything that would put the camera nowhere', () => {
    expect(parseViewerState(null)).toBeNull();
    expect(parseViewerState('kaputt')).toBeNull();
    expect(parseViewerState({})).toBeNull();
    expect(parseViewerState({ ...good, camera: { ...good.camera, theta: Number.NaN } })).toBeNull();
    expect(parseViewerState({ ...good, camera: { ...good.camera, distance: 0 } })).toBeNull();
    expect(parseViewerState({ ...good, camera: { ...good.camera, target: [0, 1] } })).toBeNull();
    expect(parseViewerState({ ...good, camera: { ...good.camera, target: [0, 1, 'x'] } })).toBeNull();
  });

  it('fills in what an older version did not store', () => {
    const older = parseViewerState({ camera: good.camera });
    expect(older?.layers).toEqual({ KG: true, EG: true, OG: true, DACH: true, GAR: true });
    expect(older?.structural).toBe(false);
    expect(older?.showRooms).toBe(false);
    expect(older?.viewLabel).toBe('');
    expect(older?.roomId).toBeUndefined();
  });

  it('does not take an empty room as a selection', () => {
    expect(parseViewerState({ ...good, roomId: '' })?.roomId).toBeUndefined();
  });
});

describe('remember and recall', () => {
  it('hands back what was put in', () => {
    forgetViewerState();
    expect(lastViewerState()).toBeNull();
    rememberViewerState(good);
    expect(lastViewerState()).toEqual(good);
  });

  it('keeps the last good view when a broken one comes along', () => {
    forgetViewerState();
    rememberViewerState(good);
    rememberViewerState({ ...good, camera: { ...good.camera, phi: Number.POSITIVE_INFINITY } });
    expect(lastViewerState()).toEqual(good);
  });

  it('forgets on demand', () => {
    rememberViewerState(good);
    forgetViewerState();
    expect(lastViewerState()).toBeNull();
  });
});
