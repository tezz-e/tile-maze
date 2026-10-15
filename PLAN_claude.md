# Tiltmaze: Build Plan (for the coding agent)

> "Tiltmaze" is a working name. Rename freely, but keep it consistent across repo, app, and docs.

## 0. How to use this document

- This file is the source of truth. Work milestone by milestone, in order (M0 → M7).
- **Decide, don't ask.** Make reasonable engineering decisions yourself and note them in `docs/DECISIONS.md`. Only stop for steps marked **[HUMAN]** (physical device, hotspot, adb, camera measurements, Glyph debug mode).
- After each milestone: run its acceptance checklist, record pass/fail in `docs/PROGRESS.md`, and commit with message `M<n>: <summary>`.
- Keep dependencies minimal and pinned. TypeScript `strict` for `server/` and `game/`. Add a formatter and linter (Prettier + ESLint, ktlint or Android Studio defaults).
- Quality bar: no hardcoded IPs, no console errors, friendly error messages, clean logs, no dead code.

---

## 1. Context

This is a club recruitment task, **"Anything but a Game Controller"**. Goal: build a mobile app that turns a phone into a real-time motion controller for a browser game on a laptop.

**Required deliverables:** GitHub repo (app, game, server), APK or build link, screen recording of the phone controlling the game, and a README covering tech stack, pairing, and latency approach.

**Core requirements:**

1. Read gyroscope and accelerometer data and map it to controls (tilt to steer, shake to act).
2. Pair phone and laptop via QR code or room code.
3. Stream sensor data over WebSockets with no noticeable lag.
4. Simple browser game controlled entirely by the phone.
5. Calibration to set a neutral position.
6. Connection status on both devices with automatic reconnection.

**Bonus:** local multiplayer with multiple phones, on-screen phone buttons, vibration feedback, live latency display. We are doing all four.

**This needs to be very good work and stand out reasonably.** Judges will judge: does it work first try, does it feel instant, does it survive abuse, does the repo look professional.
## Original prompt as given by the task
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

### Environment (fixed decisions)

- Dev PC: **Windows**. Phone: **Nothing Phone (3)** (Android, 25×25 Glyph Matrix on the back).
- Network: the phone's **Wi-Fi hotspot**, with the PC joined to it. **LAN only. No cloud, no hosted relay.** Plain `ws://` / `http://`.
- The Node server on the PC serves the game page and the WebSocket endpoint from one process and port.

### What makes it stand out (prioritize these)

1. **A game that feels great:** a 3D marble labyrinth where the on-screen board mirrors the phone's tilt in real time.
2. **Glyph Matrix + haptics as part of the controller:** the phone's back shows live game state (a mini-map with the ball) and pairing/connection animations. Distinct haptic patterns fire on game events.
3. **Measured latency:** a live HUD plus a real motion-to-photon measurement (240 fps slow-mo) reported in the README.

---

## 2. Architecture

```
 ┌────────────────┐   ws://pc-ip:3000/ws?role=controller   ┌──────────────────────┐   ws (role=host)   ┌──────────────────┐
 │ Android app    │ ─────────────────────────────────────▶ │ Node server (PC)     │ ◀────────────────▶ │ Browser game     │
 │ sensors, UI,   │ ◀───── haptic / glyph / status ─────── │ rooms, pairing,      │                    │ Three.js + Rapier│
 │ haptics, Glyph │                                        │ forward, heartbeat,  │ ── serves /game ─▶ │ lobby, HUD, QR   │
 └────────────────┘                                        │ static game hosting  │                    └──────────────────┘
                                                           └──────────────────────┘
```

- The server is deliberately thin: it routes messages and tracks rooms and sessions. It never interprets game logic.
- All filtering/smoothing happens in the **game** (one place, tunable live from the HUD).
- Calibration happens on the **phone** (it sends orientation relative to the neutral pose).

---

## 3. Repo layout

