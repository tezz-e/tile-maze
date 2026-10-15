# Architectural Specification: Tiltmaze Kinetic Edition

## 1. System Topology
The system consists of three distinct tiers operating over a trusted local area network (LAN):

1. **Android Motion Controller (`/app`):**
   - High-rate 100Hz orientation capture via `Sensor.TYPE_GAME_ROTATION_VECTOR`.
   - Adaptive One Euro filter dynamically varying cutoff between 1.0Hz (at rest) and 30Hz (under fast flicks).
   - Quaternion zeroing: computes relative tilt against calibrated reference quaternion $q_{rel} = q_{ref}^* \otimes q_{curr}$.
   - Encodes state into a compact 20-byte binary `ArrayBuffer` sent at 60Hz via an OkHttp WebSocket.
   - Dual-mode feedback: custom `VibrationEffect` waveforms + Nothing Phone (3) rear 25×25 Glyph Matrix LED driver.

2. **Ultra-Thin Node.js Relay Server (`/server`):**
   - Single-port architecture hosting Express HTTP, static bundle assets, and the `ws` WebSocket relay on port 3000.
   - Zero-copy binary forwarder: routes telemetry frames directly by reading only byte 1 (`playerSlot`) without JSON serialization or memory re-allocation.
   - In-memory `RoomManager` issuing 4-character non-ambiguous uppercase codes (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`).
   - 60-second session recovery grace period: disconnects do not wipe player slot, enabling instantaneous resumption.
   - Network interface discovery engine: automatically prunes virtual adapters (WSL, Docker, Hyper-V, VirtualBox) to serve the correct LAN IP.

3. **Browser 3D Physics Engine & Telemetry Lab (`/game`):**
   - Three.js WebGL renderer + Rapier 3D WebAssembly physics simulation.
   - Rotated Gravity Engine: dynamically sets Rapier's global gravity vector to $\vec{g}_{effective} = \mathbf{R}_{board} \cdot [0, -9.81, 0]^T$ with Continuous Collision Detection (CCD).
   - Web Audio API procedural sound engine with zero audio asset loading.
   - Telemetry Lab flight recorder: 3D phone wireframe tracker, live dual-trace oscilloscope (Raw vs One-Euro Filtered), 20-byte live hex inspector, and NTP clock sync metrics.

## 2. Data Flow
- **Hot Path (Data Plane):** Phone $\xrightarrow{\text{20-Byte Binary @ 60Hz}}$ Server $\xrightarrow{\text{Zero-Copy Forward}}$ Laptop Three.js Game.
- **Control Plane (JSON):** Handshake (`HOST_CREATE_ROOM`, `JOIN_ROOM`), 4-timestamp NTP clock sync (`NTP_PING`, `NTP_PONG`), and collision triggers (`HAPTIC_EVENT`).
