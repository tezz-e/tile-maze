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
  private victoryModal!: HTMLElement;
  private victoryTimeEl!: HTMLElement;
  private tiltPillEl!: HTMLElement;
  private tiltTitleEl!: HTMLElement;
  private tiltSubEl!: HTMLElement;
  private islandDropletEl!: HTMLElement;

  private startTime: number = 0;
  private timerRunning = false;
  private toastTimer: number | null = null;
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

        /* Frosted Smoked Acrylic Glass Surface - Rounded organic capsules */
        .hud-glass-surface {
          background: rgba(12, 12, 16, 0.78);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 20px;
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.22),
            0 12px 32px rgba(0, 0, 0, 0.6);
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
          padding: 12px 18px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 190px;
          border-radius: 22px;
        }

        .hud-meta-label {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #888888;
          text-transform: uppercase;
        }

        .hud-timer-digits {
          font-size: 1.85rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.02em;
          line-height: 1.1;
        }

        .hud-best-row {
          display: flex;
          align-items: center;
          gap: 6px;
          padding-top: 6px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 0.75rem;
          color: #888888;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .hud-best-row .red-dot {
          color: #EA3323;
          font-weight: 700;
          font-size: 0.65rem;
        }

        /* Top-Right: Controls & Checkpoint Badge */
        .hud-top-right-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .hud-btn-util {
          background: rgba(14, 14, 20, 0.72);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 9999px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
          color: #ffffff;
          padding: 9px 18px;
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
          box-shadow: 0 4px 16px rgba(255, 255, 255, 0.3);
        }

        .hud-checkpoint-badge {
          padding: 12px 18px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          min-width: 150px;
          border-radius: 22px;
        }

        .hud-checkpoint-digits {
          font-size: 1.35rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 0.04em;
          line-height: 1.1;
          margin-top: 2px;
        }

        .hud-checkpoint-meter-row {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 6px;
        }

        .cp-pill {
          width: 14px;
          height: 5px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.2);
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .cp-pill.reached {
          background: #EA3323;
          box-shadow: 0 0 10px #EA3323, 0 0 18px rgba(234, 51, 35, 0.6);
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
          background: rgba(10, 10, 14, 0.92);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(234, 51, 35, 0.65);
          border-radius: 9999px;
          color: #ffffff;
          padding: 0.75rem 2.2rem;
          font-size: 0.92rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          box-shadow: 
            0 0 30px rgba(234, 51, 35, 0.4),
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
          filter: drop-shadow(0 12px 32px rgba(0, 0, 0, 0.6));
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
          background: rgba(12, 12, 16, 0.88);
          border-radius: 9999px;
        }

        .island-droplet {
          position: absolute;
          right: 2px;
          top: 50%;
          width: 18px;
          height: 18px;
          margin-top: -9px;
          border-radius: 50%;
          background: #EA3323;
          opacity: 0.85;
          box-shadow: 0 0 12px #EA3323;
          transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.25);
          will-change: transform;
        }

        .hud-tilt-pill {
          position: relative;
          z-index: 5;
          padding: 12px 22px;
          display: flex;
          align-items: center;
          gap: 14px;
          border-radius: 9999px;
          background: rgba(12, 12, 16, 0.78);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.16);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s, border-color 0.2s;
        }

        .hud-tilt-pill.pulse {
          transform: scale(1.04);
          border-color: rgba(234, 51, 35, 0.6);
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.3),
            0 0 25px rgba(234, 51, 35, 0.45);
        }

        .hud-phone-indicator {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #EA3323;
          border: 1.5px solid #ffffff;
          box-shadow: 0 0 10px #EA3323;
          animation: dot-breathe 2s infinite ease-in-out;
        }

        @keyframes dot-breathe {
          0%, 100% { opacity: 0.75; transform: scale(0.95); }
          50% { opacity: 1; transform: scale(1.1); box-shadow: 0 0 14px #EA3323; }
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
          color: #888888;
          text-transform: uppercase;
          margin-top: 2px;
        }

        /* Bottom-Right: Rounded Speedometer Group */
        .hud-speedometer-group {
          padding: 12px 20px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          min-width: 160px;
          border-radius: 22px;
        }

        .speedo-number {
          font-size: 2.2rem;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.0;
          letter-spacing: -0.03em;
        }

        .speedo-unit {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #888888;
          text-transform: uppercase;
          margin-top: 2px;
        }

        .speedo-meter-track {
          width: 140px;
          height: 6px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.12);
          overflow: hidden;
          margin-top: 6px;
          position: relative;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
        }

        .speedo-meter-fill {
          height: 100%;
          width: 0%;
          border-radius: 9999px;
          background: linear-gradient(90deg, #ffffff 0%, #EA3323 100%);
          transition: width 0.08s ease-out;
          box-shadow: 0 0 12px rgba(234, 51, 35, 0.6);
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
          background: rgba(12, 12, 16, 0.86);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1.5px solid rgba(255, 255, 255, 0.2);
          border-radius: 28px;
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
          color: #888888;
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
          border-radius: 9999px;
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
          background: #EA3323;
          border-color: #EA3323;
          color: #ffffff;
          box-shadow: 0 6px 24px rgba(234, 51, 35, 0.45);
          transform: translateY(-1px);
        }

        .victory-btn-secondary {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 9999px;
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
          <span class="hud-meta-label">[ 01 // CHRONO ]</span>
          <span id="hud-timer" class="hud-timer-digits">00:00.00</span>
          <div class="hud-best-row">
            <span class="red-dot">■</span>
            <span>RECORD:</span>
            <span id="hud-best">01:15.20</span>
          </div>
        </div>

        <!-- Top-Right: Controls & Checkpoint Badge -->
        <div class="hud-top-right-group">
          <button id="hud-btn-lobby" class="hud-btn-util">[ LOBBY // ESC ]</button>
          <button id="hud-btn-lab" class="hud-btn-util">[ TELEMETRY // F3 ]</button>

          <div class="hud-glass-surface hud-checkpoint-badge">
            <span class="hud-meta-label">[ 02 // CHECKPOINT ]</span>
            <span id="hud-checkpoint" class="hud-checkpoint-digits">0 / 4</span>
            <div id="hud-checkpoint-meter" class="hud-checkpoint-meter-row"></div>
          </div>
        </div>
      </div>

      <!-- CENTER TOAST -->
      <div id="hud-toast" class="hud-center-toast">[ CHECKPOINT LOGGED ]</div>

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
          <span class="hud-meta-label">[ VELOCITY // KM/H ]</span>
          <span id="speedo-value" class="speedo-number">0</span>
          <div class="speedo-meter-track">
            <div id="speedo-meter-fill" class="speedo-meter-fill"></div>
          </div>
        </div>
      </div>

      <!-- VICTORY MODAL -->
      <div id="victory-modal">
        <div class="victory-card">
          <span class="hud-meta-label" style="color: #EA3323;">[ MISSION DEBRIEF // SECTOR COMPLETE ]</span>
          <h2 style="margin-top: 0.5rem;">SECTOR CLEARED</h2>
          <div id="victory-time" class="victory-time-display">00:00.00</div>
          <p>PHYSICAL MOTION CONTROLLER PERFORMANCE LOGGED</p>
          <div class="victory-actions">
            <button id="victory-next-btn" class="victory-btn-primary">
              [ NEXT SECTOR &rarr; ]
            </button>
            <button id="victory-retry-btn" class="victory-btn-secondary">
              [ REPLAY SECTOR ]
            </button>
            <button id="victory-lobby-btn" class="victory-btn-secondary">
              [ RETURN TO LOBBY ]
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
        this.islandDropletEl.style.transform = 'translateX(14px) scale(1.2)';
      }
    } else if (speedKmH > 15) {
      this.tiltPillEl.classList.remove('pulse');
      if (this.islandDropletEl) {
        const offset = ((speedKmH - 15) / 20) * 8;
        this.islandDropletEl.style.transform = `translateX(${offset}px) scale(1.05)`;
      }
    } else {
      this.tiltPillEl.classList.remove('pulse');
      if (this.islandDropletEl) {
        this.islandDropletEl.style.transform = 'translateX(0px) scale(1)';
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