```
tiltmaze/
  README.md
  PLAN.md                 (this file)
  package.json            (npm workspaces: server, game; scripts: dev, build, start, test)
  docs/
    PROGRESS.md  DECISIONS.md  protocol.md  architecture.md  latency.md  demo-script.md
    media/                (GIFs, screenshots, latency photos)
  server/                 (TypeScript, ws, minimal static serving, qrcode helper)
  game/                   (Vite + TypeScript + Three.js + Rapier)
  app/                    (Android, Kotlin + Jetpack Compose, Gradle)
  scripts/
    start.bat             (double-click: install deps if needed, build game, start server, open browser)
    open-firewall.bat     (adds inbound rule for the server port; needs admin; documented)
  .github/workflows/android.yml   (build debug APK on push; attach to GitHub Release on tag)
```

`npm start` at the root builds `game/` and serves `game/dist` from the server on port **3000** (configurable via `PORT`).

---

## 4. Protocol v1 (document fully in `docs/protocol.md`)

- Transport: WebSocket, JSON text frames, one endpoint `ws://<ip>:<port>/ws`.
- Handshake: first message must be `hello` (controller) or `host` (game). Reject anything else.
- All messages are objects with a type field `t`. The hot-path frame uses short keys.

### Messages

| Direction | `t` | Payload | Notes |
|---|---|---|---|
| game → server | `host` | `{room?}` | Request a room; if `room` is given and free, reuse it (survives game refresh and server restart). |
| server → game | `hosted` | `{room, ips:[...], port}` | Used for the QR and lobby. |
| phone → server | `hello` | `{room, name, token?}` | `token` present when resuming a session. |
| server → phone | `welcome` | `{playerId, slot, color, token, name}` | Token is a random secret for slot reclaim. |
| server → phone | `reject` | `{reason}` | `room_not_found`, `room_full`, `bad_token`. |
| server → game | `players` | `{players:[{id, slot, color, name, connected}]}` | Sent on any change. |
| server → phone | `host_status` | `{up:boolean}` | So the phone shows "Waiting for game". |
| phone → game | `s` (state) | `{seq, ts, q:[w,x,y,z], a:[x,y,z]}` | ~60 Hz. `q` is orientation **relative to the calibrated neutral**. `a` is linear acceleration. `ts` is estimated server-clock ms. |
| phone → game | `shake` | `{seq, ts, mag}` | Reliable discrete event, debounced on the phone. |
| phone → game | `btn` | `{id:"pause"\|"action"\|"recal", ts}` | On-screen buttons. |
| both → server | `ping` | `{id, t0}` | Every 1 s. |
| server → both | `pong` | `{id, t0, t1, t2}` | `t1`/`t2` = server receive/send times. Used for RTT and clock offset. |
| game → phone | `haptic` | `{p, pattern, intensity}` | `pattern`: `tick`, `wall`, `hole`, `checkpoint`, `win`, `lost`. `p` = player id. |
| game → phone | `level` | `{p, grid}` | 625-char string (25×25) of `0` floor, `1` wall, `2` hole, `3` goal. Sent when a level loads. |
| game → phone | `ball` | `{p, x, y}` | Ball position in matrix coordinates (0–24, floats). ≤30 Hz, only on change. |
| game → phone | `glyph` | `{p, anim}` | `win`, `lost`, `idle`. |

Server forwarding rules:

- Controller messages → that room's host only. Host messages with `p` → that player's phone only.
- **Latest-wins for `s`:** if the target socket's `bufferedAmount` exceeds a small threshold (e.g. 16 KB), drop frames instead of queueing.
- Validate every inbound message (types, sizes, max length, numeric finite). Ignore malformed frames and log at debug level.

---

## 5. Server spec (`server/`)

- Node 20+, TypeScript, `ws`. Minimal static file serving for `game/dist` (no heavy framework).
- **Rooms:** 4-char codes from an unambiguous alphabet (no `0/O/1/I/L`). Max 4 players per room, fixed slot colors. One host per room.
- **Sessions:** on `welcome`, the player gets a random `token`. If a phone disconnects, its slot is reserved for **60 s**. `hello` with a valid token reclaims it and notifies the host (`players` update).
- **Heartbeat:** clients ping every 1 s. If no ping arrives for 3 s, the server terminates that socket and starts the grace timer.
- **Clock sync support:** answer `ping` with `pong` containing server `t1` (receive) and `t2` (send) from `performance.timeOrigin + performance.now()`.
- **Performance:** make sure Nagle is off (`setNoDelay`) and `permessage-deflate` is disabled. Verify and note it in `docs/architecture.md`.
- **IP discovery:** list IPv4, non-internal interfaces. Exclude names matching `vEthernet|WSL|VirtualBox|VMware|Docker|Hyper-V|Loopback`. Rank private ranges (`192.168.*`, `172.16-31.*`, `10.*`) first and return all candidates so the lobby can switch.
- **Startup output:** print the game URL, the candidate IPs, and a clear hint about the Windows Firewall if no connections arrive. Provide `/health`.
- **Tests (vitest):** room create/join/full, token reclaim within and after the grace window, message validation, drop-on-backpressure logic, forwarding rules.

