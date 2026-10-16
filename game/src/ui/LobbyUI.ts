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

  // Gooey mercury active pill indicator
  private gooeyPill!: HTMLElement;

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
    this.initSpotlight();
    this.initCardTilts();
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <!-- Skiper UI skiper46 SVG Gooey Mercury Filter Definition -->
      <svg style="position: absolute; width: 0; height: 0; pointer-events: none;">
        <defs>
          <filter id="mercury-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -8" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <style>
        #lobby-modal {
          position: absolute;
          inset: 0;
          background: #000000;
          background-image: 
            radial-gradient(550px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(234, 51, 35, 0.08), rgba(255, 255, 255, 0.03) 30%, transparent 60%),
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 100% 100%, 32px 32px, 32px 32px;
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

        /* Glass Surface Chassis with Magic UI Border Beam */
        .glass-chassis {
          position: relative;
          background: rgba(10, 10, 14, 0.78);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.22),
            0 35px 80px rgba(0, 0, 0, 0.85);
          max-width: 820px;
          width: 100%;
          padding: 1.75rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          box-sizing: border-box;
          overflow: hidden;
        }

        /* Magic UI Border Beam: 1.5px perimeter highlight */
        .glass-chassis::before {
          content: '';
          position: absolute;
          inset: -1.5px;
          padding: 1.5px;
          background: conic-gradient(from var(--beam-angle, 0deg), transparent 75%, rgba(255, 255, 255, 0.5) 88%, #EA3323 96%, transparent 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          animation: border-beam-spin 8s linear infinite;
        }
        @property --beam-angle {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }
        @keyframes border-beam-spin {
          to { --beam-angle: 360deg; }
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
          z-index: 10;
        }
        .corner-tl { top: 4px; left: 4px; }
        .corner-tr { top: 4px; right: 4px; }
        .corner-bl { bottom: 4px; left: 4px; }
        .corner-br { bottom: 4px; right: 4px; }

        .lobby-meta-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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

        /* Glass-framed LedGrid */
        .led-grid-wrap {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(12px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
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

        /* Tilted Smoked Glass QR Card */
        .qr-card {
          background: rgba(18, 18, 24, 0.65);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 10px 25px rgba(0, 0, 0, 0.5);
          padding: 1.1rem 1rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          position: relative;
          transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.4, 1), box-shadow 0.2s;
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
          background: rgba(0, 0, 0, 0.6);
          padding: 0.5rem 0.5rem;
          margin: 0.2rem 0 0.8rem 0;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
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
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
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
          background: rgba(18, 18, 24, 0.65);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
          padding: 0.8rem 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: border-color 0.2s, background 0.2s;
        }
        .player-slot-chip.connected {
          border-color: rgba(255, 255, 255, 0.4);
          background: rgba(234, 51, 35, 0.08);
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
          transition: all 0.2s;
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
          box-shadow: 0 0 16px rgba(234, 51, 35, 0.5);
        }
        .status-recon {
          color: #000000;
          background: #ffffff;
          border-color: #ffffff;
        }

        /* Skiper UI skiper46 Liquid Mercury Gooey Level Selector */
        .level-selector {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .gooey-tabs-track {
          position: relative;
          height: 44px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.14);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
          padding: 3px;
          box-sizing: border-box;
          display: flex;
          align-items: stretch;
          overflow: visible;
        }
        .gooey-liquid-layer {
          position: absolute;
          inset: 3px;
          pointer-events: none;
          filter: url(#mercury-goo);
          z-index: 1;
        }
        .gooey-pill {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 25%;
          background: #ffffff;
          box-shadow: 0 0 16px rgba(255, 255, 255, 0.5);
          transition: transform 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.1);
          will-change: transform;
        }
        .gooey-trailing-blob {
          position: absolute;
          top: 15%;
          bottom: 15%;
          left: 0;
          width: 25%;
          background: #ffffff;
          opacity: 0.9;
          transition: transform 0.44s cubic-bezier(0.15, 0.75, 0.35, 1.25);
          will-change: transform;
        }
        .gooey-buttons-layer {
          position: relative;
          z-index: 5;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          width: 100%;
          height: 100%;
        }
        .level-tab-btn {
          all: unset;
          cursor: pointer;
          font-size: 0.8rem;
          font-family: var(--font-mono);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #888888;
          transition: color 0.18s cubic-bezier(0.2, 0.8, 0.4, 1);
        }
        .level-tab-btn:hover {
          color: #ffffff;
        }
        .level-tab-btn.active {
          color: #000000;
          font-weight: 700;
        }

        /* Action Buttons */
        .actions-row {
          display: flex;
          gap: 0.75rem;
          margin-top: 0.25rem;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 1.25rem;
        }
        .btn-launch {
          flex: 1.3;
          background: #ffffff;
          color: #000000;
          border: 1.5px solid #ffffff;
          padding: 0.85rem 1rem;
          font-family: var(--font-mono);
          font-size: 0.88rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          text-align: center;
          transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.12s;
          box-shadow: 0 4px 16px rgba(255, 255, 255, 0.2);
        }
        .btn-launch:hover:not(:disabled) {
          background: #EA3323;
          border-color: #EA3323;
          color: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(234, 51, 35, 0.45);
        }
        .btn-launch:active:not(:disabled) {
          transform: translateY(0);
        }
        .btn-launch:disabled {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
          color: #444444;
          box-shadow: none;
          cursor: not-allowed;
        }
        .btn-kbd {
          flex: 1;
          background: rgba(18, 18, 24, 0.7);
          backdrop-filter: blur(12px);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.25);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
          padding: 0.85rem 1rem;
          font-family: var(--font-mono);
          font-size: 0.84rem;
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
          border-color: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(255, 255, 255, 0.25);
        }
        .btn-kbd:active {
          transform: translateY(0);
        }
        .btn-telemetry {
          background: rgba(18, 18, 24, 0.7);
          backdrop-filter: blur(12px);
          color: #888888;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
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
          border-color: rgba(255, 255, 255, 0.35);
          transform: translateY(-1px);
        }
        .btn-telemetry:active {
          transform: translateY(0);
        }
      </style>

      <div class="glass-chassis">
        <div class="corner-mark corner-tl">+</div>
        <div class="corner-mark corner-tr">+</div>
        <div class="corner-mark corner-bl">+</div>
        <div class="corner-mark corner-br">+</div>

        <div class="lobby-meta-bar">
          <div>[ SYS // HARNESS_ONLINE ] <span class="accent">100HZ STREAM</span></div>
          <div>MOTION SENSOR CONTROLLER • ZERO-COPY RELAY</div>
        </div>

        <div class="lobby-header-row">
          <div class="lobby-title-area">
            <h1>TILTMAZE</h1>
            <p>Physical Motion Controller // Real-Time Kinetic Simulation</p>
          </div>
          <div class="led-grid-wrap">
            <canvas id="lobby-led-canvas"></canvas>
          </div>
        </div>

        <div class="lobby-grid">
          <div class="qr-card" id="qr-tilted-card">
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
                <div class="slot-subtitle">PHYSICAL MOTION SENSOR LINK (100HZ IMU)</div>
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
                <span id="level-selected-name" style="color: #ffffff;">01 // SKYWAY RUNWAY</span>
              </div>
              <div class="gooey-tabs-track" id="gooey-tabs-track">
                <div class="gooey-liquid-layer">
                  <div class="gooey-pill" id="gooey-pill"></div>
                  <div class="gooey-trailing-blob" id="gooey-trailing-blob"></div>
                </div>
                <div class="gooey-buttons-layer">
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
        </div>

        <div class="actions-row">
          <button id="start-game-btn" class="btn-launch" disabled>[ LAUNCH // PHONE ]</button>
          <button id="play-keyboard-btn" class="btn-kbd">[ KEYBOARD // WASD ]</button>
          <button id="telemetry-lab-btn" class="btn-telemetry">[ TELEMETRY // F3 ]</button>
        </div>

        <div class="lobby-controls-bar" style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 0.75rem; font-size: 0.72rem; color: #888888; display: flex; justify-content: space-between; letter-spacing: 0.06em; text-transform: uppercase;">
          <span>CONTROLS: WASD / ARROWS: STEER • SPACE: JUMP • SHIFT: NITRO</span>
          <span style="color: #cbd5e1;">V: TOGGLE VIEW • C: CALIBRATE • T: TELEMETRY</span>
        </div>
      </div>
    `;

    this.roomCodeElement = this.container.querySelector('#room-code-letters')!;
    this.qrCanvas = this.container.querySelector('#qr-code-canvas')!;
    this.p1StatusElement = this.container.querySelector('#p1-status')!;
    this.p2StatusElement = this.container.querySelector('#p2-status')!;
    this.startBtn = this.container.querySelector('#start-game-btn')!;

    // Level tab selection with liquid mercury animation
    const levelButtons = this.container.querySelectorAll<HTMLButtonElement>('.level-tab-btn');
    const levelNameLabel = this.container.querySelector('#level-selected-name')!;
    const pill = this.container.querySelector<HTMLElement>('#gooey-pill');
    const blob = this.container.querySelector<HTMLElement>('#gooey-trailing-blob');

    levelButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        levelButtons.forEach((b) => b.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        this.selectedLevelIndex = parseInt(target.dataset.index || '0', 10);
        if (levelNameLabel && target.dataset.name) {
          levelNameLabel.textContent = `0${this.selectedLevelIndex + 1} // ${target.dataset.name.toUpperCase()}`;
        }
        if (pill && blob) {
          const shift = this.selectedLevelIndex * 100;
          pill.style.transform = `translateX(${shift}%)`;
          blob.style.transform = `translateX(${shift}%)`;
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
   * Ambient Spotlight (ibelick / React Bits)
   * Tracks cursor position to generate a wide-falloff radial pool (550px radius at ~7% opacity)
   */
  private initSpotlight(): void {
    const modal = this.container;
    modal.addEventListener('mousemove', (e) => {
      const rect = modal.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      modal.style.setProperty('--mouse-x', `${x}px`);
      modal.style.setProperty('--mouse-y', `${y}px`);
    });
  }

  /**
   * 3D Inertial Card Tilt (TiltedCard from React Bits)
   */
  private initCardTilts(): void {
    const qrCard = this.container.querySelector('#qr-tilted-card') as HTMLElement;
    if (!qrCard) return;

    qrCard.addEventListener('mousemove', (e) => {
      const rect = qrCard.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -6; // max -6deg to +6deg
      const rotateY = ((x - centerX) / centerX) * 6;

      qrCard.style.transform = `perspective(600px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-2px)`;
    });

    qrCard.addEventListener('mouseleave', () => {
      qrCard.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) translateY(0px)';
    });
  }

  /**
   * Authentic Nothing OS / Glyph Odyssey 2D LED Grid Canvas
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

      this.ledCtx.fillStyle = '#08080c';
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
            ds.target = 0.05 + Math.random() * 0.1;
          } else if (rand < 0.85) {
            ds.target = 0.7 + Math.random() * 0.3;
          } else {
            ds.target = 0.3 + Math.random() * 0.3;
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
    this.animateDecryptedText(roomCode);

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
        this.startBtn.textContent = '[ LAUNCH // COMMENCE ]';
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
        this.startBtn.textContent = '[ LAUNCH // PHONE ]';
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
