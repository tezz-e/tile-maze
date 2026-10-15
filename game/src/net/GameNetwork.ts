import {
  PACKET_SIZE,
  PACKET_TYPE_TELEMETRY,
  decodeTelemetry,
  BUTTON_BOOST,
  BUTTON_BRAKE,
  BUTTON_SHAKE,
  BUTTON_RECALIBRATE,
  hasButton,
  parseControlMessage,
  serializeControlMessage,
  type ControlMessage,
  type RoomCreatedMsg,
  type PlayerJoinedMsg,
  type PlayerDisconnectedMsg,
  type PlayerReconnectedMsg,
  type PlayerLeftMsg,
  type NtpPongMsg,
  type HapticEffect,
} from '@tiltmaze/protocol';

export interface ControllerState {
  playerSlot: number;
  pitch: number;
  roll: number;
  yaw: number;
  boost: boolean;
  brake: boolean;
  shake: boolean;
  recalibrate: boolean;
  lastPacketTime: number;
  sequenceNumber: number;
  packetRateHz: number;
  jitterMs: number;
}

export interface NetworkCallbacks {
  onRoomCreated: (info: RoomCreatedMsg) => void;
  onPlayerJoined: (p: PlayerJoinedMsg) => void;
  onPlayerDisconnected: (p: PlayerDisconnectedMsg) => void;
  onPlayerReconnected: (p: PlayerReconnectedMsg) => void;
  onPlayerLeft: (p: PlayerLeftMsg) => void;
  onLatencyUpdate: (rttMs: number, clockSkewMs: number) => void;
  onRawPacketReceived?: (raw: ArrayBuffer) => void;
}

export class GameNetwork {
  private ws: WebSocket | null = null;
  private callbacks: NetworkCallbacks;
  private roomCode: string | null = null;
  private hostSessionId: string | null = null;
  private lanIp: string = '127.0.0.1';
  private port: number = 3000;

  // Controllers state mapped by slot (1, 2)
  private controllers: Map<number, ControllerState> = new Map();

  // Packet jitter & rate tracking
  private lastArrivalTimes: Map<number, number[]> = new Map();
  private lastSequenceNumbers: Map<number, number> = new Map();