---

## 6. Android app spec (`app/`)

**Stack:** Kotlin, Jetpack Compose, OkHttp WebSocket, coroutines. `minSdk 31`, `targetSdk` current. Single-activity, portrait locked, dark theme.

**Manifest:** `INTERNET`, `VIBRATE`, cleartext allowed (`usesCleartextTraffic="true"`; document this as a deliberate LAN-only choice). Use the Google code scanner (`play-services-code-scanner`) for QR so no camera permission is needed. Keep a manual entry fallback.

### Screens

1. **Pair:** "Scan QR" button, plus manual entry (room code and optional `ip:port`). Shows connection result and errors in plain language ("Can't reach the game. Are both devices on the same hotspot?").
2. **Calibrate:** prompt "Hold the phone in your comfortable neutral position", then tap to capture. A short 3-2-1 countdown before capture is fine. Re-accessible anytime.
3. **Controller:** status chip (`Connecting`, `Waiting for game`, `Connected · 6 ms`, `Reconnecting…`, `Disconnected`), a tilt indicator (dot in circle), player name and color, latency/Hz readout, and on-screen buttons: **Recalibrate**, **Pause**, **Action**.
4. **Settings (small sheet):** player name, sensitivity (3 steps), haptics on/off, Glyph on/off.

### Sensors

- Use `TYPE_GAME_ROTATION_VECTOR` (no magnetometer) for orientation. Convert with `SensorManager.getQuaternionFromVector`.
- Use `TYPE_LINEAR_ACCELERATION` for shake detection. Request ~100 Hz (`samplingPeriodUs = 10_000`).
- **Send loop:** a 60 Hz ticker that sends the latest sample only, never a backlog.
- **Calibration math:** store `q_ref` at capture; send `q_rel = conj(q_ref) * q_current`. Write unit tests for this and check axis signs with the live debug view.
- **Shake:** linear-acceleration magnitude over a threshold (default 14 m/s²) with 600 ms debounce. Send as a `shake` event.
- Keep the screen on (`FLAG_KEEP_SCREEN_ON`). Stop streaming when backgrounded and tell the host (`btn:pause`).

### Networking

- On connect: `hello`. On `welcome`: store `token`, `room`, server address in DataStore.
- Heartbeat ping every 1 s. Estimate the server clock offset with the NTP-style 4-timestamp method and keep the lowest-RTT sample from the last 8 (see §9).
- **Reconnection:** exponential backoff 250 ms → 2 s cap with jitter. Register a `ConnectivityManager` network callback to retry immediately when the network returns. If a session token exists, resume it.

### Haptics

Map `haptic` messages to `VibrationEffect` (use predefined effects where available, waveforms otherwise). Rate-limit `wall` ticks to one per ~80 ms and scale with `intensity`.

| Pattern | Feel |
|---|---|
| `tick` | very short light click |
| `wall` | short tick scaled by impact |
| `hole` | heavy click then quick decay |
| `checkpoint` | double click |
| `win` | rising waveform |
| `lost` | single long buzz |

### Glyph Matrix (signature feature)

