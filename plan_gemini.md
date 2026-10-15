# MASTER ENGINEERING SPECIFICATION: "KINETIC" MOTION CONTROLLER & 3D ARENA

## 1. System Objective & Core Deliverables
Build a production-grade, real-time motion controller ecosystem consisting of a mobile Android app (`.apk`), an ultra-low-latency WebSocket relay server, a 3D physics browser game, and an interactive engineering showcase website[cite: 1].
## Original prompy by the team:
Anything but a Game Controller
Goal: Build a mobile app that turns a phone into a real-time motion controller for a browser game on a laptop.
Deliverables: GitHub repo (app, game, server), APK or build link, screen recording of the phone controlling the game, and a README covering tech stack, pairing and latency approach.
Core Requirements:
1. Read gyroscope and accelerometer data and map it to controls (e.g. tilt to steer, shake to jump).
2. Pair phone and laptop via QR code or room code.
3. Stream sensor data over WebSockets with no noticeable lag.
4. Build a simple browser game (racing, maze, ball-balancing) controlled entirely by the phone.
5. Calibration to set a neutral position.
6. Connection status on both devices with automatic reconnection.
Bonus: Local multiplayer with multiple phones, on-screen phone buttons, vibration feedback, live latency display.

### Target Requirements Checklist (Must Implement 100%)
- [x] **Core 1 (Sensors):** Read 60Hz gyroscope and accelerometer telemetry on the phone and map to game controls (tilt to steer/balance, shake to jump)[cite: 1].
- [x] **Core 2 (Pairing):** Pair phone(s) and laptop browser via dynamic QR code scanning or a 4-character alphanumeric room code[cite: 1].
- [x] **Core 3 (Zero-Lag Streaming):** Stream compact binary `ArrayBuffer` telemetry over WebSockets with client-side physics interpolation for zero noticeable lag[cite: 1].
- [x] **Core 4 (Browser Game):** Build a 3D React Three Fiber + Rapier physics game combining ball-balancing, maze obstacles, and racing controlled entirely by the phone[cite: 1].
- [x] **Core 5 (Calibration):** One-tap neutral position calibration on the phone that zeroes out pitch/roll offsets in any comfortable holding posture[cite: 1].
- [x] **Core 6 (Resilience):** Live connection status indicators on both devices with automatic session-preserving reconnection on network drop[cite: 1].
- [x] **Bonus 1 (Local Multiplayer):** Support up to 2 phones paired simultaneously to the same room for 2-player head-to-head race and bumper-arena modes[cite: 1].
- [x] **Bonus 2 (On-Screen Buttons):** Ergonomic landscape thumb buttons on the phone (Boost/Nitro, Brake/Stabilize, Manual Jump, Calibrate)[cite: 1].
- [x] **Bonus 3 (Vibration Feedback):** Bi-directional WebSocket events from the laptop game back to the phone triggering native haptic vibrations on collision, boost, countdown, and goal[cite: 1].
- [x] **Bonus 4 (Live Latency Display):** Real-time Round-Trip Time (RTT / Ping in `ms`) and packet rate (`Hz`) HUD displayed on both the phone and laptop[cite: 1].

---

## 2. Tech Stack & Monorepo Directory Structure
Use `pnpm` workspaces with a shared TypeScript protocol package so the server, web app, and mobile app share strict types and binary encoders[cite: 1]:

```text
kinetic-controller/
├── pnpm-workspace.yaml
├── package.json
├── README.md                         # Architecture, pairing, latency math, and setup docs
├── packages/
│   └── shared-protocol/              # Shared TS interfaces & 20-byte ArrayBuffer codec
│       ├── src/index.ts
│       ├── src/binaryCodec.ts
│       └── package.json
└── apps/
    ├── ws-server/                    # Node.js + TypeScript + 'ws' real-time relay server
    │   ├── src/index.ts
    │   ├── src/RoomManager.ts
    │   └── package.json
    ├── web/                          # Next.js (App Router) + Tailwind + Three.js + Rapier
    │   ├── app/page.tsx              # Showcase Landing Page + Live 3D Sensor Sandbox
    │   ├── app/play/page.tsx         # 3D Browser Game Lobby & Arena
    │   ├── components/game/          # R3F Canvas, Track, Physics Spheres, HUD
    │   ├── components/sandbox/       # 3D Wireframe Phone, Oscilloscope, Hex Inspector
    │   ├── hooks/useControllerHost.ts
    │   └── package.json
    └── mobile/                       # React Native (Expo) Android Controller App (.apk)
        ├── app/index.tsx             # QR Scanner + Room Code Pairing Screen
        ├── app/controller.tsx        # Landscape Cockpit HUD + 60Hz Sensor Streamer
        ├── hooks/useMotionStream.ts
        ├── app.json
        ├── eas.json
        └── package.json
```

