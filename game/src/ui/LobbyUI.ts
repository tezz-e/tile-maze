import QRCode from 'qrcode';
import type { LevelDef } from '../levels/LevelData.js';
import { LEVELS } from '../levels/LevelData.js';
import type { DifficultyMode } from '../physics/PhysicsWorld.js';

export interface LobbyCallbacks {
  onStartGame: (selectedLevel: LevelDef, difficulty: DifficultyMode) => void;
  onPlayKeyboard: (selectedLevel: LevelDef, difficulty: DifficultyMode) => void;
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
  private selectedDifficulty: DifficultyMode = 'medium';
  private hasPlayer1 = false;
  private hasPlayer2 = false;
  private p1TiltIndicator: HTMLElement | null = null;
  private p1TiltBubble: HTMLElement | null = null;
  private p2TiltIndicator: HTMLElement | null = null;
  private p2TiltBubble: HTMLElement | null = null;
  private debugUnlockAll = false;
  private courseDifficultyBadge!: HTMLElement;
  private courseLockIndicator!: HTMLElement;
  private courseMedalBadge!: HTMLElement;
  private courseBestTimeEl!: HTMLElement;
  private keyboardStartBtn!: HTMLButtonElement;
  private refreshCourseUI: () => void = () => {};

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

  // React Bits inspired Dot Field & Ambient Cyber Motes Background
  private bgCanvas: HTMLCanvasElement | null = null;
  private bgCtx: CanvasRenderingContext2D | null = null;
  private bgAnimFrame: number | null = null;
  private bgDots: Array<{ x: number; y: number; originX: number; originY: number; vx: number; vy: number; baseAlpha: number }> = [];
  private bgMotes: Array<{ x: number; y: number; vx: number; vy: number; size: number; alpha: number; seed: number }> = [];
  private bgPointer = { x: -1000, y: -1000, targetX: -1000, targetY: -1000, active: false };
  private bgTiltOffset = { x: 0, y: 0, targetX: 0, targetY: 0 };
  private bgLastTime = performance.now();

  constructor(parent: HTMLElement, callbacks: LobbyCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.id = 'lobby-modal';
    this.container.className = 'interactive';
    this.buildDOM();
    parent.appendChild(this.container);

    this.initBackgroundCanvas();
    this.initLedGrid();
    this.initSpotlight();
    this.initCardTilts();
  }