- Use Nothing's official **GlyphMatrix developer kit** (look for it under the `Nothing-Developer-Programme` GitHub organization). Follow its README for the library, manifest entries, and API key/debug setup. **[HUMAN]** enables debug mode via adb and supplies any key.
- Hide the SDK behind a `GlyphController` interface with a **no-op implementation** so the app still runs on other phones and in tests. If the SDK API differs from this plan, change only the implementation.
- Display states (25×25, brightness 0–255):
  - **Searching/pairing:** rotating radar sweep or ring.
  - **Connected:** a ring pulse that resolves into a check mark.
  - **Playing:** mini-map from the `level` grid (walls dim, goal blinking, hole dotted) plus a bright pixel for the ball from `ball` messages.
  - **Win:** expanding rings. **Lost/disconnected:** blinking center dot.
- Note for the design: the matrix faces away from the player, so it is built for spectators and the demo video. It is not a player HUD.

---

## 7. Game spec (`game/`)

**Stack:** Vite, TypeScript, Three.js, `@dimforge/rapier3d-compat`. Web Audio for synthesized sound effects (no audio assets).

### Structure

- **Design for multiplayer from the start:** a `Session` owns a list of `Board` instances (one per player). Single player = one board in the full viewport; multiplayer = a viewport grid (scissor/viewport rendering). Do not hardcode a single player anywhere.
- `net/`: WebSocket client, reconnect, clock sync, per-player latest-state store.
- `input/`: orientation → tilt mapping, One Euro filter, dead-zone, shake handling, keyboard fake controller.
- `world/`: level loading, physics, rendering, effects.
- `ui/`: lobby, HUD, overlays.

### Core mechanic

- **Board mirrors the phone.** Each frame (`requestAnimationFrame`), take the **latest** state per player (no queue, no interpolation), derive tilt from `q_rel`, clamp, filter, and apply to the board mesh.
- Mapping: phone tilt of ±35° → board tilt of ±18° (tunable). Verify directions: tilt right → right edge dips, tilt top away → far edge dips.
- **Physics approach (robust):** keep the physical floor static and **rotate the gravity vector** to match the board tilt, while the board mesh visually tilts. This avoids kinematic jitter and tunneling. Enable CCD on the ball. Use a fixed timestep (1/120 s) with an accumulator.
- **Shake:** acts as "restart from last checkpoint" (or a short ball boost). Pick one, document it.
- **Filter:** One Euro filter per axis. Defaults `minCutoff 1.2`, `beta 0.05`, `dCutoff 1.0`. These are tunable live from the debug panel, and the defaults must be tuned by feel.

### Levels

- Defined as ASCII grids in `levels/*.json`: `#` wall, `.` floor, `H` hole, `S` start, `G` goal, `C` checkpoint.
- Build **4 levels** of rising difficulty: (1) open tutorial, (2) holes, (3) narrow corridors with checkpoints, (4) combined challenge.
- A unit test must verify each level is solvable (BFS from `S` to `G` avoiding walls and holes) and that exactly one `S` and one `G` exist.
- Holes are sensor colliders. Falling in plays a drop animation, then respawn at the last checkpoint. Goal sensor completes the level and records the time (best times in `localStorage`).

### Screens and UI

- **Lobby/start screen** (this doubles as the showcase page): title, large QR, room code, server address (dropdown if multiple IPs), player slots with names/colors and per-player connection state, "calibrate on your phone" hint, Start button, keyboard fake-controller toggle.
- **Pause/disconnect overlay:** when a player disconnects, pause that board and show "Controller disconnected. Reconnecting…" with a status chip. Resume automatically when the player returns.
- **Status chip** always visible: server link state plus per-player state.
- **Latency HUD** toggled with `L` (see §9).
- **Polish:** soft shadows, a tasteful lighting setup, smooth camera, ball trail, particle burst on goal, synthesized sounds (roll, wall hit, hole, checkpoint, win). Keep 60 fps on a normal laptop.
- **Keyboard fake controller** (arrows/WASD tilt, space shake, R recalibrate) as a virtual player, for dev without a phone.

### Game → phone feedback

- From Rapier contact events, compute impact intensity and send `haptic` (`wall`) to the owning player's phone. Send `hole`, `checkpoint`, `win`, `lost` on those events.
- On level load: send `level` (downsample/pad the level to 25×25, centered). Send `ball` positions at ≤30 Hz when changed by more than ~0.25 cells.

---

## 8. Reconnection and status (cross-cutting)

