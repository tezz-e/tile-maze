import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameNetwork } from '../src/net/GameNetwork.js';
import {
  PACKET_TYPE_TELEMETRY,
  BUTTON_BOOST,
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

describe('GameNetwork - Sequence Number and Stale Packet Discarding', () => {
  it('accepts packets in sequence, handles wraparound at 255 -> 0, and drops late/duplicate packets', () => {
    const net = new GameNetwork({
      onRoomCreated: () => {},
      onPlayerJoined: () => {},
      onPlayerDisconnected: () => {},
      onPlayerReconnected: () => {},
      onPlayerLeft: () => {},
      onLatencyUpdate: () => {},
    });

    // Packet seq 254
    net.handleBinaryTelemetry(makeFrame(1, 254, 0));
    expect(net.getController(1)?.sequenceNumber).toBe(254);

    // Duplicate packet seq 254 should be dropped
    net.handleBinaryTelemetry(makeFrame(1, 254, BUTTON_BOOST));
    // Should NOT have updated boost flag because duplicate was dropped
    expect(net.getController(1)?.boost).toBe(false);

    // Packet seq 255
    net.handleBinaryTelemetry(makeFrame(1, 255, 0));
    expect(net.getController(1)?.sequenceNumber).toBe(255);

    // Wraparound: packet seq 0 should be accepted
    net.handleBinaryTelemetry(makeFrame(1, 0, BUTTON_BOOST));
    expect(net.getController(1)?.sequenceNumber).toBe(0);
    expect(net.getController(1)?.boost).toBe(true);

    // Late packet seq 255 arriving after seq 0 should be dropped
    net.handleBinaryTelemetry(makeFrame(1, 255, 0));
    expect(net.getController(1)?.sequenceNumber).toBe(0);

    // Next in-order packet seq 1 should be accepted
    net.handleBinaryTelemetry(makeFrame(1, 1, 0));
    expect(net.getController(1)?.sequenceNumber).toBe(1);
  });
});

describe('GameNetwork - Reconnect Backoff and Close', () => {
  class MockWebSocket {
    public static instances: MockWebSocket[] = [];
    public onopen: (() => void) | null = null;
    public onclose: (() => void) | null = null;
    public onmessage: ((e: any) => void) | null = null;
    public onerror: ((e: any) => void) | null = null;
    public readyState: number = 0;
    public binaryType: string = 'blob';

    constructor(public url: string) {
      MockWebSocket.instances.push(this);
    }
    public send() {}
    public close() {
      this.readyState = 3;
      if (this.onclose) this.onclose();
    }
  }

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('backs off exponentially (1s, 2s, 4s, 8s, 15s) and resets on open', () => {
    const net = new GameNetwork({
      onRoomCreated: () => {},
      onPlayerJoined: () => {},
      onPlayerDisconnected: () => {},
      onPlayerReconnected: () => {},
      onPlayerLeft: () => {},
      onLatencyUpdate: () => {},
    });

    net.connect('ws://test:3000');
    expect(MockWebSocket.instances.length).toBe(1);

    // Disconnect 1 -> 1s delay
    MockWebSocket.instances[0].onclose?.();
    expect(net.getReconnectDelayMs()).toBe(2000); // next scheduled will be 2s
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances.length).toBe(2);

    // Disconnect 2 -> 2s delay
    MockWebSocket.instances[1].onclose?.();
    expect(net.getReconnectDelayMs()).toBe(4000);
    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances.length).toBe(3);

    // Disconnect 3 -> 4s delay
    MockWebSocket.instances[2].onclose?.();
    expect(net.getReconnectDelayMs()).toBe(8000);
    vi.advanceTimersByTime(4000);
    expect(MockWebSocket.instances.length).toBe(4);

    // Disconnect 4 -> 8s delay
    MockWebSocket.instances[3].onclose?.();
    expect(net.getReconnectDelayMs()).toBe(15000); // capped at 15s
    vi.advanceTimersByTime(8000);
    expect(MockWebSocket.instances.length).toBe(5);

    // Disconnect 5 -> 15s delay (capped)
    MockWebSocket.instances[4].onclose?.();
    expect(net.getReconnectDelayMs()).toBe(15000);
    vi.advanceTimersByTime(15000);
    expect(MockWebSocket.instances.length).toBe(6);

    // Successful connect resets backoff to 1000
    MockWebSocket.instances[5].onopen?.();
    expect(net.getReconnectDelayMs()).toBe(1000);

    net.close();
  });

  it('cancels pending reconnect timer and does not reconnect after close()', () => {
    const net = new GameNetwork({
      onRoomCreated: () => {},
      onPlayerJoined: () => {},
      onPlayerDisconnected: () => {},
      onPlayerReconnected: () => {},
      onPlayerLeft: () => {},
      onLatencyUpdate: () => {},
    });

    net.connect('ws://test:3000');
    expect(MockWebSocket.instances.length).toBe(1);

    // Disconnect triggers pending timer
    MockWebSocket.instances[0].onclose?.();
    expect(net.isReconnectScheduled()).toBe(true);
    expect(net.isClosed()).toBe(false);

    // Intentional close cancels timer
    net.close();
    expect(net.isReconnectScheduled()).toBe(false);
    expect(net.isClosed()).toBe(true);

    // Fast-forwarding time does not create any new connections
    vi.advanceTimersByTime(30000);
    expect(MockWebSocket.instances.length).toBe(1);
  });
});