  private getBestTimes(): Record<number, number> {
    try {
      const raw = localStorage.getItem('tiltmaze_best_times');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const res: Record<number, number> = {};
          for (const [k, v] of Object.entries(parsed)) {
            const numK = Number(k);
            const numV = Number(v);
            if (!isNaN(numK) && !isNaN(numV) && numV > 0) {
              res[numK] = numV;
            }
          }
          return res;
        }
      }
    } catch {}
    return {};
  }

  private isLevelUnlocked(index: number): boolean {
    if (index === 0) return true;
    if (this.debugUnlockAll) return true;
    try {
      if (localStorage.getItem('tiltmaze_unlock_all') === 'true') return true;
    } catch {}
    const bestTimes = this.getBestTimes();
    const prevLevelId = LEVELS[index - 1]?.id ?? index;
    return bestTimes[prevLevelId] !== undefined && bestTimes[prevLevelId] > 0;
  }

  private getMedal(level: LevelDef, bestSecs?: number): { icon: string; text: string; color: string } {
    if (bestSecs === undefined || bestSecs <= 0) {
      return { icon: '', text: '--', color: '#64748b' };
    }
    if (bestSecs <= level.parTimes.gold) {
      return { icon: '🥇', text: 'GOLD', color: '#facc15' };
    } else if (bestSecs <= level.parTimes.silver) {
      return { icon: '🥈', text: 'SILVER', color: '#e2e8f0' };
    } else if (bestSecs <= level.parTimes.bronze) {
      return { icon: '🥉', text: 'BRONZE', color: '#f97316' };
    }
    return { icon: '✓', text: 'CLEAR', color: '#38bdf8' };
  }

  private formatTimeSecs(totalSecs: number): string {
    const totalCentis = Math.round(totalSecs * 100);
    const mins = Math.floor(totalCentis / 6000);
    const secs = Math.floor((totalCentis % 6000) / 100);
    const cs = totalCentis % 100;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <style>
        #lobby-modal {
          position: absolute;
          inset: 0;
          background: #000000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 1.5rem;
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          box-sizing: border-box;
          opacity: 1;
          visibility: visible;
          transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.3s ease;
          overflow: hidden;
        }
        #lobby-ambient-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 0;
          pointer-events: none;
        }
        #lobby-modal.lobby-fade-out {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
        }

        /* Apple Vision / Liquid Glass Chassis */
        .glass-chassis {
          position: relative;
          background: rgba(14, 14, 18, 0.76);
          backdrop-filter: blur(36px) saturate(190%);
          -webkit-backdrop-filter: blur(36px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 22px;
          box-shadow: 
            inset 0 1px 1px 0 rgba(255, 255, 255, 0.22),
            0 32px 80px rgba(0, 0, 0, 0.85);
          max-width: 820px;
          width: 100%;
          padding: 1.85rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.35rem;
          box-sizing: border-box;
          overflow: hidden;
        }

        /* Ambient Glass Border Sheen */
        .glass-chassis::before {
          content: '';
          position: absolute;
          inset: -1.5px;
          padding: 1.5px;
          border-radius: 23px;
          background: conic-gradient(from var(--beam-angle, 0deg), transparent 75%, rgba(255, 255, 255, 0.4) 88%, rgba(234, 51, 35, 0.8) 96%, transparent 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          animation: border-beam-spin 10s linear infinite;
        }
        @property --beam-angle {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }
        @keyframes border-beam-spin {
          to { --beam-angle: 360deg; }
        }

        .lobby-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1.5rem;
        }
        .lobby-title-area h1 {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 2.1rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          text-transform: uppercase;
          margin: 0;
          color: #ffffff;
          line-height: 1;
        }
        .lobby-title-area p {
          color: #94a3b8;
          margin: 0.35rem 0 0 0;
          font-size: 0.85rem;
          letter-spacing: 0.02em;
          font-weight: 400;
        }

        /* Glass-framed 2D LED matrix */
        .led-grid-wrap {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(12px);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
          padding: 6px 7px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        #lobby-led-canvas {
          display: block;
          image-rendering: pixelated;
        }

        .lobby-grid {
          display: grid;
          grid-template-columns: 310px 1fr;
          gap: 1.35rem;
          align-items: stretch;
        }
        @media (max-width: 780px) {
          .lobby-grid { grid-template-columns: 1fr; }
        }

        /* Frosted Glass Cards */
        .glass-card {
          background: rgba(255, 255, 255, 0.035);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 16px;
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.12),
            0 10px 24px rgba(0, 0, 0, 0.4);
          padding: 1.15rem 1.25rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          box-sizing: border-box;
          transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.4, 1), box-shadow 0.2s;
        }

        .section-label {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #94a3b8;
          margin-bottom: 0.6rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .qr-pairing-body {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.75rem;
          width: 100%;
        }
        .qr-canvas-wrap {
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.9);
          background: #ffffff;
          padding: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
          flex-shrink: 0;
        }
        .qr-canvas {
          display: block;
        }
        .qr-details-side {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 100%;
        }
        .qr-side-label {
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: #94a3b8;
          text-transform: uppercase;
          margin-bottom: 0.25rem;
        }
        .room-code-tag {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 1.45rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          white-space: nowrap;
          color: #ffffff;
          background: rgba(0, 0, 0, 0.75);
          padding: 0.4rem 0.85rem;
          border-radius: 10px;
          margin: 0.1rem 0 0.45rem 0;
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 4px 12px rgba(0, 0, 0, 0.4);
          display: inline-flex;
          justify-content: center;
          align-items: center;
          max-width: 100%;
          box-sizing: border-box;
        }
        .room-code-tag .bracket {
          color: #EA3323;
          margin: 0 0.3rem;
          font-weight: 700;
        }
        .qr-instructions {
          font-size: 0.72rem;
          letter-spacing: 0.01em;
          color: #94a3b8;
          line-height: 1.35;
        }

        /* Right Column Slots & Course Selector */
        .slots-card {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
          justify-content: space-between;
        }
        .player-slot-chip {
          background: rgba(255, 255, 255, 0.035);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 14px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
          padding: 0.75rem 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: border-color 0.2s, background 0.2s;
        }
        .player-slot-chip.connected {
          border-color: rgba(16, 185, 129, 0.45);
          background: rgba(16, 185, 129, 0.08);
        }
        .slot-title {
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          color: #ffffff;
        }
        .slot-subtitle {
          font-size: 0.74rem;
          color: #94a3b8;
          margin-top: 2px;
        }
        .status-badge {
          font-size: 0.72rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-weight: 600;
          letter-spacing: 0.02em;
          padding: 0.3rem 0.7rem;
          border-radius: 8px;
          border: 1px solid currentColor;
          box-sizing: border-box;
          transition: all 0.2s;
        }
        .status-waiting {
          color: #94a3b8;
          border-color: rgba(148, 163, 184, 0.3);
          background: rgba(15, 23, 42, 0.4);
        }
        .status-connected-green {
          color: #10b981;
          background: rgba(16, 185, 129, 0.14);
          border-color: #10b981;
          box-shadow: 0 0 14px rgba(16, 185, 129, 0.35);
        }
        .waiting-pulse {
          animation: wait-pulse 2.2s infinite ease-in-out;
        }
        @keyframes wait-pulse {
          0%, 100% { opacity: 0.65; }
          50% { opacity: 1; color: #f1f5f9; }
        }
        .tilt-gauge {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 1.5px solid rgba(16, 185, 129, 0.6);
          background: rgba(0, 0, 0, 0.6);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .tilt-gauge::before {
          content: '';
          position: absolute;
          width: 100%;
          height: 1px;
          background: rgba(255, 255, 255, 0.15);
        }
        .tilt-gauge::after {
          content: '';
          position: absolute;
          width: 1px;
          height: 100%;
          background: rgba(255, 255, 255, 0.15);
        }
        .tilt-gauge-bubble {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
          position: absolute;
          transform: translate(0px, 0px);
          z-index: 2;
        }
        .status-recon {
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.18);
          border-color: #f59e0b;
          box-shadow: 0 0 16px rgba(245, 158, 11, 0.35);
          animation: recon-pulse 1.2s infinite ease-in-out;
        }
        @keyframes recon-pulse {
          0%, 100% { opacity: 0.65; transform: scale(0.99); }
          50% { opacity: 1; transform: scale(1.01); }
        }

        /* Apple Liquid Glass Sliding Segmented Control */
        .course-selector-bay {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }
        :root, #lobby-modal {
          --level-count: 6;
        }
        .glass-segmented-track {
          position: relative;
          height: 46px;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 3px;
          box-sizing: border-box;
          display: flex;
          align-items: stretch;
          cursor: grab;
          user-select: none;
          touch-action: none;
          overflow: hidden;
        }
        .glass-segmented-track:active {
          cursor: grabbing;
        }
        .glass-pill {
          position: absolute;
          top: 3px;
          bottom: 3px;
          left: 3px;
          width: calc((100% - 6px) / var(--level-count, 6));
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.10) 100%);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.32);
          border-radius: 9px;
          box-shadow: 
            inset 0 1px 1px 0 rgba(255, 255, 255, 0.6),
            0 4px 16px rgba(0, 0, 0, 0.45);
          transition: transform 0.28s cubic-bezier(0.18, 0.89, 0.32, 1.15);
          will-change: transform;
          pointer-events: none;
        }
        .glass-segmented-buttons {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: repeat(var(--level-count, 6), 1fr);
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .segment-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.88rem;
          font-weight: 700;
          color: #718096;
          transition: color 0.18s ease, opacity 0.18s ease;
          pointer-events: none;
        }
        .segment-btn.active {
          color: #ffffff;
        }
        .segment-btn.locked {
          opacity: 0.35;
          color: #475569;
        }

        /* Apple Liquid Glass Action Buttons */
        .actions-row {
          display: flex;
          gap: 0.85rem;
          margin-top: 0.25rem;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 1.25rem;
        }
        .glass-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 0.92rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          border-radius: 13px;
          padding: 0.82rem 1.25rem;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          box-sizing: border-box;
          outline: none;
        }
        .glass-btn:active:not(:disabled) {
          transform: scale(0.975);
        }

        .btn-launch {
          flex: 1;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
          border-color: rgba(255, 255, 255, 0.08);
          color: #64748b;
          box-shadow: none;
          cursor: not-allowed;
        }
        .phone-ready .btn-launch {
          background: linear-gradient(180deg, rgba(234, 51, 35, 0.92) 0%, rgba(185, 28, 28, 0.84) 100%);
          border-color: rgba(255, 120, 100, 0.6);
          color: #ffffff;
          box-shadow: 
            inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.5),
            0 8px 26px rgba(234, 51, 35, 0.45);
          cursor: pointer;
        }
        .phone-ready .btn-launch:hover:not(:disabled) {
          transform: translateY(-1px) scale(1.01);
          box-shadow: 
            inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.65),
            0 12px 32px rgba(234, 51, 35, 0.6);
        }

        .btn-kbd {
          flex: 1;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(228, 233, 242, 0.92) 100%);
          border-color: rgba(255, 255, 255, 0.85);
          color: #0b0c10;
          box-shadow: 
            inset 0 1.5px 1px 0 rgba(255, 255, 255, 1),
            0 8px 24px rgba(0, 0, 0, 0.35);
        }
        .btn-kbd:hover {
          transform: translateY(-1px) scale(1.01);
          background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
          box-shadow: 
            inset 0 1.5px 1px 0 #ffffff,
            0 10px 28px rgba(0, 0, 0, 0.45);
        }

        .lobby-controls-bar {
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding-top: 0.75rem;
          font-size: 0.72rem;
          color: #94a3b8;
          display: flex;
          justify-content: space-between;
          align-items: center;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
      </style>

      <canvas id="lobby-ambient-bg"></canvas>
      <div class="glass-chassis" style="position: relative; z-index: 10;">
        <div class="lobby-header-row">
          <div class="lobby-title-area">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <img src="/favicon.svg" alt="Tiltmaze Logo" style="width: 38px; height: 38px; border-radius: 9px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.6)); border: 1px solid rgba(255,255,255,0.12); flex-shrink: 0;" />
              <h1>TILTMAZE</h1>
            </div>
            <p>Motion-controlled marble labyrinth</p>
          </div>
          <div class="led-grid-wrap">
            <canvas id="lobby-led-canvas"></canvas>
          </div>
        </div>

        <div class="lobby-grid">
          <div class="glass-card" id="qr-tilted-card">
            <div class="section-label">
              <span>Connect Controller</span>
            </div>
            <div class="qr-pairing-body">
              <div class="qr-canvas-wrap">
                <canvas id="qr-code-canvas" class="qr-canvas" width="136" height="136"></canvas>
              </div>
              <div class="qr-details-side">
                <div class="qr-side-label">Room Code</div>
                <div id="room-code-display" class="room-code-tag">
                  <span class="bracket">[</span>
                  <span id="room-code-letters">----</span>
                  <span class="bracket">]</span>
                </div>
                <div class="qr-instructions">
                  Scan with camera or enter code on your phone
                </div>
                <div style="margin-top: 0.55rem;">
                  <a href="/apk" target="_blank" rel="noopener" style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.69rem; color: #38bdf8; text-decoration: none; padding: 3px 8px; border-radius: 6px; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.25); transition: all 0.2s; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;" onmouseover="this.style.background='rgba(56,189,248,0.2)';this.style.borderColor='#38bdf8';" onmouseout="this.style.background='rgba(56,189,248,0.08)';this.style.borderColor='rgba(56,189,248,0.25)';">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                    </svg>
                    <span>Download APK</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div class="slots-card">
            <div class="player-slot-chip" id="p1-slot-chip">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div id="p1-tilt-indicator" class="tilt-gauge" style="display: none;">
                  <div id="p1-tilt-bubble" class="tilt-gauge-bubble"></div>
                </div>
                <div>
                  <div class="slot-title">Player 1</div>
                  <div class="slot-subtitle">Phone motion controller</div>
                </div>
              </div>
              <span id="p1-status" class="status-badge status-waiting waiting-pulse">Waiting for phone</span>
            </div>

            <div class="player-slot-chip" id="p2-slot-chip">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div id="p2-tilt-indicator" class="tilt-gauge" style="display: none;">
                  <div id="p2-tilt-bubble" class="tilt-gauge-bubble" style="background: #a855f7; box-shadow: 0 0 6px rgba(168, 85, 247, 0.8);"></div>
                </div>
                <div>
                  <div class="slot-title">Player 2</div>
                  <div class="slot-subtitle">Tandem Co-Op / Spectator</div>
                </div>
              </div>
              <span id="p2-status" class="status-badge status-waiting">Available</span>
            </div>

            <div class="course-selector-bay">
              <div class="section-label">
                <span>Course</span>
                <span id="course-selected-name" style="color: #ffffff; font-weight: 500;">01 • Skyway Runway</span>
              </div>
              <div class="glass-segmented-track" id="course-segmented-track" style="--level-count: ${LEVELS.length};" title="Slide or click to select course">
                <div class="glass-pill" id="course-glass-pill"></div>
                <div class="glass-segmented-buttons">
                  ${LEVELS.map((lvl, index) => `
                    <div class="segment-btn ${index === 0 ? 'active' : ''}" data-index="${index}">${lvl.id}</div>
                  `).join('')}
                </div>
              </div>
              <div class="course-meta-bay" id="course-meta-bay" style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.4rem; font-size: 0.74rem;">
                <div style="display: flex; gap: 8px; align-items: center;">
                  <span id="course-difficulty-badge" style="padding: 2px 7px; border-radius: 6px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; font-weight: 600; font-size: 0.70rem;">1/5 Tutorial</span>
                  <span id="course-lock-indicator" style="display: none; color: #f59e0b; font-weight: 600; font-size: 0.70rem;">🔒 Locked</span>
                </div>
                <div id="course-best-medal-display" style="display: flex; align-items: center; gap: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 600;">
                  <span id="course-medal-badge" style="color: #facc15;">--</span>
                  <span id="course-best-time" style="color: #cbd5e1;">--:--.--</span>
                </div>
              </div>
            </div>

            <div class="difficulty-selector-bay" style="display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.2rem;">
              <div class="section-label" style="margin-bottom: 0.25rem;">
                <span>Difficulty Mode</span>
                <span id="difficulty-selected-label" style="color: #38bdf8; font-weight: 600; font-size: 0.70rem; letter-spacing: 0.04em;">MEDIUM</span>
              </div>
              <div class="glass-segmented-track" id="difficulty-segmented-track" style="--level-count: 3; height: 34px;" title="Select difficulty mode">
                <div class="glass-pill" id="difficulty-glass-pill" style="width: calc(100% / 3);"></div>
                <div class="glass-segmented-buttons" style="grid-template-columns: repeat(3, 1fr);">
                  <div class="segment-btn" data-diff="easy" style="font-size: 0.78rem; letter-spacing: 0.06em; cursor: pointer;">EASY</div>
                  <div class="segment-btn active" data-diff="medium" style="font-size: 0.78rem; letter-spacing: 0.06em; cursor: pointer;">MEDIUM</div>
                  <div class="segment-btn" data-diff="hard" style="font-size: 0.78rem; letter-spacing: 0.06em; cursor: pointer;">HARD</div>
                </div>
              </div>
              <div id="difficulty-desc-card" style="padding: 0.5rem 0.8rem; border-radius: 10px; background: rgba(255, 255, 255, 0.035); border: 1px solid rgba(255, 255, 255, 0.08); font-size: 0.71rem; color: #94a3b8; line-height: 1.35; display: flex; align-items: center; gap: 8px;">
                <span id="difficulty-desc-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #38bdf8; box-shadow: 0 0 6px #38bdf8; flex-shrink: 0;"></span>
                <span id="difficulty-desc-text">Authentic Skyway • Strategic catch-walls with open ridges & bridges • Standard par times</span>
              </div>
            </div>
          </div>
        </div>

        <div class="actions-row">
          <button id="start-game-btn" class="glass-btn btn-launch" disabled>Start with Phone</button>
          <button id="play-keyboard-btn" class="glass-btn btn-kbd">Play with Keyboard</button>
        </div>

        <div class="lobby-controls-bar">
          <span>WASD / Arrows to steer • Space to jump • Shift for boost • V: Camera • C: Calibrate</span>
          <span style="color: #cbd5e1;">U: Unlock All</span>
        </div>
      </div>
    `;

    this.roomCodeElement = this.container.querySelector('#room-code-letters')!;
    this.qrCanvas = this.container.querySelector('#qr-code-canvas')!;
    this.p1StatusElement = this.container.querySelector('#p1-status')!;
    this.p2StatusElement = this.container.querySelector('#p2-status')!;
    this.startBtn = this.container.querySelector('#start-game-btn')!;
    this.keyboardStartBtn = this.container.querySelector('#play-keyboard-btn')!;
    this.p1TiltIndicator = this.container.querySelector('#p1-tilt-indicator');
    this.p1TiltBubble = this.container.querySelector('#p1-tilt-bubble');
    this.p2TiltIndicator = this.container.querySelector('#p2-tilt-indicator');
    this.p2TiltBubble = this.container.querySelector('#p2-tilt-bubble');
    this.courseDifficultyBadge = this.container.querySelector('#course-difficulty-badge')!;
    this.courseLockIndicator = this.container.querySelector('#course-lock-indicator')!;
    this.courseMedalBadge = this.container.querySelector('#course-medal-badge')!;
    this.courseBestTimeEl = this.container.querySelector('#course-best-time')!;

    // Apple-style Fluid Sliding Segmented Control for Courses
    const track = this.container.querySelector<HTMLElement>('#course-segmented-track')!;
    const pill = this.container.querySelector<HTMLElement>('#course-glass-pill')!;
    const courseNameLabel = this.container.querySelector<HTMLElement>('#course-selected-name')!;
    const segmentButtons = this.container.querySelectorAll<HTMLElement>('.segment-btn');

    let isPointerDown = false;

    const setCourseIndex = (index: number, animate = true) => {
      index = Math.max(0, Math.min(index, LEVELS.length - 1));
      this.selectedLevelIndex = index;
      const bestTimes = this.getBestTimes();
      const lvl = LEVELS[index];

      segmentButtons.forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
        const unlocked = this.isLevelUnlocked(i);
        btn.classList.toggle('locked', !unlocked);
      });

      if (courseNameLabel) {
        courseNameLabel.textContent = `0${lvl.id} • ${lvl.name}`;
      }
      if (this.courseDifficultyBadge) {
        this.courseDifficultyBadge.textContent = lvl.difficulty;
      }

      const isUnlocked = this.isLevelUnlocked(index);
      if (this.courseLockIndicator) {
        this.courseLockIndicator.style.display = isUnlocked ? 'none' : 'inline-block';
        if (!isUnlocked) {
          this.courseLockIndicator.textContent = `🔒 Locked (Complete Sector 0${index} First)`;
        }
      }

      const bestSecs = bestTimes[lvl.id];
      const medal = this.getMedal(lvl, bestSecs);
      if (this.courseMedalBadge) {
        this.courseMedalBadge.textContent = medal.icon ? `${medal.icon} ${medal.text}` : '--';
        this.courseMedalBadge.style.color = medal.color;
      }
      if (this.courseBestTimeEl) {
        this.courseBestTimeEl.textContent = bestSecs !== undefined ? this.formatTimeSecs(bestSecs) : '--:--.--';
      }

      // Update button state based on lock
      if (!isUnlocked) {
        this.startBtn.disabled = true;
        this.startBtn.textContent = `Sector 0${lvl.id} Locked`;
        this.keyboardStartBtn.disabled = true;
        this.keyboardStartBtn.style.opacity = '0.5';
        this.keyboardStartBtn.style.cursor = 'not-allowed';
      } else {
        this.keyboardStartBtn.disabled = false;
        this.keyboardStartBtn.style.opacity = '1';
        this.keyboardStartBtn.style.cursor = 'pointer';
        if (this.hasPlayer1) {
          this.startBtn.disabled = false;
          this.startBtn.textContent = 'Start with Phone';
        } else {
          this.startBtn.disabled = true;
          this.startBtn.textContent = 'Start with Phone';
        }
      }

      if (pill) {
        if (animate) {
          pill.style.transition = 'transform 0.28s cubic-bezier(0.18, 0.89, 0.32, 1.15)';
        } else {
          pill.style.transition = 'none';
        }
        pill.style.transform = `translateX(${index * 100}%)`;
      }
    };

    this.refreshCourseUI = () => setCourseIndex(this.selectedLevelIndex, false);
    this.refreshCourseUI();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'u' || e.key === 'U') {
        this.debugUnlockAll = !this.debugUnlockAll;
        this.refreshCourseUI();
      }
    });

    const handleTrackPointerMove = (e: PointerEvent) => {
      if (!isPointerDown) return;
      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(x / rect.width, 0.999));
      const targetIndex = Math.floor(ratio * LEVELS.length);

      // Fluid sliding: pill dynamically follows user drag position
      const pillWidth = rect.width / LEVELS.length;
      const minX = 0;
      const maxX = rect.width - pillWidth;
      const currentX = Math.max(minX, Math.min(x - pillWidth / 2, maxX));

      pill.style.transition = 'none';
      pill.style.transform = `translateX(${currentX}px)`;

      // Dynamically highlight active segment during drag
      if (targetIndex !== this.selectedLevelIndex) {
        setCourseIndex(targetIndex, false);
      }
    };

    track.addEventListener('pointerdown', (e) => {
      isPointerDown = true;
      track.setPointerCapture(e.pointerId);
      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(x / rect.width, 0.999));
      const targetIndex = Math.floor(ratio * LEVELS.length);
      setCourseIndex(targetIndex, false);
      handleTrackPointerMove(e);
    });

    track.addEventListener('pointermove', handleTrackPointerMove);

    const handleTrackPointerUp = (e: PointerEvent) => {
      if (!isPointerDown) return;
      isPointerDown = false;
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {}
      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(x / rect.width, 0.999));
      const targetIndex = Math.floor(ratio * LEVELS.length);
      setCourseIndex(targetIndex, true);
    };

    track.addEventListener('pointerup', handleTrackPointerUp);
    track.addEventListener('pointercancel', handleTrackPointerUp);

    // Difficulty Selector Logic
    const diffModes: DifficultyMode[] = ['easy', 'medium', 'hard'];
    const diffConfig: Record<DifficultyMode, { label: string; color: string; text: string }> = {
      easy: {
        label: 'EASY',
        color: '#34d399',
        text: 'Safety Guardrails Active • Side barriers prevent falling into the abyss • Relaxed par times',
      },
      medium: {
        label: 'MEDIUM',
        color: '#38bdf8',
        text: 'Authentic Skyway • Strategic catch-walls with open ridges & bridges • Standard par times',
      },
      hard: {
        label: 'HARD',
        color: '#f43f5e',
        text: 'Pro Labyrinth • Raw open ledges • 25% faster rotors • Strict championship par times',
      },
    };

    let savedDiff: DifficultyMode = 'medium';
    try {
      const raw = localStorage.getItem('tiltmaze_difficulty');
      if (raw === 'easy' || raw === 'medium' || raw === 'hard') {
        savedDiff = raw;
      }
    } catch {}
    this.selectedDifficulty = savedDiff;

    const diffTrack = this.container.querySelector('#difficulty-segmented-track') as HTMLElement;
    const diffPill = this.container.querySelector('#difficulty-glass-pill') as HTMLElement;
    const diffBtns = this.container.querySelectorAll('#difficulty-segmented-track .segment-btn');
    const diffLabel = this.container.querySelector('#difficulty-selected-label') as HTMLElement;
    const diffText = this.container.querySelector('#difficulty-desc-text') as HTMLElement;
    const diffDot = this.container.querySelector('#difficulty-desc-dot') as HTMLElement;

    const setDifficulty = (mode: DifficultyMode, animate = true) => {
      this.selectedDifficulty = mode;
      try {
        localStorage.setItem('tiltmaze_difficulty', mode);
      } catch {}
      const cfg = diffConfig[mode];
      const idx = diffModes.indexOf(mode);

      diffBtns.forEach((btn, bIdx) => {
        if (bIdx === idx) {
          btn.classList.add('active');
          (btn as HTMLElement).style.color = '#ffffff';
        } else {
          btn.classList.remove('active');
          (btn as HTMLElement).style.color = '#718096';
        }
      });

      if (diffPill) {
        diffPill.style.transition = animate ? 'transform 0.25s cubic-bezier(0.18, 0.89, 0.32, 1.15)' : 'none';
        diffPill.style.transform = `translateX(${idx * 100}%)`;
      }
      if (diffLabel) {
        diffLabel.textContent = cfg.label;
        diffLabel.style.color = cfg.color;
      }
      if (diffText) {
        diffText.textContent = cfg.text;
      }
      if (diffDot) {
        diffDot.style.background = cfg.color;
        diffDot.style.boxShadow = `0 0 6px ${cfg.color}`;
      }
    };

    setDifficulty(this.selectedDifficulty, false);

    if (diffTrack) {
      diffTrack.addEventListener('click', (e) => {
        const rect = diffTrack.getBoundingClientRect();
        const x = (e as MouseEvent).clientX - rect.left;
        const ratio = Math.max(0, Math.min(x / rect.width, 0.999));
        const targetIdx = Math.floor(ratio * 3);
        setDifficulty(diffModes[targetIdx], true);
      });
    }

    // Start with Phone
    this.startBtn.addEventListener('click', () => {
      if (!this.isLevelUnlocked(this.selectedLevelIndex)) return;
      this.hide();
      this.callbacks.onStartGame(LEVELS[this.selectedLevelIndex], this.selectedDifficulty);
    });

    // Play with Keyboard
    this.keyboardStartBtn.addEventListener('click', () => {
      if (!this.isLevelUnlocked(this.selectedLevelIndex)) return;
      this.hide();
      this.callbacks.onPlayKeyboard(LEVELS[this.selectedLevelIndex], this.selectedDifficulty);
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
        width: 136,
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
      el.classList.add('status-connected-green');
      el.textContent = name ? `${name} Connected` : 'Phone Connected';
      if (chip) {
        chip.classList.add('connected');
        chip.style.borderColor = 'rgba(16, 185, 129, 0.5)';
      }
      if (slot === 1) {
        this.hasPlayer1 = true;
        if (this.p1TiltIndicator) this.p1TiltIndicator.style.display = 'flex';
      } else if (slot === 2) {
        this.hasPlayer2 = true;
        if (this.p2TiltIndicator) this.p2TiltIndicator.style.display = 'flex';
      }
      if (this.hasPlayer1 || this.hasPlayer2) {
        this.container.classList.add('phone-ready');
        this.startBtn.disabled = false;
        this.startBtn.textContent = (this.hasPlayer1 && this.hasPlayer2) ? 'Start Tandem Co-Op' : 'Start with Phone';
      }
    } else if (status === 'reconnecting') {
      el.classList.add('status-recon');
      el.textContent = 'Reconnecting...';
      if (chip) {
        chip.classList.remove('connected');
        chip.style.borderColor = '';
      }
      if (slot === 1) {
        this.hasPlayer1 = false;
        if (this.p1TiltIndicator) this.p1TiltIndicator.style.display = 'none';
      } else if (slot === 2) {
        this.hasPlayer2 = false;
        if (this.p2TiltIndicator) this.p2TiltIndicator.style.display = 'none';
      }
      if (!this.hasPlayer1 && !this.hasPlayer2) {
        this.container.classList.remove('phone-ready');
        this.startBtn.disabled = true;
        this.startBtn.textContent = 'Reconnecting...';
      } else {
        this.startBtn.textContent = (this.hasPlayer1 && this.hasPlayer2) ? 'Start Tandem Co-Op' : 'Start with Phone';
      }
    } else {
      el.classList.add('status-waiting');
      if (slot === 1) el.classList.add('waiting-pulse');
      el.textContent = slot === 1 ? 'Waiting for phone' : 'Available';
      if (chip) {
        chip.classList.remove('connected');
        chip.style.borderColor = '';
      }
      if (slot === 1) {
        this.hasPlayer1 = false;
        if (this.p1TiltIndicator) this.p1TiltIndicator.style.display = 'none';
      } else if (slot === 2) {
        this.hasPlayer2 = false;
        if (this.p2TiltIndicator) this.p2TiltIndicator.style.display = 'none';
      }
      if (!this.hasPlayer1 && !this.hasPlayer2) {
        this.container.classList.remove('phone-ready');
        this.startBtn.disabled = true;
        this.startBtn.textContent = 'Start with Phone';
      } else {
        this.startBtn.textContent = (this.hasPlayer1 && this.hasPlayer2) ? 'Start Tandem Co-Op' : 'Start with Phone';
      }
    }
  }

  /**
   * React Bits inspired Dot Field & Ambient Cyber Motes Background Canvas
   */
  private initBackgroundCanvas(): void {
    const canvas = this.container.querySelector('#lobby-ambient-bg') as HTMLCanvasElement;
    if (!canvas) return;
    this.bgCanvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    this.bgCtx = ctx;

    const resize = () => {
      if (!this.bgCanvas || !this.bgCtx) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.bgCanvas.width = w * dpr;
      this.bgCanvas.height = h * dpr;
      this.bgCanvas.style.width = `${w}px`;
      this.bgCanvas.style.height = `${h}px`;
      this.bgCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.bgCtx.scale(dpr, dpr);
      this.rebuildBgPoints(w, h);
    };

    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('mousemove', (e) => {
      this.bgPointer.targetX = e.clientX;
      this.bgPointer.targetY = e.clientY;
      this.bgPointer.active = true;
    });

    document.addEventListener('mouseleave', () => {
      this.bgPointer.active = false;
      this.bgPointer.targetX = -1000;
      this.bgPointer.targetY = -1000;
    });

    this.startBackgroundLoop();
  }

  private rebuildBgPoints(w: number, h: number): void {
    this.bgDots = [];
    const step = 32;
    const cols = Math.ceil(w / step) + 1;
    const rows = Math.ceil(h / step) + 1;
    const centerDistMax = Math.hypot(w / 2, h / 2);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ox = c * step;
        const oy = r * step;
        const distFromCenter = Math.hypot(ox - w / 2, oy - h / 2) / centerDistMax;
        const baseAlpha = Math.max(0.06, 0.22 * (1 - distFromCenter * 0.75));
        this.bgDots.push({
          x: ox,
          y: oy,
          originX: ox,
          originY: oy,
          vx: 0,
          vy: 0,
          baseAlpha,
        });
      }
    }

    this.bgMotes = Array.from({ length: 42 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -(0.18 + Math.random() * 0.4),
      size: 0.8 + Math.random() * 1.8,
      alpha: 0.15 + Math.random() * 0.45,
      seed: Math.random() * 100,
    }));
  }

  private startBackgroundLoop(): void {
    if (this.bgAnimFrame) cancelAnimationFrame(this.bgAnimFrame);
    this.bgLastTime = performance.now();

    const loop = (now: number) => {
      if (!this.bgCtx || !this.bgCanvas) return;
      this.bgLastTime = now;

      const w = window.innerWidth;
      const h = window.innerHeight;

      // Smooth pointer interpolation
      this.bgPointer.x += (this.bgPointer.targetX - this.bgPointer.x) * 0.12;
      this.bgPointer.y += (this.bgPointer.targetY - this.bgPointer.y) * 0.12;

      // Smooth tilt offset interpolation
      this.bgTiltOffset.x += (this.bgTiltOffset.targetX - this.bgTiltOffset.x) * 0.08;
      this.bgTiltOffset.y += (this.bgTiltOffset.targetY - this.bgTiltOffset.y) * 0.08;

      // Clear with dark matte background
      this.bgCtx.fillStyle = '#05070a';
      this.bgCtx.fillRect(0, 0, w, h);

      // Deep room-scale radial gradient glow behind chassis
      const radGrad = this.bgCtx.createRadialGradient(
        w / 2 + this.bgTiltOffset.x,
        h / 2 + this.bgTiltOffset.y,
        80,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.75
      );
      radGrad.addColorStop(0, 'rgba(18, 26, 38, 0.7)');
      radGrad.addColorStop(0.5, 'rgba(8, 12, 18, 0.95)');
      radGrad.addColorStop(1, '#000000');
      this.bgCtx.fillStyle = radGrad;
      this.bgCtx.fillRect(0, 0, w, h);

      // Update and draw interactive dot grid
      const ptrX = this.bgPointer.x;
      const ptrY = this.bgPointer.y;
      const hasPointer = this.bgPointer.active && ptrX > -500;
      const radius = 170;
      const rSq = radius * radius;

      for (let i = 0; i < this.bgDots.length; i++) {
        const dot = this.bgDots[i];
        const targetOriginX = dot.originX + this.bgTiltOffset.x;
        const targetOriginY = dot.originY + this.bgTiltOffset.y;

        if (hasPointer) {
          const dx = ptrX - dot.x;
          const dy = ptrY - dot.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < rSq && distSq > 0) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / radius) * 15;
            dot.vx -= (dx / dist) * force * 0.22;
            dot.vy -= (dy / dist) * force * 0.22;
          }
        }

        // Spring return to origin
        dot.vx += (targetOriginX - dot.x) * 0.08;
        dot.vy += (targetOriginY - dot.y) * 0.08;
        dot.vx *= 0.82;
        dot.vy *= 0.82;
        dot.x += dot.vx;
        dot.y += dot.vy;

        // Render dot
        let dotAlpha = dot.baseAlpha;
        let dotColor = `rgba(148, 163, 184, ${dotAlpha})`;

        if (hasPointer) {
          const pDist = Math.hypot(dot.x - ptrX, dot.y - ptrY);
          if (pDist < radius) {
            const glow = 1 - pDist / radius;
            dotAlpha = Math.min(0.85, dotAlpha + glow * 0.6);
            dotColor = `rgba(234, 51, 35, ${dotAlpha})`; // Nothing Red illumination near cursor
          }
        }

        this.bgCtx.fillStyle = dotColor;
        this.bgCtx.beginPath();
        this.bgCtx.arc(dot.x, dot.y, 1.25, 0, Math.PI * 2);
        this.bgCtx.fill();
      }

      // Update and draw floating ambient motes
      for (let i = 0; i < this.bgMotes.length; i++) {
        const mote = this.bgMotes[i];
        mote.y += mote.vy;
        mote.x += mote.vx + Math.sin(now * 0.001 + mote.seed) * 0.25;

        // Wrap around viewport
        if (mote.y < -10) {
          mote.y = h + 10;
          mote.x = Math.random() * w;
        }
        if (mote.x < -10) mote.x = w + 10;
        if (mote.x > w + 10) mote.x = -10;

        const moteGrad = this.bgCtx.createRadialGradient(mote.x, mote.y, 0, mote.x, mote.y, mote.size * 2);
        moteGrad.addColorStop(0, `rgba(56, 189, 248, ${mote.alpha})`);
        moteGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        this.bgCtx.fillStyle = moteGrad;
        this.bgCtx.beginPath();
        this.bgCtx.arc(mote.x, mote.y, mote.size * 2, 0, Math.PI * 2);
        this.bgCtx.fill();
      }

      this.bgAnimFrame = requestAnimationFrame(loop);
    };

    this.bgAnimFrame = requestAnimationFrame(loop);
  }

  public updateLiveTilt(pitch: number, roll: number, p2Pitch?: number, p2Roll?: number): void {
    const clampedRoll = Math.max(-1, Math.min(1, roll));
    const clampedPitch = Math.max(-1, Math.min(1, pitch));
    this.bgTiltOffset.targetX = clampedRoll * 28;
    this.bgTiltOffset.targetY = -clampedPitch * 28;

    if (this.p1TiltBubble) {
      const tx = Math.round(clampedRoll * 11);
      const ty = Math.round(-clampedPitch * 11);
      this.p1TiltBubble.style.transform = `translate(${tx}px, ${ty}px)`;
    }

    if (this.p2TiltBubble && p2Pitch !== undefined && p2Roll !== undefined) {
      const cRoll2 = Math.max(-1, Math.min(1, p2Roll));
      const cPitch2 = Math.max(-1, Math.min(1, p2Pitch));
      const tx2 = Math.round(cRoll2 * 11);
      const ty2 = Math.round(-cPitch2 * 11);
      this.p2TiltBubble.style.transform = `translate(${tx2}px, ${ty2}px)`;
    }
  }

  public show(): void {
    this.refreshCourseUI();
    this.container.classList.remove('lobby-fade-out');
    this.container.style.display = 'flex';
    void this.container.offsetWidth;
    this.container.style.opacity = '1';
    this.container.style.visibility = 'visible';
    this.container.style.pointerEvents = 'auto';
    this.startBackgroundLoop();
    this.startLedLoop();
  }

  public hide(): void {
    this.container.classList.add('lobby-fade-out');
    this.container.style.opacity = '0';
    this.container.style.visibility = 'hidden';
    this.container.style.pointerEvents = 'none';
    window.setTimeout(() => {
      if (this.container.classList.contains('lobby-fade-out')) {
        this.container.style.display = 'none';
        if (this.bgAnimFrame) {
          cancelAnimationFrame(this.bgAnimFrame);
          this.bgAnimFrame = null;
        }
        if (this.ledAnimFrame) {
          cancelAnimationFrame(this.ledAnimFrame);
          this.ledAnimFrame = null;
        }
      }
    }, 300);
  }
}