| Situation | Expected behavior |
|---|---|
| Phone loses hotspot/network briefly | Phone shows `Reconnecting…`, game pauses that board, both recover automatically within a few seconds, same slot, no re-pairing |
| Phone screen locks / app backgrounded | Game pauses that board; on return the app resumes the session |
| Game tab refreshed | Game re-registers with the same room (stored in `sessionStorage`); phones stay in the room and re-link |
| Server restarted | Both sides retry; game requests the same room code; phones rejoin with the room code (tokens are lost; that is acceptable) |
| Phone out of range > 60 s | Slot released; phone needs to rejoin (shows a clear message) |

---

## 9. Latency system

**Goal:** a trustworthy live number and a defensible measured number.

- **Clock sync (phone and game each do this with the server):** every ping measures `t0` (client send), `t1`/`t2` (server receive/send), `t3` (client receive).
  - `rtt = (t3 - t0) - (t2 - t1)`
  - `offset = ((t1 - t0) + (t2 - t3)) / 2`
  - Keep the lowest-RTT sample of the last 8 for the offset.
- The phone stamps each `s` frame with `ts` = its time converted to server time. When the game applies a frame, it computes `age = serverNow_est - ts`. That is the **phone-to-game latency** (includes the server hop; excludes display time).
- **HUD (per player):** RTT p50/p95, phone→game age p50/p95 (rolling 5 s), jitter (stddev of age), received Hz, dropped frames (sequence gaps), game FPS. The app shows RTT and Hz on its controller screen.
- **Design rules that protect latency:** latest-wins, no queues, no compression, Nagle off, small payloads, apply state once per render frame, adaptive filtering instead of heavy smoothing.
- **Real measurement [HUMAN]:** film the phone and the screen together at 240 fps. Count frames between a phone movement and the first on-screen response. Take ≥20 samples, report median and p90, HUD off. Save photos and the table in `docs/latency.md`. Quote the number in the README.

---

## 10. Milestones

### M0: Connectivity spike (a few hours)

- [ ] Minimal server with `/ws` echo and a `ping`→`pong` handler.
- [ ] Minimal Android screen: text field for `ws://ip:port`, sends pings, shows live RTT.
- [ ] **[HUMAN]** On the hotspot: install the APK, run the server, allow the Windows firewall prompt (or run `open-firewall.bat`). Record RTT median/p95 in `docs/latency.md` (draft).
- **Accept:** phone connects to the PC over the hotspot and shows RTT. If median RTT > 20 ms or jitter is large, log findings and mitigations in `docs/DECISIONS.md` (e.g. turn off Wi-Fi power saving on the PC adapter).

### M1: Pipe

- [ ] Real server: rooms, `host`/`hello`/`welcome`, forwarding, QR info endpoint.
- [ ] Game lobby with QR and room code; debug 3D cube driven by incoming `s` frames.
- [ ] App: QR scan + manual entry, sensors, 60 Hz streaming.
- **Accept:** pair by QR in under ~5 s; tilting the phone rotates the cube with no visible lag; manual code entry also works.

### M2: Core requirements hardened

- [ ] Calibration (app screen and `recal` button) with correct relative quaternion.
- [ ] Heartbeat, session tokens, grace period, reconnection (backoff + network callback).
- [ ] Status chips on phone and game; game pauses/resumes on disconnect.
- [ ] Unit tests: calibration math, server rooms/tokens.
- **Accept:** every row in §8 and the test matrix (§11) passes.

### M3: The game

- [ ] `Session`/`Board` structure, level loader, Rapier world with rotated gravity, CCD.
- [ ] 4 levels with solvability tests, holes/checkpoints/goal, timer, best times.
- [ ] One Euro filter, tunable debug panel, lobby polish, synthesized audio, visual polish.
- [ ] Latency HUD (§9) and the clock sync on both clients.
- **Accept:** stable 60 fps; the board visibly mirrors the phone; levels beatable by a person in a few minutes; HUD numbers match expectations.

### M4: Standout features

- [ ] Haptic patterns end-to-end (impact intensity from physics).
- [ ] `GlyphController` + real Glyph Matrix implementation (all display states), with no-op fallback.
- **Accept:** each game event produces a distinct, recognizable haptic; the Glyph Matrix shows searching → connected → mini-map with moving ball → win. **[HUMAN]** verifies on device.

