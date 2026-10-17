import confetti from 'canvas-confetti';
import { LEVELS, type LevelDef } from '../levels/LevelData.js';
import type { DifficultyMode } from '../physics/PhysicsWorld.js';

export interface HUDCallbacks {
  onNextLevel: () => void;
  onRestartLevel: () => void;
  onReturnToLobby: () => void;
  onToggleCameraView?: () => void;
}

export class GameHUD {
  private container: HTMLElement;
  private callbacks: HUDCallbacks;

  // HUD Elements
  private timerEl!: HTMLElement;
  private bestEl!: HTMLElement;
  private checkpointEl!: HTMLElement;
  private checkpointMeterEl!: HTMLElement;
  private modeBadgeEl!: HTMLElement;
  private speedoValueEl!: HTMLElement;
  private speedoFillEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private coachToastEl!: HTMLElement;
  private victoryModal!: HTMLElement;
  private victoryTimeEl!: HTMLElement;
  private victorySectorView!: HTMLElement;
  private victoryGrandView!: HTMLElement;
  private victorySectorTracker!: HTMLElement;
  private victoryTotalTimeEl!: HTMLElement;
  private victoryCampaignBreakdown!: HTMLElement;
  private disconnectOverlay!: HTMLElement;
  private disconnectTimerEl!: HTMLElement;
  private disconnectProgressFillEl!: HTMLElement;
  private disconnectInterval: number | null = null;
  private onContinueKeyboardCallback: (() => void) | null = null;
  private controllerCardEl!: HTMLElement;
  private controllerContentEl!: HTMLElement;
  private lastInputMode: 'keyboard' | 'phone' | null = null;
  private lastHz: number = 0;
  private lastRtt: number = 0;
  private sessionLevelTimes: Record<number, number> = {};

  private startTime: number = 0;
  private pausedTime: number = 0;
  private totalPausedDuration: number = 0;
  private timerRunning = false;
  private toastTimer: number | null = null;
  private coachToastTimer: number | null = null;
  private victoryBestEl!: HTMLElement;
  private victoryNewBadgeEl!: HTMLElement;
  private bestTimes: Record<number, number> = {};
  private currentLevelId: number = 1;
  private currentLevelName: string = 'Skyway Runway';

  constructor(parent: HTMLElement, callbacks: HUDCallbacks) {
    this.callbacks = callbacks;
    this.loadBestTimes();
    this.container = document.createElement('div');
    this.container.id = 'game-hud';
    this.buildDOM();
    parent.appendChild(this.container);
  }

  private loadBestTimes(): void {
    try {
      const raw = localStorage.getItem('tiltmaze_best_times');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            const numK = Number(k);
            const numV = Number(v);
            if (!isNaN(numK) && !isNaN(numV) && numV > 0) {
              this.bestTimes[numK] = numV;
            }
          }
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  private saveBestTimes(): void {
    try {
      localStorage.setItem('tiltmaze_best_times', JSON.stringify(this.bestTimes));
    } catch {
      // Ignore localStorage errors
    }
  }

  public getBestTimes(): Record<number, number> {
    return { ...this.bestTimes };
  }

  public getBestTime(levelId: number): number | null {
    return this.bestTimes[levelId] ?? null;
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
          background: rgba(14, 18, 28, 0.75);
          backdrop-filter: blur(28px) saturate(190%);
          -webkit-backdrop-filter: blur(28px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 12px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 8px 24px rgba(0, 0, 0, 0.45);
          color: #f1f5f9;
          padding: 8px 14px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.2, 0.8, 0.4, 1);
          pointer-events: auto;
          outline: none;
        }

        .hud-btn-util:hover {
          background: rgba(25, 32, 48, 0.9);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.35);
          transform: translateY(-1px);
        }

