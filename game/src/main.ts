import * as THREE from 'three';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { Board } from './world/Board.js';
import { Marble } from './world/Marble.js';
import { SkyEnvironment } from './world/Environment.js';
import { SoundSynthesizer } from './audio/SoundSynthesizer.js';
import { KeyboardController } from './input/KeyboardController.js';
import { OneEuroFilter } from './input/OneEuroFilter.js';
import { GameNetwork } from './net/GameNetwork.js';
import { LobbyUI } from './ui/LobbyUI.js';
import { GameHUD } from './ui/GameHUD.js';
import { ClickSpark } from './ui/ClickSpark.js';
import { LEVELS, type LevelDef, checkCoachHints } from './levels/LevelData.js';
import { EffectsManager } from './world/EffectsManager.js';
import type { DifficultyMode } from './physics/PhysicsWorld.js';

export const GAME_FEEL_CONFIG = {
  nitroFovEnabled: true,
  nitroShakeEnabled: true,
  baseFov: 56,
  boostFov: 66,
  boostShakeIntensity: 0.035,
};

class GameApp {
  // Three.js
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  public environment!: SkyEnvironment;

  // Follow Camera (Bruno Simon Lerp Target Formula - Preallocated for zero per-frame garbage)
  public cameraPosition = new THREE.Vector3();
  public cameraTarget = new THREE.Vector3();
  private targetCamPos = new THREE.Vector3();
  private targetCamTarget = new THREE.Vector3();

  // Game Systems
  public physics!: PhysicsWorld;
  public board!: Board;
  public marble!: Marble;
  private effectsManager!: EffectsManager;
  private sounds!: SoundSynthesizer;
  private keyboard!: KeyboardController;
  private pitchFilter = new OneEuroFilter(1.2, 0.4);
  private rollFilter = new OneEuroFilter(1.2, 0.4);
  private phonePitchFilter = new OneEuroFilter(0.85, 0.25);
  private phoneRollFilter = new OneEuroFilter(0.85, 0.25);
  private currentCameraRoll = 0;
  private network!: GameNetwork;

  // UI Systems
  private lobbyUI!: LobbyUI;
  private hud!: GameHUD;
  private clickSpark = new ClickSpark();
  private currentDifficulty: DifficultyMode = 'medium';

  // State
  private currentLevelIndex = 0;
  private isPlaying = false;
  private lastTime = performance.now();
  private lastRawBuffer: ArrayBuffer | null = null;
  private smoothedPitch = 0;
  private smoothedRoll = 0;
  private sessionShownHints = new Set<string>();
  private wasAirborne = false;
  private prevLinvelY = 0;
  private cameraMode: 'standard' | 'cinematic' = 'standard';
  private isPhysicsPaused = false;
  private forceKeyboardMode = false;
  private isLowQuality = false;
  private fpsFramesInWindow = 0;
  private fpsWindowStart = performance.now();
  private levelStartTime = performance.now();
  private isVictoryCelebration = false;
  private victoryTime = 0;
  private prevPhoneBoost = false;
  private prevPhoneBrake = false;
  private isTransitioning = false;
  private nextLightningTime = 0;

