/**
 * JSON Control Plane Message Types & Helpers
 * Tiltmaze: Kinetic Edition
 */

export type PlayerSlot = 1 | 2;

export type HapticEffect =
  | 'impactLight'
  | 'impactHeavy'
  | 'scrape'
  | 'success'
  | 'warning';

export type GameState =
  | 'LOBBY'
  | 'PLAYING'
  | 'PAUSED'
  | 'VICTORY'
  | 'GAMEOVER';

// Message Definitions

export interface HostCreateRoomMsg {
  type: 'HOST_CREATE_ROOM';
}

export interface HostReconnectMsg {
  type: 'HOST_RECONNECT';
  roomCode: string;
  hostSessionId: string;
}

export interface RoomCreatedMsg {
  type: 'ROOM_CREATED';
  roomCode: string;
  hostSessionId: string;
  lanIp: string;
  port: number;
}

export interface JoinRoomMsg {
  type: 'JOIN_ROOM';
  roomCode: string;
  sessionId?: string;
  deviceName?: string;
}

export interface JoinedRoomMsg {
  type: 'JOINED_ROOM';
  roomCode: string;
  playerSlot: PlayerSlot;
  sessionId: string;
  assignedName: string;
}

export interface PlayerJoinedMsg {
  type: 'PLAYER_JOINED';
  playerSlot: PlayerSlot;
  sessionId: string;
  deviceName: string;
}

export interface PlayerDisconnectedMsg {
  type: 'PLAYER_DISCONNECTED';
  playerSlot: PlayerSlot;
  sessionId: string;
  gracePeriodSeconds: number;
}

export interface PlayerReconnectedMsg {
  type: 'PLAYER_RECONNECTED';
  playerSlot: PlayerSlot;
  sessionId: string;
}

export interface PlayerLeftMsg {
  type: 'PLAYER_LEFT';
  playerSlot: PlayerSlot;
  sessionId: string;
}

export interface NtpPingMsg {
  type: 'NTP_PING';
  clientSendTime: number; // t0
}

export interface NtpPongMsg {
  type: 'NTP_PONG';
  clientSendTime: number;    // t0
  serverReceiveTime: number; // t1
  serverSendTime: number;    // t2
}

export interface HapticEventMsg {
  type: 'HAPTIC_EVENT';
  playerSlot: PlayerSlot;
  effect: HapticEffect;
  durationMs?: number;
  intensity?: number;
}

export interface CalibrateRequestMsg {
  type: 'CALIBRATE_REQUEST';
  playerSlot?: PlayerSlot;
}

export interface CalibrateCompleteMsg {
  type: 'CALIBRATE_COMPLETE';
  playerSlot: PlayerSlot;
  zeroPitch: number;
  zeroRoll: number;
}

export interface GameStateSyncMsg {
  type: 'GAME_STATE_SYNC';
  state: GameState;
  levelIndex: number;
  score?: number;
  timeMs?: number;
}

export interface ErrorMsg {
  type: 'ERROR';
  code: string;
  message: string;
}

export type ControlMessage =
  | HostCreateRoomMsg
  | HostReconnectMsg
  | RoomCreatedMsg
  | JoinRoomMsg
  | JoinedRoomMsg
  | PlayerJoinedMsg
  | PlayerDisconnectedMsg
  | PlayerReconnectedMsg
  | PlayerLeftMsg
  | NtpPingMsg
  | NtpPongMsg
  | HapticEventMsg
  | CalibrateRequestMsg
  | CalibrateCompleteMsg
  | GameStateSyncMsg
  | ErrorMsg;

export const MAX_CONTROL_MESSAGE_LENGTH = 4096;
const MAX_STR_LEN = 128;
const MAX_ROOM_CODE_LEN = 32;

function isNonEmptyString(val: unknown, maxLen = MAX_STR_LEN): val is string {
  return typeof val === 'string' && val.trim().length > 0 && val.length <= maxLen;
}

function isString(val: unknown, maxLen = MAX_STR_LEN): val is string {
  return typeof val === 'string' && val.length <= maxLen;
}

function isOptionalString(val: unknown, maxLen = MAX_STR_LEN): boolean {
  return val === undefined || (typeof val === 'string' && val.length <= maxLen);
}

function isPlayerSlot(val: unknown): val is PlayerSlot {
  return val === 1 || val === 2;
}

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

function isOptionalFiniteNumber(val: unknown): boolean {
  return val === undefined || (typeof val === 'number' && Number.isFinite(val));
}

const VALID_HAPTIC_EFFECTS = new Set<string>([
  'impactLight',
  'impactHeavy',
  'scrape',
  'success',
  'warning',
]);

const VALID_GAME_STATES = new Set<string>([
  'LOBBY',
  'PLAYING',
  'PAUSED',
  'VICTORY',
  'GAMEOVER',
]);