        .hud-checkpoint-badge {
          background: rgba(15, 23, 42, 0.72);
          backdrop-filter: blur(24px) saturate(190%);
          -webkit-backdrop-filter: blur(24px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 12px 32px rgba(0, 0, 0, 0.5);
          padding: 10px 18px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          min-width: 145px;
          border-radius: 16px;
        }

        .hud-checkpoint-digits {
          font-size: 1.45rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 0.02em;
          line-height: 1.1;
          margin-top: 2px;
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
          background: #38bdf8;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.65);
        }

        .cp-pill.current {
          background: #ffffff;
          box-shadow: 0 0 8px rgba(255, 255, 255, 0.85);
          animation: cp-pulse 1.2s infinite alternate ease-in-out;
        }

        @keyframes cp-pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.2); opacity: 1; }
        }

        /* Center Toast (Floating Liquid Capsule) */
        .hud-center-toast {
          align-self: center;
          background: rgba(14, 18, 28, 0.88);
          backdrop-filter: blur(28px) saturate(190%);
          -webkit-backdrop-filter: blur(28px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 9999px;
          color: #ffffff;
          padding: 0.7rem 2rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 0.92rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.25),
            0 14px 36px rgba(0, 0, 0, 0.6);
          opacity: 0;
          transform: translateY(12px) scale(0.96);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
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
          background: rgba(14, 18, 28, 0.88);
          backdrop-filter: blur(28px) saturate(190%);
          -webkit-backdrop-filter: blur(28px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 9999px;
          color: #f8fafc;
          padding: 0.6rem 1.6rem;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 0.84rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.25),
            0 12px 32px rgba(0, 0, 0, 0.65);
          opacity: 0;
          pointer-events: none;
          transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
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

        /* Bottom-Left: Harmonized Controller Card (.hud-glass-surface) */
        .hud-controller-card {
          padding: 12px 18px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 220px;
          border-radius: 16px;
          pointer-events: auto;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s, border-color 0.2s;
        }

        .hud-controller-card.speed-pulse {
          border-color: rgba(56, 189, 248, 0.55);
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.3),
            0 0 24px rgba(56, 189, 248, 0.4);
        }

        .hud-controller-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        /* Tactile Mechanical Keycaps (Nothing Tech / Teenage Engineering) */
        .hud-kbd-container {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .hud-keycap-cluster {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
        }

        .hud-keycaps-row {
          display: flex;
          gap: 3px;
        }

        .hud-keycap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 4px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-bottom: 2px solid rgba(255, 255, 255, 0.4);
          border-radius: 5px;
          font-family: var(--font-mono);
          font-size: 0.70rem;
          font-weight: 700;
          color: #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
          box-sizing: border-box;
        }

        .hud-keycap-sm {
          min-width: 17px;
          height: 17px;
          font-size: 0.62rem;
          padding: 0 3px;
          border-bottom-width: 1.5px;
        }

        .hud-kbd-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .hud-kbd-title {
          font-size: 0.82rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          line-height: 1.1;
        }

        .hud-kbd-sub {
          font-size: 0.68rem;
          font-weight: 500;
          color: #94a3b8;
          letter-spacing: 0.02em;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* Phone Connected State */
        .hud-phone-container {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .hud-phone-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #00ff66; /* Phosphor Green */
          border: 1.5px solid #ffffff;
          box-shadow: 0 0 10px #00ff66;
          animation: dot-breathe-green 1.8s infinite ease-in-out;
          flex-shrink: 0;
        }

        @keyframes dot-breathe-green {
          0%, 100% { opacity: 0.75; transform: scale(0.95); box-shadow: 0 0 6px #00ff66; }
          50% { opacity: 1; transform: scale(1.15); box-shadow: 0 0 14px #00ff66; }
        }

        .hud-phone-title {
          font-size: 0.82rem;
          font-weight: 700;
          color: #00ff66;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          line-height: 1.1;
        }

        .hud-phone-sub {
          font-size: 0.70rem;
          font-weight: 500;
          color: #cbd5e1;
          letter-spacing: 0.03em;
          font-variant-numeric: tabular-nums;
          margin-top: 1px;
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
          background: rgba(14, 14, 18, 0.78);
          backdrop-filter: blur(36px) saturate(190%);
          -webkit-backdrop-filter: blur(36px) saturate(190%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 24px;
          box-shadow: 
            inset 0 1.5px 1px 0 rgba(255, 255, 255, 0.22),
            0 32px 80px rgba(0, 0, 0, 0.85);
          padding: 2.25rem 2.25rem;
          text-align: center;
          max-width: 440px;
          width: 100%;
          box-sizing: border-box;
          position: relative;
        }

        .victory-header-tag {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-bottom: 0.4rem;
        }

        .victory-card h2 {
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 1.7rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin: 0;
        }

        .victory-time-wrap {
          margin: 1.25rem 0 1.5rem 0;
          padding: 1.15rem 1.4rem;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.035);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.45rem;
        }

        .victory-time-display {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 2.85rem;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }

        .victory-stats-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 0.25rem;
        }

        .victory-best-text {
          font-size: 0.82rem;
          color: #94a3b8;
          font-weight: 500;
          letter-spacing: 0.02em;
        }

        .victory-record-pill {
          display: none;
          padding: 0.25rem 0.65rem;
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.4);
          border-radius: 9999px;
          color: #10b981;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .victory-actions {
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          margin-top: 0.25rem;
        }

        .victory-glass-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 0.92rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          border-radius: 13px;
          padding: 0.82rem 1.4rem;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.16);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          box-sizing: border-box;
          outline: none;
        }
        .victory-glass-btn:active {
          transform: scale(0.975);
        }

        .victory-btn-primary {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(228, 233, 242, 0.92) 100%);
          border-color: rgba(255, 255, 255, 0.85);
          color: #0b0c10;
          box-shadow: 
            inset 0 1.5px 1px 0 rgba(255, 255, 255, 1),
            0 8px 24px rgba(0, 0, 0, 0.35);
        }
        .victory-btn-primary:hover {
          transform: translateY(-1px) scale(1.01);
          background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
          box-shadow: 
            inset 0 1.5px 1px 0 #ffffff,
            0 10px 28px rgba(0, 0, 0, 0.45);
        }

        .victory-btn-secondary {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
          border-color: rgba(255, 255, 255, 0.14);
          color: #cbd5e1;
          box-shadow: 
            inset 0 1px 0.5px 0 rgba(255, 255, 255, 0.25),
            0 6px 20px rgba(0, 0, 0, 0.3);
        }
        .victory-btn-secondary:hover {
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.3);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.06) 100%);
          transform: translateY(-1px);
        }

        /* In-Game Disconnect Reconnecting Overlay (ui-references) */
        .hud-disconnect-overlay {
          position: absolute;
          inset: 0;
          background: rgba(4, 6, 12, 0.88);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          display: none;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          z-index: 55;
          overflow: hidden;
        }

        .hud-disconnect-spotlight {
          position: absolute;
          inset: 0;
          background: radial-gradient(600px circle at 50% 50%, rgba(255, 119, 0, 0.14), transparent 70%);
          pointer-events: none;
        }

        .hud-disconnect-card {
          position: relative;
          background: rgba(14, 17, 26, 0.94);
          border: 1px solid rgba(255, 119, 0, 0.30);
          border-radius: 24px;
          padding: 2.4rem 2.6rem;
          max-width: 490px;
          width: 90%;
          text-align: center;
          box-shadow: 
            inset 0 1px 0 rgba(255, 255, 255, 0.18),
            0 24px 60px rgba(0, 0, 0, 0.85),
            0 0 35px rgba(255, 119, 0, 0.20);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.15rem;
          box-sizing: border-box;
        }

        /* Magic UI Rotating Border Beam in Signal Amber (#FF7700) */
        .hud-disconnect-card::before {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 26px;
          padding: 2px;
          background: conic-gradient(from 0deg, transparent 65%, #ff7700 85%, #ffaa00 95%, transparent 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
          animation: rotate-border-beam 4s linear infinite;
          z-index: 1;
        }

        @keyframes rotate-border-beam {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Radar Sweep Graphic */
        .disconnect-radar-wrap {
          position: relative;
          width: 68px;
          height: 68px;
          border-radius: 50%;
          border: 1px solid rgba(255, 119, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 119, 0, 0.04);
        }

        .disconnect-radar-sweep {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: conic-gradient(from 0deg, rgba(255, 119, 0, 0.45) 0deg, transparent 60deg);
          animation: radar-sweep 2.2s linear infinite;
        }

        @keyframes radar-sweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .disconnect-radar-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px dashed rgba(255, 119, 0, 0.35);
        }
        .disconnect-radar-ring.ring-1 { width: 44px; height: 44px; }
        .disconnect-radar-ring.ring-2 { width: 24px; height: 24px; }

        .disconnect-radar-center {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #ff7700;
          box-shadow: 0 0 8px #ff7700;
          z-index: 2;
        }

        .disconnect-badge {
          font-family: var(--font-mono);
          font-size: 0.70rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #ff7700;
          text-transform: uppercase;
          background: rgba(255, 119, 0, 0.12);
          border: 1px solid rgba(255, 119, 0, 0.35);
          padding: 4px 12px;
          border-radius: 9999px;
        }

        .disconnect-title {
          font-size: 1.15rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #ffffff;
          text-transform: uppercase;
          margin: 0;
        }

        .disconnect-sub {
          font-size: 0.72rem;
          color: #94a3b8;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          line-height: 1.4;
          margin: 0;
        }

        .disconnect-countdown-wrap {
          width: 100%;
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 10px 16px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          box-sizing: border-box;
        }

        .disconnect-countdown-label {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .disconnect-countdown-digits {
          font-family: var(--font-mono);
          font-size: 1.35rem;
          font-weight: 800;
          color: #ff7700;
          letter-spacing: 0.05em;
          font-variant-numeric: tabular-nums;
        }

        .disconnect-progress-track {
          width: 100%;
          height: 4px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.12);
          overflow: hidden;
        }

        .disconnect-progress-fill {
          height: 100%;
          width: 100%;
          background: linear-gradient(90deg, #ff7700 0%, #ffaa00 100%);
          transition: width 1s linear;
        }

        .disconnect-btn-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }

        .disconnect-action-btn {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 0.88rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          border-radius: 12px;
          padding: 0.85rem 1.4rem;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-sizing: border-box;
          outline: none;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .disconnect-btn-primary {
          background: linear-gradient(180deg, #ffffff 0%, #e2e8f0 100%);
          color: #0b0c10;
          border: 1px solid #ffffff;
          box-shadow: 0 4px 18px rgba(255, 255, 255, 0.25);
        }

        .disconnect-btn-primary:hover {
          background: #ff7700;
          border-color: #ff7700;
          color: #ffffff;
          transform: translateY(-1px);
          box-shadow: 0 6px 22px rgba(255, 119, 0, 0.45);
        }

        .disconnect-btn-secondary {
          background: rgba(255, 255, 255, 0.06);
          color: #cbd5e1;
          border: 1px solid rgba(255, 255, 255, 0.14);
        }

        .disconnect-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.3);
          transform: translateY(-1px);
        }

        .disconnect-btn-hint {
          font-size: 0.75rem;
          opacity: 0.65;
          font-weight: 500;
          font-family: var(--font-mono);
        }

        /* Sector Progress Tracker */
        .victory-sector-tracker {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 5px;
          margin: 0.9rem 0 0.5rem 0;
        }

        .victory-sector-pill {
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 3px 8px;
          border-radius: 9999px;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #94a3b8;
        }

        .victory-sector-pill.completed {
          background: rgba(56, 189, 248, 0.15);
          border-color: rgba(56, 189, 248, 0.5);
          color: #38bdf8;
        }

        .victory-sector-pill.active {
          background: rgba(16, 185, 129, 0.2);
          border-color: #10b981;
          color: #10b981;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
        }

        /* Campaign Breakdown Table */
        .campaign-breakdown-table {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin: 1.15rem 0;
        }

        .debrief-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 14px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.07);
          font-size: 0.80rem;
          letter-spacing: 0.02em;
        }

        .debrief-row .sector-title {
          color: #cbd5e1;
          font-weight: 600;
        }

        .debrief-row .sector-time {
          font-family: var(--font-mono);
          font-weight: 700;
          color: #facc15;
          font-variant-numeric: tabular-nums;
        }

        .grand-trophy-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(250, 204, 21, 0.25) 0%, rgba(250, 204, 21, 0.05) 70%, transparent 100%);
          border: 1px solid rgba(250, 204, 21, 0.4);
          box-shadow: 0 0 25px rgba(250, 204, 21, 0.35);
          margin-bottom: 0.5rem;
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
            <span style="color: #94a3b8;">BEST:</span>
            <span id="hud-best" style="font-weight: 700; color: #ffffff;">--:--.--</span>
          </div>
        </div>

        <!-- Top-Right: Controls & Checkpoint Badge -->
        <div class="hud-top-right-group">
          <span id="hud-mode-badge" style="display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 10px; font-size: 0.70rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);">MEDIUM</span>
          <button id="hud-btn-view" class="hud-btn-util">Camera &nbsp;<span style="font-size: 0.72rem; opacity: 0.6;">V</span></button>
          <button id="hud-btn-lobby" class="hud-btn-util">Lobby &nbsp;<span style="font-size: 0.72rem; opacity: 0.6;">Esc</span></button>

          <div class="hud-glass-surface hud-checkpoint-badge">
            <div class="hud-meta-header">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                <line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
              <span class="hud-meta-label">CHECKPOINTS</span>
            </div>
            <span id="hud-checkpoint" class="hud-checkpoint-digits">0 / 4</span>
            <div id="hud-checkpoint-meter" class="hud-checkpoint-meter-row"></div>
          </div>
        </div>
      </div>

      <!-- CENTER TOAST -->
      <div id="hud-toast" class="hud-center-toast">Checkpoint Reached</div>

      <!-- COACH TOAST (Bottom-Center Pill) -->
      <div id="hud-coach-toast" class="hud-coach-toast"></div>

      <!-- BOTTOM BAR -->
      <div class="hud-bottom-bar">
        <!-- Bottom-Left: Harmonized Controller Card (.hud-glass-surface) -->
        <div class="hud-glass-surface hud-controller-card" id="hud-controller-card">
          <div class="hud-meta-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2"/>
              <path d="M6 12h4m-2-2v4m10-2h.01m-3 0h.01"/>
            </svg>
            <span class="hud-meta-label">CONTROLLER</span>
          </div>
          <div class="hud-controller-content" id="hud-controller-content">
            <!-- Initialized with Keyboard Mode; dynamically updated by updateLatency -->
            <div class="hud-kbd-container">
              <div class="hud-keycap-cluster">
                <span class="hud-keycap hud-keycap-sm">W</span>
                <div class="hud-keycaps-row">
                  <span class="hud-keycap hud-keycap-sm">A</span>
                  <span class="hud-keycap hud-keycap-sm">S</span>
                  <span class="hud-keycap hud-keycap-sm">D</span>
                </div>
              </div>
              <div class="hud-kbd-info">
                <div class="hud-kbd-title">Keyboard Mode</div>
                <div class="hud-kbd-sub">
                  <span>WASD Steer</span> &bull; 
                  <span><span class="hud-keycap hud-keycap-sm">SHIFT</span> Boost</span> &bull;
                  <span><span class="hud-keycap hud-keycap-sm">V</span> Cam</span>
                </div>
              </div>
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
          <!-- Sector View (Levels 1-3) -->
          <div id="victory-sector-view">
            <div class="victory-header-tag">
              <span id="victory-course-tag">Sector 01</span>
              <span>&bull;</span>
              <span>Complete</span>
            </div>
            <h2 id="victory-course-title">Skyway Runway</h2>
            <div id="victory-sector-tracker" class="victory-sector-tracker"></div>
            <div class="victory-time-wrap">
              <div id="victory-time" class="victory-time-display">00:00.00</div>
              <div class="victory-stats-row">
                <span id="victory-best" class="victory-best-text">Best: 00:00.00</span>
                <span id="victory-new-badge" class="victory-record-pill">New Record</span>
              </div>
            </div>
            <div class="victory-actions">
              <button id="victory-next-btn" class="victory-glass-btn victory-btn-primary">
                Next Sector &nbsp;<span style="font-size: 0.78rem; opacity: 0.65; font-weight: 500;">[Enter]</span>
              </button>
              <button id="victory-retry-btn" class="victory-glass-btn victory-btn-secondary">
                Retry Sector &nbsp;<span style="font-size: 0.78rem; opacity: 0.65; font-weight: 500;">[R]</span>
              </button>
              <button id="victory-lobby-btn" class="victory-glass-btn victory-btn-secondary">
                Return to Lobby &nbsp;<span style="font-size: 0.78rem; opacity: 0.65; font-weight: 500;">[Esc]</span>
              </button>
            </div>
          </div>

          <!-- Grand Championship Debrief View (Level 4 Victory) -->
          <div id="victory-grand-view" style="display: none;">
            <div class="grand-trophy-badge">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
                <path d="M4 22h16"/>
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
              </svg>
            </div>
            <div class="victory-header-tag" style="color: #facc15;">
              <span>Grand Prix Championship</span>
              <span>&bull;</span>
              <span>Victory</span>
            </div>
            <h2 style="background: linear-gradient(135deg, #ffffff 0%, #facc15 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">CAMPAIGN COMPLETE</h2>
            <p style="font-size: 0.8rem; color: #94a3b8; margin: 0.3rem 0 0.8rem 0;">All 6 skyway sectors mastered with distinction</p>
            
            <div id="victory-campaign-breakdown" class="campaign-breakdown-table"></div>

            <div class="victory-time-wrap" style="margin-top: 0.5rem; margin-bottom: 1.2rem;">
              <span style="font-size: 0.72rem; font-weight: 700; color: #94a3b8; letter-spacing: 0.08em; text-transform: uppercase;">TOTAL CAMPAIGN TIME</span>
              <div id="victory-total-time" class="victory-time-display" style="color: #facc15; font-size: 2.4rem;">00:00.00</div>
            </div>

            <div class="victory-actions">
              <button id="victory-replay-btn" class="victory-glass-btn victory-btn-primary">
                Replay Campaign &nbsp;<span style="font-size: 0.78rem; opacity: 0.65; font-weight: 500;">[Enter]</span>
              </button>
              <button id="victory-grand-lobby-btn" class="victory-glass-btn victory-btn-secondary">
                Return to Lobby &nbsp;<span style="font-size: 0.78rem; opacity: 0.65; font-weight: 500;">[Esc]</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- IN-GAME DISCONNECT OVERLAY -->
      <div id="hud-disconnect-overlay" class="hud-disconnect-overlay">
        <div class="hud-disconnect-spotlight"></div>
        <div class="hud-disconnect-card">
          <div class="disconnect-radar-wrap">
            <div class="disconnect-radar-sweep"></div>
            <div class="disconnect-radar-ring ring-1"></div>
            <div class="disconnect-radar-ring ring-2"></div>
            <div class="disconnect-radar-center"></div>
          </div>
          <div class="disconnect-badge">SIGNAL INTERRUPTED</div>
          <h3 class="disconnect-title">PHONE DISCONNECTED</h3>
          <p class="disconnect-sub">SERVER RESERVING CONTROLLER SLOT IN ACTIVE LOBBY POOL</p>
          <div class="disconnect-countdown-wrap">
            <span class="disconnect-countdown-label">GRACE PERIOD REMAINING</span>
            <div class="disconnect-countdown-digits"><span id="disconnect-timer-secs">60</span>s</div>
            <div class="disconnect-progress-track">
              <div id="disconnect-progress-fill" class="disconnect-progress-fill"></div>
            </div>
          </div>
          <div class="disconnect-btn-group">
            <button id="disconnect-keyboard-btn" class="disconnect-action-btn disconnect-btn-primary">
              CONTINUE WITH KEYBOARD &nbsp;<span class="disconnect-btn-hint">[SPACE / ENTER]</span>
            </button>
            <button id="disconnect-lobby-btn" class="disconnect-action-btn disconnect-btn-secondary">
              ABORT TO LOBBY &nbsp;<span class="disconnect-btn-hint">[ESC]</span>
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
    this.victoryBestEl = this.container.querySelector('#victory-best')!;
    this.victoryNewBadgeEl = this.container.querySelector('#victory-new-badge')!;
    this.victorySectorView = this.container.querySelector('#victory-sector-view')!;
    this.victoryGrandView = this.container.querySelector('#victory-grand-view')!;
    this.victorySectorTracker = this.container.querySelector('#victory-sector-tracker')!;
    this.victoryTotalTimeEl = this.container.querySelector('#victory-total-time')!;
    this.victoryCampaignBreakdown = this.container.querySelector('#victory-campaign-breakdown')!;
    this.disconnectOverlay = this.container.querySelector('#hud-disconnect-overlay')!;
    this.disconnectTimerEl = this.container.querySelector('#disconnect-timer-secs')!;
    this.disconnectProgressFillEl = this.container.querySelector('#disconnect-progress-fill')!;
    this.controllerCardEl = this.container.querySelector('#hud-controller-card')!;
    this.controllerContentEl = this.container.querySelector('#hud-controller-content')!;
    this.modeBadgeEl = this.container.querySelector('#hud-mode-badge')!;

    this.container.querySelector('#hud-btn-view')!.addEventListener('click', () => {
      this.callbacks.onToggleCameraView?.();
    });

    this.container.querySelector('#hud-btn-lobby')!.addEventListener('click', () => {
      this.callbacks.onReturnToLobby();
    });

    this.container.querySelector('#victory-next-btn')!.addEventListener('click', () => {
      this.dismissVictoryNext();
    });

    this.container.querySelector('#victory-retry-btn')!.addEventListener('click', () => {
      this.dismissVictoryRetry();
    });

    this.container.querySelector('#victory-lobby-btn')!.addEventListener('click', () => {
      this.dismissVictoryLobby();
    });

    this.container.querySelector('#victory-replay-btn')?.addEventListener('click', () => {
      this.dismissVictoryNext();
    });

    this.container.querySelector('#victory-grand-lobby-btn')?.addEventListener('click', () => {
      this.dismissVictoryLobby();
    });

    const disconnectKbdBtn = this.container.querySelector('#disconnect-keyboard-btn');
    if (disconnectKbdBtn) {
      disconnectKbdBtn.addEventListener('click', () => {
        this.continueWithKeyboard();
      });
    }

    const disconnectLobbyBtn = this.container.querySelector('#disconnect-lobby-btn');
    if (disconnectLobbyBtn) {
      disconnectLobbyBtn.addEventListener('click', () => {
        this.hideDisconnectOverlay();
        this.callbacks.onReturnToLobby();
      });
    }
  }

  public setLevel(level: LevelDef): void {
    if (level.id === 1) {
      this.sessionLevelTimes = {};
    }
    this.currentLevelId = level.id;
    this.currentLevelName = level.name;
    const bestSecs = this.bestTimes[level.id];
    this.bestEl.textContent = bestSecs !== undefined ? this.formatTimeSecs(bestSecs) : '--:--.--';
    this.resetTimer();
    this.startTimer();
    this.victoryModal.style.display = 'none';
  }

  public setDifficulty(mode: DifficultyMode): void {
    if (!this.modeBadgeEl) return;
    if (mode === 'easy') {
      this.modeBadgeEl.textContent = 'EASY // GUARDRAILS';
      this.modeBadgeEl.style.color = '#34d399';
      this.modeBadgeEl.style.background = 'rgba(52, 211, 153, 0.15)';
      this.modeBadgeEl.style.borderColor = 'rgba(52, 211, 153, 0.4)';
    } else if (mode === 'hard') {
      this.modeBadgeEl.textContent = 'HARD // PRO';
      this.modeBadgeEl.style.color = '#f43f5e';
      this.modeBadgeEl.style.background = 'rgba(244, 63, 94, 0.15)';
      this.modeBadgeEl.style.borderColor = 'rgba(244, 63, 94, 0.4)';
    } else {
      this.modeBadgeEl.textContent = 'MEDIUM';
      this.modeBadgeEl.style.color = '#38bdf8';
      this.modeBadgeEl.style.background = 'rgba(56, 189, 248, 0.15)';
      this.modeBadgeEl.style.borderColor = 'rgba(56, 189, 248, 0.4)';
    }
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
    this.pausedTime = 0;
    this.totalPausedDuration = 0;
    this.timerRunning = true;
  }

  public pauseTimer(): void {
    if (this.timerRunning && this.pausedTime === 0) {
      this.pausedTime = performance.now();
    }
  }

  public resumeTimer(): void {
    if (this.pausedTime > 0) {
      this.totalPausedDuration += performance.now() - this.pausedTime;
      this.pausedTime = 0;
    }
  }

  public resetTimer(): void {
    this.startTime = performance.now();
    this.pausedTime = 0;
    this.totalPausedDuration = 0;
    this.timerEl.textContent = '00:00.00';
  }

  public update(speedMps: number): void {
    if (this.timerRunning) {
      const current = this.pausedTime > 0 ? this.pausedTime : performance.now();
      const elapsed = Math.max(0, current - this.startTime - this.totalPausedDuration);
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

    // Speed pulse effect on harmonized controller card
    if (this.controllerCardEl) {
      if (speedKmH > 35) {
        this.controllerCardEl.classList.add('speed-pulse');
      } else {
        this.controllerCardEl.classList.remove('speed-pulse');
      }
    }
  }

  private formatTimeSecs(totalSecs: number): string {
    const totalCentis = Math.round(totalSecs * 100);
    const mins = Math.floor(totalCentis / 6000);
    const secs = Math.floor((totalCentis % 6000) / 100);
    const cs = totalCentis % 100;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }

  public updateLatency(rttMs: number, hz: number, _jitterMs: number, isKeyboard: boolean): void {
    const roundedRtt = Math.round(rttMs);
    const mode = isKeyboard ? 'keyboard' : 'phone';
    if (this.lastInputMode === mode && this.lastRtt === roundedRtt && this.lastHz === hz) {
      return;
    }
    this.lastInputMode = mode;
    this.lastRtt = roundedRtt;
    this.lastHz = hz;

    if (!this.controllerContentEl) return;

    if (isKeyboard) {
      this.controllerContentEl.innerHTML = `
        <div class="hud-kbd-container">
          <div class="hud-keycap-cluster">
            <span class="hud-keycap hud-keycap-sm">W</span>
            <div class="hud-keycaps-row">
              <span class="hud-keycap hud-keycap-sm">A</span>
              <span class="hud-keycap hud-keycap-sm">S</span>
              <span class="hud-keycap hud-keycap-sm">D</span>
            </div>
          </div>
          <div class="hud-kbd-info">
            <div class="hud-kbd-title">Keyboard Mode</div>
            <div class="hud-kbd-sub">
              <span>WASD Steer</span> &bull; 
              <span><span class="hud-keycap hud-keycap-sm">SHIFT</span> Boost</span> &bull;
              <span><span class="hud-keycap hud-keycap-sm">V</span> Cam</span>
            </div>
          </div>
        </div>
      `;
    } else {
      this.controllerContentEl.innerHTML = `
        <div class="hud-phone-container">
          <div class="hud-phone-dot"></div>
          <div class="hud-kbd-info">
            <div class="hud-phone-title">Phone Active</div>
            <div class="hud-phone-sub">
              <span>${hz}Hz</span> &bull; 
              <span>${roundedRtt}ms</span> &bull; 
              <span><span class="hud-keycap hud-keycap-sm">V</span> Cam</span>
            </div>
          </div>
        </div>
      `;
    }
  }

  public showToast(text: string, _color: string = '#ffffff'): void {
    const cleanText = text.replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim();
    this.toastEl.textContent = cleanText;
    this.toastEl.classList.add('visible');

    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 1400);
  }

  public showCoachToast(text: string): void {
    const cleanText = text.replace(/^\[\s*/, '').replace(/\s*\]$/, '').trim();
    this.coachToastEl.textContent = cleanText;
    this.coachToastEl.classList.add('visible');

    if (this.coachToastTimer) window.clearTimeout(this.coachToastTimer);
    this.coachToastTimer = window.setTimeout(() => {
      this.coachToastEl.classList.remove('visible');
    }, 2500);
  }

  public showDisconnectOverlay(onContinueKeyboard: () => void): void {
    this.pauseTimer();
    this.disconnectOverlay.style.display = 'flex';
    this.onContinueKeyboardCallback = onContinueKeyboard;
    let remainingSecs = 60;
    this.disconnectTimerEl.textContent = `${remainingSecs}`;
    if (this.disconnectProgressFillEl) {
      this.disconnectProgressFillEl.style.width = '100%';
    }

    if (this.disconnectInterval) clearInterval(this.disconnectInterval);
    this.disconnectInterval = window.setInterval(() => {
      remainingSecs--;
      if (remainingSecs <= 0) {
        remainingSecs = 0;
        if (this.disconnectInterval) clearInterval(this.disconnectInterval);
      }
      this.disconnectTimerEl.textContent = `${remainingSecs}`;
      if (this.disconnectProgressFillEl) {
        this.disconnectProgressFillEl.style.width = `${(remainingSecs / 60) * 100}%`;
      }
    }, 1000);
  }

  public hideDisconnectOverlay(): void {
    this.resumeTimer();
    this.disconnectOverlay.style.display = 'none';
    this.onContinueKeyboardCallback = null;
    if (this.disconnectInterval) {
      clearInterval(this.disconnectInterval);
      this.disconnectInterval = null;
    }
  }

  public continueWithKeyboard(): void {
    const cb = this.onContinueKeyboardCallback;
    this.hideDisconnectOverlay();
    cb?.();
  }

  public isDisconnectShowing(): boolean {
    return !!(this.disconnectOverlay && this.disconnectOverlay.style.display === 'flex');
  }

  public showVictory(levelIndex?: number, totalLevels: number = LEVELS.length): void {
    this.timerRunning = false;
    const current = this.pausedTime > 0 ? this.pausedTime : performance.now();
    const elapsedSecs = Math.max(0, (current - this.startTime - this.totalPausedDuration) / 1000);
    this.sessionLevelTimes[this.currentLevelId] = elapsedSecs;

    const prevBest = this.bestTimes[this.currentLevelId];
    const isNewRecord = prevBest === undefined || elapsedSecs < prevBest;

    if (isNewRecord) {
      this.bestTimes[this.currentLevelId] = Number(elapsedSecs.toFixed(2));
      this.saveBestTimes();
      this.bestEl.textContent = this.formatTimeSecs(this.bestTimes[this.currentLevelId]);
    }

    const isGrand = (levelIndex !== undefined)
      ? (levelIndex >= totalLevels - 1)
      : (this.currentLevelId >= totalLevels);

    if (isGrand) {
      if (this.victorySectorView) this.victorySectorView.style.display = 'none';
      if (this.victoryGrandView) this.victoryGrandView.style.display = 'block';

      if (this.victoryCampaignBreakdown) {
        this.victoryCampaignBreakdown.innerHTML = '';
        let totalCampaignSecs = 0;
        for (let i = 1; i <= totalLevels; i++) {
          const lvl = LEVELS[i - 1];
          const secTime = this.sessionLevelTimes[i] ?? this.bestTimes[i];
          const timeFormatted = secTime !== undefined ? this.formatTimeSecs(secTime) : '--:--.--';
          if (secTime !== undefined) {
            totalCampaignSecs += secTime;
          }

          let medalIcon = '--';
          let medalText = '--';
          let medalColor = '#64748b';
          if (secTime !== undefined && lvl) {
            if (secTime <= lvl.parTimes.gold) {
              medalIcon = '🥇';
              medalText = 'GOLD';
              medalColor = '#facc15';
            } else if (secTime <= lvl.parTimes.silver) {
              medalIcon = '🥈';
              medalText = 'SILVER';
              medalColor = '#e2e8f0';
            } else if (secTime <= lvl.parTimes.bronze) {
              medalIcon = '🥉';
              medalText = 'BRONZE';
              medalColor = '#f97316';
            } else {
              medalIcon = '✓';
              medalText = 'CLEAR';
              medalColor = '#38bdf8';
            }
          }

          const row = document.createElement('div');
          row.className = 'debrief-row';
          row.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 2px;">
              <span class="sector-title">0${i} • ${lvl ? lvl.name : `Sector 0${i}`}</span>
              <span style="font-size: 0.68rem; color: #94a3b8;">Par: ${lvl ? lvl.parTimes.gold.toFixed(0) : 0}s (G) / ${lvl ? lvl.parTimes.silver.toFixed(0) : 0}s (S)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="sector-medal" style="color: ${medalColor}; font-weight: 700; font-size: 0.74rem;">${medalIcon} ${medalText}</span>
              <span class="sector-time">${timeFormatted}</span>
            </div>
          `;
          this.victoryCampaignBreakdown.appendChild(row);
        }
        if (this.victoryTotalTimeEl) {
          this.victoryTotalTimeEl.textContent = this.formatTimeSecs(totalCampaignSecs);
        }
      }

      confetti({
        particleCount: 160,
        spread: 100,
        origin: { y: 0.55 },
        colors: ['#facc15', '#fbbf24', '#f59e0b', '#ffffff', '#10b981', '#38bdf8'],
      });
    } else {
      if (this.victorySectorView) this.victorySectorView.style.display = 'block';
      if (this.victoryGrandView) this.victoryGrandView.style.display = 'none';

      this.victoryTimeEl.textContent = this.timerEl.textContent;
      const bestSecs = this.bestTimes[this.currentLevelId] ?? elapsedSecs;
      if (this.victoryBestEl) {
        this.victoryBestEl.textContent = `Best: ${this.formatTimeSecs(bestSecs)}`;
      }
      const tagEl = this.container.querySelector('#victory-course-tag');
      if (tagEl) {
        tagEl.textContent = `Sector 0${this.currentLevelId}`;
      }
      const titleEl = this.container.querySelector('#victory-course-title');
      if (titleEl) {
        titleEl.textContent = this.currentLevelName;
      }
      if (this.victoryNewBadgeEl) {
        this.victoryNewBadgeEl.style.display = isNewRecord ? 'inline-block' : 'none';
      }

      if (this.victorySectorTracker) {
        this.victorySectorTracker.innerHTML = '';
        for (let s = 1; s <= totalLevels; s++) {
          const pill = document.createElement('div');
          pill.className = 'victory-sector-pill';
          if (s < this.currentLevelId) {
            pill.classList.add('completed');
            pill.innerHTML = `<span>✓</span><span>SEC 0${s}</span>`;
          } else if (s === this.currentLevelId) {
            pill.classList.add('active');
            pill.innerHTML = `<span>●</span><span>SEC 0${s}</span>`;
          } else {
            pill.innerHTML = `<span>○</span><span>SEC 0${s}</span>`;
          }
          this.victorySectorTracker.appendChild(pill);
        }
      }

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }

    this.victoryModal.style.display = 'flex';
  }

  public isVictoryShowing(): boolean {
    return !!(this.victoryModal && this.victoryModal.style.display === 'flex');
  }

  public dismissVictoryNext(): void {
    if (this.isVictoryShowing()) {
      this.victoryModal.style.display = 'none';
      this.callbacks.onNextLevel();
    }
  }

  public dismissVictoryRetry(): void {
    if (this.isVictoryShowing()) {
      this.victoryModal.style.display = 'none';
      this.callbacks.onRestartLevel();
    }
  }

  public dismissVictoryLobby(): void {
    if (this.isVictoryShowing()) {
      this.victoryModal.style.display = 'none';
      this.callbacks.onReturnToLobby();
    }
  }
}
