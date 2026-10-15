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
import { TelemetryLab } from './ui/TelemetryLab.js';
import { ClickSpark } from './ui/ClickSpark.js';
import { LEVELS, type LevelDef } from './levels/LevelData.js';

class GameApp {
  // Three.js
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private environment!: SkyEnvironment;

  // Follow Camera (Bruno Simon Lerp Target Formula)
  private cameraPosition = new THREE.Vector3();
  private cameraTarget = new THREE.Vector3();

  // Game Systems
  private physics!: PhysicsWorld;
  private board!: Board;
  private marble!: Marble;
  private sounds!: SoundSynthesizer;
  private keyboard!: KeyboardController;
  private pitchFilter = new OneEuroFilter(1.2, 0.4);
  private rollFilter = new OneEuroFilter(1.2, 0.4);
  private network!: GameNetwork;

  // UI Systems
  private lobbyUI!: LobbyUI;
  private hud!: GameHUD;
  private telemetryLab!: TelemetryLab;
  private clickSpark = new ClickSpark();

  // State
  private currentLevelIndex = 0;
  private isPlaying = false;
  private lastTime = performance.now();
  private lastRawBuffer: ArrayBuffer | null = null;

  constructor() {
    this.initGraphics();
    this.initSystems();
    this.setupResize();
    this.loop();
  }

