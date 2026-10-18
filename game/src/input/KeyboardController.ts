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

export interface KeyboardControllerOptions {
  onToggleCameraView?: () => void;
  onToggleQuality?: () => void;
}

export class KeyboardController {
  private keys: Record<string, boolean> = {};
  private targetPitch = 0;
  private targetRoll = 0;
  private currentPitch = 0;
  private currentRoll = 0;
  private shakeTriggered = false;
  private recalibrateTriggered = false;
  private onToggleCameraView?: () => void;
  private onToggleQuality?: () => void;

  public isP2Enabled = false;
  private currentP2Pitch = 0;
  private currentP2Roll = 0;
  private p2ShakeTriggered = false;

  constructor(options?: KeyboardControllerOptions) {
    this.onToggleCameraView = options?.onToggleCameraView;
    this.onToggleQuality = options?.onToggleQuality;
    this.setupListeners();
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      if (e.code === 'Space' && !e.repeat && !e.defaultPrevented) {
        this.shakeTriggered = true;
        e.preventDefault();
      }

      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat && !e.defaultPrevented) {
        if (this.isP2Enabled) {
          this.p2ShakeTriggered = true;
        }
      }

      if (e.code === 'KeyC' && !e.repeat && !e.defaultPrevented) {
        this.recalibrateTriggered = true;
      }

      if (e.code === 'KeyV' && !e.repeat && !e.defaultPrevented) {
        this.onToggleCameraView?.();
      }

      if (e.code === 'KeyQ' && !e.repeat && !e.defaultPrevented) {
        this.onToggleQuality?.();
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

    if (this.isP2Enabled) {
      // When P2 is on keyboard, P1 strictly uses WASD
      if (this.keys['KeyW']) forward += 1.0;
      if (this.keys['KeyS']) forward -= 1.0;
      if (this.keys['KeyD']) right += 1.0;
      if (this.keys['KeyA']) right -= 1.0;
    } else {
      // Normal: either WASD or Arrow keys
      if (this.keys['KeyW'] || this.keys['ArrowUp']) forward += 1.0;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) forward -= 1.0;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) right += 1.0;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) right -= 1.0;
    }

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

    const boost = !!(this.keys['ShiftLeft'] || (!this.isP2Enabled && this.keys['ShiftRight']));
    const brake = !!(this.keys['KeyB'] || this.keys['ControlLeft']);

    const isAnyKeyPressed =
      Boolean(this.keys['KeyW'] ||
      this.keys['KeyS'] ||
      this.keys['KeyA'] ||
      this.keys['KeyD'] ||
      (!this.isP2Enabled && (this.keys['ArrowUp'] || this.keys['ArrowDown'] || this.keys['ArrowLeft'] || this.keys['ArrowRight'])) ||
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

  /**
   * Samples Player 2 input from Arrow Keys, Enter (Jump), ShiftRight (Boost), ControlRight (Brake)
   */
  public getP2State(dt: number): { pitch: number; roll: number; boost: boolean; brake: boolean; shake: boolean; active: boolean } {
    let forward = 0;
    let right = 0;

    if (this.keys['ArrowUp']) forward += 1.0;
    if (this.keys['ArrowDown']) forward -= 1.0;
    if (this.keys['ArrowRight']) right += 1.0;
    if (this.keys['ArrowLeft']) right -= 1.0;

    const alpha = 1.0 - Math.exp(-10.0 * dt);
    this.currentP2Pitch += (forward - this.currentP2Pitch) * alpha;
    this.currentP2Roll += (right - this.currentP2Roll) * alpha;

    const boost = !!(this.keys['ShiftRight'] || this.keys['Numpad0']);
    const brake = !!(this.keys['ControlRight'] || this.keys['KeyM']);
    const shake = this.p2ShakeTriggered;
    this.p2ShakeTriggered = false;

    return {
      pitch: this.currentP2Pitch,
      roll: this.currentP2Roll,
      boost,
      brake,
      shake,
      active: forward !== 0 || right !== 0 || boost || brake || shake || Math.abs(this.currentP2Pitch) > 0.01 || Math.abs(this.currentP2Roll) > 0.01,
    };
  }

  public reset(): void {
    this.keys = {};
    this.targetPitch = 0;
    this.targetRoll = 0;
    this.currentPitch = 0;
    this.currentRoll = 0;
    this.currentP2Pitch = 0;
    this.currentP2Roll = 0;
    this.shakeTriggered = false;
    this.p2ShakeTriggered = false;
    this.recalibrateTriggered = false;
  }
}
