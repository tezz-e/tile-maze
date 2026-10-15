import QRCode from 'qrcode';
import type { LevelDef } from '../levels/LevelData.js';
import { LEVELS } from '../levels/LevelData.js';

export interface LobbyCallbacks {
  onStartGame: (selectedLevel: LevelDef) => void;
  onPlayKeyboard: (selectedLevel: LevelDef) => void;
  onOpenTelemetryLab: () => void;
}

interface LedDotState {
  val: number;
  target: number;
  duration: number;
  elapsed: number;
  isRed: boolean;
  redDuration: number;
  redElapsed: number;
  mult: number;
  multVel: number;
}

export class LobbyUI {
  private container: HTMLElement;
  private callbacks: LobbyCallbacks;
  private roomCodeElement!: HTMLElement;
  private qrCanvas!: HTMLCanvasElement;
  private p1StatusElement!: HTMLElement;
  private p2StatusElement!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private selectedLevelIndex = 0;
  private hasPlayer1 = false;

  // LedGrid canvas elements
  private ledCanvas: HTMLCanvasElement | null = null;
  private ledCtx: CanvasRenderingContext2D | null = null;
  private ledAnimFrame: number | null = null;
  private dotsState: LedDotState[] = [];
  private ledLastTime = performance.now();
  private ledMouse = { x: -1000, y: -1000, active: false };
  private currentLanIp = 'localhost';
  private currentPort = 3000;
  private currentRoomCode = '----';

  private readonly LED_COLS = 44;
  private readonly LED_ROWS = 6;
  private readonly LED_DOT_SIZE = 6;
  private readonly LED_GAP = 3;

  constructor(parent: HTMLElement, callbacks: LobbyCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.id = 'lobby-modal';
    this.container.className = 'interactive';
    this.buildDOM();
    parent.appendChild(this.container);

    this.initLedGrid();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <style>
        #lobby-modal {
          position: absolute;
          inset: 0;
          background-color: #000000;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 255, 255, 0.015) 2px, rgba(255, 255, 255, 0.015) 4px);
          background-size: 32px 32px, 32px 32px, 100% 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 1.5rem;
          color: #ffffff;
          font-family: var(--font-mono);
          box-sizing: border-box;
        }

        .lobby-panel {
          position: relative;
          background: #080808;
          border: 1px solid #ffffff;
          box-shadow: 0 0 0 1px #000000, 0 30px 60px rgba(0, 0, 0, 0.95);
          max-width: 820px;
          width: 100%;
          padding: 1.75rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          box-sizing: border-box;
        }

        /* Tactical corner crosshairs */
        .corner-mark {
          position: absolute;
          width: 9px;
          height: 9px;
          color: #EA3323;
          font-family: var(--font-mono);
          font-size: 11px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .corner-tl { top: -6px; left: -6px; }
        .corner-tr { top: -6px; right: -6px; }
        .corner-bl { bottom: -6px; left: -6px; }
        .corner-br { bottom: -6px; right: -6px; }

        .lobby-meta-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #222222;
          padding-bottom: 0.6rem;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #888888;
        }
        .lobby-meta-bar span.accent {
          color: #EA3323;
          font-weight: 700;
        }