  // NTP Sync metrics
  private rttMs: number = 0;
  private clockSkewMs: number = 0;
  private ntpInterval: number | null = null;

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(wsUrl?: string): void {
    const url =
      wsUrl ||
      `ws://${window.location.hostname || 'localhost'}:${window.location.port ? (window.location.port === '5173' ? '3000' : window.location.port) : '3000'}`;

    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[GameNetwork] Connected to WebSocket server at', url);
      if (this.roomCode && this.hostSessionId) {
        const reconMsg: ControlMessage = {
          type: 'HOST_RECONNECT',
          roomCode: this.roomCode,
          hostSessionId: this.hostSessionId,
        };
        this.sendJson(reconMsg);
      } else {
        const createMsg: ControlMessage = { type: 'HOST_CREATE_ROOM' };
        this.sendJson(createMsg);
      }
      this.startNtpLoop();
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.handleBinaryTelemetry(event.data);
      } else if (typeof event.data === 'string') {
        this.handleControlMessage(event.data);
      }
    };

    this.ws.onclose = () => {
      console.log('[GameNetwork] WebSocket connection closed. Attempting reconnect in 2s...');
      this.stopNtpLoop();
      setTimeout(() => this.connect(wsUrl), 2000);
    };

    this.ws.onerror = (err) => {
      console.error('[GameNetwork] WebSocket error:', err);
    };
  }

  private handleBinaryTelemetry(buffer: ArrayBuffer): void {
    if (buffer.byteLength < PACKET_SIZE) return;

    try {
      const frame = decodeTelemetry(buffer);
      this.callbacks.onRawPacketReceived?.(buffer);

      const now = performance.now();
      const slot = frame.playerSlot;

      // Calculate arrival intervals for Hz and Jitter
      if (!this.lastArrivalTimes.has(slot)) {
        this.lastArrivalTimes.set(slot, []);
      }
      const intervals = this.lastArrivalTimes.get(slot)!;
      intervals.push(now);
      if (intervals.length > 30) intervals.shift();

      let rateHz = 0;
      let jitter = 0;
      if (intervals.length >= 2) {
        const totalDuration = intervals[intervals.length - 1] - intervals[0];
        const avgInterval = totalDuration / (intervals.length - 1);
        rateHz = avgInterval > 0 ? 1000 / avgInterval : 0;

        // Jitter: standard deviation of intervals
        let sumSq = 0;
        for (let i = 1; i < intervals.length; i++) {
          const diff = (intervals[i] - intervals[i - 1]) - avgInterval;
          sumSq += diff * diff;
        }
        jitter = Math.sqrt(sumSq / (intervals.length - 1));
      }

      const boost = hasButton(frame.buttonBitmask, BUTTON_BOOST);
      const brake = hasButton(frame.buttonBitmask, BUTTON_BRAKE);
      const shake = hasButton(frame.buttonBitmask, BUTTON_SHAKE);
      const recalibrate = hasButton(frame.buttonBitmask, BUTTON_RECALIBRATE);

      const state: ControllerState = {
        playerSlot: slot,
        pitch: frame.calibratedPitch,
        roll: frame.calibratedRoll,
        yaw: frame.rawYawRate,
        boost,
        brake,
        shake,
        recalibrate,
        lastPacketTime: now,
        sequenceNumber: frame.sequenceNumber,
        packetRateHz: Math.round(rateHz),
        jitterMs: Math.round(jitter * 10) / 10,
      };

      this.controllers.set(slot, state);
    } catch (e) {
      // Decode error / corrupt frame
    }
  }

  private handleControlMessage(raw: string): void {
    const msg = parseControlMessage(raw);
    if (!msg) return;

    switch (msg.type) {
      case 'ROOM_CREATED':
        this.roomCode = msg.roomCode;
        this.hostSessionId = msg.hostSessionId;
        this.lanIp = msg.lanIp;
        this.port = msg.port;
        this.callbacks.onRoomCreated(msg);
        break;

      case 'PLAYER_JOINED':
        this.callbacks.onPlayerJoined(msg);
        break;

      case 'PLAYER_DISCONNECTED':
        this.callbacks.onPlayerDisconnected(msg);
        break;

      case 'PLAYER_RECONNECTED':
        this.callbacks.onPlayerReconnected(msg);
        break;

      case 'PLAYER_LEFT':
        this.controllers.delete(msg.playerSlot);
        this.callbacks.onPlayerLeft(msg);
        break;

      case 'NTP_PONG':
        this.handleNtpPong(msg);
        break;
    }
  }

  private startNtpLoop(): void {
    this.stopNtpLoop();
    this.ntpInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const ping: ControlMessage = {
          type: 'NTP_PING',
          clientSendTime: Date.now(),
        };
        this.sendJson(ping);
      }
    }, 1000);
  }

  private stopNtpLoop(): void {
    if (this.ntpInterval) {
      clearInterval(this.ntpInterval);
      this.ntpInterval = null;
    }
  }

  private handleNtpPong(pong: NtpPongMsg): void {
    const t0 = pong.clientSendTime;
    const t1 = pong.serverReceiveTime;
    const t2 = pong.serverSendTime;
    const t3 = Date.now();

    // NTP standard RTT: (t3 - t0) - (t2 - t1)
    const rtt = Math.max(0, (t3 - t0) - (t2 - t1));
    // Clock Skew: ((t1 - t0) + (t2 - t3)) / 2
    const skew = ((t1 - t0) + (t2 - t3)) / 2;

    this.rttMs = Math.round(rtt * 10) / 10;
    this.clockSkewMs = Math.round(skew * 10) / 10;
    this.callbacks.onLatencyUpdate(this.rttMs, this.clockSkewMs);
  }

  public sendHaptic(playerSlot: 1 | 2, effect: HapticEffect, durationMs?: number, intensity?: number): void {
    const msg: ControlMessage = {
      type: 'HAPTIC_EVENT',
      playerSlot,
      effect,
      durationMs,
      intensity,
    };
    this.sendJson(msg);
  }

  public sendCalibrateRequest(playerSlot?: 1 | 2): void {
    const msg: ControlMessage = {
      type: 'CALIBRATE_REQUEST',
      playerSlot,
    };
    this.sendJson(msg);
  }

  public sendGameStateSync(
    state: 'LOBBY' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAMEOVER',
    levelIndex: number,
    score?: number,
    timeMs?: number
  ): void {
    const msg: ControlMessage = {
      type: 'GAME_STATE_SYNC',
      state,
      levelIndex,
      score,
      timeMs,
    };
    this.sendJson(msg);
  }

  private sendJson(msg: ControlMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(serializeControlMessage(msg));
    }
  }

  public getController(slot: number = 1): ControllerState | undefined {
    return this.controllers.get(slot);
  }

  public consumeShake(slot: number = 1): boolean {
    const ctrl = this.controllers.get(slot);
    if (ctrl && ctrl.shake) {
      ctrl.shake = false;
      return true;
    }
    return false;
  }

  public getRoomCode(): string | null {
    return this.roomCode;
  }

  public getLanIp(): string {
    return this.lanIp;
  }

  public getPort(): number {
    return this.port;
  }

  public getRttMs(): number {
    return this.rttMs;
  }
}
