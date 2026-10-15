import QRCode from 'qrcode';
import type { LevelDef } from '../levels/LevelData.js';
import { LEVELS } from '../levels/LevelData.js';

export interface LobbyCallbacks {
  onStartGame: (selectedLevel: LevelDef) => void;
  onPlayKeyboard: (selectedLevel: LevelDef) => void;
  onOpenTelemetryLab: () => void;
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

  constructor(parent: HTMLElement, callbacks: LobbyCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.id = 'lobby-modal';
    this.container.className = 'interactive';
    this.buildDOM();
    parent.appendChild(this.container);
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <style>
        #lobby-modal {
          position: absolute;
          inset: 0;
          background: rgba(11, 15, 25, 0.94);
          backdrop-filter: blur(12px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 1.5rem;
          color: #f3f4f6;
        }
        .lobby-panel {
          background: #161e2e;
          border: 1px solid #374151;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
          border-radius: 16px;
          max-width: 780px;
          width: 100%;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .lobby-header {
          text-align: center;
        }
        .lobby-header h1 {
          font-size: 2.2rem;
          font-weight: 800;
          letter-spacing: -0.025em;
          color: #38bdf8;
          margin: 0;
        }
        .lobby-header p {
          color: #9ca3af;
          margin-top: 0.3rem;
          font-size: 0.95rem;
        }
        .lobby-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          align-items: center;
        }
        @media (max-width: 640px) {
          .lobby-grid { grid-template-columns: 1fr; }
        }
        .qr-card {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .room-code-tag {
          font-family: monospace;
          font-size: 2.4rem;
          font-weight: 900;
          letter-spacing: 0.25em;
          color: #38bdf8;
          background: #1e293b;
          padding: 0.3rem 1.2rem;
          border-radius: 8px;
          margin: 0.8rem 0;
          border: 1px solid #38bdf8;
        }
        .qr-canvas {
          border-radius: 8px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
          background: #ffffff;
          padding: 6px;
        }
        .slots-card {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .player-slot-chip {
          background: #1e293b;
          border: 1px solid #334155;
          padding: 0.9rem 1.2rem;
          border-radius: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .status-badge {
          font-size: 0.8rem;
          padding: 0.25rem 0.6rem;
          border-radius: 9999px;
          font-weight: 600;
        }
        .status-waiting { background: #475569; color: #cbd5e1; }
        .status-connected { background: #059669; color: #ecfdf5; }
        .status-recon { background: #d97706; color: #fffbeb; }
        .level-selector {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .level-tabs {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.5rem;
        }
        .level-tab-btn {
          background: #1e293b;
          border: 1px solid #374151;
          color: #d1d5db;
          padding: 0.6rem;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
          transition: all 0.2s;
        }
        .level-tab-btn.active {
          background: #0284c7;
          border-color: #38bdf8;
          color: #ffffff;
        }
        .actions-row {
          display: flex;
          gap: 0.8rem;
          margin-top: 0.5rem;
        }
        .btn-primary {
          flex: 1;
          background: #0284c7;
          hover: #0369a1;
          color: white;
          padding: 0.85rem;
          border-radius: 8px;
          border: none;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        .btn-primary:hover { background: #0369a1; }
        .btn-primary:disabled {
          background: #334155;
          color: #64748b;
          cursor: not-allowed;
        }
        .btn-secondary {
          background: #1e293b;
          color: #e2e8f0;
          padding: 0.85rem 1.2rem;
          border-radius: 8px;
          border: 1px solid #475569;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-secondary:hover { background: #334155; }
      </style>
      <div class="lobby-panel">
        <div class="lobby-header">
          <h1>TILTMAZE: KINETIC EDITION</h1>
          <p>Motion-Controlled 3D Physics Labyrinth & Telemetry Lab</p>
        </div>

        <div class="lobby-grid">
          <div class="qr-card">
            <span style="font-size: 0.85rem; color: #94a3b8; font-weight: 600;">PAIRING CODE</span>
            <div id="room-code-display" class="room-code-tag">----</div>
            <canvas id="qr-code-canvas" class="qr-canvas" width="180" height="180"></canvas>
            <span style="font-size: 0.8rem; color: #64748b; margin-top: 0.6rem;">Scan with Phone or Hotspot</span>
          </div>

          <div class="slots-card">
            <div class="player-slot-chip">
              <div>
                <strong>Player 1 (Controller)</strong>
                <div style="font-size: 0.8rem; color: #94a3b8;">Primary Motion Controller</div>
              </div>
              <span id="p1-status" class="status-badge status-waiting">Waiting...</span>
            </div>

            <div class="player-slot-chip">
              <div>
                <strong>Player 2 (Spectator/Co-op)</strong>
                <div style="font-size: 0.8rem; color: #94a3b8;">Optional Second Controller</div>
              </div>
              <span id="p2-status" class="status-badge status-waiting">Open</span>
            </div>

            <div class="level-selector">
              <span style="font-size: 0.85rem; color: #94a3b8; font-weight: 600;">SELECT COURSE</span>
              <div class="level-tabs">
                ${LEVELS.map(
                  (l, idx) => `
                  <button class="level-tab-btn ${idx === 0 ? 'active' : ''}" data-index="${idx}">
                    Lvl ${l.id}
                  </button>
                `
                ).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="actions-row">
          <button id="start-game-btn" class="btn-primary" disabled>Start with Phone</button>
          <button id="play-keyboard-btn" class="btn-secondary">Play with Keyboard (WASD)</button>
          <button id="telemetry-lab-btn" class="btn-secondary">Telemetry Lab [T]</button>
        </div>
      </div>
    `;

    this.roomCodeElement = this.container.querySelector('#room-code-display')!;
    this.qrCanvas = this.container.querySelector('#qr-code-canvas')!;
    this.p1StatusElement = this.container.querySelector('#p1-status')!;
    this.p2StatusElement = this.container.querySelector('#p2-status')!;
    this.startBtn = this.container.querySelector('#start-game-btn')!;

    // Level tab selection
    const levelButtons = this.container.querySelectorAll('.level-tab-btn');
    levelButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        levelButtons.forEach((b) => b.classList.remove('active'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('active');
        this.selectedLevelIndex = parseInt(target.dataset.index || '0', 10);
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

  public setRoomInfo(roomCode: string, lanIp: string, port: number): void {
    this.roomCodeElement.textContent = roomCode;

    // Payload formatted for phone scanner:
    const payload = JSON.stringify({
      wsUrl: `ws://${lanIp}:${port}`,
      roomCode,
    });

    QRCode.toCanvas(
      this.qrCanvas,
      payload,
      {
        width: 180,
        margin: 1,
        color: {
          dark: '#0f172a',
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
    if (!el) return;

    el.className = 'status-badge';
    if (status === 'connected') {
      el.classList.add('status-connected');
      el.textContent = name || 'Connected';
      if (slot === 1) {
        this.hasPlayer1 = true;
        this.startBtn.disabled = false;
      }
    } else if (status === 'reconnecting') {
      el.classList.add('status-recon');
      el.textContent = 'Reconnecting...';
    } else {
      el.classList.add('status-waiting');
      el.textContent = slot === 1 ? 'Waiting...' : 'Open';
      if (slot === 1) {
        this.hasPlayer1 = false;
        this.startBtn.disabled = true;
      }
    }
  }

  public show(): void {
    this.container.style.display = 'flex';
  }

  public hide(): void {
    this.container.style.display = 'none';
  }
}
