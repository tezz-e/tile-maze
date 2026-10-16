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
  private lastAcceptedTimes: Map<number, number> = new Map();
  private consecutiveStaleCounts: Map<number, number> = new Map();

  // NTP Sync metrics
  private rttMs: number = 0;
  private clockSkewMs: number = 0;
  private ntpInterval: any = null;

  // Previous raw button bits per slot for rising-edge detection
  private prevRawShake: Map<number, boolean> = new Map();
  private prevRawRecalibrate: Map<number, boolean> = new Map();

  // Reconnect backoff state
  private reconnectDelayMs: number = 1000;
  private reconnectTimer: any = null;
  private isIntentionallyClosed: boolean = false;

  private getTime: () => number;

  constructor(callbacks: NetworkCallbacks, getTime?: () => number) {
    this.callbacks = callbacks;
    this.getTime = getTime ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  private nowMs(): number {
    return this.getTime();
  }

  public connect(wsUrl?: string): void {
    this.isIntentionallyClosed = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const url =
      wsUrl ||
      `ws://${window.location.hostname || 'localhost'}:${window.location.port ? (window.location.port === '5173' ? '3000' : window.location.port) : '3000'}`;

    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      console.log('[GameNetwork] Connected to WebSocket server at', url);
      this.reconnectDelayMs = 1000;
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
      this.stopNtpLoop();
      if (this.isIntentionallyClosed) {
        console.log('[GameNetwork] WebSocket connection closed intentionally.');
        return;
      }
      const delay = this.reconnectDelayMs;
      console.log(`[GameNetwork] WebSocket connection closed. Attempting reconnect in ${delay / 1000}s...`);
      this.reconnectDelayMs = Math.min(15000, this.reconnectDelayMs * 2);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect(wsUrl);
      }, delay);
    };

    this.ws.onerror = (err) => {
      console.error('[GameNetwork] WebSocket error:', err);
    };
  }

  public close(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopNtpLoop();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  public getReconnectDelayMs(): number {
    return this.reconnectDelayMs;
  }

  public isClosed(): boolean {
    return this.isIntentionallyClosed;
  }

  public isReconnectScheduled(): boolean {
    return this.reconnectTimer !== null;
  }

  public handleBinaryTelemetry(buffer: ArrayBuffer): void {
    if (buffer.byteLength < PACKET_SIZE) return;

    try {
      const frame = decodeTelemetry(buffer);

      const slot = frame.playerSlot;
      const seq = frame.sequenceNumber & 0xff;
      const now = this.nowMs();

      const lastAccepted = this.lastAcceptedTimes.get(slot);
      const lastSeq = this.lastSequenceNumbers.get(slot);
      const staleCount = this.consecutiveStaleCounts.get(slot) ?? 0;

      let isResync = false;
      if (lastAccepted !== undefined && now - lastAccepted > 250) {
        isResync = true;
      }

      if (!isResync && lastSeq !== undefined) {
        const diff = (seq - lastSeq + 256) & 0xff;
        // diff === 0: exact duplicate
        if (diff === 0) {
          return;
        }
        // diff > 127: stale / out-of-order packet
        if (diff > 127) {
          const newStale = staleCount + 1;
          if (newStale >= 8) {
            isResync = true;
          } else {
            this.consecutiveStaleCounts.set(slot, newStale);
            return;
          }
        }
      }

      // Packet is accepted
      this.lastSequenceNumbers.set(slot, seq);
      this.lastAcceptedTimes.set(slot, now);
      this.consecutiveStaleCounts.set(slot, 0);

      this.callbacks.onRawPacketReceived?.(buffer);

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

      const rawShake = hasButton(frame.buttonBitmask, BUTTON_SHAKE);
      const rawRecalibrate = hasButton(frame.buttonBitmask, BUTTON_RECALIBRATE);

      let shakeEdge = false;
      let recalibrateEdge = false;

      if (isResync) {
        // Reset previous raw bits so held bits are not misread as rising edges
        this.prevRawShake.set(slot, rawShake);
        this.prevRawRecalibrate.set(slot, rawRecalibrate);
      } else {
        const prevShake = this.prevRawShake.get(slot) ?? false;
        const prevRecalibrate = this.prevRawRecalibrate.get(slot) ?? false;

        this.prevRawShake.set(slot, rawShake);
        this.prevRawRecalibrate.set(slot, rawRecalibrate);

        shakeEdge = rawShake && !prevShake;
        recalibrateEdge = rawRecalibrate && !prevRecalibrate;
      }

      const prev = this.controllers.get(slot);
      const shake = isResync ? false : ((prev?.shake ?? false) || shakeEdge);
      const recalibrate = isResync ? false : ((prev?.recalibrate ?? false) || recalibrateEdge);

      const state: ControllerState = {
        playerSlot: slot,
        pitch: frame.calibratedPitch,
        roll: frame.calibratedRoll,
        yaw: frame.yaw,
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
        this.prevRawShake.delete(msg.playerSlot);
        this.prevRawRecalibrate.delete(msg.playerSlot);
        this.lastSequenceNumbers.delete(msg.playerSlot);
        this.lastAcceptedTimes.delete(msg.playerSlot);
        this.consecutiveStaleCounts.delete(msg.playerSlot);
        this.callbacks.onPlayerJoined(msg);
        break;

      case 'PLAYER_DISCONNECTED':
        this.prevRawShake.delete(msg.playerSlot);
        this.prevRawRecalibrate.delete(msg.playerSlot);
        this.lastSequenceNumbers.delete(msg.playerSlot);
        this.lastAcceptedTimes.delete(msg.playerSlot);
        this.consecutiveStaleCounts.delete(msg.playerSlot);
        this.callbacks.onPlayerDisconnected(msg);
        break;

      case 'PLAYER_RECONNECTED':
        this.prevRawShake.delete(msg.playerSlot);
        this.prevRawRecalibrate.delete(msg.playerSlot);
        this.lastSequenceNumbers.delete(msg.playerSlot);
        this.lastAcceptedTimes.delete(msg.playerSlot);
        this.consecutiveStaleCounts.delete(msg.playerSlot);
        this.callbacks.onPlayerReconnected(msg);
        break;

      case 'PLAYER_LEFT':
        this.controllers.delete(msg.playerSlot);
        this.prevRawShake.delete(msg.playerSlot);
        this.prevRawRecalibrate.delete(msg.playerSlot);
        this.lastSequenceNumbers.delete(msg.playerSlot);
        this.lastAcceptedTimes.delete(msg.playerSlot);
        this.consecutiveStaleCounts.delete(msg.playerSlot);
        this.callbacks.onPlayerLeft(msg);
        break;

      case 'NTP_PONG':
        this.handleNtpPong(msg);
        break;
    }
  }

  private startNtpLoop(): void {
    this.stopNtpLoop();
    this.ntpInterval = setInterval(() => {
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

  public consumeRecalibrate(slot: number = 1): boolean {
    const ctrl = this.controllers.get(slot);
    if (ctrl && ctrl.recalibrate) {
      ctrl.recalibrate = false;
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
