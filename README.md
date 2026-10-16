# TILTMAZE: KINETIC EDITION
### The Motion-Controlled 3D Physics Labyrinth & Telemetry Ecosystem

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-r173-black.svg)](https://threejs.org/)
[![Rapier3D](https://img.shields.io/badge/Rapier-0.14-orange.svg)](https://rapier.rs/)
[![Android](https://img.shields.io/badge/Android-Kotlin%20%2B%20Compose-green.svg)](https://developer.android.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **"Anything but a Game Controller" Challenge:** A real-time motion controller ecosystem where an Android smartphone (featuring Nothing Phone 3 Glyph Matrix integration) turns into the physical control surface for a browser-based 3D marble labyrinth over local WebSockets with minimal latency.

---

## 🌟 Key Highlights

- ⚡ **20-Byte Binary Protocol:** Streams orientation and button telemetry at 60Hz with sub-millisecond serialization over WebSocket.
- 🎯 **Rotated Gravity Engine:** Physics simulated via Rapier 3D with dynamic gravity rotation ($\vec{g}_{eff} = \mathbf{R}_{board} \cdot [0, -9.81, 0]^T$) and Continuous Collision Detection (CCD).
- 🌊 **Adaptive One Euro Filter:** Eliminates hand tremors at rest while providing instantaneous tracking during high-speed flicks.
- 📡 **LAN Smart Discovery & Session Recovery:** Automatically prunes WSL/Docker/Hyper-V virtual interfaces and preserves player slots over a 60-second disconnect grace period.
- 🔬 **Telemetry Lab & Flight Recorder:** Live dual-trace oscilloscope (Raw vs One-Euro Filtered), 3D wireframe smartphone gimbal, and real-time 20-byte hex inspector.
- 📱 **Nothing Phone (3) Hardware:** Native Jetpack Compose app with custom vibration waveforms, Google Code Scanner QR pairing, and 25×25 Glyph Matrix LED mini-map driver.
- 🎮 **Full Keyboard Fallback:** Fully playable with WASD / Arrow keys for instant desktop evaluation.

---

## 🚀 Quick Start (1-Click)

### Prerequisites
- **Node.js:** v18+ (tested on Node v24 LTS)
- **Android Phone:** Android 8.0+ (API 26+) on same Wi-Fi network

### 1. Launch Game and Server
Run `start.bat` (Windows) or execute:
```bash
# Install dependencies
npm install

# Build shared protocol & game
npm run build

# Start single-port server (Port 3000)
npm start
```
> **Platform note:** On macOS/Linux: `npm install && npm run build && npm start`. On Windows: run the equivalent or use the provided scripts (`start.bat`).

The game will automatically open at `http://localhost:3000`.

### 2. Windows Firewall (If connecting over LAN)
Run `open-firewall.bat` as Administrator to permit incoming connections on TCP port 3000.

### 3. Mobile Controller App

#### Download APK
Download the latest debug APK from [GitHub Releases](https://github.com/tezz-e/tile-maze/releases) (or build from source with `cd app && ./gradlew assembleDebug` or `.\gradlew.bat assembleDebug`).

#### Pairing & Play
1. Open the Android app (`app/`).
2. Point camera at the QR code displayed on the laptop screen, or enter the 4-digit room code manually.
3. Tap **"CALIBRATE"** to set your comfortable neutral holding posture.
4. Tilt to steer the marble, shake to jump over obstacles, and hold **"NITRO"** to accelerate!

#### Nothing Phone Glyph Matrix Setup (Optional)
If running on a Nothing Phone (3) and utilizing the 25×25 Glyph Matrix LED mini-map:
1. Obtain an API key from the Nothing Developer Portal.
2. In `app/app/src/main/AndroidManifest.xml`, replace `YOUR_NOTHING_API_KEY_HERE` with your key:
   ```xml
   <meta-data
       android:name="NothingKey"
       android:value="YOUR_ACTUAL_KEY" />
   ```
On non-Nothing Android devices or when unconfigured, the app falls back gracefully to on-screen UI and standard vibration haptics.

---

## ⏱️ Latency & Calibration

- **60Hz Telemetry Stream:** The Android app captures orientation updates and streams 20-byte binary packets over WebSocket at a steady 60Hz period scheduled against a monotonic clock (`System.nanoTime`).
- **Drop-When-Backed-Up:** To prevent packet queuing and rubber-banding during Wi-Fi jitter, frames are dropped on the sender if the socket send queue exceeds 512 bytes, and dropped on the relay server if the host socket buffer exceeds 2KB.
- **Gravity-Relative Neutral Calibration:** Calibration samples screen-space gravity over a ~300ms stillness window (rejecting hand motion > 6°) to establish an orthonormal coordinate frame without gimbal lock or Euler cross-talk.
- **Sequence Numbering & Discarding:** Telemetry packets carry an 8-bit circular sequence counter; out-of-order and duplicate packets are discarded on arrival with circular wraparound handling.

> [!NOTE]
> **Security Note:** The relay server listens on `0.0.0.0` so phones on the local area network (LAN) can connect with the 4-character room code. This is intended for trusted local networks, not public Internet exposure.

---

## ⌨️ Desktop Testing Controls (Keyboard Fallback)

If testing without a phone, use the built-in keyboard fallback:
| Key | Action |
| :--- | :--- |
| **W / Up Arrow** | Tilt board forward |
| **S / Down Arrow** | Tilt board backward |
| **A / Left Arrow** | Tilt board left |
| **D / Right Arrow** | Tilt board right |
| **Spacebar** | Shake phone / Jump |
| **Shift** | Nitro Boost |
| **C** | Calibrate Neutral posture |
| **T** | Toggle Telemetry Lab / Flight Recorder |

---

## 📁 Repository Structure

```text
tiltmaze-kinetic/
├── package.json                    # Workspace root (scripts: dev, build, start, test)
├── start.bat                       # 1-click startup
├── open-firewall.bat               # Windows Firewall port 3000 helper
├── docs/
│   ├── ARCHITECTURE.md             # In-depth architectural design
│   ├── PROTOCOL.md                 # 20-Byte binary & JSON schemas
│   ├── LATENCY.md                  # NTP clock sync math & 240fps slow-mo camera guide
│   └── DECISIONS.md                # Record of architectural choices
├── packages/
│   └── protocol/                   # Shared TypeScript protocol & 20-byte codec
│       ├── src/binaryCodec.ts      # DataView encoder & decoder
│       └── src/controlMessages.ts  # JSON message types
├── server/                         # Ultra-thin Node.js + ws relay & static server
│   ├── src/index.ts                # Express/HTTP + WebSocket server on port 3000
│   ├── src/RoomManager.ts          # 4-char codes, 2-player slots, 60s session recovery
│   └── src/networkDiscovery.ts     # Prunes WSL/Docker/vEthernet, detects primary LAN IP
├── game/                           # Vite + TypeScript + Three.js + Rapier 3D
│   ├── src/main.ts                 # Game loop, rendering, physics sync
│   ├── src/physics/                # Rapier 3D world, rotated gravity, CCD marble
│   ├── src/world/                  # 3D labyrinth board, holes, checkpoints
│   ├── src/levels/                 # 4 progressive levels + BFS solvability validators
│   ├── src/audio/                  # Web Audio synthesized sound generator
│   └── src/ui/                     # Lobby, QR code, Game HUD, Telemetry Lab
└── app/                            # Native Android App (Kotlin + Jetpack Compose)
    ├── app/src/main/
    │   ├── java/com/tiltmaze/
    │   │   ├── MainActivity.kt     # Compose UI & QR Scanner
    │   │   ├── sensor/             # 100Hz GameRotationVector, LinearAccel, OneEuroFilter
    │   │   ├── net/                # OkHttp WebSocket, 20-byte binary streamer
    │   │   ├── haptics/            # Custom VibrationEffect waveforms
    │   │   └── glyph/              # Nothing Phone (3) 25x25 Glyph Matrix driver
    │   └── AndroidManifest.xml
    └── build.gradle.kts
```

---

## 🧪 Verification & Automated Testing

Run all unit tests across all workspace packages:
```bash
npm test
```
*(Windows: `npm test` or `npm.cmd test`)*

- **Protocol Tests:** Encodes/decodes 20-byte binary frames, tests little-endian float stability, and bitmask flags.
- **Server Tests:** Verifies 4-character room codes, 2-player slot capacity, 60-second disconnect recovery, and LAN interface ranking.
- **Game Tests:** Automated BFS graph solver testing every single level to mathematically prove solvability from start to finish without hazard intersection.
- **Filter Tests:** Verifies that the One Euro Filter suppresses micro-tremors at rest while maintaining instant response on fast flicks.

---

## 📄 License
MIT License. Created for the "Anything but a Game Controller" Challenge.
