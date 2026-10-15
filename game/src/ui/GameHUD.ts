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
  private speedoValueEl!: HTMLElement;
  private speedoArcEl!: SVGPathElement;
  private toastEl!: HTMLElement;
  private victoryModal!: HTMLElement;
  private victoryTimeEl!: HTMLElement;

  private startTime: number = 0;
  private timerRunning = false;
  private toastTimer: number | null = null;
  private bestTimes: Record<number, number> = {
    1: 75.2,  // 01:15.20 from reference screenshot
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
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          user-select: none;
        }

        .hud-glass-panel {
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.25);
          pointer-events: auto;
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
          border-radius: 16px;
          padding: 12px 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 170px;
        }

        .hud-time-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .hud-icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          color: #f8fafc;
        }

        .hud-label-col {
          display: flex;
          flex-direction: column;
        }

        .hud-meta-label {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .hud-timer-digits {
          font-family: ui-monospace, SFMono-Regular, "SF Pro Display", monospace;
          font-size: 1.55rem;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 0.02em;
          line-height: 1.1;
        }

        .hud-best-row {
          padding-top: 4px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .hud-best-digits {
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 1.0rem;
          font-weight: 700;
          color: #cbd5e1;
          letter-spacing: 0.02em;
        }

        /* Top-Right: Checkpoint Badge & Menu */
        .hud-top-right-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .hud-checkpoint-badge {
          border-radius: 14px;
          padding: 10px 22px;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 120px;
        }

        .hud-checkpoint-digits {
          font-size: 1.45rem;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 0.04em;
          line-height: 1.1;
          margin-top: 2px;
        }

        .hud-util-btn {
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #f1f5f9;
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          pointer-events: auto;
        }

        .hud-util-btn:hover {
          background: rgba(30, 41, 59, 0.85);
          border-color: #38bdf8;
          color: #38bdf8;
        }

        /* Center Toast */
        .hud-center-toast {
          align-self: center;
          background: rgba(15, 23, 42, 0.88);
          backdrop-filter: blur(12px);
          border: 1.5px solid #38bdf8;
          color: #38bdf8;
          padding: 0.75rem 2rem;
          border-radius: 9999px;
          font-size: 1.25rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          opacity: 0;
          transform: translateY(12px);
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          pointer-events: none;
        }

        .hud-center-toast.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* Bottom Bar */
        .hud-bottom-bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          width: 100%;
        }

        /* Bottom-Left: Tilt to Steer Controller Pill */
        .hud-tilt-pill {
          border-radius: 16px;
          padding: 12px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .hud-phone-icon {
          width: 32px;
          height: 32px;
          color: #ffffff;
        }

        .hud-tilt-text {
          display: flex;
          flex-direction: column;
        }

        .hud-tilt-title {
          font-size: 0.95rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #ffffff;
          line-height: 1.1;
        }

        .hud-tilt-sub {
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #cbd5e1;
        }

        /* Bottom-Right: Arc Gauge Speedometer */
        .hud-speedometer-group {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-width: 110px;
          height: 80px;
          pointer-events: auto;
        }

        .speedo-arc-svg {
          position: absolute;
          left: 0;
          top: 0;
          width: 110px;
          height: 80px;
          pointer-events: none;
        }

        .speedo-readout {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          z-index: 2;
          margin-left: 42px;
        }

        .speedo-number {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 2.4rem;
          font-weight: 800;
          color: #ffffff;
          line-height: 1.0;
          letter-spacing: -0.02em;
        }

        .speedo-unit {
          font-size: 0.75rem;
          font-weight: 700;
          color: #94a3b8;
          margin-top: 1px;
          text-transform: lowercase;
        }

        /* Victory Modal */
        #victory-modal {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(12px);
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          z-index: 60;
        }

        .victory-card {
          background: rgba(30, 41, 59, 0.95);
          border: 2px solid #10b981;
          box-shadow: 0 25px 50px -12px rgba(16, 185, 129, 0.25);
          border-radius: 20px;
          padding: 2.5rem;
          text-align: center;
          max-width: 440px;
          width: 90%;
        }

        .victory-card h2 {
          color: #10b981;
          font-size: 2.2rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
        }

        .victory-card p {
          color: #cbd5e1;
          font-size: 1.1rem;
          margin-bottom: 1.8rem;
        }

        .victory-actions {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
      </style>

      <!-- TOP BAR -->
      <div class="hud-top-bar">
        <!-- Top-Left: Time & Best Card -->
        <div class="hud-glass-panel hud-time-card">
          <div class="hud-time-row">
            <div class="hud-icon-wrap">
              <!-- Stopwatch SVG Icon -->
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
                <circle cx="12" cy="13" r="8"></circle>
                <path d="M12 9v4l2.5 2.5"></path>
                <path d="M10 2h4"></path>
                <path d="M12 2v3"></path>
              </svg>
            </div>
            <div class="hud-label-col">
              <span class="hud-meta-label">TIME</span>
              <span id="hud-timer" class="hud-timer-digits">00:00.00</span>
            </div>
          </div>

          <div class="hud-time-row hud-best-row">
            <div class="hud-icon-wrap" style="color: #fbbf24;">
              <!-- Crown SVG Icon -->
              <svg viewBox="0 0 24 24" fill="#fbbf24" width="20" height="20">
                <path d="M2 19h20v2H2zM3 17l3.5-9 5.5 6 5.5-6 3.5 9z"></path>
              </svg>
            </div>
            <div class="hud-label-col">
              <span class="hud-meta-label">BEST</span>
              <span id="hud-best" class="hud-best-digits">01:15.20</span>
            </div>
          </div>
        </div>

        <!-- Top-Right: Checkpoint Badge & Controls -->
        <div class="hud-top-right-group">
          <button id="hud-btn-lobby" class="hud-util-btn">Lobby</button>
          <button id="hud-btn-lab" class="hud-util-btn">Telemetry [T]</button>

          <div class="hud-glass-panel hud-checkpoint-badge">
            <span class="hud-meta-label">CHECKPOINT</span>
            <span id="hud-checkpoint" class="hud-checkpoint-digits">1 / 4</span>
          </div>
        </div>
      </div>

      <!-- CENTER TOAST -->
      <div id="hud-toast" class="hud-center-toast">CHECKPOINT!</div>

      <!-- BOTTOM BAR -->
      <div class="hud-bottom-bar">
        <!-- Bottom-Left: Tilt to Steer Controller Pill -->
        <div class="hud-glass-panel hud-tilt-pill">
          <div class="hud-phone-icon">
            <!-- Mobile Phone Tilt Icon with Rotation Motion Arcs -->
            <svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="32" height="32">
              <path d="M5 12 C3 16, 3 20, 5 24" stroke="#94a3b8" stroke-width="2"/>
              <path d="M31 12 C33 16, 33 20, 31 24" stroke="#94a3b8" stroke-width="2"/>
              <rect x="11" y="6" width="14" height="24" rx="3.5" stroke="#ffffff" fill="rgba(255,255,255,0.05)"/>
              <circle cx="18" cy="25" r="1.2" fill="#ffffff"/>
            </svg>
          </div>
          <div class="hud-tilt-text">
            <span class="hud-tilt-title">TILT</span>
            <span class="hud-tilt-sub">TO STEER</span>
          </div>
        </div>

        <!-- Bottom-Right: Arc Gauge Speedometer -->
        <div class="hud-speedometer-group">
          <svg class="speedo-arc-svg" viewBox="0 0 110 80">
            <!-- Dim background guide arc on left flank -->
            <path
              d="M 36 68 A 38 38 0 0 1 38 14"
              fill="none"
              stroke="rgba(255, 255, 255, 0.2)"
              stroke-width="5"
              stroke-linecap="round"
            />
            <!-- Glowing active speed arc on left flank -->
            <path
              id="speedo-fill-arc"
              d="M 36 68 A 38 38 0 0 1 38 14"
              fill="none"
              stroke="#67e8f9"
              stroke-width="5.5"
              stroke-linecap="round"
              stroke-dasharray="64"
              stroke-dashoffset="64"
              style="transition: stroke-dashoffset 0.08s ease-out; filter: drop-shadow(0 0 6px rgba(103, 232, 249, 0.7));"
            />
          </svg>
          <div class="speedo-readout">
            <span id="speedo-value" class="speedo-number">0</span>
            <span class="speedo-unit">km/h</span>
          </div>
        </div>
      </div>

      <!-- VICTORY MODAL -->
      <div id="victory-modal">
        <div class="victory-card">
          <h2>COURSE CLEARED!</h2>
          <p>Labyrinth completed in <strong id="victory-time" style="color: #f8fafc;">00:00.00</strong></p>
          <div class="victory-actions">
            <button id="victory-next-btn" class="hud-util-btn" style="background: #0284c7; padding: 0.9rem; font-size: 1.05rem; font-weight: 700;">
              Next Course &rarr;
            </button>
            <button id="victory-retry-btn" class="hud-util-btn" style="padding: 0.75rem;">
              Replay Course
            </button>
            <button id="victory-lobby-btn" class="hud-util-btn" style="padding: 0.75rem;">
              Back to Lobby
            </button>
          </div>
        </div>
      </div>
    `;

    this.timerEl = this.container.querySelector('#hud-timer')!;
    this.bestEl = this.container.querySelector('#hud-best')!;
    this.checkpointEl = this.container.querySelector('#hud-checkpoint')!;
    this.speedoValueEl = this.container.querySelector('#speedo-value')!;
    this.speedoArcEl = this.container.querySelector('#speedo-fill-arc')!;
    this.toastEl = this.container.querySelector('#hud-toast')!;
    this.victoryModal = this.container.querySelector('#victory-modal')!;
    this.victoryTimeEl = this.container.querySelector('#victory-time')!;

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

    // Arc gauge fill: Max 50 km/h, path length is ~64
    const maxSpeed = 50;
    const ratio = Math.min(Math.max(speedKmH / maxSpeed, 0), 1);
    const offset = 64 * (1 - ratio);
    this.speedoArcEl.style.strokeDashoffset = offset.toFixed(1);
  }

  private formatTimeSecs(totalSecs: number): string {
    const mins = Math.floor(totalSecs / 60);
    const secs = Math.floor(totalSecs % 60);
    const cs = Math.floor((totalSecs % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }

  public updateLatency(_rttMs: number, _hz: number, _jitterMs: number, _isKeyboard: boolean): void {
    // Latency telemetry can be inspected anytime via the Telemetry Lab [T] button
  }

  public showToast(text: string, color: string = '#38bdf8'): void {
    this.toastEl.textContent = text;
    this.toastEl.style.color = color;
    this.toastEl.style.borderColor = color;
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
      particleCount: 120,
      spread: 75,
      origin: { y: 0.6 },
    });
  }
}
