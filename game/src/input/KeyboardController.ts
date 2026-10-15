/**
 * Keyboard Controller Fallback
 * Tiltmaze: Kinetic Edition
 * 
 * Provides keyboard inputs (WASD / Arrows) to simulate phone tilt,
 * Space to simulate phone shake/jump, and Shift to trigger Nitro Boost.
 */

export interface ControllerInputState {
  pitch: number;          // Forward / Backward tilt in range [-1.0, 1.0]
  roll: number;           // Left / Right tilt in range [-1.0, 1.0]
  boost: boolean;         // Nitro boost active
  brake: boolean;         // Brake active
  shake: boolean;         // Discrete shake / jump event pulse
  recalibrate: boolean;   // Neutral calibration event pulse
  isKeyboard: boolean;    // Whether active input source is keyboard
}

export class KeyboardController {
  private keys: Record<string, boolean> = {};
  private targetPitch = 0;
  private targetRoll = 0;
  private currentPitch = 0;
  private currentRoll = 0;
  private shakeTriggered = false;
  private recalibrateTriggered = false;
  private onToggleTelemetryLab?: () => void;

  constructor(options?: { onToggleTelemetryLab?: () => void }) {
    this.onToggleTelemetryLab = options?.onToggleTelemetryLab;
    this.setupListeners();
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      if (e.code === 'Space' && !e.repeat) {
        this.shakeTriggered = true;
        e.preventDefault();
      }

      if (e.code === 'KeyC' && !e.repeat) {
        this.recalibrateTriggered = true;
      }

      if (e.code === 'KeyT' && !e.repeat) {
        this.onToggleTelemetryLab?.();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  /**
   * Updates keyboard input state with smooth ramping for analog feel.
   * @param dt Delta time in seconds
   */
  public update(dt: number): ControllerInputState {
    let forward = 0;
    let right = 0;

    // Pitch: Up/W tilts forward (negative pitch in 3D rotation), Down/S tilts backward
    if (this.keys['KeyW'] || this.keys['ArrowUp']) forward += 1.0;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) forward -= 1.0;

    // Roll: Right/D tilts right, Left/A tilts left
    if (this.keys['KeyD'] || this.keys['ArrowRight']) right += 1.0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) right -= 1.0;

    // Target values clamped to [-1.0, 1.0]
    this.targetPitch = forward; // Forward (W) tilts nose down
    this.targetRoll = right;

    // Smooth response with exponential decay
    const responseSpeed = 10.0; // Higher = snappier keyboard response
    const alpha = 1.0 - Math.exp(-responseSpeed * dt);
    this.currentPitch += (this.targetPitch - this.currentPitch) * alpha;
    this.currentRoll += (this.targetRoll - this.currentRoll) * alpha;

    const shake = this.shakeTriggered;
    this.shakeTriggered = false;

    const recalibrate = this.recalibrateTriggered;
    if (recalibrate) {
      this.currentPitch = 0;
      this.currentRoll = 0;
      this.recalibrateTriggered = false;
    }

    const boost = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const brake = !!(this.keys['KeyB'] || this.keys['ControlLeft']);

    const isAnyKeyPressed =
      Boolean(this.keys['KeyW'] ||
      this.keys['KeyS'] ||
      this.keys['KeyA'] ||
      this.keys['KeyD'] ||
      this.keys['ArrowUp'] ||
      this.keys['ArrowDown'] ||
      this.keys['ArrowLeft'] ||
      this.keys['ArrowRight'] ||
      boost ||
      brake);

    return {
      pitch: this.currentPitch,
      roll: this.currentRoll,
      boost,
      brake,
      shake,
      recalibrate,
      isKeyboard: isAnyKeyPressed || Math.abs(this.currentPitch) > 0.01 || Math.abs(this.currentRoll) > 0.01,
    };
  }

  public reset(): void {
    this.keys = {};
    this.targetPitch = 0;
    this.targetRoll = 0;
    this.currentPitch = 0;
    this.currentRoll = 0;
    this.shakeTriggered = false;
    this.recalibrateTriggered = false;
  }
}
