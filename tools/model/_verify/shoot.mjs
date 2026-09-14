import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const targets = process.argv.slice(2);
const browser = await chromium.launch();
for (const t of targets) {
  const [file, out, w, h] = t.split('|');
  const page = await browser.newPage({ viewport: { width: +(w||1200), height: +(h||1100) }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('file://' + fs.realpathSync(file));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out });
  console.log(out, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ok');
  await page.close();
}
await browser.close();
