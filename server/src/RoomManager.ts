import type { WebSocket } from 'ws';
import crypto from 'node:crypto';

export type PlayerSlot = 1 | 2;

export interface PlayerRecord {
  slot: PlayerSlot;
  sessionId: string;
  socket: WebSocket | null;
  deviceName: string;
  connected: boolean;
  disconnectTimer: NodeJS.Timeout | null;
  joinedAt: number;
}

export interface Room {
  code: string;
  hostSocket: WebSocket | null;
  hostSessionId: string;
  hostDisconnectTimer: NodeJS.Timeout | null;
  players: Map<PlayerSlot, PlayerRecord>;
  createdAt: number;
}

export interface JoinSuccess {
  success: true;
  slot: PlayerSlot;
  sessionId: string;
  reconnected: boolean;
  assignedName: string;
  room: Room;
}

export interface JoinFailure {
  success: false;
  error: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'INVALID_CODE';
  message: string;
}

export type JoinResult = JoinSuccess | JoinFailure;

export interface DisconnectResult {
  roomCode?: string;
  isHost?: boolean;
  slot?: PlayerSlot;
  sessionId?: string;
}

// 4-character alphabet excluding ambiguous symbols (0, O, 1, I, L)
const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ROOM_CODE_LENGTH = 4;
export const DEFAULT_GRACE_PERIOD_MS = 60_000; // 60 seconds session preservation

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToMetadata = new WeakMap<
    WebSocket,
    { roomCode: string; role: 'host' | 'controller'; slot?: PlayerSlot; sessionId: string }
  >();

  constructor(private gracePeriodMs: number = DEFAULT_GRACE_PERIOD_MS) {}

  /**
   * Generates a unique 4-character room code.
   */
  private generateUniqueRoomCode(): string {
    let attempts = 0;
    while (attempts < 1000) {
      let code = '';
      const bytes = crypto.randomBytes(ROOM_CODE_LENGTH);
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
      }
      if (!this.rooms.has(code)) {
        return code;
      }
      attempts++;
    }
    // Fallback if space is saturated (unlikely for 4 chars with low concurrency)
    return `R${Date.now().toString(36).slice(-3).toUpperCase()}`;
  }

  /**
   * Creates a new game room hosted by the browser game instance.
   */
  public createRoom(hostSocket: WebSocket): { room: Room; hostSessionId: string } {
    const code = this.generateUniqueRoomCode();
    const hostSessionId = crypto.randomUUID();

    const room: Room = {
      code,
      hostSocket,
      hostSessionId,
      hostDisconnectTimer: null,
      players: new Map(),
      createdAt: Date.now(),
    };

    this.rooms.set(code, room);
    this.socketToMetadata.set(hostSocket, {
      roomCode: code,
      role: 'host',
      sessionId: hostSessionId,
    });

    return { room, hostSessionId };
  }

  /**
   * Reconnects a host socket to an existing room using hostSessionId.
   */
  public reconnectHost(roomCode: string, hostSessionId: string, newSocket: WebSocket): boolean {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room || room.hostSessionId !== hostSessionId) {
      return false;
    }

    if (room.hostDisconnectTimer) {
      clearTimeout(room.hostDisconnectTimer);
      room.hostDisconnectTimer = null;
    }

    room.hostSocket = newSocket;
    this.socketToMetadata.set(newSocket, {
      roomCode: room.code,
      role: 'host',
      sessionId: hostSessionId,
    });

    return true;
  }

  /**
   * Mobile controller joins a room.
   * If sessionId matches an existing disconnected slot in this room, reconnects it!
   */
  public joinRoom(
    roomCode: string,
    socket: WebSocket,
    sessionId?: string,
    deviceName?: string
  ): JoinResult {
    const code = roomCode.trim().toUpperCase();
    const room = this.rooms.get(code);

    if (!room) {
      return {
        success: false,
        error: 'ROOM_NOT_FOUND',
        message: `Room code "${code}" does not exist.`,
      };
    }

    // 1. Check for existing session reconnection
    if (sessionId) {
      for (const [slot, player] of room.players.entries()) {
        if (player.sessionId === sessionId) {
          // Cancel grace period disconnect timer
          if (player.disconnectTimer) {
            clearTimeout(player.disconnectTimer);
            player.disconnectTimer = null;
          }

          if (player.socket && player.socket !== socket) {
            try {
              player.socket.close(1000, 'Replaced by reconnected socket');
            } catch {
              // ignore
            }
          }

          player.socket = socket;
          player.connected = true;
          if (deviceName) player.deviceName = deviceName;

          this.socketToMetadata.set(socket, {
            roomCode: code,
            role: 'controller',
            slot,
            sessionId,
          });

          return {
            success: true,
            slot,
            sessionId,
            reconnected: true,
            assignedName: player.deviceName,
            room,
          };
        }
      }
    }

    // 2. Allocate next open slot (1 or 2)
    let availableSlot: PlayerSlot | null = null;
    if (!room.players.has(1)) {
      availableSlot = 1;
    } else if (!room.players.has(2)) {
      availableSlot = 2;
    }

    if (!availableSlot) {
      return {
        success: false,
        error: 'ROOM_FULL',
        message: `Room "${code}" already has 2 active players.`,
      };
    }

    const newSessionId = sessionId || crypto.randomUUID();
    const assignedName = deviceName || `Player ${availableSlot}`;

    const record: PlayerRecord = {
      slot: availableSlot,
      sessionId: newSessionId,
      socket,
      deviceName: assignedName,
      connected: true,
      disconnectTimer: null,
      joinedAt: Date.now(),
    };

    room.players.set(availableSlot, record);
    this.socketToMetadata.set(socket, {
      roomCode: code,
      role: 'controller',
      slot: availableSlot,
      sessionId: newSessionId,
    });

    return {
      success: true,
      slot: availableSlot,
      sessionId: newSessionId,
      reconnected: false,
      assignedName,
      room,
    };
  }

  /**
   * Handles socket disconnection. Starts the 60-second grace timer for slot recovery.
   */
  public handleDisconnect(
    socket: WebSocket,
    onPlayerGraceExpired?: (room: Room, slot: PlayerSlot, sessionId: string) => void,
    onHostGraceExpired?: (roomCode: string) => void
  ): DisconnectResult {
    const meta = this.socketToMetadata.get(socket);
    if (!meta) return {};

    const { roomCode, role, slot, sessionId } = meta;
    const room = this.rooms.get(roomCode);
    if (!room) return { roomCode, isHost: role === 'host', slot, sessionId };

    if (role === 'host') {
      if (room.hostSocket === socket) {
        room.hostSocket = null;
        // Start grace timer for host
        room.hostDisconnectTimer = setTimeout(() => {
          this.closeRoom(roomCode);
          onHostGraceExpired?.(roomCode);
        }, this.gracePeriodMs);
      }
      return { roomCode, isHost: true, sessionId };
    }

    // Controller disconnected
    if (slot && room.players.has(slot)) {
      const player = room.players.get(slot)!;
      if (player.socket === socket) {
        player.socket = null;
        player.connected = false;

        // Start 60-second grace timer for controller slot reclamation
        player.disconnectTimer = setTimeout(() => {
          if (!player.connected && room.players.get(slot)?.sessionId === sessionId) {
            room.players.delete(slot);
            onPlayerGraceExpired?.(room, slot, sessionId);
          }
        }, this.gracePeriodMs);
      }
      return { roomCode, isHost: false, slot, sessionId };
    }

    return { roomCode, isHost: false, slot, sessionId };
  }

  public getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  public getSocketMetadata(socket: WebSocket) {
    return this.socketToMetadata.get(socket);
  }

  public closeRoom(code: string): void {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return;

    if (room.hostDisconnectTimer) {
      clearTimeout(room.hostDisconnectTimer);
    }

    for (const player of room.players.values()) {
      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
      }
      if (player.socket) {
        try {
          player.socket.close(1000, 'Room closed');
        } catch {
          // ignore
        }
      }
    }

    if (room.hostSocket) {
      try {
        room.hostSocket.close(1000, 'Room closed');
      } catch {
        // ignore
      }
    }

    this.rooms.delete(code.toUpperCase());
  }

  public getActiveRoomCount(): number {
    return this.rooms.size;
  }

  public destroy(): void {
    for (const code of Array.from(this.rooms.keys())) {
      this.closeRoom(code);
    }
  }
}
