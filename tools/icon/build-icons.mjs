/**
 * Renders the app icon from tools/icon/icon.svg into every size the app needs.
 *
 *   node tools/icon/build-icons.mjs
 *
 * Needs a Chromium and Playwright on the machine - that is why the results are
 * committed: the CI build only copies the PNGs, it never renders them.
 *
 * Three shapes come out of the same drawing:
 *   web       the PWA icons, mark on the dark ground
 *   maskable  the same with a wide margin, because Android crops it to its own shape
 *   fore      only the mark on transparency, for the Android adaptive icon
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const root = process.cwd();
const svg = fs.readFileSync(path.join(root, 'tools/icon/icon.svg'), 'utf8');
const BACKGROUND = '#1d2126';

/** how much of the canvas the drawing fills, per shape */
const SCALE = { web: 0.86, maskable: 0.64, fore: 0.6 };

const TARGETS = [
  { file: 'public/img/icon-192.png', size: 192, shape: 'web' },
  { file: 'public/img/icon-512.png', size: 512, shape: 'web' },
  { file: 'public/img/icon-maskable.png', size: 512, shape: 'maskable' },
  // Android launcher, one file per screen density
  ...[48, 72, 96, 144, 192].map((size, i) => ({
    file: `tools/icon/android/ic_launcher-${['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'][i]}.png`,
    size,
    shape: 'web',
    rounded: size * 0.22,
  })),
  ...[48, 72, 96, 144, 192].map((size, i) => ({
    file: `tools/icon/android/ic_launcher_round-${['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'][i]}.png`,
    size,
    shape: 'web',
    rounded: size / 2,
  })),
  // the adaptive icon is 108dp wide, the launcher crops it to its own shape
  ...[108, 162, 216, 324, 432].map((size, i) => ({
    file: `tools/icon/android/ic_launcher_foreground-${['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'][i]}.png`,
    size,
    shape: 'fore',
  })),
];

function page({ size, shape, rounded = 0 }) {
  const scale = SCALE[shape];
  const ground = shape === 'fore' ? 'transparent' : BACKGROUND;
  return `<!doctype html><meta charset="utf-8">
<style>
  html, body { margin: 0; background: transparent; }
  .icon {
    width: ${size}px; height: ${size}px;
    background: ${ground};
    border-radius: ${rounded}px;
    display: grid; place-items: center;
    overflow: hidden;
  }
  .icon svg { width: ${size * scale}px; height: ${size * scale}px; display: block; }
</style>
<div class="icon">${svg}</div>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const tab = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });

for (const target of TARGETS) {
  await tab.setContent(page(target));
  const element = await tab.$('.icon');
  const full = path.join(root, target.file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  await element.screenshot({ path: full, omitBackground: true });
  console.log(`  ${target.file}  ${target.size}px`);
}

await browser.close();
