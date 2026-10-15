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

/**
 * Safely parse a JSON control message from a string.
 */
export function parseControlMessage(data: string): ControlMessage | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed.type === 'string') {
      return parsed as ControlMessage;
    }
  } catch {
    // Non-JSON or malformed payload
  }
  return null;
}

/**
 * Serializes a ControlMessage to JSON string.
 */
export function serializeControlMessage(message: ControlMessage): string {
  return JSON.stringify(message);
}
