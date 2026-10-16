import { describe, it, expect } from 'vitest';
import {
  PACKET_SIZE,
  PACKET_TYPE_TELEMETRY,
  BUTTON_BOOST,
  BUTTON_BRAKE,
  BUTTON_SHAKE,
  BUTTON_RECALIBRATE,
  encodeTelemetry,
  decodeTelemetry,
  peekPlayerSlot,
  peekPacketType,
  hasButton,
  formatHexDump,
  type TelemetryFrame,
} from '../src/binaryCodec.js';
import {
  parseControlMessage,
  serializeControlMessage,
  type ControlMessage,
} from '../src/controlMessages.js';

describe('20-Byte Binary Telemetry Protocol', () => {
  it('correctly encodes and decodes a standard telemetry frame', () => {
    const original: TelemetryFrame = {
      packetType: PACKET_TYPE_TELEMETRY,
      playerSlot: 1,
      buttonBitmask: BUTTON_BOOST | BUTTON_SHAKE,
      sequenceNumber: 42,
      calibratedPitch: -0.3456,
      calibratedRoll: 0.7891,
      yaw: 1.2345,
      clientTimestamp: 1698765432,
    };

    const buffer = encodeTelemetry(original);
    expect(buffer.byteLength).toBe(PACKET_SIZE);
    expect(buffer.byteLength).toBe(20);

    const decoded = decodeTelemetry(buffer);

    expect(decoded.packetType).toBe(PACKET_TYPE_TELEMETRY);
    expect(decoded.playerSlot).toBe(1);
    expect(decoded.buttonBitmask).toBe(BUTTON_BOOST | BUTTON_SHAKE);
    expect(decoded.sequenceNumber).toBe(42);
    expect(decoded.calibratedPitch).toBeCloseTo(-0.3456, 4);
    expect(decoded.calibratedRoll).toBeCloseTo(0.7891, 4);
    expect(decoded.yaw).toBeCloseTo(1.2345, 4);
    expect(decoded.clientTimestamp).toBe(1698765432);
  });

  it('supports zero-allocation encoding into a pre-allocated buffer with offset', () => {
    const memory = new ArrayBuffer(64);
    const frame: TelemetryFrame = {
      packetType: PACKET_TYPE_TELEMETRY,
      playerSlot: 2,
      buttonBitmask: BUTTON_BRAKE,
      sequenceNumber: 255,
      calibratedPitch: 0.0,
      calibratedRoll: -1.0,
      yaw: 0.0,
      clientTimestamp: 999999,
    };

    encodeTelemetry(frame, memory, 16);

    const slice = new Uint8Array(memory, 16, 20);
    const decoded = decodeTelemetry(slice);
    expect(decoded.playerSlot).toBe(2);
    expect(decoded.sequenceNumber).toBe(255);
    expect(decoded.calibratedPitch).toBe(0.0);
    expect(decoded.calibratedRoll).toBe(-1.0);
    expect(decoded.buttonBitmask).toBe(BUTTON_BRAKE);
  });

  it('accurately peeks player slot and packet type from raw buffer for fast server routing', () => {
    const frame: TelemetryFrame = {
      packetType: PACKET_TYPE_TELEMETRY,
      playerSlot: 2,
      buttonBitmask: BUTTON_RECALIBRATE,
      sequenceNumber: 10,
      calibratedPitch: 0.1,
      calibratedRoll: 0.2,
      yaw: 0.3,
      clientTimestamp: 12345,
    };

    const buffer = encodeTelemetry(frame);
    expect(peekPacketType(buffer)).toBe(PACKET_TYPE_TELEMETRY);
    expect(peekPlayerSlot(buffer)).toBe(2);

    const uint8 = new Uint8Array(buffer);
    expect(peekPacketType(uint8)).toBe(PACKET_TYPE_TELEMETRY);
    expect(peekPlayerSlot(uint8)).toBe(2);
  });

  it('correctly checks button flags', () => {
    const mask = BUTTON_BOOST | BUTTON_RECALIBRATE;
    expect(hasButton(mask, BUTTON_BOOST)).toBe(true);
    expect(hasButton(mask, BUTTON_BRAKE)).toBe(false);
    expect(hasButton(mask, BUTTON_SHAKE)).toBe(false);
    expect(hasButton(mask, BUTTON_RECALIBRATE)).toBe(true);
  });

  it('rejects buffers smaller than 20 bytes', () => {
    const shortBuffer = new ArrayBuffer(19);
    expect(() => decodeTelemetry(shortBuffer)).toThrow(RangeError);
  });

  it('rejects buffers with invalid packetType', () => {
    const buffer = new ArrayBuffer(20);
    const view = new DataView(buffer);
    view.setUint8(0, 0x99); // Invalid type
    expect(() => decodeTelemetry(buffer)).toThrow(/Invalid packet type/);
  });

  it('formats hex dump correctly and clamps oversized buffers to 20 bytes', () => {
    const frame: TelemetryFrame = {
      packetType: 0x01,
      playerSlot: 0x02,
      buttonBitmask: 0x03,
      sequenceNumber: 0x04,
      calibratedPitch: 0.0,
      calibratedRoll: 0.0,
      yaw: 0.0,
      clientTimestamp: 0,
    };
    const buffer = encodeTelemetry(frame);
    const dump = formatHexDump(buffer);
    expect(dump.startsWith('01 02 03 04 |')).toBe(true);

    // Oversized 64-byte buffer
    const largeBuffer = new Uint8Array(64);
    largeBuffer[0] = 0x01;
    largeBuffer[1] = 0x02;
    const largeDump = formatHexDump(largeBuffer);
    // Should have exactly 20 byte tokens plus 4 '|' separators
    const tokens = largeDump.split(' ');
    expect(tokens.length).toBe(24);
  });
});

