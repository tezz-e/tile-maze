import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomManager } from '../src/RoomManager.js';
import { getPrimaryLanIp, getLanInterfaces } from '../src/networkDiscovery.js';
import { handleNtpPing } from '../src/ntpSync.js';
import type { WebSocket } from 'ws';

function createMockSocket(): WebSocket {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1, // OPEN
  } as unknown as WebSocket;
}

describe('RoomManager - 4-Char Rooms & 60s Session Recovery', () => {
  let roomManager: RoomManager;

  beforeEach(() => {
    roomManager = new RoomManager(100); // 100ms grace period for fast testing
  });

  it('creates a room with a 4-character code', () => {
    const hostSocket = createMockSocket();
    const { room, hostSessionId } = roomManager.createRoom(hostSocket);

    expect(room.code).toBeDefined();
    expect(room.code.length).toBe(4);
    expect(hostSessionId).toBeDefined();
    expect(roomManager.getRoom(room.code)).toBe(room);
  });

  it('assigns player 1 and player 2 slots correctly', () => {
    const hostSocket = createMockSocket();
    const { room } = roomManager.createRoom(hostSocket);

    const p1Socket = createMockSocket();
    const p1Join = roomManager.joinRoom(room.code, p1Socket, undefined, 'Nothing Phone');
    expect(p1Join.success).toBe(true);
    if (p1Join.success) {
      expect(p1Join.slot).toBe(1);
      expect(p1Join.reconnected).toBe(false);
    }

    const p2Socket = createMockSocket();
    const p2Join = roomManager.joinRoom(room.code, p2Socket, undefined, 'Pixel 8');
    expect(p2Join.success).toBe(true);
    if (p2Join.success) {
      expect(p2Join.slot).toBe(2);
      expect(p2Join.reconnected).toBe(false);
    }

    // 3rd player should be rejected (Room full)
    const p3Socket = createMockSocket();
    const p3Join = roomManager.joinRoom(room.code, p3Socket, undefined, 'iPhone');
    expect(p3Join.success).toBe(false);
    if (!p3Join.success) {
      expect(p3Join.error).toBe('ROOM_FULL');
    }
  });

  it('recovers disconnected player session within grace period', () => {
    const hostSocket = createMockSocket();
    const { room } = roomManager.createRoom(hostSocket);

    const p1Socket = createMockSocket();
    const p1Join = roomManager.joinRoom(room.code, p1Socket, undefined, 'Phone 3');
    expect(p1Join.success).toBe(true);
    if (!p1Join.success) return;

    const p1SessionId = p1Join.sessionId;

    // Disconnect player 1
    roomManager.handleDisconnect(p1Socket);

    // Reconnect player 1 with same sessionId
    const p1NewSocket = createMockSocket();
    const reconJoin = roomManager.joinRoom(room.code, p1NewSocket, p1SessionId);

    expect(reconJoin.success).toBe(true);
    if (reconJoin.success) {
      expect(reconJoin.slot).toBe(1);
      expect(reconJoin.reconnected).toBe(true);
      expect(reconJoin.sessionId).toBe(p1SessionId);
    }
  });

  it('rejects joins with non-existent room code', () => {
    const socket = createMockSocket();
    const join = roomManager.joinRoom('ZZZZ', socket);
    expect(join.success).toBe(false);
    if (!join.success) {
      expect(join.error).toBe('ROOM_NOT_FOUND');
    }
  });

  it('reconnects host with hostSessionId', () => {
    const hostSocket1 = createMockSocket();
    const { room, hostSessionId } = roomManager.createRoom(hostSocket1);

    roomManager.handleDisconnect(hostSocket1);

    const hostSocket2 = createMockSocket();
    const reconnected = roomManager.reconnectHost(room.code, hostSessionId, hostSocket2);
    expect(reconnected).toBe(true);
    expect(room.hostSocket).toBe(hostSocket2);
  });

  it('handles rapid controller connection flapping and terminates zombie sockets', () => {
    const hostSocket = createMockSocket();
    const { room } = roomManager.createRoom(hostSocket);

    // Initial join
    const s1 = createMockSocket();
    const join1 = roomManager.joinRoom(room.code, s1, undefined, 'Flapping Phone');
    expect(join1.success).toBe(true);
    if (!join1.success) return;

    const sessionId = join1.sessionId;

    // Rapid flap 1: new socket connects before s1 disconnects
    const s2 = createMockSocket();
    const join2 = roomManager.joinRoom(room.code, s2, sessionId);
    expect(join2.success).toBe(true);
    expect(s1.close).toHaveBeenCalledWith(1000, expect.stringContaining('Replaced'));

    // Rapid flap 2: another socket reconnects
    const s3 = createMockSocket();
    const join3 = roomManager.joinRoom(room.code, s3, sessionId);
    expect(join3.success).toBe(true);
    expect(s2.close).toHaveBeenCalledWith(1000, expect.stringContaining('Replaced'));
    expect(room.players.get(1)?.socket).toBe(s3);
  });
});

describe('networkDiscovery', () => {
  it('returns a valid IP address for primary LAN IP', () => {
    const ip = getPrimaryLanIp();
    expect(typeof ip).toBe('string');
    expect(ip.length).toBeGreaterThan(0);
    // Should match IPv4 pattern
    expect(/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)).toBe(true);
  });

  it('retrieves and prioritizes LAN interfaces', () => {
    const interfaces = getLanInterfaces();
    expect(Array.isArray(interfaces)).toBe(true);
    // If there are interfaces, none should be named docker/wsl/vethernet
    for (const iface of interfaces) {
      expect(/docker|wsl|vethernet|virtualbox/i.test(iface.name)).toBe(false);
    }
  });
});

describe('ntpSync', () => {
  it('responds to NTP ping with valid timestamps', () => {
    const t0 = Date.now() - 50;
    const pong = handleNtpPing({ type: 'NTP_PING', clientSendTime: t0 });

    expect(pong.type).toBe('NTP_PONG');
    expect(pong.clientSendTime).toBe(t0);
    expect(pong.serverReceiveTime).toBeGreaterThanOrEqual(t0);
    expect(pong.serverSendTime).toBeGreaterThanOrEqual(pong.serverReceiveTime);
  });
});