### M5: Local multiplayer (bonus)

- [ ] 2–4 players, viewport grid, per-player boards racing the same level, per-player latency in the HUD, finish ordering.
- **Accept:** 2 phones play simultaneously with independent reconnection; a drop of one does not affect the other.

### M6: Docs, CI, release

- [ ] README (see §12), `docs/architecture.md`, `docs/protocol.md`, `docs/latency.md`.
- [ ] GitHub Actions builds the APK on push and attaches it to a GitHub Release on tag. `start.bat` and `open-firewall.bat` work from a clean checkout.
- [ ] Linting/formatting pass, CI runs server and game tests.
- **Accept:** a fresh clone follows the README and gets to a working demo.

### M7: Final QA and demo **[HUMAN]**

- [ ] Run the full test matrix (§11).
- [ ] Take the 240 fps latency measurement and fill `docs/latency.md`.
- [ ] Record the demo video (§12). Tag `v1.0`, publish the APK release.

**Cut order if time runs short:** multiplayer (M5) → extra levels (keep at least 2) → fancy visual effects. **Never cut M1–M2, haptics, the Glyph Matrix feature, the latency HUD, or the README.**

---

## 11. Test matrix (run in M2 and again in M7)

- Toggle the hotspot off and on mid-game; recovery without re-pairing.
- Walk the phone out of range and back.
- Lock/unlock the phone screen; background/foreground the app.
- Refresh the game tab; restart the server.
- 2–3 phones on the hotspot at once.
- Fresh install of the APK on a clean phone profile and pairing from scratch.
- Wrong/expired room code: clear error message.
- Windows Firewall blocked: server hint and README fix work.
- Multiple network adapters on the PC (VPN/WSL on): QR uses the hotspot IP or the lobby can switch.
- Someone following only the README, cold, succeeds.

---

## 12. Deliverables

### README outline

1. One-line pitch + hero GIF.
2. What it is (requirements checklist with ✅ for each core and bonus item).
3. Quick start (3 steps: join the phone's hotspot with the PC, run `start.bat` / `npm start`, install the APK and scan the QR). Include the Windows Firewall note.
4. Architecture diagram (Mermaid) and a short tech stack rationale.
5. Pairing flow.
6. Calibration and control mapping.
7. **Latency approach** with the measured numbers (HUD data and the 240 fps result).
8. Reconnection behavior.
9. Glyph Matrix and haptics.
10. Project structure, development setup, tests, known limitations, and what's next.

### Demo video (60–90 s)

Laptop screen capture plus a second camera on the phone and hands (back of the phone visible for the Glyph Matrix).

1. Start the server; the QR appears; scan; the Glyph Matrix shows searching → connected.
2. Calibrate.
3. Play a level; the board mirrors the phone; show the latency HUD.
4. Haptics and Glyph mini-map in action.
5. Deliberately turn the hotspot off and on; the game pauses and auto-recovers.
6. Two phones racing (if M5 done).
7. End card with the repo URL and the measured latency number.

Write the shot list into `docs/demo-script.md`.

---

## 13. Out of scope (do not build)

Hosted/cloud relay, WebRTC, binary protocol, web-based phone controller, iOS app, mDNS auto-discovery, accounts, a separate showcase website, or anything not listed above. The game's lobby plus the README plus the video are the showcase.

---

## 14. Default tunables (all in one config file per side)

| Name | Default |
|---|---|
| Server port | 3000 |
| State send rate | 60 Hz |
| Sensor sampling | 100 Hz (10 000 µs) |
| Ping interval | 1 s |
| Dead-link timeout | 3 s |
| Slot grace period | 60 s |
| Reconnect backoff | 250 ms → 2 s cap, jittered |
| Max players | 4 |
| Phone tilt → board tilt | ±35° → ±18° |
| One Euro | minCutoff 1.2, beta 0.05, dCutoff 1.0 |
| Shake threshold / debounce | 14 m/s² / 600 ms |
| Haptic wall-tick rate limit | 80 ms |
| Ball→Glyph update | ≤30 Hz, on change > 0.25 cell |
| Physics timestep | 1/120 s |