---

## 3. Dual-Channel Network Protocol (`/packages/shared-protocol`)
Separate WebSocket traffic into two frame types over a single socket connection to eliminate serialization lag[cite: 1]:

### A. Control Plane (JSON Text Frames — Low Frequency)
Used for pairing, room state, heartbeats, and haptic triggers[cite: 1]:
1. `HOST_CREATE_ROOM`: Laptop requests a new room. Server replies with `{ type: "ROOM_CREATED", roomCode: "K9X2", hostSessionId }`[cite: 1].
2. `CONTROLLER_JOIN_ROOM`: Phone sends `{ type: "JOIN_ROOM", roomCode: "K9X2", sessionId?, deviceName }`[cite: 1]. Server assigns `playerSlot: 1 | 2` and broadcasts `PLAYER_JOINED` to the laptop host[cite: 1].
3. `PING` / `PONG`: Sent every `1000ms` with high-precision timestamps (`t0`) to compute one-way latency (`latencyMs = (now - t0) / 2`) and display live `ms` on both devices[cite: 1].
4. `HAPTIC_EVENT` (Laptop -> Server -> Phone): Sent when the player's sphere collides with walls, hits a boost pad, falls off the track, or crosses the finish line (`impactLight`, `impactHeavy`, `notificationSuccess`, `notificationWarning`)[cite: 1].
5. `GAME_STATE_SYNC`: Broadcasts lobby readiness, active game mode (`1P_COURSE` vs `2P_ARENA`), pause states on disconnect, and live score/timer[cite: 1].

### B. Data Plane (20-Byte Binary `ArrayBuffer` — 60Hz High Frequency)
Sent from Phone -> Server -> Laptop every `16.6ms`[cite: 1]. The server reads only Byte `0` and Byte `1` to route the raw binary buffer directly to the room's laptop socket without JSON parsing overhead:

| Byte Offset | Data Type | Field Name | Description |
| :--- | :--- | :--- | :--- |
| `0` | `Uint8` | `packetType` | Constant `0x01` (Telemetry Frame) |
| `1` | `Uint8` | `playerSlot` | `1` (Player 1) or `2` (Player 2)[cite: 1] |
| `2` | `Uint8` | `buttonBitmask` | Bit `0`: Boost, Bit `1`: Brake, Bit `2`: Shake/Jump, Bit `3`: Recalibrated[cite: 1] |
| `3` | `Uint8` | `sequenceNumber` | Rolling `0–255` counter to discard out-of-order packets |
| `4–7` | `Float32` | `calibratedPitch` | Normalized forward/backward tilt in range `[-1.0, 1.0]`[cite: 1] |
| `8–11` | `Float32` | `calibratedRoll` | Normalized left/right steering tilt in range `[-1.0, 1.0]`[cite: 1] |
| `12–15` | `Float32` | `rawYawRate` | Gyroscope angular velocity (z-axis) for visual drift effects[cite: 1] |
| `16–19` | `Uint32` | `clientTimestamp` | Millisecond timestamp for jitter diagnostics[cite: 1] |

---

## 4. Sensor Math, Calibration & Latency Algorithms

### 1. Exponential Moving Average (EMA) Low-Pass Filter (Mobile)
Raw accelerometer/tilt readings exhibit micro-jitter. Before transmitting, pass raw pitch and roll through a discrete EMA filter at 60Hz[cite: 1]:
```text
filteredPitch = ALPHA * rawPitch + (1 - ALPHA) * prevFilteredPitch
filteredRoll  = ALPHA * rawRoll  + (1 - ALPHA) * prevFilteredRoll
```
Use `ALPHA = 0.28` to strip hand tremors while maintaining crisp responsiveness[cite: 1].

### 2. Neutral Position Calibration Offset (Mobile)
Store calibration offsets `(zeroPitch, zeroRoll)` in state[cite: 1]. When the user taps **"Calibrate Neutral"** on the phone, set `zeroPitch = filteredPitch` and `zeroRoll = filteredRoll`[cite: 1]. Compute normalized output clamped to a maximum tilt angle of `MAX_TILT_DEG = 35`:
```text
normPitch = clamp((filteredPitch - zeroPitch) / MAX_TILT_DEG, -1.0, 1.0)
normRoll  = clamp((filteredRoll  - zeroRoll)  / MAX_TILT_DEG, -1.0, 1.0)
```
Apply a `0.04` radial deadzone around `0.0` so the ball remains completely stationary when the phone is held at its calibrated neutral posture[cite: 1].

