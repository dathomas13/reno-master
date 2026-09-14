import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const shots = [
  [192, 0.1, 'public/img/icon-192.png'],
  [512, 0.1, 'public/img/icon-512.png'],
  [512, 0.3, 'public/img/icon-maskable.png'],  // 30% padding keeps the art inside the safe zone
];
const browser = await chromium.launch();
for (const [size, pad, out] of shots) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:8899/tools/model/_verify/icon.html?size=${size}&pad=${pad}`);
  await page.waitForTimeout(200);
  await page.locator('#box').screenshot({ path: out });
  console.log(out, size + 'px');
  await page.close();
}
await browser.close();