describe('JSON Control Plane Messages', () => {
  it('serializes and parses valid control messages including HOST_RECONNECT', () => {
    const msg: ControlMessage = {
      type: 'ROOM_CREATED',
      roomCode: 'ABCD',
      hostSessionId: 'host-1234',
      lanIp: '192.168.1.50',
      port: 3000,
    };

    const raw = serializeControlMessage(msg);
    const parsed = parseControlMessage(raw);
    expect(parsed).toEqual(msg);

    const reconMsg: ControlMessage = {
      type: 'HOST_RECONNECT',
      roomCode: 'WXYZ',
      hostSessionId: 'host-sess-99',
    };
    const reconRaw = serializeControlMessage(reconMsg);
    const reconParsed = parseControlMessage(reconRaw);
    expect(reconParsed).toEqual(reconMsg);
  });

  it('safely handles non-JSON or invalid structures', () => {
    expect(parseControlMessage('not a json')).toBeNull();
    expect(parseControlMessage('{"notType": 123}')).toBeNull();
    expect(parseControlMessage('123')).toBeNull();
    expect(parseControlMessage('')).toBeNull();
    expect(parseControlMessage('{}')).toBeNull();
    expect(parseControlMessage('[]')).toBeNull();
  });

  it('rejects malformed payloads with missing or invalid fields', () => {
    // Missing required roomCode
    expect(parseControlMessage('{"type":"JOIN_ROOM"}')).toBeNull();
    // Non-string roomCode
    expect(parseControlMessage('{"type":"JOIN_ROOM","roomCode":123}')).toBeNull();
    // Empty roomCode
    expect(parseControlMessage('{"type":"JOIN_ROOM","roomCode":"   "}')).toBeNull();
    // Missing hostSessionId or roomCode
    expect(parseControlMessage('{"type":"HOST_RECONNECT"}')).toBeNull();
    expect(parseControlMessage('{"type":"HOST_RECONNECT","roomCode":"ABCD"}')).toBeNull();
    expect(parseControlMessage('{"type":"HOST_RECONNECT","hostSessionId":"sess-123"}')).toBeNull();
    // Invalid playerSlot
    expect(parseControlMessage('{"type":"CALIBRATE_COMPLETE","playerSlot":3,"zeroPitch":0,"zeroRoll":0}')).toBeNull();
    // Non-finite numbers
    expect(parseControlMessage('{"type":"NTP_PING","clientSendTime":"not-a-number"}')).toBeNull();
    // Invalid haptic effect
    expect(parseControlMessage('{"type":"HAPTIC_EVENT","playerSlot":1,"effect":"explode"}')).toBeNull();
  });

  it('rejects oversized control message strings exceeding 4KB', () => {
    const huge = 'x'.repeat(4097);
    expect(parseControlMessage(huge)).toBeNull();
    const hugeJson = JSON.stringify({ type: 'JOIN_ROOM', roomCode: 'ABCD', deviceName: 'x'.repeat(4096) });
    expect(parseControlMessage(hugeJson)).toBeNull();
  });

  it('accepts valid control messages with required and optional fields', () => {
    expect(parseControlMessage('{"type":"HOST_CREATE_ROOM"}')).toEqual({ type: 'HOST_CREATE_ROOM' });
    expect(parseControlMessage('{"type":"JOIN_ROOM","roomCode":"ABCD"}')).toEqual({
      type: 'JOIN_ROOM',
      roomCode: 'ABCD',
    });
    expect(parseControlMessage('{"type":"JOIN_ROOM","roomCode":"ABCD","deviceName":"Pixel 8"}')).toEqual({
      type: 'JOIN_ROOM',
      roomCode: 'ABCD',
      deviceName: 'Pixel 8',
    });
  });
});