### 3. Shake-to-Jump Vector Detector (Mobile)
Compute total linear acceleration magnitude from the accelerometer `(ax, ay, az)` in g-forces[cite: 1]:
```text
accelMagnitude = Math.hypot(ax, ay, az)
```
When `accelMagnitude > 2.15` and `now - lastJumpTime > 450` (450ms debounce cooldown), set Bit `2` (`JUMP`) in `buttonBitmask` for the next 3 binary frames and trigger a light haptic pulse on the phone[cite: 1].

### 4. Frame-Rate Independent Physics Smoothing (Laptop Browser)
In the React Three Fiber `useFrame((state, delta) => ...)` loop, never snap the physics force directly to the incoming WebSocket packet. Interpolate the current applied force vector toward the latest network target vector:
```text
smoothingFactor = 1 - Math.exp(-18 * delta)
currentForce.lerp(targetNetworkForce, smoothingFactor)
```
This guarantees smooth 60–144fps visuals even if network packets experience minor Wi-Fi jitter[cite: 1].

---

## 5. Detailed Component Specifications

### Component A: WebSocket Relay Server (`/apps/ws-server`)
1. **Room Manager:** Maintain an in-memory `Map<roomCode, RoomSession>`. Each room holds 1 Host socket and up to 2 Controller slots (`slot 1`, `slot 2`)[cite: 1]. Listen on `0.0.0.0:8080` so phones on the same Wi-Fi LAN can connect directly via local IP[cite: 1].
2. **Session Persistence & Auto-Reconnect:** Issue a persistent `sessionId` when a phone pairs[cite: 1]. If a phone's WebSocket drops, mark the player as `DISCONNECTED`, notify the laptop host (`PLAYER_CONNECTION_LOST`), and reserve their slot for a `60-second` grace window[cite: 1]. When the phone reconnects with its `sessionId`, restore its player slot and resume streaming (`PLAYER_RECONNECTED`)[cite: 1].
3. **Zero-Copy Binary Forwarding:** When the server receives a binary message from a controller socket, forward the buffer directly to the room's host socket without JSON serialization[cite: 1].

### Component B: Mobile Controller App (`/apps/mobile`)
1. **Screen 1 — Connection & Pairing Hub (`app/index.tsx`):**
   - Full-screen dark sci-fi UI locked to landscape orientation (`expo-screen-orientation`).
   - **QR Code Scanner Modal:** Uses `expo-camera` to scan the QR code displayed on the laptop screen[cite: 1]. The QR payload encodes `{"wsUrl":"ws://...","roomCode":"ABCD"}` so pairing configures both the server endpoint and room code in one scan[cite: 1].
   - **Manual Fallback Form:** 4-character Room Code input + an editable WebSocket Server URL field (allowing instant switching between cloud URL and local LAN IP like `ws://192.168.1.x:8080`)[cite: 1].
2. **Screen 2 — Active Motion Cockpit (`app/controller.tsx`):**
   - **Top Telemetry Bar:** Connection status pill (`CONNECTED • P1` in emerald, `RECONNECTING...` in amber, or `OFFLINE` in red)[cite: 1], live Ping readout (`4 ms`)[cite: 1], and sensor sampling rate badge (`60 Hz`).
   - **Center Interactive Gimbal Horizon:** A circular artificial horizon and glowing 2D reticle that moves in real time with `calibratedRoll` and `calibratedPitch`, showing the deadzone ring and current tilt vector[cite: 1].
   - **Left Thumb Zone:** Large tactile **BRAKE / STABILIZE** hold button (increases linear damping in-game) and a secondary **MANUAL JUMP** button[cite: 1].
   - **Right Thumb Zone:** Large tactile **NITRO BOOST** hold button (applies forward impulse when boost energy is available) and a prominent **"CALIBRATE NEUTRAL"** button[cite: 1].
   - **Auto-Reconnect Loop:** Exponential backoff state machine (`300ms`, `600ms`, `1200ms`, capped at `3000ms`) that automatically reconnects and re-authenticates `sessionId` if the connection drops[cite: 1].

### Component C: 3D Browser Game (`/apps/web/app/play/page.tsx`)
Build **"KINETIC ARENA"** using `@react-three/fiber`, `@react-three/drei`, and `@react-three/rapier`[cite: 1]:
1. **Pairing Lobby Overlay:**
   - Displays a scannable QR code (encoding active WebSocket URL + Room Code) and the 4-letter Room Code in large typography[cite: 1].
   - Shows two interactive player cards (**Player 1 — Cyan Sphere**, **Player 2 — Magenta Sphere**) with live connection badges, live tilt preview bars, and a **"Tap Calibrate on Phone to Ready Up"** prompt[cite: 1].
