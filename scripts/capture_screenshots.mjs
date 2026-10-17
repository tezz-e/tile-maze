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

  // Set unlock all in localStorage
  await page.addInitScript(() => {
    localStorage.setItem('tiltmaze_unlock_all', 'true');
  });

  // 1. Lobby Screenshot
  console.log('Navigating to lobby...');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  console.log('Capturing lobby screenshot...');
  await page.screenshot({ path: path.join(mediaDir, 'lobby.png') });
  console.log('Saved lobby.png');

  // 2. Capture each Level (index 0 to 5 for all 6 campaign courses)
  for (let idx = 0; idx < 6; idx++) {
    const lvlNum = idx + 1;
    console.log(`Loading Level ${lvlNum} (index ${idx})...`);

    await page.goto('http://127.0.0.1:3000', { waitUntil: 'load' });
    await page.waitForTimeout(800);

    // Select course and click play keyboard directly
    const courseName = await page.evaluate((courseIdx) => {
      const track = document.getElementById('course-segmented-track');
      if (track) {
        const rect = track.getBoundingClientRect();
        const clientX = rect.left + ((courseIdx + 0.5) / 6) * rect.width;
        const clientY = rect.top + rect.height / 2;
        track.dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY, bubbles: true }));
        track.dispatchEvent(new PointerEvent('pointerup', { clientX, clientY, bubbles: true }));
      }
      const name = document.getElementById('course-selected-name')?.innerText || `Level ${courseIdx + 1}`;
      document.getElementById('play-keyboard-btn')?.click();
      return name;
    }, idx);

    console.log(`Launched ${courseName}`);

    // Wait for fade curtain and 3D scene to fully render
    await page.waitForTimeout(1500);

    const outPath = path.join(mediaDir, `level-${lvlNum}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved level-${lvlNum}.png`);
  }

  await browser.close();
  console.log('All 6 course screenshots + lobby captured successfully into docs/media/!');
}

main().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
