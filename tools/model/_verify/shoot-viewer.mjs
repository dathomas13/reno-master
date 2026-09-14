import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const shots = [
  ['Außen', 'view-aussen.png', null],
  ['EG-Grundriss', 'view-eg.png', null],
  ['OG-Grundriss', 'view-og.png', null],
  ['Außen', 'view-tragwaende.png', 'structural=1'],
];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
for (const [view, out, extra] of shots) {
  const url = `http://127.0.0.1:8899/tools/model/_verify/viewer.html?view=${encodeURIComponent(view)}${extra ? '&' + extra : ''}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `tools/model/_verify/${out}` });
  console.log(out, 'ok');
}
// tap in the middle of the EG floor plan to verify room picking
await page.goto(`http://127.0.0.1:8899/tools/model/_verify/viewer.html?view=${encodeURIComponent('EG-Grundriss')}`);
await page.waitForFunction(() => window.__ready === true);
await page.mouse.click(300, 480);
await page.waitForTimeout(300);
console.log('pick at (300,480):', await page.evaluate(() => window.__lastPick));
await page.mouse.click(620, 300);
await page.waitForTimeout(300);
console.log('pick at (620,300):', await page.evaluate(() => window.__lastPick));
console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no console errors');
await browser.close();