2. **Game Mode 1 — Neon Skyway Course (1 or 2 Players):**
   - A suspended 3D obstacle track combining banked racing turns, narrow laser-gated balance bridges, a shifting wall maze section, and jump gaps[cite: 1].
   - **Controls Mapping:** Tilting the phone applies directional torque/force to roll the player's energy sphere[cite: 1]; shaking the phone (or pressing Jump) applies an upward physics impulse to clear barriers[cite: 1]; holding Boost activates a particle trail and speed multiplier; holding Brake increases linear damping for tight maze corners[cite: 1].
   - **Bi-Directional Haptics:** Rapier `onCollisionEnter` callbacks detect wall impacts, player-to-player collisions, and boost pads, immediately sending `HAPTIC_EVENT` messages back to the respective phone[cite: 1].
3. **Game Mode 2 — Hexa-Core Bumper Arena (2-Player Local Multiplayer Bonus):**
   - Two players spawn on a floating hexagonal platform[cite: 1]. Players tilt to build momentum, trigger Nitro Boost to knock their opponent off the platform, and shake to jump over incoming charges[cite: 1]. High-impact collisions trigger heavy vibration pulses on both phones[cite: 1].
4. **Top-Right Live HUD & Disconnect Freeze:**
   - Displays live RTT (`ms`), packet rate (`Hz`), player connection status pills, and course timer[cite: 1].
   - If an active controller disconnects mid-game, pause the Rapier physics simulation immediately and display a **"Controller Disconnected — Waiting for Auto-Reconnect..."** modal that automatically unpauses with a 3-2-1 countdown once the phone reconnects[cite: 1].

### Component D: Showcase Website & Live Telemetry Sandbox (`/apps/web/app/page.tsx`)
Make the root route (`/`) an interactive engineering showcase page:
1. **Hero Section:** High-contrast dark UI with smooth scrolling, a primary **"Launch 3D Game Lobby (`/play`)"** CTA, and an **"Install Android Controller (`.apk`)"** card with a direct download button and QR code[cite: 1].
2. **Interactive 3D Sensor Sandbox (Embedded on Landing Page):**
   - Allows an evaluator to pair their phone directly on the homepage and watch a 3D wireframe smartphone model rotate in real time alongside a dual-line canvas oscilloscope plotting **Raw Noisy Sensor Data vs. EMA-Filtered Output** and a live **20-Byte Hex Inspector** displaying incoming binary `ArrayBuffer` packets at 60Hz[cite: 1].
3. **Engineering Architecture Section:** Visual cards breaking down the QR Pairing Handshake, the 20-byte binary protocol vs. JSON overhead, the neutral calibration math, and the auto-reconnection state machine[cite: 1].

---

## 6. Sequential Execution Plan for the Coding Agent
Execute the build strictly in these 5 phases, verifying TypeScript compilation (`pnpm -r typecheck`) at the end of each phase:

- **Phase 1 (Workspace & Protocol):** Initialize the `pnpm` monorepo, configure `/packages/shared-protocol`, implement `encodeTelemetry()` and `decodeTelemetry()` using `DataView` / `ArrayBuffer`, and define all TypeScript control message unions[cite: 1].
- **Phase 2 (WebSocket Server):** Build `/apps/ws-server` with room creation, 2-player slot allocation, binary frame pass-through, `1Hz` ping-pong latency measurement, and `60s` grace-period session reconnection[cite: 1].
- **Phase 3 (Web Showcase & 3D Game):** Build `/apps/web`. First build the `useControllerHost` hook (including a WASD/Arrow-key fallback mode for desktop testing), then build the `/play` 3D Rapier physics course and 2-player bumper arena, and finally build the `/` Showcase landing page with the live 3D phone wireframe telemetry sandbox[cite: 1].
- **Phase 4 (Mobile Controller App):** Build `/apps/mobile` using Expo. Implement the 60Hz `expo-sensors` pipeline, EMA filter, calibration offset state, shake detector, `expo-camera` QR scanner, `expo-haptics` listener, landscape cockpit UI, and auto-reconnection state machine[cite: 1]. Configure `eas.json` for standalone Android `.apk` generation[cite: 1].
- **Phase 5 (README & Packaging):** Generate a comprehensive root `README.md` with Mermaid.js architecture diagrams, binary protocol byte tables, latency math explanations, and one-command local startup scripts (`pnpm dev`)[cite: 1].