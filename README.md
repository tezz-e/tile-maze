<p align="center">
  <img src="docs/media/logo.svg" alt="Tiltmaze" width="680" />
</p>

<p align="center">
  A 3D motion-controlled marble platformer. Your phone acts as the physical labyrinth tray, transmitting high-frequency motion sensor telemetry over WebSockets to steer a marble across suspended skyways in the browser.
</p>

---

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
  - [Windows (One-Click)](#windows-one-click)
  - [Manual Setup (Cross-Platform)](#manual-setup-cross-platform)
- [Android Controller Setup](#android-controller-setup)
- [Controls](#controls)
- [Difficulty Modes](#difficulty-modes)
- [Campaign Courses](#campaign-courses)
- [Architecture](#architecture)
- [A Quirky Side Note: Glyph Matrix](#a-quirky-side-note-glyph-matrix)
- [Repository Structure](#repository-structure)
- [License](#license)

---

## Overview

Tiltmaze turns your Android smartphone into a physical balancing tray. Holding the phone flat and tilting it in real space dynamically steers a virtual marble across elevated platforms, tight chicanes, and open-air drops.

The system pairs the phone and browser over local Wi-Fi with a 4-letter room code or QR scan. Orientation data is filtered on-device using a 1€ adaptive filter, packed into 20-byte binary frames at 60 Hz, and relayed to a Three.js and Rapier 3D (WASM) physics simulation in the browser.

---

## Quick Start

### Windows (One-Click)

If you are on Windows, the fastest way to run the project is using the included batch file:

1. Double-click `start.bat` in the repository root (or run `.\start.bat` from PowerShell / Command Prompt).
2. The script checks for Node.js, installs dependencies if missing, compiles the shared protocol, server, and game client, launches the server, and opens `http://localhost:3000` in your default browser.

### Manual Setup (Cross-Platform)

Prerequisites: **Node.js 18+** and **npm**.

1. Clone the repository and navigate into the project directory:
   ```bash
   git clone https://github.com/tezz-e/tile-maze.git
   cd tile-maze
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build all workspace packages:
   ```bash
   npm run build
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Open `http://localhost:3000` in your web browser. The lobby will display your computer's local network IP, room pairing code, and a QR code for your phone.

---

## Android Controller Setup

You can install the controller app on any Android device (Android 8.0+, API 26+) using one of the following methods:

1. **Direct Download from the Web Server**
   Make sure your phone is connected to the same Wi-Fi network as your computer, then navigate to `http://<your-computer-ip>:3000/apk` in your mobile browser (or tap the **Download APK** link in the web lobby). Open the downloaded file to install.

2. **GitHub Releases**
   Download the latest pre-compiled `Tiltmaze-Controller.apk` from the [Releases](https://github.com/tezz-e/tile-maze/releases) section of this repository.

3. **ADB Sideload**
   If your device is connected via USB with USB debugging enabled, run:
   ```bash
   adb install -r app-debug.apk
   ```

4. **Build from Source**
   Open the `app/` directory in Android Studio or compile it with the Gradle wrapper:
   ```bash
   cd app
   ./gradlew assembleDebug
   ```
   The APK will be generated at `app/app/build/outputs/apk/debug/app-debug.apk`.

---

## Controls

### Phone Controller

1. Open the Tiltmaze app on your phone.
2. Tap **Scan Laptop QR Code** and point your camera at the QR code on your computer screen (or manually enter the IP and 4-letter room code).
3. Hold the phone in your natural, comfortable resting posture and tap **Calibrate**. The app records your resting baseline over a 300ms window so you never have to hold the device unnaturally flat.
4. **Steer:** Tilt the phone in any direction to roll the marble.
5. **Jump:** Perform a quick upward wrist flick or shake to hop over gaps.
6. **Nitro Boost:** Hold the on-screen Nitro button for a burst of speed.
7. **Brake:** Hold the on-screen Brake button to bleed velocity before tight corners.

### Keyboard Fallback

If you want to test or play without a phone, the web client includes full keyboard support:

- Click **Play with Keyboard** on any course in the lobby.
- **Steer:** `W`, `A`, `S`, `D` or `Arrow Keys`
- **Jump:** `Spacebar`
- **Nitro Boost:** `Shift`
- **Brake:** `B`
- **Toggle Camera View:** `V` (cycles between standard chase and close follow cameras)
- **Recalibrate Neutral:** `C`
- **Return to Lobby:** `Esc`

---

## Difficulty Modes

Difficulty can be toggled in the lobby prior to launching any course. The underlying level layouts remain identical, but hazard collision and rotor dynamics adjust to your preferred challenge:

| Mode | Gameplay Adjustments | Description |
| :--- | :--- | :--- |
| **Easy** | Safety guardrails active | Walkable borders facing an abyss spawn 2.8m physical collision barriers and translucent glowing acrylic rails. Jump gaps remain leapable. Marble cannot fall off ledges. |
| **Medium** | Standard campaign rules | Authentic skyway platforming with real open-air drops, selective corner catch-walls, and standard par times. |
| **Hard** | Pro labyrinth | Completely un-walled ridges, strict championship par targets, and turnstile rotors spinning 25% faster. |

---

## Campaign Courses

The campaign consists of 6 progressive courses, each introducing specific kinematic obstacles, track geometries, and lighting themes:

| Course | Subtitle | Key Mechanics | Par Time |
| :--- | :--- | :--- | :---: |
| **01 • Skyway Runway** | The Teaser | Walled introductory corridor leading into an open chicane and a 1-cell leap over the cloud sea directly onto the Goal. | 00:14.00 |
| **02 • Serpent's Ridge** | The Elevated Spine | Narrow 2-cell winding spine flanked by open drop-offs, entry apex catch-wall, and an un-walled rotor bridge. | 00:22.00 |
| **03 • Twin Paths** | Island Shortcut | Safe winding corridor (25 steps) versus a disconnected sky-island leap across open void (22 steps). | 00:26.00 |
| **04 • Kinetic Speedway** | High-Speed Tangents | Long boost pad straights into sweeping corners where the exit opens into raw abyss, demanding disciplined braking. | 00:32.00 |
| **05 • Vortex Valley** | Central Chasm Spiral | Storm atmosphere with ambient lightning. The elevated track spirals inward around a central abyss void onto a suspended Goal island. | 00:40.00 |
| **06 • Master's Labyrinth** | Championship Climax | Stepping-stone islands, dual kinematic rotors, spring jumps, and the Blackout Sanctum finale where path lighting dims to neon edge strips. | 00:52.00 |

### Screenshots

| Course 01: Skyway Runway | Course 02: Serpent's Ridge |
| :---: | :---: |
| <img src="docs/media/level-1.png" alt="Level 1" width="450" /> | <img src="docs/media/level-2.png" alt="Level 2" width="450" /> |

| Course 03: Twin Paths | Course 04: Kinetic Speedway |
| :---: | :---: |
| <img src="docs/media/level-3.png" alt="Level 3" width="450" /> | <img src="docs/media/level-4.png" alt="Level 4" width="450" /> |

| Course 05: Vortex Valley | Course 06: Master's Labyrinth |
| :---: | :---: |
| <img src="docs/media/level-5.png" alt="Level 5" width="450" /> | <img src="docs/media/level-6.png" alt="Level 6" width="450" /> |

---

## Architecture

```
Phone (Android IMU)
  └─ Rotation Vector @ 100 Hz
  └─ 1€ Adaptive Jitter Filter (1.0 Hz - 30.0 Hz)
  └─ 20-Byte Compact Binary Frame @ 60 Hz
       │
       ▼ (WebSocket over Local Wi-Fi)
Server (Node.js Relay on :3000)
  └─ Room management & zero-copy packet forwarding
  └─ Static web game host & /apk distribution
       │
       ▼
Browser (Three.js + Rapier 3D WASM)
  └─ Rotated Gravity Tensor (track remains fixed, gravity rotates)
  └─ Contiguous Floor Collider Rectangles (prevents seam catching)
  └─ Procedural Web Audio synthesizer for rolling friction & impacts
```

### Sensor Filtering and Neutral Calibration

Raw smartphone sensors suffer from hand tremor at rest and phase delay during fast motion. The Android app passes IMU rotation vector data through an implementation of the **1€ (One-Euro) Filter**:
- At low angular velocities, the cutoff frequency drops toward 1.0 Hz to eliminate resting jitter.
- During rapid wrist movements, the cutoff frequency expands up to 30.0 Hz to maintain responsive tracking without noticeable latency.
- Calibration captures the resting quaternion $q_{ref}$ over a 300ms window and computes relative rotation via quaternion conjugation:
  $$q_{rel} = q_{ref}^* \otimes q_{curr}$$
  This avoids gimbal lock and ensures the player can hold the device at whatever angle feels natural.

### Rotated Gravity Simulation

Instead of physically tilting the entire 3D level geometry (which can cause collision jitter, tunneling, or camera instability), the skyway track is static at $y = 0$. The phone's pitch and roll are translated into a rotated gravity vector in Rapier 3D:
$$\vec{g}_{effective} = \begin{bmatrix} -g \sin(\text{roll}) \\ g \cos(\text{pitch})\cos(\text{roll}) \\ g \sin(\text{pitch}) \end{bmatrix}$$
This preserves realistic momentum, centrifugal behavior around banked curves, and smooth rolling physics.

### Anti-Seam Tile Merging

Individually placing 1×1 tile colliders in a physics engine causes internal seam bounces when a rolling sphere crosses tile boundaries. The game uses a 2D rectangular decomposition algorithm (`mergeFloorTiles` in `PhysicsWorld.ts`) that combines contiguous walkable cells into single continuous box colliders while leaving empty void cells completely open.

### Binary Protocol

Telemetry packets are transmitted over WebSockets as compact 20-byte binary buffers:

```text
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  Type (0x01)  |  Player Slot  | Button Bitmask|  Sequence No  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Calibrated Pitch (Float32 LE)               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Calibrated Roll  (Float32 LE)               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                   Azimuth / Yaw    (Float32 LE)               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                 Client Timestamp (Uint32 LE, ms)              |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

---

## A Quirky Side Note: Glyph Matrix

While building the Android companion app, I noticed the Nothing Phone has an addressable LED matrix on the back. So naturally, because why not, I hooked up the Glyph SDK: a 3×3 LED dot mirrors the marble's position across the rear glass while you tilt, radar sweeps fire during pairing, and celebration strobes flash when you cross the finish line. It is completely unnecessary, but fun if you happen to have a Nothing Phone.

---

## Repository Structure

```text
.
├── .github/workflows/
│   └── build-and-release.yml      # CI/CD: Automated builds and Android APK release
├── app/                           # Android Kotlin companion app (sensor capture, haptics)
├── packages/
│   └── protocol/                  # Shared TypeScript binary protocol definitions
├── server/                        # Express HTTP server & WebSocket relay (:3000)
├── game/                          # Three.js + Rapier 3D browser client
│   ├── src/
│   │   ├── audio/                 # Procedural Web Audio synthesizer
│   │   ├── input/                 # Keyboard controller
│   │   ├── levels/                # 6 campaign courses and par times
│   │   ├── physics/               # Rapier 3D world, rotated gravity, collider merging
│   │   ├── ui/                    # Lobby UI and HUD
│   │   └── world/                 # Track meshes, materials, and environment
├── docs/                          # Screenshots, logo, and media assets
├── app-debug.apk                  # Pre-compiled Android controller APK
├── start.bat                      # Windows one-click startup script
└── package.json                   # Root workspace configuration
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