        .lobby-header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1.5rem;
        }
        .lobby-title-area h1 {
          font-size: 2.2rem;
          font-weight: 700;
          letter-spacing: -0.05em;
          text-transform: uppercase;
          margin: 0;
          color: #ffffff;
          line-height: 1;
        }
        .lobby-title-area p {
          color: #888888;
          margin-top: 0.4rem;
          font-size: 0.8rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        /* Embedded LedGrid canvas */
        .led-grid-wrap {
          border: 1px solid #222222;
          background: #000000;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          align-self: center;
        }
        #lobby-led-canvas {
          display: block;
          image-rendering: pixelated;
        }

        .lobby-grid {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 1.5rem;
          align-items: stretch;
        }
        @media (max-width: 680px) {
          .lobby-grid { grid-template-columns: 1fr; }
        }

        /* QR Bay */
        .qr-card {
          background: #000000;
          border: 1px solid #222222;
          padding: 1.1rem 1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          position: relative;
        }
        .section-label {
          font-size: 0.72rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #888888;
          margin-bottom: 0.6rem;
          width: 100%;
          text-align: left;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .room-code-tag {
          font-family: var(--font-mono);
          font-size: 1.3rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          white-space: nowrap;
          color: #ffffff;
          background: #000000;
          padding: 0.5rem 0.5rem;
          margin: 0.2rem 0 0.8rem 0;
          border: 1px solid #ffffff;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .room-code-tag .bracket {
          color: #EA3323;
          margin: 0 0.3rem;
          font-weight: 700;
        }
        .qr-canvas-wrap {
          border: 1px solid #ffffff;
          background: #ffffff;
          padding: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .qr-canvas {
          display: block;
        }
        .qr-instructions {
          font-size: 0.72rem;
          letter-spacing: 0.05em;
          color: #888888;
          margin-top: 0.6rem;
          text-transform: uppercase;
        }

        /* Info & Slots Bay */
        .slots-card {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .player-slot-chip {
          background: #000000;
          border: 1px solid #222222;
          padding: 0.8rem 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: border-color 0.15s;
        }
        .player-slot-chip.connected {
          border-color: #ffffff;
        }
        .slot-title {
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #ffffff;
        }
        .slot-subtitle {
          font-size: 0.72rem;
          color: #888888;
          letter-spacing: 0.03em;
          margin-top: 2px;
          text-transform: uppercase;
        }
        .status-badge {
          font-size: 0.75rem;
          font-family: var(--font-mono);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 0.35rem 0.75rem;
          border: 1px solid currentColor;
          box-sizing: border-box;
        }
        .status-waiting {
          color: #888888;
          border-color: #333333;
          background: #111111;
        }
        .status-connected {
          color: #ffffff;
          background: #EA3323;
          border-color: #EA3323;
        }
        .status-recon {
          color: #000000;
          background: #ffffff;
          border-color: #ffffff;
        }

        /* Level Selector */
        .level-selector {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .level-tabs {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.5rem;
        }
        .level-tab-btn {
          background: #000000;
          border: 1px solid #333333;
          color: #888888;
          padding: 0.65rem 0.4rem;
          cursor: pointer;
          font-size: 0.75rem;
          font-family: var(--font-mono);
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          text-align: center;
          transition: all 0.12s;
        }
        .level-tab-btn:hover {
          color: #ffffff;
          border-color: #ffffff;
        }
        .level-tab-btn.active {
          background: #ffffff;
          border-color: #ffffff;
          color: #000000;
        }

        /* Action Buttons */
        .actions-row {
          display: flex;
          gap: 0.75rem;
          margin-top: 0.25rem;
          border-top: 1px solid #222222;
          padding-top: 1.25rem;
        }
        .btn-launch {
          flex: 1.3;
          background: #ffffff;
          color: #000000;
          border: 2px solid #ffffff;
          padding: 0.85rem 1rem;
          font-family: var(--font-mono);
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s;
        }
        .btn-launch:hover:not(:disabled) {
          background: #EA3323;
          border-color: #EA3323;
          color: #ffffff;
        }
        .btn-launch:disabled {
          background: #111111;
          border-color: #222222;
          color: #444444;
          cursor: not-allowed;
        }
        .btn-kbd {
          flex: 1;
          background: transparent;
          color: #ffffff;
          border: 1px solid #ffffff;
          padding: 0.85rem 1rem;
          font-family: var(--font-mono);
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s;
        }
        .btn-kbd:hover {
          background: #ffffff;
          color: #000000;
        }
        .btn-telemetry {
          background: transparent;
          color: #888888;
          border: 1px solid #333333;
          padding: 0.85rem 1.1rem;
          font-family: var(--font-mono);
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          cursor: pointer;
          text-align: center;
          transition: all 0.15s;
        }
        .btn-telemetry:hover {
          color: #ffffff;
          border-color: #ffffff;
        }
      </style>

      <div class="lobby-panel">
        <div class="corner-mark corner-tl">+</div>
        <div class="corner-mark corner-tr">+</div>
        <div class="corner-mark corner-bl">+</div>
        <div class="corner-mark corner-br">+</div>

        <div class="lobby-meta-bar">
          <div>[ SYS // HARNESS_ONLINE ] <span class="accent">100HZ STREAM</span></div>
          <div>NOTHING PHONE (3) • 25×25 GLYPH MATRIX</div>
        </div>

        <div class="lobby-header-row">
          <div class="lobby-title-area">
            <h1>TILTMAZE</h1>
            <p>Physical Motion Controller // Low-Latency Kinetic Relay</p>
          </div>
          <div class="led-grid-wrap">
            <canvas id="lobby-led-canvas"></canvas>
          </div>
        </div>

        <div class="lobby-grid">
          <div class="qr-card">
            <div class="section-label">
              <span>PAIRING CODE</span>
              <span style="color: #EA3323;">01 // QR</span>
            </div>
            <div id="room-code-display" class="room-code-tag">
              <span class="bracket">[</span>
              <span id="room-code-letters">----</span>
              <span class="bracket">]</span>
            </div>
            <div class="qr-canvas-wrap">
              <canvas id="qr-code-canvas" class="qr-canvas" width="160" height="160"></canvas>
            </div>
            <div class="qr-instructions">
              SCAN WITH PHONE ON LOCAL WI-FI
            </div>
          </div>

          <div class="slots-card">
            <div class="player-slot-chip" id="p1-slot-chip">
              <div>
                <div class="slot-title">SLOT 01 // PRIMARY CONTROLLER</div>
                <div class="slot-subtitle">NOTHING PHONE 3 (NATIVE IMU + GLYPHS)</div>
              </div>
              <span id="p1-status" class="status-badge status-waiting">[ STANDBY ]</span>
            </div>

            <div class="player-slot-chip" id="p2-slot-chip">
              <div>
                <div class="slot-title">SLOT 02 // SPECTATOR / CO-OP</div>
                <div class="slot-subtitle">OPTIONAL SECONDARY TELEMETRY LINK</div>
              </div>
              <span id="p2-status" class="status-badge status-waiting">[ OPEN ]</span>
            </div>

            <div class="level-selector">
              <div class="section-label">
                <span>SECTOR SELECTION</span>
                <span id="level-selected-name" style="color: #ffffff;">01 // SKY HIGHWAY</span>
              </div>
              <div class="level-tabs">
                ${LEVELS.map(
                  (l, idx) => `
                  <button class="level-tab-btn ${idx === 0 ? 'active' : ''}" data-index="${idx}" data-name="${l.name}">
                    [ 0${l.id} ]
                  </button>
                `
                ).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="actions-row">
          <button id="start-game-btn" class="btn-launch" disabled>[ LAUNCH // PHONE ]</button>
          <button id="play-keyboard-btn" class="btn-kbd">[ KEYBOARD // WASD ]</button>
          <button id="telemetry-lab-btn" class="btn-telemetry">[ TELEMETRY // F3 ]</button>
        </div>
      </div>
    `;

    this.roomCodeElement = this.container.querySelector('#room-code-letters')!;
    this.qrCanvas = this.container.querySelector('#qr-code-canvas')!;
    this.p1StatusElement = this.container.querySelector('#p1-status')!;
    this.p2StatusElement = this.container.querySelector('#p2-status')!;
    this.startBtn = this.container.querySelector('#start-game-btn')!;

    // Level tab selection
    const levelButtons = this.container.querySelectorAll('.level-tab-btn');
    const levelNameLabel = this.container.querySelector('#level-selected-name')!;
    levelButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        levelButtons.forEach((b) => b.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        this.selectedLevelIndex = parseInt(target.dataset.index || '0', 10);
        if (levelNameLabel && target.dataset.name) {
          levelNameLabel.textContent = `0${this.selectedLevelIndex + 1} // ${target.dataset.name.toUpperCase()}`;
        }
      });
    });

    // Start with Phone
    this.startBtn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onStartGame(LEVELS[this.selectedLevelIndex]);
    });

    // Play with Keyboard
    const kbBtn = this.container.querySelector('#play-keyboard-btn')!;
    kbBtn.addEventListener('click', () => {
      this.hide();
      this.callbacks.onPlayKeyboard(LEVELS[this.selectedLevelIndex]);
    });

    // Telemetry Lab
    const labBtn = this.container.querySelector('#telemetry-lab-btn')!;
    labBtn.addEventListener('click', () => {
      this.callbacks.onOpenTelemetryLab();
    });
  }

  /**
   * Authentic Nothing OS / Glyph Odyssey 2D LED Grid Canvas
   * Replicates LedGrid.tsx with noise targets, mouse interaction springs, and red spikes.
   */
  private initLedGrid(): void {
    const canvas = this.container.querySelector('#lobby-led-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    this.ledCanvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    this.ledCtx = ctx;

    const totalWidth = this.LED_COLS * this.LED_DOT_SIZE + (this.LED_COLS - 1) * this.LED_GAP;
    const totalHeight = this.LED_ROWS * this.LED_DOT_SIZE + (this.LED_ROWS - 1) * this.LED_GAP;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${totalHeight}px`;
    ctx.scale(dpr, dpr);

    const totalCells = this.LED_COLS * this.LED_ROWS;
    this.dotsState = Array.from({ length: totalCells }, () => ({
      val: Math.random() * 0.8,
      target: Math.random() * 0.8,
      duration: 300 + Math.random() * 500,
      elapsed: Math.random() * 800,
      isRed: false,
      redDuration: 0,
      redElapsed: 0,
      mult: 1.0,
      multVel: 0,
    }));

    const handleMouseMove = (e: MouseEvent) => {
      this.ledMouse.x = e.clientX;
      this.ledMouse.y = e.clientY;
      this.ledMouse.active = true;
    };
    const handleMouseLeave = () => {
      this.ledMouse.active = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    this.startLedLoop();
  }

  private startLedLoop(): void {
    if (this.ledAnimFrame) cancelAnimationFrame(this.ledAnimFrame);
    this.ledLastTime = performance.now();

    const loop = (now: number) => {
      if (!this.ledCtx || !this.ledCanvas) return;
      const dt = now - this.ledLastTime;
      this.ledLastTime = now;
      const dtSec = Math.min(dt / 1000, 0.1);

      const totalWidth = this.LED_COLS * this.LED_DOT_SIZE + (this.LED_COLS - 1) * this.LED_GAP;
      const totalHeight = this.LED_ROWS * this.LED_DOT_SIZE + (this.LED_ROWS - 1) * this.LED_GAP;
      const rect = this.ledCanvas.getBoundingClientRect();

      this.ledCtx.fillStyle = '#000000';
      this.ledCtx.fillRect(0, 0, totalWidth, totalHeight);

      const omega = (2 * Math.PI) / 0.4;
      const k = omega * omega;
      const c = 2 * omega;

      const totalCells = this.LED_COLS * this.LED_ROWS;
      for (let i = 0; i < totalCells; i++) {
        const row = Math.floor(i / this.LED_COLS);
        const col = i % this.LED_COLS;
        const rectX = col * (this.LED_DOT_SIZE + this.LED_GAP);
        const rectY = row * (this.LED_DOT_SIZE + this.LED_GAP);
        const dotCenterX = rect.left + rectX + this.LED_DOT_SIZE / 2;
        const dotCenterY = rect.top + rectY + this.LED_DOT_SIZE / 2;

        const ds = this.dotsState[i];

        // 1. Grayscale noise target
        ds.elapsed += dt;
        if (ds.elapsed >= ds.duration) {
          ds.elapsed = 0;
          ds.val = ds.target;
          const rand = Math.random();
          if (rand < 0.5) {
            ds.target = 0.05 + Math.random() * 0.1; // Dark dots
          } else if (rand < 0.85) {
            ds.target = 0.7 + Math.random() * 0.3; // Crisp white
          } else {
            ds.target = 0.3 + Math.random() * 0.3; // Muted gray
          }
          ds.duration = 250 + Math.random() * 450;
        }

        // 2. Independent red spikes (#EA3323)
        if (!ds.isRed) {
          if (Math.random() < 0.1 * dtSec) {
            ds.isRed = true;
            ds.redElapsed = 0;
            ds.redDuration = 180 + Math.random() * 150;
          }
        } else {
          ds.redElapsed += dt;
          if (ds.redElapsed >= ds.redDuration) {
            ds.isRed = false;
          }
        }

        const progress = ds.elapsed / ds.duration;
        const currentVal = ds.val + (ds.target - ds.val) * progress;

        // 3. Mouse hover spring
        let targetMult = 1.0;
        if (this.ledMouse.active) {
          const dist = Math.hypot(dotCenterX - this.ledMouse.x, dotCenterY - this.ledMouse.y);
          if (dist < 70) {
            targetMult = 2.4;
          }
        }

        const force = -k * (ds.mult - targetMult) - c * ds.multVel;
        ds.multVel += force * dtSec;
        ds.mult += ds.multVel * dtSec;
        ds.mult = Math.max(1.0, ds.mult);

        const finalVal = Math.min(1.0, currentVal * ds.mult);

        // 4. Draw Dot
        if (ds.isRed) {
          const r = Math.round(234 * finalVal);
          const g = Math.round(51 * finalVal);
          const b = Math.round(35 * finalVal);
          this.ledCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        } else {
          const gray = Math.round(255 * finalVal);
          this.ledCtx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
        }

        this.ledCtx.fillRect(rectX, rectY, this.LED_DOT_SIZE, this.LED_DOT_SIZE);
      }

      this.ledAnimFrame = requestAnimationFrame(loop);
    };

    this.ledAnimFrame = requestAnimationFrame(loop);
  }

  private animateDecryptedText(targetText: string): void {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let iteration = 0;
    const interval = setInterval(() => {
      this.roomCodeElement.textContent = targetText
        .split('')
        .map((letter, index) => {
          if (index < iteration) {
            return targetText[index];
          }
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join(' · ');
      if (iteration >= targetText.length) {
        clearInterval(interval);
      }
      iteration += 1 / 2;
    }, 40);
  }

  public setRoomInfo(roomCode: string, lanIp: string, port: number): void {
    this.currentRoomCode = roomCode;
    this.currentLanIp = lanIp;
    this.currentPort = port;

    this.animateDecryptedText(roomCode);

    // Payload formatted for phone scanner:
    const payload = JSON.stringify({
      wsUrl: `ws://${lanIp}:${port}`,
      roomCode,
    });

    QRCode.toCanvas(
      this.qrCanvas,
      payload,
      {
        width: 160,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      },
      (error) => {
        if (error) console.error('[QR Error]', error);
      }
    );
  }

  public updatePlayerStatus(slot: number, status: 'connected' | 'waiting' | 'reconnecting', name?: string): void {
    const el = slot === 1 ? this.p1StatusElement : this.p2StatusElement;
    const chip = this.container.querySelector(slot === 1 ? '#p1-slot-chip' : '#p2-slot-chip') as HTMLElement;
    if (!el) return;

    el.className = 'status-badge';
    if (status === 'connected') {
      el.classList.add('status-connected');
      el.textContent = name ? `[ ${name.toUpperCase()} ]` : '[ ONLINE 100HZ ]';
      if (chip) chip.classList.add('connected');
      if (slot === 1) {
        this.hasPlayer1 = true;
        this.startBtn.disabled = false;
        this.startBtn.textContent = '[ LAUNCH ENGINE // COMMENCE ]';
      }
    } else if (status === 'reconnecting') {
      el.classList.add('status-recon');
      el.textContent = '[ RECONNECTING... ]';
      if (chip) chip.classList.remove('connected');
    } else {
      el.classList.add('status-waiting');
      el.textContent = slot === 1 ? '[ STANDBY ]' : '[ OPEN ]';
      if (chip) chip.classList.remove('connected');
      if (slot === 1) {
        this.hasPlayer1 = false;
        this.startBtn.disabled = true;
        this.startBtn.textContent = '[ LAUNCH ENGINE // PHONE READY ]';
      }
    }
  }

  public show(): void {
    this.container.style.display = 'flex';
    this.startLedLoop();
  }

  public hide(): void {
    this.container.style.display = 'none';
    if (this.ledAnimFrame) {
      cancelAnimationFrame(this.ledAnimFrame);
      this.ledAnimFrame = null;
    }
  }
}