  private initGraphics(): void {
    const container = document.getElementById('game-container')!;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 150);
    this.camera.position.set(0, 4, 8);
    this.camera.lookAt(0, 0, -5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
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
      },
      onHoleFall: () => {
        this.sounds.playHoleFall();
        this.hud.showToast('HAZARD! MARBLE FELL', '#ef4444');
        this.network.sendHaptic(1, 'warning', 250);
        this.physics.respawnAtLastCheckpoint();
      },
      onCheckpoint: (idx) => {
        this.sounds.playCheckpoint();
        const cp = this.physics.getCheckpointProgress();
        this.hud.setCheckpoints(cp.current, cp.total);
        this.hud.showToast(`CHECKPOINT ${idx + 1} REACHED!`, '#38bdf8');
        this.network.sendHaptic(1, 'success', 80);
      },
      onGoalReached: () => {
        this.sounds.playWin();
        this.hud.showVictory();
        this.network.sendHaptic(1, 'success', 400);
        this.network.sendGameStateSync('VICTORY', this.currentLevelIndex);
      },
      onBoostPad: () => {
        this.sounds.playBoost();
        this.hud.showToast('NITRO BOOST!', '#f59e0b');
        this.network.sendHaptic(1, 'impactLight', 80);
      },
      onBouncer: () => {
        this.sounds.playSpring();
        this.hud.showToast('SPRING BOUNCE!', '#f43f5e');
        this.network.sendHaptic(1, 'impactLight', 120);
      },
    });

    this.board = new Board();
    this.scene.add(this.board.group);

    this.marble = new Marble();
    this.scene.add(this.marble.mesh);

    // 3. Controllers
    this.keyboard = new KeyboardController({
      onToggleTelemetryLab: () => this.telemetryLab.toggle(),
    });

    // 4. UI
    this.telemetryLab = new TelemetryLab(uiLayer);

    this.hud = new GameHUD(uiLayer, {
      onNextLevel: () => this.nextLevel(),
      onRestartLevel: () => this.startLevel(this.currentLevelIndex),
      onReturnToLobby: () => this.returnToLobby(),
      onToggleTelemetryLab: () => this.telemetryLab.toggle(),
    });

    this.lobbyUI = new LobbyUI(uiLayer, {
      onStartGame: (level) => {
        this.currentLevelIndex = level.id - 1;
        this.startLevel(this.currentLevelIndex);
      },
      onPlayKeyboard: (level) => {
        this.currentLevelIndex = level.id - 1;
        this.startLevel(this.currentLevelIndex);
      },
      onOpenTelemetryLab: () => this.telemetryLab.toggle(),
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
        this.hud.showToast(`Player ${p.playerSlot} Disconnected - Reconnecting...`, '#f59e0b');
      },
      onPlayerReconnected: (p) => {
        this.lobbyUI.updatePlayerStatus(p.playerSlot, 'connected');
        this.hud.showToast(`Player ${p.playerSlot} Reconnected!`, '#10b981');
      },
      onPlayerLeft: (p) => {
        this.lobbyUI.updatePlayerStatus(p.playerSlot, 'waiting');
        this.hud.showToast(`Player ${p.playerSlot} Left`, '#94a3b8');
      },
      onLatencyUpdate: (rttMs, skewMs) => {
        const ctrl = this.network.getController(1);
        this.telemetryLab.updateMetrics(
          rttMs,
          skewMs,
          ctrl?.packetRateHz ?? 60,
          ctrl?.jitterMs ?? 0
        );
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
  }

  private loadLevelData(level: LevelDef): void {
    this.board.buildLevel(level);
    const { startPos } = this.physics.loadLevel(level);
    this.marble.mesh.position.set(startPos.x, startPos.y, startPos.z);

    // Bruno Simon follow camera initial setup
    this.cameraPosition.set(startPos.x, startPos.y + 2.5, startPos.z + 5.2);
    this.cameraTarget.set(startPos.x, startPos.y + 0.8, startPos.z - 4.5);
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraTarget);

    const cp = this.physics.getCheckpointProgress();
    this.hud.setCheckpoints(cp.current, cp.total);
  }

  private startLevel(idx: number): void {
    this.currentLevelIndex = idx;
    this.sounds.resume();
    const level = LEVELS[idx];
    this.loadLevelData(level);
    this.hud.setLevel(level);
    this.isPlaying = true;
    this.network.sendGameStateSync('PLAYING', idx);
  }

  private nextLevel(): void {
    const nextIdx = (this.currentLevelIndex + 1) % LEVELS.length;
    this.startLevel(nextIdx);
  }

  private returnToLobby(): void {
    this.isPlaying = false;
    this.lobbyUI.show();
    this.network.sendGameStateSync('LOBBY', this.currentLevelIndex);
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
    const phoneCtrl = this.network.getController(1);

    let rawPitch = 0;
    let rawRoll = 0;
    let boost = false;
    let shake = false;
    let isKeyboard = true;

    // Use phone input if recently received (within last 500ms) and keyboard is not overriding
    if (phoneCtrl && (now - phoneCtrl.lastPacketTime < 500) && !kb.isKeyboard) {
      rawPitch = phoneCtrl.pitch;
      rawRoll = phoneCtrl.roll;
      boost = phoneCtrl.boost;
      shake = this.network.consumeShake(1);
      isKeyboard = false;
    } else {
      rawPitch = kb.pitch;
      rawRoll = kb.roll;
      boost = kb.boost;
      shake = kb.shake;
      isKeyboard = true;
    }

    // Adaptive One-Euro Filtering
    const filteredPitch = this.pitchFilter.filter(rawPitch, now);
    const filteredRoll = this.rollFilter.filter(rawRoll, now);

    // Update Telemetry Lab if visible
    if (this.telemetryLab.isOpen() && this.lastRawBuffer) {
      this.telemetryLab.updatePacket(this.lastRawBuffer, filteredPitch);
    }

    // Update Environment (clouds breathing)
    this.environment.update(now / 1000);

    if (this.isPlaying) {
      // 1. Update Physics Gravity with rotated vector
      this.physics.updateGravity(filteredPitch, filteredRoll);

      // 2. Apply discrete impulses (jump / nitro)
      this.physics.applyAction(boost, shake, dt);

      // 3. Step Rapier World (kinematic obstacles & physics)
      this.physics.step(dt);

      // 4. Sync Marble visuals
      const marblePos = this.physics.getMarblePosition();
      const marbleRot = this.physics.getMarbleRotation();
      const speed = this.physics.getMarbleSpeed();

      this.marble.update(marblePos, marbleRot, speed);

      // 5. Visually tilt the 3D board
      this.board.setTilt(filteredPitch, filteredRoll);

      // 6. Update visual obstacle animations (spinners & golden rings)
      this.board.update(dt, this.physics.getSpinners());

      // 7. Smooth 3rd-person spring follow-cam (Bruno Simon Lerp Formula)
      const targetCamPos = new THREE.Vector3(marblePos.x, marblePos.y + 2.5, marblePos.z + 5.2);
      const targetCamTarget = new THREE.Vector3(marblePos.x, marblePos.y + 0.8, marblePos.z - 4.5);

      this.cameraPosition.lerp(targetCamPos, 1 - Math.exp(-6.0 * dt));
      this.cameraTarget.lerp(targetCamTarget, 1 - Math.exp(-8.0 * dt));

      this.camera.position.copy(this.cameraPosition);
      this.camera.lookAt(this.cameraTarget);
      // Dynamic camera banking into steering turns
      this.camera.rotation.z = -filteredRoll * 0.05;

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
  new GameApp();
});
