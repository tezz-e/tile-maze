import confetti from 'canvas-confetti';
import type { LevelDef } from '../levels/LevelData.js';

export interface HUDCallbacks {
  onNextLevel: () => void;
  onRestartLevel: () => void;
  onReturnToLobby: () => void;
  onToggleTelemetryLab: () => void;
}

export class GameHUD {
  private container: HTMLElement;
  private callbacks: HUDCallbacks;

  // HUD Elements
  private timerEl!: HTMLElement;
  private bestEl!: HTMLElement;
  private checkpointEl!: HTMLElement;
  private checkpointMeterEl!: HTMLElement;
  private speedoValueEl!: HTMLElement;
  private speedoFillEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private coachToastEl!: HTMLElement;
  private victoryModal!: HTMLElement;
  private victoryTimeEl!: HTMLElement;
  private tiltPillEl!: HTMLElement;
  private tiltTitleEl!: HTMLElement;
  private tiltSubEl!: HTMLElement;
  private islandDropletEl!: HTMLElement;

  private startTime: number = 0;
  private timerRunning = false;
  private toastTimer: number | null = null;
  private coachToastTimer: number | null = null;
  private bestTimes: Record<number, number> = {
    1: 75.2, // 01:15.20
    2: 92.15,
    3: 114.5,
    4: 138.0,
  };
  private currentLevelId: number = 1;

  constructor(parent: HTMLElement, callbacks: HUDCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.id = 'game-hud';
    this.buildDOM();
    parent.appendChild(this.container);
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <!-- Skiper UI SVG Gooey Mercury Filter Definition for HUD -->
      <svg style="position: absolute; width: 0; height: 0; pointer-events: none;">
        <defs>
          <filter id="hud-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -8" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <style>
        #game-hud {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 1.5rem;
          color: #ffffff;
          font-family: var(--font-mono);
          user-select: none;
          box-sizing: border-box;
          z-index: 10;
        }

