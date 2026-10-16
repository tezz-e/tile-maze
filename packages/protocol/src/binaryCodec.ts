/**
 * 20-Byte Binary Telemetry Protocol Codec
 * Tiltmaze: Kinetic Edition
 * 
 * Memory Layout (20 bytes total):
 * +---------------+---------------+------------------+---------------+
 * |  Type (0x01)  |  Player Slot  |  Button Bitmask  |  Sequence No  | (Bytes 0-3)
 * +---------------+---------------+------------------+---------------+
 * |                  Calibrated Pitch (Float32 LE)                  | (Bytes 4-7)
 * +---------------+---------------+------------------+---------------+
 * |                  Calibrated Roll  (Float32 LE)                  | (Bytes 8-11)
 * +---------------+---------------+------------------+---------------+
 * |                  Yaw / Azimuth    (Float32 LE)                  | (Bytes 12-15)
 * +---------------+---------------+------------------+---------------+
 * |                 Client Timestamp  (Uint32 LE ms)                 | (Bytes 16-19)
 * +---------------+---------------+------------------+---------------+
 */

export const PACKET_SIZE = 20;
export const PACKET_TYPE_TELEMETRY = 0x01;

export const BUTTON_BOOST = 1 << 0;       // 0x01: Nitro / Boost
export const BUTTON_BRAKE = 1 << 1;       // 0x02: Brake / Dampen
export const BUTTON_SHAKE = 1 << 2;       // 0x04: Shake-to-Jump trigger
export const BUTTON_RECALIBRATE = 1 << 3; // 0x08: Neutral position recalibrated

export interface TelemetryFrame {
  packetType: number;       // Uint8: 0x01
  playerSlot: number;       // Uint8: 1 or 2
  buttonBitmask: number;    // Uint8: bit flags
  sequenceNumber: number;   // Uint8: 0..255
  calibratedPitch: number;  // Float32: normalized tilt [-1.0, 1.0]
  calibratedRoll: number;   // Float32: normalized tilt [-1.0, 1.0]
  yaw: number;              // Float32: azimuth angle in radians
  clientTimestamp: number;  // Uint32: millisecond timestamp
}

/**
 * Encodes a TelemetryFrame into a 20-byte ArrayBuffer.
 * If targetBuffer is provided, writes into targetBuffer at offset (zero GC allocations).
 */
export function encodeTelemetry(
  frame: TelemetryFrame,
  targetBuffer?: ArrayBuffer,
  offset: number = 0
): ArrayBuffer {
  const buffer = targetBuffer ?? new ArrayBuffer(PACKET_SIZE);
  if (buffer.byteLength < offset + PACKET_SIZE) {
    throw new RangeError(`Target buffer too small: required ${offset + PACKET_SIZE}, got ${buffer.byteLength}`);
  }

  const view = new DataView(buffer, offset, PACKET_SIZE);
  view.setUint8(0, frame.packetType ?? PACKET_TYPE_TELEMETRY);
  view.setUint8(1, frame.playerSlot);
  view.setUint8(2, frame.buttonBitmask & 0xff);
  view.setUint8(3, frame.sequenceNumber & 0xff);
  view.setFloat32(4, frame.calibratedPitch, true); // Little-Endian
  view.setFloat32(8, frame.calibratedRoll, true);  // Little-Endian
  view.setFloat32(12, frame.yaw, true);            // Little-Endian
  view.setUint32(16, frame.clientTimestamp >>> 0, true); // Little-Endian

  return buffer;
}

/**
 * Decodes a 20-byte TelemetryFrame from an ArrayBuffer, DataView, or Uint8Array.
 */
export function decodeTelemetry(
  source: ArrayBuffer | ArrayBufferView,
  offset: number = 0
): TelemetryFrame {
  let view: DataView;
  if (source instanceof DataView) {
    view = new DataView(source.buffer, source.byteOffset + offset, PACKET_SIZE);
  } else if (ArrayBuffer.isView(source)) {
    view = new DataView(source.buffer, source.byteOffset + offset, PACKET_SIZE);
  } else {
    view = new DataView(source, offset, PACKET_SIZE);
  }

  if (view.byteLength < PACKET_SIZE) {
    throw new RangeError(`Buffer length ${view.byteLength} is less than required packet size ${PACKET_SIZE}`);
  }

  const packetType = view.getUint8(0);
  if (packetType !== PACKET_TYPE_TELEMETRY) {
    throw new Error(`Invalid packet type: 0x${packetType.toString(16)}, expected 0x01`);
  }

  return {
    packetType,
    playerSlot: view.getUint8(1),
    buttonBitmask: view.getUint8(2),
    sequenceNumber: view.getUint8(3),
    calibratedPitch: view.getFloat32(4, true),
    calibratedRoll: view.getFloat32(8, true),
    yaw: view.getFloat32(12, true),
    clientTimestamp: view.getUint32(16, true),
  };
}

/**
 * High-speed helper to peek the player slot from Byte 1 without decoding the full packet.
 * Used by the server router for zero-copy forwarding.
 */
export function peekPlayerSlot(source: ArrayBuffer | ArrayBufferView, offset: number = 0): number {
  if (source instanceof DataView) {
    return source.getUint8(offset + 1);
  }
  if (source instanceof Uint8Array) {
    return source[offset + 1];
  }
  if (ArrayBuffer.isView(source)) {
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    return view.getUint8(offset + 1);
  }
  const view = new DataView(source);
  return view.getUint8(offset + 1);
}

/**
 * High-speed helper to peek packet type from Byte 0.
 */
export function peekPacketType(source: ArrayBuffer | ArrayBufferView, offset: number = 0): number {
  if (source instanceof DataView) {
    return source.getUint8(offset);
  }
  if (source instanceof Uint8Array) {
    return source[offset];
  }
  if (ArrayBuffer.isView(source)) {
    const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
    return view.getUint8(offset);
  }
  const view = new DataView(source);
  return view.getUint8(offset);
}

/**
 * Checks if a specific button bit is set in the bitmask.
 */
export function hasButton(bitmask: number, buttonFlag: number): boolean {
  return (bitmask & buttonFlag) !== 0;
}

/**
 * Formats a 20-byte buffer into a formatted hex string for diagnostic displays.
 * Example: "01 01 04 2A | 3F 80 00 00 | BF 00 00 00 | 00 00 00 00 | 00 01 E2 40"
 */
export function formatHexDump(source: ArrayBuffer | ArrayBufferView): string {
  const length = Math.min(source.byteLength, PACKET_SIZE);
  let bytes: Uint8Array;
  if (source instanceof Uint8Array) {
    bytes = source.subarray(0, length);
  } else if (ArrayBuffer.isView(source)) {
    bytes = new Uint8Array(source.buffer, source.byteOffset, length);
  } else {
    bytes = new Uint8Array(source, 0, length);
  }

  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
    if (i === 3 || i === 7 || i === 11 || i === 15) {
      hex.push('|');
    }
  }
  return hex.join(' ');
}
