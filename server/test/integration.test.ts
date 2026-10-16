import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { server, wss, roomManager } from '../src/index.js';
import {
  PACKET_SIZE,
  PACKET_TYPE_TELEMETRY,
  BUTTON_BOOST,
  encodeTelemetry,
  decodeTelemetry,
  serializeControlMessage,
  type ControlMessage,
  type RoomCreatedMsg,
  type JoinedRoomMsg,
  type NtpPongMsg,
} from '@tiltmaze/protocol';

describe('End-to-End WebSocket Relay Integration', () => {
  let weStartedServer = false;

  beforeAll(async () => {
    // Check if port 3000 is already running
    const alreadyUp = await new Promise<boolean>((resolve) => {
      const probe = new WebSocket('ws://127.0.0.1:3000');
      probe.on('open', () => {
        probe.close();
        resolve(true);
      });
      probe.on('error', () => resolve(false));
    });

    if (alreadyUp) {
      return;
    }

    if (!server.listening) {
      weStartedServer = true;
      await new Promise<void>((resolve, reject) => {
        server.listen(3000, '0.0.0.0', () => resolve());
        server.on('error', (err) => {
          if ((err as any).code === 'EADDRINUSE') resolve();
          else reject(err);
        });
      });
    }
  });

  afterAll(async () => {
    if (weStartedServer) {
      wss.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('handles full lifecycle: room creation, mobile join, 20-byte zero-copy binary forwarding, and NTP sync', async () => {
    // 1. Host connects via WebSocket
    const hostWs = new WebSocket('ws://127.0.0.1:3000');
    await new Promise((resolve) => hostWs.on('open', resolve));

    // 2. Host requests room creation
    const createMsg: ControlMessage = { type: 'HOST_CREATE_ROOM' };
    hostWs.send(serializeControlMessage(createMsg));

    const roomCreated = await new Promise<RoomCreatedMsg>((resolve) => {
      hostWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ROOM_CREATED') resolve(msg);
        } catch {}
      });
    });

    expect(roomCreated.roomCode).toBeDefined();
    expect(roomCreated.roomCode.length).toBe(4);
    expect(roomCreated.port).toBe(3000);

    // 3. Controller connects and joins room
    const controllerWs = new WebSocket('ws://127.0.0.1:3000');
    await new Promise((resolve) => controllerWs.on('open', resolve));

    const joinMsg: ControlMessage = {
      type: 'JOIN_ROOM',
      roomCode: roomCreated.roomCode,
      deviceName: 'Nothing Phone 3 Test',
    };
    controllerWs.send(serializeControlMessage(joinMsg));

    const joinedRoom = await new Promise<JoinedRoomMsg>((resolve) => {
      controllerWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'JOINED_ROOM') resolve(msg);
        } catch {}
      });
    });

    expect(joinedRoom.playerSlot).toBe(1);
    expect(joinedRoom.roomCode).toBe(roomCreated.roomCode);

    // 4. Controller sends 20-byte binary telemetry frame
    const binaryPromise = new Promise<Buffer>((resolve) => {
      hostWs.on('message', (data, isBinary) => {
        if (isBinary && Buffer.isBuffer(data)) {
          resolve(data);
        }
      });
    });

    const testFrame = {
      packetType: PACKET_TYPE_TELEMETRY,
      playerSlot: 1,
      buttonBitmask: BUTTON_BOOST,
      sequenceNumber: 99,
      calibratedPitch: 0.456,
      calibratedRoll: -0.789,
      yaw: 0.123,
      clientTimestamp: 12345678,
    };
    const binaryBuf = encodeTelemetry(testFrame);
    controllerWs.send(binaryBuf, { binary: true });

    const receivedBuffer = await binaryPromise;
    expect(receivedBuffer.length).toBe(PACKET_SIZE);

    const decoded = decodeTelemetry(receivedBuffer);
    expect(decoded.playerSlot).toBe(1);
    expect(decoded.buttonBitmask).toBe(BUTTON_BOOST);
    expect(decoded.sequenceNumber).toBe(99);
    expect(decoded.calibratedPitch).toBeCloseTo(0.456, 3);
    expect(decoded.calibratedRoll).toBeCloseTo(-0.789, 3);

    // 5. NTP Ping / Pong verification
    const ntpPromise = new Promise<NtpPongMsg>((resolve) => {
      controllerWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'NTP_PONG') resolve(msg);
        } catch {}
      });
    });

    const t0 = Date.now();
    controllerWs.send(serializeControlMessage({ type: 'NTP_PING', clientSendTime: t0 }));
    const pong = await ntpPromise;
    expect(pong.clientSendTime).toBe(t0);
    expect(pong.serverReceiveTime).toBeGreaterThanOrEqual(t0 - 100);

    // Cleanup
    hostWs.close();
    controllerWs.close();
  });

  it('supports host reconnection and recovers room state with HOST_RECONNECT', async () => {
    // 1. Host creates room
    const host1 = new WebSocket('ws://127.0.0.1:3000');
    await new Promise((resolve) => host1.on('open', resolve));

    host1.send(serializeControlMessage({ type: 'HOST_CREATE_ROOM' }));
    const roomInfo = await new Promise<RoomCreatedMsg>((resolve) => {
      host1.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ROOM_CREATED') resolve(msg);
        } catch {}
      });
    });

    // 2. Controller joins
    const ctrl = new WebSocket('ws://127.0.0.1:3000');
    await new Promise((resolve) => ctrl.on('open', resolve));
    ctrl.send(serializeControlMessage({
      type: 'JOIN_ROOM',
      roomCode: roomInfo.roomCode,
      deviceName: 'Persistent Mobile',
    }));

    await new Promise<JoinedRoomMsg>((resolve) => {
      ctrl.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'JOINED_ROOM') resolve(msg);
        } catch {}
      });
    });

    // 3. Host disconnects
    host1.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 4. Host reconnects using HOST_RECONNECT
    const host2 = new WebSocket('ws://127.0.0.1:3000');
    await new Promise((resolve) => host2.on('open', resolve));

    host2.send(serializeControlMessage({
      type: 'HOST_RECONNECT',
      roomCode: roomInfo.roomCode,
      hostSessionId: roomInfo.hostSessionId,
    }));

    const reconInfo = await new Promise<RoomCreatedMsg>((resolve) => {
      host2.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ROOM_CREATED') resolve(msg);
        } catch {}
      });
    });

    expect(reconInfo.roomCode).toBe(roomInfo.roomCode);
    expect(reconInfo.hostSessionId).toBe(roomInfo.hostSessionId);

    // 5. Binary pass-through routes to the reconnected host
    const binaryPromise = new Promise<Buffer>((resolve) => {
      host2.on('message', (data, isBinary) => {
        if (isBinary && Buffer.isBuffer(data)) {
          resolve(data);
        }
      });
    });

    const testPacket = encodeTelemetry({
      packetType: PACKET_TYPE_TELEMETRY,
      playerSlot: 1,
      buttonBitmask: 0,
      sequenceNumber: 1,
      calibratedPitch: 0.1,
      calibratedRoll: 0.2,
      yaw: 0.0,
      clientTimestamp: 500,
    });
    ctrl.send(testPacket, { binary: true });

    const received = await binaryPromise;
    expect(received.length).toBe(PACKET_SIZE);
    expect(decodeTelemetry(received).sequenceNumber).toBe(1);

    host2.close();
    ctrl.close();
  });

  it('drops telemetry frames when hostSocket bufferedAmount exceeds 2KB backpressure threshold', async () => {
    const hostWs = new WebSocket('ws://127.0.0.1:3000');
    await new Promise((resolve) => hostWs.on('open', resolve));

    const createMsg: ControlMessage = { type: 'HOST_CREATE_ROOM' };
    hostWs.send(serializeControlMessage(createMsg));

    const roomCreated = await new Promise<RoomCreatedMsg>((resolve) => {
      hostWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ROOM_CREATED') resolve(msg);
        } catch {}
      });
    });

    const controllerWs = new WebSocket('ws://127.0.0.1:3000');
    await new Promise((resolve) => controllerWs.on('open', resolve));

    const joinMsg: ControlMessage = {
      type: 'JOIN_ROOM',
      roomCode: roomCreated.roomCode,
      deviceName: 'Backpressure Test Phone',
    };
    controllerWs.send(serializeControlMessage(joinMsg));

    await new Promise<JoinedRoomMsg>((resolve) => {
      controllerWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'JOINED_ROOM') resolve(msg);
        } catch {}
      });
    });

    const room = roomManager.getRoom(roomCreated.roomCode)!;
    expect(room).toBeDefined();

    let receivedCount = 0;
    hostWs.on('message', (_data, isBinary) => {
      if (isBinary) receivedCount++;
    });

    // Simulate backed-up hostSocket buffer (> 2KB)
    Object.defineProperty(room.hostSocket!, 'bufferedAmount', {
      value: 3000,
      configurable: true,
      writable: true,
    });

    const droppedFrame = encodeTelemetry({
      packetType: PACKET_TYPE_TELEMETRY,
      playerSlot: 1,
      buttonBitmask: 0,
      sequenceNumber: 1,
      calibratedPitch: 0.1,
      calibratedRoll: 0.2,
      yaw: 0.0,
      clientTimestamp: 100,
    });
    controllerWs.send(droppedFrame, { binary: true });

    // Wait a brief tick to verify frame was dropped
    await new Promise((r) => setTimeout(r, 60));
    expect(receivedCount).toBe(0);

    // Relieve backpressure (bufferedAmount <= 2048)
    Object.defineProperty(room.hostSocket!, 'bufferedAmount', {
      value: 0,
      configurable: true,
      writable: true,
    });

    const acceptedFrame = encodeTelemetry({
      packetType: PACKET_TYPE_TELEMETRY,
      playerSlot: 1,
      buttonBitmask: 0,
      sequenceNumber: 2,
      calibratedPitch: 0.1,
      calibratedRoll: 0.2,
      yaw: 0.0,
      clientTimestamp: 200,
    });
    controllerWs.send(acceptedFrame, { binary: true });

    // Wait for accepted frame to arrive
    await new Promise((r) => setTimeout(r, 60));
    expect(receivedCount).toBe(1);

    hostWs.close();
    controllerWs.close();
  });

  it('resists malformed WebSocket messages and continues servicing requests', async () => {
    const ws = new WebSocket('ws://127.0.0.1:3000');
    await new Promise((resolve) => ws.on('open', resolve));

    const malformedPayloads = [
      '{"type":"JOIN_ROOM"}',
      '{"type":"HOST_RECONNECT"}',
      '{"type":"JOIN_ROOM","roomCode":123}',
      'not json',
      '{}',
      'x'.repeat(5000),
    ];

    for (const payload of malformedPayloads) {
      ws.send(payload);
    }

    // Allow time for server to process/drop the payloads
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Assert the server still answers /api/info
    const res = await fetch('http://127.0.0.1:3000/api/info');
    expect(res.status).toBe(200);
    const info = await res.json();
    expect(info.status).toBe('online');

    // Assert a valid HOST_CREATE_ROOM is properly handled afterwards
    const createMsg: ControlMessage = { type: 'HOST_CREATE_ROOM' };
    ws.send(serializeControlMessage(createMsg));

    const roomCreated = await new Promise<RoomCreatedMsg>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for ROOM_CREATED')), 2000);
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ROOM_CREATED') {
            clearTimeout(timer);
            resolve(msg);
          }
        } catch {}
      });
    });

    expect(roomCreated.type).toBe('ROOM_CREATED');
    expect(roomCreated.roomCode).toBeDefined();
    expect(roomCreated.roomCode.length).toBe(4);

    ws.close();
  });
});
