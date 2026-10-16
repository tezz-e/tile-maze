import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--headless=new', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const mediaDir = path.resolve('docs/media');
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  // 1. Lobby Screenshot
  console.log('Navigating to lobby...');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  console.log('Capturing lobby screenshot...');
  await page.screenshot({ path: path.join(mediaDir, 'lobby.png') });
  console.log('Saved lobby.png');

  // 2. Capture each Level (index 0 to 3)
  for (let idx = 0; idx < 4; idx++) {
    const lvlNum = idx + 1;
    console.log(`Loading Level ${lvlNum} (index ${idx})...`);

    await page.goto('http://127.0.0.1:3000', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    // Click level tab
    const tabBtn = page.locator(`.level-tab-btn[data-index="${idx}"]`);
    await tabBtn.click();
    await page.waitForTimeout(500);

    // Click Play Keyboard button
    const playBtn = page.locator('#play-keyboard-btn');
    await playBtn.click();

    // Wait for fade curtain and 3D scene to fully render
    await page.waitForTimeout(3000);

    const outPath = path.join(mediaDir, `level-${lvlNum}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved level-${lvlNum}.png`);
  }

  await browser.close();
  console.log('All 5 screenshots captured successfully into docs/media/!');
}

main().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