        /* Frosted Smoked Glass Capsules - Rounded modern racing pills */
        .hud-glass-surface {
          background: rgba(15, 23, 42, 0.72);
          backdrop-filter: blur(24px) saturate(190%);
          -webkit-backdrop-filter: blur(24px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 16px;
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.24),
            0 14px 36px rgba(0, 0, 0, 0.5);
          pointer-events: auto;
          box-sizing: border-box;
          transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.4, 1), box-shadow 0.2s;
        }

        /* Top Bar */
        .hud-top-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          width: 100%;
        }

        /* Top-Left: Time & Best Card */
        .hud-time-card {
          padding: 12px 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 200px;
          border-radius: 16px;
        }

        .hud-meta-header {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .hud-meta-label {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .hud-timer-digits {
          font-size: 1.95rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.02em;
          line-height: 1.1;
          font-variant-numeric: tabular-nums;
          text-shadow: 0 2px 10px rgba(56, 189, 248, 0.35);
        }

        .hud-best-row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding-top: 6px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          font-size: 0.75rem;
          color: #cbd5e1;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .hud-best-row .crown-icon {
          display: inline-flex;
          align-items: center;
        }

        /* Top-Right: Controls & Checkpoint Badge */
        .hud-top-right-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .hud-btn-util {
          background: rgba(15, 23, 42, 0.70);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 8px 24px rgba(0, 0, 0, 0.4);
          color: #ffffff;
          padding: 10px 18px;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.4, 1);
          pointer-events: auto;
        }

        .hud-btn-util:hover {
          background: #ffffff;
          color: #000000;
          border-color: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(255, 255, 255, 0.35);
        }

        .hud-checkpoint-badge {
          padding: 12px 20px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          min-width: 155px;
          border-radius: 16px;
        }

        .hud-checkpoint-digits {
          font-size: 1.45rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 0.04em;
          line-height: 1.1;
          margin-top: 2px;
          text-shadow: 0 2px 8px rgba(244, 63, 94, 0.35);
        }

        .hud-checkpoint-meter-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 6px;
        }

        .cp-pill {
          width: 15px;
          height: 6px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.2);
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .cp-pill.reached {
          background: #f43f5e;
          box-shadow: 0 0 10px #f43f5e, 0 0 18px rgba(244, 63, 94, 0.6);
        }

        .cp-pill.current {
          background: #ffffff;
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
          animation: cp-pulse 1.2s infinite alternate ease-in-out;
        }

        @keyframes cp-pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.2); opacity: 1; }
        }

        /* Center Toast (Floating Liquid Capsule) */
        .hud-center-toast {
          align-self: center;
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(56, 189, 248, 0.65);
          border-radius: 14px;
          color: #ffffff;
          padding: 0.85rem 2.4rem;
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          box-shadow: 
            0 0 30px rgba(56, 189, 248, 0.4),
            0 16px 40px rgba(0, 0, 0, 0.7);
          opacity: 0;
          transform: translateY(14px) scale(0.94);
          transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
          pointer-events: none;
        }

        .hud-center-toast.visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }

        /* Coach Toast (Bottom-Center Pill) */
        .hud-coach-toast {
          position: absolute;
          bottom: 5.8rem;
          left: 50%;
          transform: translateX(-50%) translateY(10px) scale(0.96);
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(24px) saturate(190%);
          -webkit-backdrop-filter: blur(24px) saturate(190%);
          border: 1px solid rgba(250, 204, 21, 0.65);
          border-radius: 9999px;
          color: #ffffff;
          padding: 0.65rem 1.6rem;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          box-shadow: 
            0 0 24px rgba(250, 204, 21, 0.25),
            0 12px 32px rgba(0, 0, 0, 0.65);
          opacity: 0;
          pointer-events: none;
          transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 25;
          white-space: nowrap;
        }

        .hud-coach-toast.visible {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }

        /* Bottom Bar */
        .hud-bottom-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          width: 100%;
        }

        /* Bottom-Left: Dynamic Island Elastic Gooey Controller Pill */
        .hud-dynamic-island-wrap {
          position: relative;
          display: inline-flex;
          align-items: center;
          pointer-events: auto;
          filter: drop-shadow(0 12px 32px rgba(0, 0, 0, 0.5));
        }

        .hud-goo-layer {
          position: absolute;
          inset: -4px -14px -4px -4px;
          pointer-events: none;
          filter: url(#hud-goo);
          z-index: 1;
        }

        .island-main-capsule {
          position: absolute;
          inset: 4px 14px 4px 4px;
          background: rgba(15, 23, 42, 0.85);
          border-radius: 14px;
        }

        .island-droplet {
          position: absolute;
          right: 16px;
          top: 50%;
          width: 14px;
          height: 14px;
          margin-top: -7px;
          border-radius: 50%;
          background: #38bdf8;
          opacity: 0;
          box-shadow: 0 0 12px #38bdf8;
          transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.25), opacity 0.25s;
          will-change: transform, opacity;
        }

        .hud-tilt-pill {
          position: relative;
          z-index: 5;
          padding: 11px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-radius: 16px;
          background: rgba(15, 23, 42, 0.72);
          backdrop-filter: blur(24px) saturate(190%);
          -webkit-backdrop-filter: blur(24px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s, border-color 0.2s;
        }

        .hud-tilt-pill.pulse {
          transform: scale(1.04);
          border-color: rgba(56, 189, 248, 0.6);
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.3),
            0 0 25px rgba(56, 189, 248, 0.45);
        }

        .hud-phone-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #38bdf8;
          border: 1.5px solid #ffffff;
          box-shadow: 0 0 10px #38bdf8;
          animation: dot-breathe 2s infinite ease-in-out;
        }

        @keyframes dot-breathe {
          0%, 100% { opacity: 0.75; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.1); box-shadow: 0 0 14px #38bdf8; }
        }

        .hud-tilt-text {
          display: flex;
          flex-direction: column;
        }

        .hud-tilt-title {
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #ffffff;
          line-height: 1.1;
        }

        .hud-tilt-sub {
          font-size: 0.72rem;
          font-weight: 400;
          letter-spacing: 0.04em;
          color: #94a3b8;
          text-transform: uppercase;
          margin-top: 2px;
        }

        /* Bottom-Right: Speedometer Pill */
        .hud-speedometer-group {
          padding: 12px 22px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          min-width: 170px;
          border-radius: 16px;
        }

        .speedo-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }

        .speedo-number {
          font-size: 2.3rem;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.0;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
        }

        .speedo-unit {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .speedo-meter-track {
          width: 150px;
          height: 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.12);
          overflow: hidden;
          margin-top: 6px;
          position: relative;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
        }

        .speedo-meter-fill {
          height: 100%;
          width: 0%;
          border-radius: 4px;
          background: linear-gradient(90deg, #38bdf8 0%, #fbbf24 60%, #ef4444 100%);
          transition: width 0.08s ease-out;
          box-shadow: 0 0 12px rgba(56, 189, 248, 0.6);
        }

        /* Victory Modal */
        #victory-modal {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.88);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          z-index: 60;
          padding: 1.5rem;
        }

        .victory-card {
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1.5px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.25),
            0 40px 90px rgba(0, 0, 0, 0.95);
          padding: 2.75rem 2.25rem;
          text-align: center;
          max-width: 480px;
          width: 100%;
          box-sizing: border-box;
          position: relative;
        }

        .victory-card h2 {
          color: #ffffff;
          font-size: 1.8rem;
          font-weight: 700;
          letter-spacing: -0.04em;
          text-transform: uppercase;
          margin-bottom: 0.5rem;
        }

        .victory-card p {
          color: #94a3b8;
          font-size: 0.9rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 2rem;
        }

        .victory-time-display {
          font-size: 2.6rem;
          font-weight: 700;
          color: #ffffff;
          margin: 1rem 0;
          letter-spacing: -0.02em;
        }

        .victory-actions {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }

        .victory-btn-primary {
          background: #ffffff;
          color: #000000;
          border: 1.5px solid #ffffff;
          border-radius: 12px;
          padding: 0.95rem 1.8rem;
          font-family: var(--font-mono);
          font-size: 0.95rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.4, 1);
          box-shadow: 0 4px 18px rgba(255, 255, 255, 0.25);
        }

        .victory-btn-primary:hover {
          background: #38bdf8;
          border-color: #38bdf8;
          color: #000000;
          box-shadow: 0 6px 24px rgba(56, 189, 248, 0.45);
          transform: translateY(-1px);
        }

        .victory-btn-secondary {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
          color: #ffffff;
          padding: 0.85rem 1.6rem;
          font-family: var(--font-mono);
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.4, 1);
        }

        .victory-btn-secondary:hover {
          border-color: #ffffff;
          color: #ffffff;
          background: rgba(255, 255, 255, 0.12);
          transform: translateY(-1px);
        }
      </style>

      <!-- TOP BAR -->
      <div class="hud-top-bar">
        <!-- Top-Left: Time & Best Card -->
        <div class="hud-glass-surface hud-time-card">
          <div class="hud-meta-header">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="14" r="8"/>
              <line x1="12" y1="14" x2="12" y2="10"/>
              <line x1="12" y1="2" x2="12" y2="4"/>
              <line x1="10" y1="2" x2="14" y2="2"/>
            </svg>
            <span class="hud-meta-label">TIME</span>
          </div>
          <span id="hud-timer" class="hud-timer-digits">00:00.00</span>
          <div class="hud-best-row">
            <span class="crown-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#facc15" stroke="#facc15" stroke-width="1.5">
                <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9 12 2"/>
              </svg>
            </span>
            <span style="color: #94a3b8;">RECORD:</span>
            <span id="hud-best" style="font-weight: 700; color: #ffffff;">01:15.20</span>
          </div>
        </div>

        <!-- Top-Right: Controls & Checkpoint Badge -->
        <div class="hud-top-right-group">
          <button id="hud-btn-lobby" class="hud-btn-util">LOBBY // ESC</button>
          <button id="hud-btn-lab" class="hud-btn-util">TELEMETRY // F3</button>

          <div class="hud-glass-surface hud-checkpoint-badge">
            <div class="hud-meta-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                <line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
              <span class="hud-meta-label">CHECKPOINT</span>
            </div>
            <span id="hud-checkpoint" class="hud-checkpoint-digits">0 / 4</span>
            <div id="hud-checkpoint-meter" class="hud-checkpoint-meter-row"></div>
          </div>
        </div>
      </div>

      <!-- CENTER TOAST -->
      <div id="hud-toast" class="hud-center-toast">[ CHECKPOINT LOGGED ]</div>

      <!-- COACH TOAST (Bottom-Center Pill) -->
      <div id="hud-coach-toast" class="hud-coach-toast"></div>

      <!-- BOTTOM BAR -->
      <div class="hud-bottom-bar">
        <!-- Bottom-Left: Dynamic Island Elastic Gooey Controller Pill -->
        <div class="hud-dynamic-island-wrap" id="hud-island-wrap">
          <div class="hud-goo-layer">
            <div class="island-main-capsule"></div>
            <div class="island-droplet" id="island-droplet"></div>
          </div>
          <div class="hud-tilt-pill" id="hud-tilt-pill">
            <div class="hud-phone-indicator" id="hud-phone-indicator"></div>
            <div class="hud-tilt-text">
              <span class="hud-tilt-title" id="hud-tilt-title">MOTION CONTROLLER // ACTIVE</span>
              <span class="hud-tilt-sub" id="hud-tilt-sub">100HZ STREAM • TILT TO STEER</span>
            </div>
          </div>
        </div>

        <!-- Bottom-Right: Segmented LED Speedometer -->
        <div class="hud-glass-surface hud-speedometer-group">
          <div class="hud-meta-header" style="justify-content: flex-end; width: 100%;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v2"/>
              <path d="M4.93 4.93l1.41 1.41"/>
              <path d="M20 12h2"/>
              <path d="M19.07 4.93l-1.41 1.41"/>
              <path d="M15.54 8.46a5 5 0 0 0-7.07 0"/>
              <path d="M12 14v-4"/>
            </svg>
            <span class="hud-meta-label">SPEED</span>
          </div>
          <div class="speedo-row">
            <span id="speedo-value" class="speedo-number">0</span>
            <span class="speedo-unit">KM/H</span>
          </div>
          <div class="speedo-meter-track">
            <div id="speedo-meter-fill" class="speedo-meter-fill"></div>
          </div>
        </div>
      </div>

      <!-- VICTORY MODAL -->
      <div id="victory-modal">
        <div class="victory-card">
          <span class="hud-meta-label" style="color: #38bdf8;">[ MISSION DEBRIEF // SECTOR COMPLETE ]</span>
          <h2 style="margin-top: 0.5rem;">SECTOR CLEARED</h2>
          <div id="victory-time" class="victory-time-display">00:00.00</div>
          <p>PHYSICAL MOTION CONTROLLER PERFORMANCE LOGGED</p>
          <div class="victory-actions">
            <button id="victory-next-btn" class="victory-btn-primary">
              NEXT SECTOR &rarr;
            </button>
            <button id="victory-retry-btn" class="victory-btn-secondary">
              REPLAY SECTOR
            </button>
            <button id="victory-lobby-btn" class="victory-btn-secondary">
              RETURN TO LOBBY
            </button>
          </div>
        </div>
      </div>
    `;

    this.timerEl = this.container.querySelector('#hud-timer')!;
    this.bestEl = this.container.querySelector('#hud-best')!;
    this.checkpointEl = this.container.querySelector('#hud-checkpoint')!;
    this.checkpointMeterEl = this.container.querySelector('#hud-checkpoint-meter')!;
    this.speedoValueEl = this.container.querySelector('#speedo-value')!;
    this.speedoFillEl = this.container.querySelector('#speedo-meter-fill')!;
    this.toastEl = this.container.querySelector('#hud-toast')!;
    this.coachToastEl = this.container.querySelector('#hud-coach-toast')!;
    this.victoryModal = this.container.querySelector('#victory-modal')!;
    this.victoryTimeEl = this.container.querySelector('#victory-time')!;
    this.tiltPillEl = this.container.querySelector('#hud-tilt-pill')!;
    this.tiltTitleEl = this.container.querySelector('#hud-tilt-title')!;
    this.tiltSubEl = this.container.querySelector('#hud-tilt-sub')!;
    this.islandDropletEl = this.container.querySelector('#island-droplet')!;

    this.container.querySelector('#hud-btn-lab')!.addEventListener('click', () => {
      this.callbacks.onToggleTelemetryLab();
    });

    this.container.querySelector('#hud-btn-lobby')!.addEventListener('click', () => {
      this.callbacks.onReturnToLobby();
    });

    this.container.querySelector('#victory-next-btn')!.addEventListener('click', () => {
      this.victoryModal.style.display = 'none';
      this.callbacks.onNextLevel();
    });

    this.container.querySelector('#victory-retry-btn')!.addEventListener('click', () => {
      this.victoryModal.style.display = 'none';
      this.callbacks.onRestartLevel();
    });

    this.container.querySelector('#victory-lobby-btn')!.addEventListener('click', () => {
      this.victoryModal.style.display = 'none';
      this.callbacks.onReturnToLobby();
    });
  }

  public setLevel(level: LevelDef): void {
    this.currentLevelId = level.id;
    const bestSecs = this.bestTimes[level.id] || 60.0;
    this.bestEl.textContent = this.formatTimeSecs(bestSecs);
    this.resetTimer();
    this.startTimer();
    this.victoryModal.style.display = 'none';
  }

  public setCheckpoints(current: number, total: number): void {
    this.checkpointEl.textContent = `${current} / ${total}`;
    this.checkpointMeterEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const pill = document.createElement('div');
      pill.className = 'cp-pill';
      if (i < current) {
        pill.classList.add('reached');
      } else if (i === current) {
        pill.classList.add('current');
      }
      this.checkpointMeterEl.appendChild(pill);
    }
  }

  public startTimer(): void {
    this.startTime = performance.now();
    this.timerRunning = true;
  }

  public resetTimer(): void {
    this.startTime = performance.now();
    this.timerEl.textContent = '00:00.00';
  }

  public update(speedMps: number): void {
    if (this.timerRunning) {
      const elapsed = performance.now() - this.startTime;
      const mins = Math.floor(elapsed / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000);
      const ms = Math.floor((elapsed % 1000) / 10);
      this.timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    // Convert speed from m/s to km/h (speed * 3.6)
    const speedKmH = Math.round(speedMps * 3.6);
    this.speedoValueEl.textContent = `${speedKmH}`;

    // Fill percentage up to 45 km/h
    const maxSpeed = 45;
    const pct = Math.min(Math.max((speedKmH / maxSpeed) * 100, 0), 100);
    this.speedoFillEl.style.width = `${pct}%`;

    // Dynamic Island Gooey Droplet stretch & pulse when high speed / boosting
    if (speedKmH > 35) {
      this.tiltPillEl.classList.add('pulse');
      if (this.islandDropletEl) {
        this.islandDropletEl.style.opacity = '0.9';
        this.islandDropletEl.style.transform = 'translateX(14px) scale(1.2)';
      }
    } else if (speedKmH > 10) {
      this.tiltPillEl.classList.remove('pulse');
      if (this.islandDropletEl) {
        const offset = ((speedKmH - 10) / 25) * 8;
        this.islandDropletEl.style.opacity = '0.75';
        this.islandDropletEl.style.transform = `translateX(${offset}px) scale(1.0)`;
      }
    } else {
      this.tiltPillEl.classList.remove('pulse');
      if (this.islandDropletEl) {
        this.islandDropletEl.style.opacity = '0';
        this.islandDropletEl.style.transform = 'translateX(0px) scale(0.8)';
      }
    }
  }

  private formatTimeSecs(totalSecs: number): string {
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    const cs = Math.floor((totalSecs % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }

  public updateLatency(rttMs: number, hz: number, _jitterMs: number, isKeyboard: boolean): void {
    if (this.tiltTitleEl && this.tiltSubEl) {
      if (isKeyboard) {
        this.tiltTitleEl.textContent = 'KEYBOARD // WASD';
        this.tiltSubEl.textContent = 'STEER WITH KEYS • SHIFT: NITRO';
      } else {
        this.tiltTitleEl.textContent = 'MOTION CONTROLLER // ACTIVE';
        this.tiltSubEl.textContent = `${hz}HZ STREAM • ${Math.round(rttMs)}MS RTT`;
      }
    }
  }

  public showToast(text: string, _color: string = '#ffffff'): void {
    this.toastEl.textContent = `[ ${text.toUpperCase()} ]`;
    this.toastEl.classList.add('visible');

    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 1200);
  }

  public showCoachToast(text: string): void {
    this.coachToastEl.textContent = `[ ${text.toUpperCase()} ]`;
    this.coachToastEl.classList.add('visible');

    if (this.coachToastTimer) window.clearTimeout(this.coachToastTimer);
    this.coachToastTimer = window.setTimeout(() => {
      this.coachToastEl.classList.remove('visible');
    }, 2500);
  }

  public showVictory(): void {
    this.timerRunning = false;
    this.victoryTimeEl.textContent = this.timerEl.textContent;
    this.victoryModal.style.display = 'flex';

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  }
}