function validateControlMessage(parsed: any): ControlMessage | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.type !== 'string') {
    return null;
  }

  switch (parsed.type) {
    case 'HOST_CREATE_ROOM':
      return parsed as HostCreateRoomMsg;

    case 'HOST_RECONNECT':
      if (isNonEmptyString(parsed.roomCode, MAX_ROOM_CODE_LEN) && isNonEmptyString(parsed.hostSessionId)) {
        return parsed as HostReconnectMsg;
      }
      return null;

    case 'ROOM_CREATED':
      if (
        isNonEmptyString(parsed.roomCode, MAX_ROOM_CODE_LEN) &&
        isNonEmptyString(parsed.hostSessionId) &&
        isNonEmptyString(parsed.lanIp, 64) &&
        isFiniteNumber(parsed.port)
      ) {
        return parsed as RoomCreatedMsg;
      }
      return null;

    case 'JOIN_ROOM':
      if (
        isNonEmptyString(parsed.roomCode, MAX_ROOM_CODE_LEN) &&
        isOptionalString(parsed.sessionId) &&
        isOptionalString(parsed.deviceName)
      ) {
        return parsed as JoinRoomMsg;
      }
      return null;

    case 'JOINED_ROOM':
      if (
        isNonEmptyString(parsed.roomCode, MAX_ROOM_CODE_LEN) &&
        isPlayerSlot(parsed.playerSlot) &&
        isNonEmptyString(parsed.sessionId) &&
        isString(parsed.assignedName)
      ) {
        return parsed as JoinedRoomMsg;
      }
      return null;

    case 'PLAYER_JOINED':
      if (
        isPlayerSlot(parsed.playerSlot) &&
        isOptionalString(parsed.sessionId) &&
        isOptionalString(parsed.deviceName)
      ) {
        return parsed as PlayerJoinedMsg;
      }
      return null;

    case 'PLAYER_DISCONNECTED':
      if (
        isPlayerSlot(parsed.playerSlot) &&
        isOptionalString(parsed.sessionId) &&
        isOptionalFiniteNumber(parsed.gracePeriodSeconds)
      ) {
        return parsed as PlayerDisconnectedMsg;
      }
      return null;

    case 'PLAYER_RECONNECTED':
      if (isPlayerSlot(parsed.playerSlot) && isOptionalString(parsed.sessionId)) {
        return parsed as PlayerReconnectedMsg;
      }
      return null;

    case 'PLAYER_LEFT':
      if (isPlayerSlot(parsed.playerSlot) && isOptionalString(parsed.sessionId)) {
        return parsed as PlayerLeftMsg;
      }
      return null;

    case 'NTP_PING':
      if (isFiniteNumber(parsed.clientSendTime)) {
        return parsed as NtpPingMsg;
      }
      return null;

    case 'NTP_PONG':
      if (
        isFiniteNumber(parsed.clientSendTime) &&
        isFiniteNumber(parsed.serverReceiveTime) &&
        isFiniteNumber(parsed.serverSendTime)
      ) {
        return parsed as NtpPongMsg;
      }
      return null;

    case 'HAPTIC_EVENT':
      if (
        isPlayerSlot(parsed.playerSlot) &&
        VALID_HAPTIC_EFFECTS.has(parsed.effect) &&
        isOptionalFiniteNumber(parsed.durationMs) &&
        isOptionalFiniteNumber(parsed.intensity)
      ) {
        return parsed as HapticEventMsg;
      }
      return null;

    case 'CALIBRATE_REQUEST':
      if (parsed.playerSlot === undefined || isPlayerSlot(parsed.playerSlot)) {
        return parsed as CalibrateRequestMsg;
      }
      return null;

    case 'CALIBRATE_COMPLETE':
      if (
        isPlayerSlot(parsed.playerSlot) &&
        isFiniteNumber(parsed.zeroPitch) &&
        isFiniteNumber(parsed.zeroRoll)
      ) {
        return parsed as CalibrateCompleteMsg;
      }
      return null;

    case 'GAME_STATE_SYNC':
      if (
        VALID_GAME_STATES.has(parsed.state) &&
        isFiniteNumber(parsed.levelIndex) &&
        isOptionalFiniteNumber(parsed.score) &&
        isOptionalFiniteNumber(parsed.timeMs)
      ) {
        return parsed as GameStateSyncMsg;
      }
      return null;

    case 'ERROR':
      if (isString(parsed.code, 64) && isString(parsed.message, 512)) {
        return parsed as ErrorMsg;
      }
      return null;

    default:
      return null;
  }
}

/**
 * Safely parse a JSON control message from a string.
 */
export function parseControlMessage(data: string): ControlMessage | null {
  if (typeof data !== 'string' || data.length === 0 || data.length > MAX_CONTROL_MESSAGE_LENGTH) {
    return null;
  }
  try {
    const parsed = JSON.parse(data);
    return validateControlMessage(parsed);
  } catch {
    // Non-JSON or malformed payload
    return null;
  }
}

/**
 * Serializes a ControlMessage to JSON string.
 */
export function serializeControlMessage(message: ControlMessage): string {
  return JSON.stringify(message);
}
