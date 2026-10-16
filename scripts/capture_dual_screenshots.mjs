import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  console.log('Starting local relay server for screenshot capture...');
  const serverProc = spawn('node', ['server/dist/index.js'], {
    stdio: 'pipe',
  });

  serverProc.stdout.on('data', (d) => {
    // Suppress verbose logs or print startup
    const msg = d.toString();
    if (msg.includes('listening')) console.log('[SERVER]', msg.trim());
  });
  serverProc.stderr.on('data', (d) => console.error('[SERVER ERR]', d.toString().trim()));

  const serverReady = await waitForServer('http://127.0.0.1:3000/api/info', 15000);
  if (!serverReady) {
    serverProc.kill();
    throw new Error('Failed to start server on port 3000 within 15 seconds.');
  }
  console.log('Server is online and responding.');

  const browser = await chromium.launch({
    channel: 'msedge',
    args: ['--headless=new', '--disable-gpu'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('PAGE ERR:', msg.text());
  });

  const mediaDir = path.resolve('docs/media');
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  try {
    // 1. Lobby Screenshot
    console.log('Navigating to lobby...');
    await page.goto('http://127.0.0.1:3000', { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    console.log('Capturing lobby screenshot...');
    await page.screenshot({ path: path.join(mediaDir, 'lobby.png') });
    console.log('Saved lobby.png');

    // 2. Capture each Level (index 0 to 3): start view and action view
    for (let idx = 0; idx < 4; idx++) {
      const lvlNum = idx + 1;
      console.log(`\n=== Loading Level ${lvlNum} (index ${idx}) ===`);

      await page.goto('http://127.0.0.1:3000', { waitUntil: 'load' });
      await page.waitForTimeout(1500);

      // Select level tab
      const tabBtn = page.locator(`.level-tab-btn[data-index="${idx}"]`);
      await tabBtn.click();
      await page.waitForTimeout(600);

      // Click Play Keyboard button
      const playBtn = page.locator('#play-keyboard-btn');
      await playBtn.click();

      // Wait for fade curtain and 3D scene to fully render
      await page.waitForTimeout(3000);

      // Capture Start View
      const startPath = path.join(mediaDir, `level-${lvlNum}-start.png`);
      await page.screenshot({ path: startPath });
      console.log(`Saved level-${lvlNum}-start.png`);

      // Also maintain legacy level-N.png pointing to start view
      const legacyPath = path.join(mediaDir, `level-${lvlNum}.png`);
      fs.copyFileSync(startPath, legacyPath);

      // Execute specific motion sequence per level to get marble in motion near ramp/spinner
      console.log(`Simulating dynamic gameplay for Level ${lvlNum} action view...`);
      if (idx === 0) {
        // Level 1: Boost straight forward over Ramp towards Turnstile Rotor
        await page.keyboard.down('ShiftLeft');
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(1200);
      } else if (idx === 1) {
        // Level 2: Steer right towards Ramp then north
        await page.keyboard.down('KeyD');
        await page.waitForTimeout(700);
        await page.keyboard.up('KeyD');
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(900);
      } else if (idx === 2) {
        // Level 3: Accelerate forward past rotor arm with nitro
        await page.keyboard.down('ShiftLeft');
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(1000);
      } else if (idx === 3) {
        // Level 4: Navigate night chicane
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(600);
        await page.keyboard.down('KeyD');
        await page.waitForTimeout(700);
      }

      // Capture Action View with marble at speed near obstacles
      const actionPath = path.join(mediaDir, `level-${lvlNum}-action.png`);
      await page.screenshot({ path: actionPath });
      console.log(`Saved level-${lvlNum}-action.png`);

      // Release any held keys
      await page.keyboard.up('KeyW');
      await page.keyboard.up('KeyA');
      await page.keyboard.up('KeyS');
      await page.keyboard.up('KeyD');
      await page.keyboard.up('ShiftLeft');
      await page.keyboard.up('Space');
    }
  } finally {
    await browser.close();
    serverProc.kill();
    console.log('\nAll screenshots captured successfully and server terminated.');
  }
}

main().catch((err) => {
  console.error('Fatal capture error:', err);
  process.exit(1);
});