  constructor() {
    this.loadCameraPreference();
    this.initGraphics();
    this.initSystems();
    this.setupResize();
    this.setupKeyboardShortcuts();
    this.loop();
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (this.hud && this.hud.isDisconnectShowing()) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.hud.continueWithKeyboard();
          return;
        } else if (e.code === 'Escape') {
          e.preventDefault();
          this.hud.hideDisconnectOverlay();
          this.returnToLobby();
          return;
        }
      }
      if (this.hud && this.hud.isVictoryShowing()) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.hud.dismissVictoryNext();
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          this.hud.dismissVictoryRetry();
        } else if (e.code === 'Escape') {
          e.preventDefault();
          this.hud.dismissVictoryLobby();
        }
      }
    });
  }

  private toggleQualityMode(): void {
    this.setQualityMode(!this.isLowQuality, 'MANUAL TOGGLE (Q)');
  }

  private setQualityMode(low: boolean, reason?: string): void {
    this.isLowQuality = low;
    this.environment.setQuality(low);
    this.effectsManager.setQuality(low);
    const msg = low ? 'Low graphics mode enabled' : 'High graphics mode enabled';
    this.hud.showToast(msg, low ? '#f59e0b' : '#38bdf8');
  }

  private loadCameraPreference(): void {
    try {
      const saved = localStorage.getItem('tiltmaze_camera_view');
      if (saved === 'cinematic' || saved === 'standard') {
        this.cameraMode = saved;
      }
    } catch {
      this.cameraMode = 'standard';
    }
  }

  private toggleCameraView(): void {
    this.cameraMode = this.cameraMode === 'standard' ? 'cinematic' : 'standard';
    try {
      localStorage.setItem('tiltmaze_camera_view', this.cameraMode);
    } catch {
      // Ignore localStorage errors
    }
    this.hud.showToast(`Camera: ${this.cameraMode === 'standard' ? 'Standard' : 'Cinematic'}`);
  }

  private initGraphics(): void {
    const container = document.getElementById('game-container')!;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 150);
    this.camera.position.set(0, 3, 6);
    this.camera.lookAt(0, 0, -5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    // Initialize Sky Island & Cloud Sea Environment (Lighting, PMREM Reflections, Clouds, Monoliths)
    this.environment = new SkyEnvironment(this.scene, this.renderer);
  }

  private initSystems(): void {
    const uiLayer = document.getElementById('ui-layer')!;

    // 1. Audio
    this.sounds = new SoundSynthesizer();

    // 2. Physics & World
    this.physics = new PhysicsWorld({
      onWallImpact: (intensity) => {
        this.sounds.playImpact(intensity);
        this.network.sendHaptic(1, intensity > 0.5 ? 'impactHeavy' : 'impactLight', 50, intensity);
        if (intensity >= 0.45) {
          this.effectsManager.triggerImpactSpark(this.physics.getMarblePosition(), intensity);
        }
      },
      onHoleFall: () => {
        if (this.isVictoryCelebration) return;
        this.sounds.playHoleFall();
        this.hud.showToast('Hazard — respawning marble', '#ef4444');
        this.network.sendHaptic(1, 'warning', 250);
        this.environment.setSanctumDimming(1.0);
        this.physics.respawnAtLastCheckpoint();
      },
      onCheckpoint: (idx) => {
        this.sounds.playCheckpoint();
        const cp = this.physics.getCheckpointProgress();
        this.hud.setCheckpoints(cp.current, cp.total);
        this.hud.showToast(`Checkpoint ${idx + 1} reached`, '#38bdf8');
        this.network.sendHaptic(1, 'success', 80);
        this.effectsManager.triggerCheckpointBurst(this.physics.getMarblePosition());
        this.board.collectCheckpoint(idx);
      },
      onGoalReached: () => {
        if (this.isVictoryCelebration) return;
        this.isVictoryCelebration = true;
        this.victoryTime = 0;
        if (this.currentLevelIndex === LEVELS.length - 1) {
          this.sounds.playGrandVictoryFanfare();
        } else {
          this.sounds.playWin();
        }
        this.effectsManager.triggerVictoryBurst(this.physics.getMarblePosition());
        this.hud.showVictory(this.currentLevelIndex, LEVELS.length);
        this.network.sendHaptic(1, 'success', 400);
        this.network.sendGameStateSync('VICTORY', this.currentLevelIndex);
        if (this.physics.marbleBody) {
          this.physics.marbleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
          this.physics.marbleBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        }
      },
      onBoostPad: () => {
        this.sounds.playBoost();
        this.hud.showToast('Speed Boost', '#f59e0b');
        this.network.sendHaptic(1, 'impactLight', 80);
      },
      onBouncer: () => {
        this.sounds.playSpring();
        this.hud.showToast('Spring Bounce', '#f43f5e');
        this.network.sendHaptic(1, 'impactLight', 120);
      },
      onGoalBlocked: (reached, total) => {
        this.sounds.playImpact(0.4);
        this.hud.showToast(`Checkpoints required: ${reached}/${total}`, '#f59e0b');
        this.network.sendHaptic(1, 'warning', 150);
      },
    });

    this.board = new Board();
    this.scene.add(this.board.group);

    this.marble = new Marble();
    this.scene.add(this.marble.mesh);

    this.effectsManager = new EffectsManager();
    this.scene.add(this.effectsManager.group);

    // 3. Controllers
    this.keyboard = new KeyboardController({
      onToggleCameraView: () => this.toggleCameraView(),
      onToggleQuality: () => this.toggleQualityMode(),
    });

    // 4. UI
    this.hud = new GameHUD(uiLayer, {
      onNextLevel: () => this.nextLevel(),
      onRestartLevel: () => this.startLevel(this.currentLevelIndex),
      onReturnToLobby: () => this.returnToLobby(),
      onToggleCameraView: () => this.toggleCameraView(),
    });

    try {
      const savedDiff = localStorage.getItem('tiltmaze_difficulty');
      if (savedDiff === 'easy' || savedDiff === 'medium' || savedDiff === 'hard') {
        this.currentDifficulty = savedDiff;
      }
    } catch {}

    this.lobbyUI = new LobbyUI(uiLayer, {
      onStartGame: (level, difficulty) => {
        this.currentDifficulty = difficulty;
        this.forceKeyboardMode = false;
        this.currentLevelIndex = level.id - 1;
        this.startLevel(this.currentLevelIndex);
      },
      onPlayKeyboard: (level, difficulty) => {
        this.currentDifficulty = difficulty;
        this.forceKeyboardMode = true;
        this.currentLevelIndex = level.id - 1;
        this.startLevel(this.currentLevelIndex);
      },
    });

    // 5. Network
    this.network = new GameNetwork({
      onRoomCreated: (info) => {
        this.lobbyUI.setRoomInfo(info.roomCode, info.lanIp, info.port);
      },
      onPlayerJoined: (p) => {
        this.lobbyUI.updatePlayerStatus(p.playerSlot, 'connected', p.deviceName);
        this.hud.showToast(`${p.deviceName} Connected!`, '#10b981');
      },
      onPlayerDisconnected: (p) => {
        this.lobbyUI.updatePlayerStatus(p.playerSlot, 'reconnecting');
        if (this.isPlaying && p.playerSlot === 1 && !this.forceKeyboardMode) {
          this.isPhysicsPaused = true;
          this.hud.showDisconnectOverlay(() => {
            this.isPhysicsPaused = false;
            this.forceKeyboardMode = true;
            this.hud.showToast('Switched to Keyboard Control', '#38bdf8');
          });
        }
        this.hud.showToast(`Player ${p.playerSlot} Disconnected - Reconnecting...`, '#f59e0b');
      },
      onPlayerReconnected: (p) => {
        this.lobbyUI.updatePlayerStatus(p.playerSlot, 'connected');
        this.hud.hideDisconnectOverlay();
        this.isPhysicsPaused = false;
        this.forceKeyboardMode = false;
        this.hud.showToast(`Player ${p.playerSlot} Reconnected!`, '#10b981');
      },
      onPlayerLeft: (p) => {
        this.lobbyUI.updatePlayerStatus(p.playerSlot, 'waiting');
        if (this.isPlaying && p.playerSlot === 1 && !this.forceKeyboardMode) {
          this.isPhysicsPaused = true;
          this.hud.showDisconnectOverlay(() => {
            this.isPhysicsPaused = false;
            this.forceKeyboardMode = true;
            this.hud.showToast('Switched to Keyboard Control', '#38bdf8');
          });
        }
        this.hud.showToast(`Player ${p.playerSlot} Left`, '#94a3b8');
      },
      onLatencyUpdate: (_rttMs, _skewMs) => {
        // Network round-trip latency and clock skew monitored
      },
      onRawPacketReceived: (raw) => {
        this.lastRawBuffer = raw;
      },
    });

    // Initialize Physics & Connect Network
    this.physics.init().then(() => {
      this.loadLevelData(LEVELS[0]);
    });
    this.network.connect();
    window.addEventListener('beforeunload', () => this.network.close());
  }

  private loadLevelData(level: LevelDef): void {
    const isNight = level.id === 6 || (level.theme && level.theme.sunIntensity < 2.0);
    if (level.theme) {
      this.environment.applyTheme(level.theme, isNight);
    }
    const boardWidth = level.grid[0].length * level.cellSize;
    const boardDepth = level.grid.length * level.cellSize;
    this.environment.adjustCloudClearance(boardWidth, boardDepth);

    this.effectsManager?.reset();
    this.wasAirborne = false;
    this.prevLinvelY = 0;
    this.board.buildLevel(level, this.currentDifficulty);
    const { startPos } = this.physics.loadLevel(level, this.currentDifficulty);
    this.marble.mesh.position.set(startPos.x, startPos.y, startPos.z);
    this.hud.setDifficulty(this.currentDifficulty);

    // Follow camera initial setup (standard vs cinematic view)
    const isStandard = this.cameraMode === 'standard';
    const camOffsetY = isStandard ? 2.3 : 1.6;
    const camOffsetZ = isStandard ? 4.2 : 3.4;

    this.cameraPosition.set(startPos.x, startPos.y + camOffsetY, startPos.z + camOffsetZ);
    this.cameraTarget.set(startPos.x, startPos.y + 0.65, startPos.z - 5.5);
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraTarget);
    this.currentCameraRoll = 0;
    this.camera.rotation.z = 0;
    this.phonePitchFilter.reset();
    this.phoneRollFilter.reset();

    const cp = this.physics.getCheckpointProgress();
    this.hud.setCheckpoints(cp.current, cp.total);
  }

  private triggerLevelTransition(action: () => void): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    const curtain = document.getElementById('level-fade-curtain');
    if (!curtain) {
      action();
      this.isTransitioning = false;
      return;
    }
    curtain.classList.add('fade-active');
    window.setTimeout(() => {
      action();
      window.setTimeout(() => {
        curtain.classList.remove('fade-active');
        this.isTransitioning = false;
      }, 50);
    }, 150);
  }

  private startLevel(idx: number): void {
    this.triggerLevelTransition(() => {
      this.currentLevelIndex = idx;
      this.fpsFramesInWindow = 0;
      this.fpsWindowStart = performance.now();
      this.levelStartTime = performance.now();
      this.isVictoryCelebration = false;
      this.victoryTime = 0;
      this.environment.setSanctumDimming(1.0);
      this.nextLightningTime = performance.now() + 5000 + Math.random() * 4000;
      this.sounds.resume();
      const level = LEVELS[idx];
      this.loadLevelData(level);
      this.hud.setLevel(level);
      this.hud.setDifficulty(this.currentDifficulty);
      this.isPlaying = true;
      this.isPhysicsPaused = false;
      this.hud.hideDisconnectOverlay();
      this.network.sendGameStateSync('PLAYING', idx);
    });
  }

  private nextLevel(): void {
    const nextIdx = (this.currentLevelIndex + 1) % LEVELS.length;
    this.startLevel(nextIdx);
  }

  private returnToLobby(): void {
    this.triggerLevelTransition(() => {
      this.isPlaying = false;
      this.isPhysicsPaused = false;
      this.isVictoryCelebration = false;
      this.victoryTime = 0;
      this.hud.hideDisconnectOverlay();
      this.lobbyUI.show();
      this.network.sendGameStateSync('LOBBY', this.currentLevelIndex);
    });
  }

  private setupResize(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private loop = (): void => {
    requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05); // Clamp dt
    this.lastTime = now;

    // Determine Input: Mobile Controller or Keyboard Fallback
    const kb = this.keyboard.update(dt);
    if (kb.recalibrate) {
      this.network.sendCalibrateRequest(1);
      this.pitchFilter.reset(0);
      this.rollFilter.reset(0);
      this.smoothedPitch = 0;
      this.smoothedRoll = 0;
    }

    if (this.network.consumeRecalibrate(1)) {
      this.phonePitchFilter.reset();
      this.phoneRollFilter.reset();
      this.smoothedPitch = 0;
      this.smoothedRoll = 0;
    }

    const phoneCtrl = this.network.getController(1);

    // Phone controller dismissal for victory modal
    if (this.hud && this.hud.isVictoryShowing()) {
      const phoneBoostEdge = (phoneCtrl?.boost ?? false) && !this.prevPhoneBoost;
      const phoneBrakeEdge = (phoneCtrl?.brake ?? false) && !this.prevPhoneBrake;
      const phoneShake = this.network.consumeShake(1);
      const phoneRecalibrate = this.network.consumeRecalibrate(1);

      if (phoneBoostEdge || phoneShake) {
        this.hud.dismissVictoryNext();
      } else if (phoneBrakeEdge || phoneRecalibrate) {
        this.hud.dismissVictoryRetry();
      }
    }
    this.prevPhoneBoost = phoneCtrl?.boost ?? false;
    this.prevPhoneBrake = phoneCtrl?.brake ?? false;

    let finalPitch = 0;
    let finalRoll = 0;
    let boost = false;
    let brake = false;
    let shake = false;
    let isKeyboard = true;

    // Use phone input if recently received (within last 500ms) and keyboard is not overriding and not forced
    if (!this.forceKeyboardMode && phoneCtrl && (now - phoneCtrl.lastPacketTime < 500) && !kb.isKeyboard) {
      boost = phoneCtrl.boost;
      brake = phoneCtrl.brake;
      shake = this.network.consumeShake(1);
      isKeyboard = false;

      // Adaptive One-Euro Filtering for phone IMU motion to eliminate Wi-Fi latency & sensor jitter
      const nowSec = now / 1000;
      finalPitch = this.phonePitchFilter.filter(phoneCtrl.pitch, nowSec);
      finalRoll = this.phoneRollFilter.filter(phoneCtrl.roll, nowSec);

      this.smoothedPitch = finalPitch;
      this.smoothedRoll = finalRoll;
    } else {
      boost = kb.boost;
      brake = kb.brake;
      shake = kb.shake;
      isKeyboard = true;

      // Adaptive One-Euro Filtering for keyboard input (timestamps in seconds)
      const nowSec = now / 1000;
      finalPitch = this.pitchFilter.filter(kb.pitch, nowSec);
      finalRoll = this.rollFilter.filter(kb.roll, nowSec);
      this.smoothedPitch = finalPitch;
      this.smoothedRoll = finalRoll;
    }

    // Update Environment (clouds breathing, lightning decays, sanctum eases)
    this.environment.update(now / 1000, dt);

    if (!this.isPlaying) {
      this.lobbyUI.updateLiveTilt(finalPitch, finalRoll);
    }

    if (this.isPlaying) {
      if (!this.isPhysicsPaused) {
        // Rolling 3-second FPS measurement & adaptive performance guard (zero allocation)
        this.fpsFramesInWindow++;
        const elapsedSinceWindow = now - this.fpsWindowStart;
        if (elapsedSinceWindow >= 3000) {
          const rollingFps = (this.fpsFramesInWindow * 1000) / elapsedSinceWindow;
          if (!this.isLowQuality && now - this.levelStartTime > 3500 && rollingFps < 45) {
            this.setQualityMode(true, 'FPS < 45 AUTO-GUARD');
          }
          this.fpsFramesInWindow = 0;
          this.fpsWindowStart = now;
        }

        // 1. Update Physics Gravity with rotated vector
        if (!this.isVictoryCelebration) {
          this.physics.updateGravity(finalPitch, finalRoll);
          this.physics.applyAction(boost, shake, dt, brake);
        } else if (this.physics.marbleBody) {
          const vel = this.physics.marbleBody.linvel();
          this.physics.marbleBody.setLinvel({ x: vel.x * 0.9, y: vel.y, z: vel.z * 0.9 }, true);
        }

        // 3. Step Rapier World (kinematic obstacles & physics)
        this.physics.step(dt);
      }

      // 4. Sync Marble visuals
      const marblePos = this.physics.getMarblePosition();
      const marbleRot = this.physics.getMarbleRotation();
      const speed = this.isPhysicsPaused ? 0 : this.physics.getMarbleSpeed();

      this.marble.update(marblePos, marbleRot, speed);

      const currentLevel = LEVELS[this.currentLevelIndex];

      // Atmospheric Storm Lightning (Level 5)
      if (currentLevel?.lightingProfile?.hasLightning && now >= this.nextLightningTime) {
        this.environment.triggerLightning(0.75 + Math.random() * 0.45);
        this.nextLightningTime = now + 6500 + Math.random() * 4500;
      }

      // Blackout Sanctum dynamic ambient dimming (Level 6)
      if (currentLevel?.lightingProfile?.blackoutSanctumRow !== undefined) {
        const sanctumRow = currentLevel.lightingProfile.blackoutSanctumRow;
        const boardDepth = currentLevel.grid.length * currentLevel.cellSize;
        const originZ = -boardDepth / 2;
        const thresholdZ = originZ + (sanctumRow + 0.5) * currentLevel.cellSize;
        if (marblePos.z <= thresholdZ) {
          this.environment.setSanctumDimming(0.12);
        } else {
          this.environment.setSanctumDimming(1.0);
        }
      }

      // Check coach toast trigger cells
      const coachHint = checkCoachHints(marblePos, currentLevel, this.sessionShownHints);
      if (coachHint) {
        this.hud.showCoachToast(coachHint);
      }

      // Landing detection (must have been airborne and now touching track floor above void)
      const isAirborne = marblePos.y > 0.44;
      if (this.wasAirborne && !isAirborne && this.prevLinvelY < -1.0 && marblePos.y >= 0.20) {
        this.effectsManager.triggerLandingPuff(marblePos);
      }
      this.wasAirborne = isAirborne;
      this.prevLinvelY = this.physics.marbleBody ? this.physics.marbleBody.linvel().y : 0;

      // Update pooled particle effects (trail, radial burst, landing dust, blob shadow)
      this.effectsManager.update(dt, marblePos, speed, boost);

      // 5. Visually tilt the 3D board
      this.board.setTilt(finalPitch, finalRoll);

      // 6. Update visual obstacle animations (spinners & golden rings)
      this.board.update(dt, this.physics.getSpinners());

      // 7. Smooth 3rd-person spring follow-cam (Standard vs Cinematic View vs Victory Ease)
      if (this.isVictoryCelebration) {
        this.victoryTime += dt;
        const slowOrbit = Math.sin(this.victoryTime * 0.5) * 0.7;
        this.targetCamPos.set(marblePos.x + slowOrbit, marblePos.y + 3.2, marblePos.z + 4.8);
        this.targetCamTarget.set(marblePos.x, marblePos.y + 0.35, marblePos.z);

        this.cameraPosition.lerp(this.targetCamPos, 1 - Math.exp(-3.5 * dt));
        this.cameraTarget.lerp(this.targetCamTarget, 1 - Math.exp(-5.0 * dt));

        this.camera.position.copy(this.cameraPosition);
        this.camera.lookAt(this.cameraTarget);
        this.camera.rotation.z = 0;
      } else {
        const isStandard = this.cameraMode === 'standard';
        const camOffsetY = isStandard ? 2.3 : 1.6;
        const camOffsetZ = isStandard ? 4.2 : 3.4;

        // Keep camera safe above cloud geometry
        const safeCamY = Math.max(1.2, marblePos.y + camOffsetY);
        this.targetCamPos.set(marblePos.x, safeCamY, marblePos.z + camOffsetZ);
        this.targetCamTarget.set(marblePos.x, marblePos.y + 0.65, marblePos.z - 5.5);

        // Silky-smooth critically damped camera follow (eliminates jerky micro-corrections)
        this.cameraPosition.lerp(this.targetCamPos, 1 - Math.exp(-4.2 * dt));
        this.cameraTarget.lerp(this.targetCamTarget, 1 - Math.exp(-5.5 * dt));

        this.camera.position.copy(this.cameraPosition);
        this.camera.lookAt(this.cameraTarget);

        // Smoothly damped camera banking (prevents rotational horizon snapping when tilting phone)
        const targetRoll = -finalRoll * 0.06;
        this.currentCameraRoll += (targetRoll - this.currentCameraRoll) * (1 - Math.exp(-4.5 * dt));
        this.camera.rotation.z = this.currentCameraRoll;
      }

      // Nitro FOV & Shake (Toggleable via GAME_FEEL_CONFIG)
      if (GAME_FEEL_CONFIG.nitroFovEnabled) {
        const targetFov = boost ? GAME_FEEL_CONFIG.boostFov : GAME_FEEL_CONFIG.baseFov;
        if (Math.abs(this.camera.fov - targetFov) > 0.02) {
          this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-7.0 * dt));
          this.camera.updateProjectionMatrix();
        }
      }

      if (GAME_FEEL_CONFIG.nitroShakeEnabled && boost) {
        const s = GAME_FEEL_CONFIG.boostShakeIntensity;
        this.camera.position.x += (Math.random() - 0.5) * s;
        this.camera.position.y += (Math.random() - 0.5) * s;
      }

      // Track directional sun shadow camera to follow marble
      this.environment.dirLight.position.set(marblePos.x + 16, marblePos.y + 28, marblePos.z + 16);
      this.environment.dirLight.target.position.set(marblePos.x, marblePos.y, marblePos.z);
      this.environment.dirLight.target.updateMatrixWorld();

      // 8. Modulate Audio
      this.sounds.updateRollSpeed(speed);

      // 9. Update HUD
      this.hud.update(speed);
      this.hud.updateLatency(
        this.network.getRttMs(),
        phoneCtrl?.packetRateHz ?? 60,
        phoneCtrl?.jitterMs ?? 0,
        isKeyboard
      );
    }

    // Render Scene
    this.renderer.render(this.scene, this.camera);
  };
}

// Bootstrap application on page load
window.addEventListener('DOMContentLoaded', () => {
  const app = new GameApp();
  (window as any).game = app;
  (window as any).gameApp = app;
});
