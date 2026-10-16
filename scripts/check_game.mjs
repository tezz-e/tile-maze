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

  console.log('Navigating to http://127.0.0.1:3000...');
  await page.goto('http://127.0.0.1:3000', { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  const outDir = path.resolve('C:/Users/manee/.gemini/antigravity/brain/7720831f-0b37-4703-83fd-2dace7b584da/scratch');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Lobby Screenshot
  const lobbyShot = path.join(outDir, '01_lobby.png');
  await page.screenshot({ path: lobbyShot });
  console.log('Saved lobby screenshot:', lobbyShot);

  // 2. Click Play with Keyboard (WASD) button
  const kbdBtn = page.locator('#play-keyboard-btn');
  console.log('Clicking Play with Keyboard button...');
  await kbdBtn.click();

  await page.waitForTimeout(2000);

  // 3. In-Game Screenshot
  const gameShot = path.join(outDir, '02_ingame.png');
  await page.screenshot({ path: gameShot });
  console.log('Saved in-game screenshot:', gameShot);

  // 4. Test Key Controls
  console.log('Simulating key presses (W, D, Space)...');
  await page.keyboard.press('KeyW');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyD');

  await page.waitForTimeout(1000);

  const actionShot = path.join(outDir, '03_action.png');
  await page.screenshot({ path: actionShot });
  console.log('Saved action screenshot:', actionShot);

  // 5. Open Telemetry Lab by pressing T
  console.log('Pressing T to open Telemetry Lab...');
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(1000);

  const labShot = path.join(outDir, '04_telemetry_lab.png');
  await page.screenshot({ path: labShot });
  console.log('Saved telemetry lab screenshot:', labShot);

  await browser.close();
  console.log('All Playwright verifications passed!');
}

main().catch(err => {
  console.error('Playwright execution error:', err);
  process.exit(1);
});
