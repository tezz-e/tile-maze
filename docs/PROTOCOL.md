# Protocol Specification: Tiltmaze Kinetic Edition

## 1. 20-Byte Binary Telemetry Protocol (Data Plane @ 60Hz)

```
0                   1                   2                   3
0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  Type (0x01)  |  Player Slot  | Button Bitmask|  Sequence No  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Calibrated Pitch (Float32 LE)               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Calibrated Roll  (Float32 LE)               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Raw Yaw Rate     (Float32 LE)               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                 Client Timestamp (Uint32 LE ms)               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Field Breakdown:
- **Byte 0 (`packetType`, Uint8):** Constant `0x01` identifies telemetry frames.
- **Byte 1 (`playerSlot`, Uint8):** `1` (Player 1) or `2` (Player 2).
- **Byte 2 (`buttonBitmask`, Uint8):**
  - Bit 0 (`0x01`): Nitro Boost active (thumb hold)
  - Bit 1 (`0x02`): Brake / Dampen active (thumb hold)
  - Bit 2 (`0x04`): Shake-to-Jump trigger pulse
  - Bit 3 (`0x08`): Recalibration pulse
- **Byte 3 (`sequenceNumber`, Uint8):** Rolling 0–255 counter.
- **Bytes 4–7 (`calibratedPitch`, Float32 Little-Endian):** Normalized forward/backward tilt in $[-1.0, 1.0]$.
- **Bytes 8–11 (`calibratedRoll`, Float32 Little-Endian):** Normalized left/right tilt in $[-1.0, 1.0]$.
- **Bytes 12–15 (`rawYawRate`, Float32 Little-Endian):** Gyroscope angular rate around Z-axis.
- **Bytes 16–19 (`clientTimestamp`, Uint32 Little-Endian):** Millisecond timestamp for jitter analysis.

---

## 2. JSON Control Plane (Low Frequency)

1. `HOST_CREATE_ROOM`: Laptop requests a new room. Server replies with `ROOM_CREATED`.
2. `JOIN_ROOM`: Phone pairs using `{ type: "JOIN_ROOM", roomCode: "K9X2", sessionId?, deviceName }`.
3. `NTP_PING` / `NTP_PONG`: 4-timestamp clock synchronization.
4. `HAPTIC_EVENT`: Triggers custom haptic waveforms on phone upon wall collisions, hole hazards, and checkpoints.
5. `GAME_STATE_SYNC`: Synchronizes game phase (`LOBBY`, `PLAYING`, `PAUSED`, `VICTORY`).
