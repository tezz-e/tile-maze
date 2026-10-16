import { describe, it, expect } from 'vitest';
import { GameNetwork } from '../src/net/GameNetwork.js';
import {
  PACKET_TYPE_TELEMETRY,
  BUTTON_SHAKE,
  encodeTelemetry,
  type TelemetryFrame,
} from '@tiltmaze/protocol';

function makeFrame(slot: number, seq: number, buttonBitmask: number): ArrayBuffer {
  const frame: TelemetryFrame = {
    packetType: PACKET_TYPE_TELEMETRY,
    playerSlot: slot,
    buttonBitmask,
    sequenceNumber: seq,
    calibratedPitch: 0.1,
    calibratedRoll: 0.2,
    yaw: 0.0,
    clientTimestamp: Date.now(),
  };
  return encodeTelemetry(frame);
}

describe('GameNetwork - Pulse Rising Edge Latching', () => {
  it('fires consumeShake exactly once when 3 consecutive packets have shake bit set', () => {
    const net = new GameNetwork({
      onRoomCreated: () => {},
      onPlayerJoined: () => {},
      onPlayerDisconnected: () => {},
      onPlayerReconnected: () => {},
      onPlayerLeft: () => {},
      onLatencyUpdate: () => {},
    });

    // Packet 1: shake bit = 1
    net.handleBinaryTelemetry(makeFrame(1, 1, BUTTON_SHAKE));
    expect(net.consumeShake(1)).toBe(true);

    // Packet 2: shake bit = 1 (held high by phone for debounce redundancy)
    net.handleBinaryTelemetry(makeFrame(1, 2, BUTTON_SHAKE));
    // Should NOT re-arm shake because it is not a rising edge
    expect(net.consumeShake(1)).toBe(false);

    // Packet 3: shake bit = 1
    net.handleBinaryTelemetry(makeFrame(1, 3, BUTTON_SHAKE));
    expect(net.consumeShake(1)).toBe(false);
  });

  it('fires consumeShake exactly twice for two separate shakes (1,1,1,0,0,1,1,1)', () => {
    const net = new GameNetwork({
      onRoomCreated: () => {},
      onPlayerJoined: () => {},
      onPlayerDisconnected: () => {},
      onPlayerReconnected: () => {},
      onPlayerLeft: () => {},
      onLatencyUpdate: () => {},
    });

    const streamPattern = [1, 1, 1, 0, 0, 1, 1, 1];
    let shakeCount = 0;

    for (let i = 0; i < streamPattern.length; i++) {
      const bitmask = streamPattern[i] === 1 ? BUTTON_SHAKE : 0;
      net.handleBinaryTelemetry(makeFrame(1, i + 1, bitmask));
      if (net.consumeShake(1)) {
        shakeCount++;
      }
    }

    expect(shakeCount).toBe(2);
  });

  it('resets stored bits on disconnect or reconnect', () => {
    const net = new GameNetwork({
      onRoomCreated: () => {},
      onPlayerJoined: () => {},
      onPlayerDisconnected: () => {},
      onPlayerReconnected: () => {},
      onPlayerLeft: () => {},
      onLatencyUpdate: () => {},
    });

    // Packet with shake
    net.handleBinaryTelemetry(makeFrame(1, 1, BUTTON_SHAKE));
    expect(net.consumeShake(1)).toBe(true);

    // Disconnect event for slot 1
    (net as any).handleControlMessage(
      JSON.stringify({ type: 'PLAYER_DISCONNECTED', playerSlot: 1 })
    );

    // Next packet arriving with shake bit is treated as a new rising edge
    net.handleBinaryTelemetry(makeFrame(1, 2, BUTTON_SHAKE));
    expect(net.consumeShake(1)).toBe(true);
  });
});
