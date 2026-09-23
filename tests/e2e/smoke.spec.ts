import { test, expect } from '@playwright/test';

/**
 * Smoke test without a Firebase project: the shell must boot, show the login and
 * serve the model files. Everything behind the login is covered by the emulator suite
 * (see README, "Tests").
 */
test('the app boots and asks for a login', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  await page.goto('/reno-master/');
  await expect(page.getByRole('heading', { name: 'Reno Master' })).toBeVisible();
  await expect(page.getByLabel('E-Mail')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the model files are served and are complete', async ({ request }) => {
  const manifest = await request.get('/reno-master/models/manifest.json');
  expect(manifest.ok()).toBeTruthy();
  const info = (await manifest.json()) as Record<string, { version: string }>;
  expect(info.ist?.version).toBeTruthy();

  const scene = await request.get('/reno-master/models/ist.json');
  const doc = (await scene.json()) as { prims: unknown[] };
  expect(doc.prims.length).toBeGreaterThan(100);

  const rooms = await request.get('/reno-master/models/rooms-ist.json');
  const roomDoc = (await rooms.json()) as { rooms: { id: string }[] };
  expect(roomDoc.rooms.length).toBeGreaterThan(30);

  // every Ist room has a Soll counterpart - the mapping that lets Planung naming
  // aggregate old entries (Heizung, Öllager) under a merged room (Technikraum)
  const roomMap = await request.get('/reno-master/models/room-map.json');
  expect(roomMap.ok()).toBeTruthy();
  const mapDoc = (await roomMap.json()) as { map: Record<string, string> };
  for (const room of roomDoc.rooms) expect(mapDoc.map[room.id]).toBeTruthy();
});

test('the generated floor plans carry tappable rooms', async ({ request }) => {
  const response = await request.get('/reno-master/plans/ist-EG.svg');
  expect(response.ok()).toBeTruthy();
  const svg = await response.text();
  expect(svg).toContain('data-room-id="eg-wohnzimmer"');
});
