# TILTMAZE

## Final Engineering Plan --- Motion-Controlled Marble Labyrinth

**Status:** Implementation source of truth\
**Platform:** Android phone + Windows laptop + browser\
**Working name:** Tiltmaze\
**Primary goal:** Build a reliable, low-latency motion controller that
turns an Android phone into the physical control surface for a
browser-based marble maze.

------------------------------------------------------------------------

## 1. Product goal and success criteria

Tiltmaze should feel like a small, polished game---not a networking demo
with a game attached.

The player pairs a phone with a laptop, calibrates a comfortable neutral
holding position, and tilts the phone to guide a marble through a 3D
labyrinth. The game responds immediately, gives clear feedback on
collisions and checkpoints, and recovers gracefully if the connection
drops.

### Required deliverables

-   GitHub repository containing the Android app, server, browser game,
    tests, and documentation.
-   Installable Android APK, preferably attached to a GitHub Release.
-   Browser game served by the local server.
-   A 60--90 second demo recording showing the phone and laptop
    together.
-   README with setup instructions, pairing, architecture, calibration,
    latency methodology, known limitations, and screenshots/GIF.
-   Measured motion-to-photon latency results---not just a displayed
    ping number.

### Core requirements

1.  Read phone orientation and accelerometer data.
2.  Map phone tilt to game controls and use a shake or on-screen action
    as a discrete input.
3.  Pair phone and laptop by QR code or room code.
4.  Stream live controller state over WebSockets.
5.  Calibrate a neutral phone position.
6.  Show connection status on both devices and reconnect without
    requiring a fresh pairing after a brief interruption.

### Bonus requirements

-   Local multiplayer with multiple phones.
-   On-screen controller buttons.
-   Haptic feedback for meaningful game events.
-   Live latency and sensor-rate indicators.
-   Nothing Phone (3) Glyph Matrix feedback.

### Definition of done

The project is complete only when a fresh checkout can be run by
following the README, the APK installs, pairing works on the intended
network, the game is playable, recovery behaviour has been tested, and
the demo video shows the real phone controlling the game.

Do not mark a requirement complete just because code exists. It must
pass its acceptance test.

------------------------------------------------------------------------

## 2. Fixed environment and design decisions

These decisions are defaults. Record any necessary change in
`docs/DECISIONS.md`.

-   **Development computer:** Windows.
-   **Phone:** Nothing Phone (3), Android.
-   **Network:** Phone hotspot; laptop joins the hotspot. The
    application runs locally on this network.
-   **No cloud dependency:** No hosted relay, accounts, or external
    backend.
-   **Transport:** Plain `ws://` / `http://` on the trusted local
    network. Document that this is a deliberate LAN-only choice; do not
    expose the server to the public internet.
-   **Server:** One Node.js process serves the built game and the
    WebSocket endpoint on the same configurable port.
-   **Android:** Kotlin, Jetpack Compose, OkHttp WebSocket, coroutines,
    and Android's native sensor APIs.
-   **Game:** TypeScript, Vite, Three.js, and Rapier physics.
-   **Protocol:** Start with compact JSON messages. At 60 Hz, this is
    adequate for a small local game. Consider binary telemetry only if
    measurements show JSON serialization or message size is a real
    bottleneck.
-   **Priority order:** Reliability and playable controls first; visual
    polish second; optional features after the core passes its tests.

### Important network assumption

The phone and laptop must be able to reach each other while the phone
hotspot is active. Android hotspot/client isolation and Windows Firewall
settings can vary. Validate connectivity before building the complete
app. If the laptop cannot reach the phone or vice versa on a particular
hotspot configuration, document the finding and test a compatible local
Wi-Fi network rather than hiding the failure.

------------------------------------------------------------------------

## 3. Scope and build strategy

Build in vertical slices. Each milestone must leave the repository in a
working state.

### MVP --- must work first

-   One phone controlling one marble.
-   Local server serving the game and WebSocket endpoint.
-   QR pairing plus manual room-code/server-address fallback.
-   Orientation-based controls and calibration.
-   Smooth, controllable physics.
-   Connection status and automatic reconnection.
-   Basic haptics.
-   README and demo video.
-   A latency HUD and a defensible real-world latency measurement.

### Polish pass

-   Four well-designed levels, with a tutorial level first.
-   Checkpoints, clear failure/restart behaviour, timer, and best time.
-   Responsive visual effects and synthesized sound.
-   Useful diagnostics for tilt, received sensor rate, dropped frames,
    RTT, and game FPS.

### Stretch features --- only after the MVP is stable

1.  Nothing Phone (3) Glyph Matrix animations and a tiny maze preview.
2.  Two-player local multiplayer, then expand to four only if time and
    testing permit.
3.  Additional game modes or elaborate visual effects.

**Cut order if time runs short:** four-player support → extra levels
beyond two → elaborate visual effects. Do not cut pairing, calibration,
reconnection, the latency measurement, core gameplay, tests, or usable
documentation. Keep the Glyph feature optional and isolated so it cannot
prevent the base app from running.

------------------------------------------------------------------------

## 4. Repository structure

Use npm workspaces to keep setup simple. Pin dependencies through the
lockfile and use strict TypeScript in the server and game.

``` text
tiltmaze/
├── README.md
├── PLAN.md
├── package.json
├── package-lock.json
├── .gitignore
├── docs/
│   ├── PROGRESS.md
│   ├── DECISIONS.md
│   ├── architecture.md
│   ├── protocol.md
│   ├── latency.md
│   ├── test-matrix.md
│   ├── demo-script.md
│   └── media/
├── server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── RoomManager.ts
│   │   ├── protocol.ts
│   │   ├── networkInterfaces.ts
│   │   └── validation.ts
│   └── test/
├── game/
│   ├── src/
│   │   ├── main.ts
│   │   ├── net/
│   │   ├── input/
│   │   ├── world/
│   │   ├── levels/
│   │   └── ui/
│   └── test/
├── app/
│   ├── app/src/main/
│   └── build.gradle.kts
├── scripts/
│   ├── start.bat
│   └── open-firewall.bat
└── .github/
    └── workflows/
        └── android.yml
```

The exact internal file layout may change as implementation develops,
but keep responsibilities separated: Android sensor/input code, network
protocol, server room management, game input mapping, and physics should
not become one tangled module.

### Root scripts

Provide documented scripts for:

-   `npm install`
-   `npm run dev` --- development server/game workflow.
-   `npm run build` --- production game build.
-   `npm start` --- serve the built game and WebSocket endpoint.
-   `npm test` --- run server and game tests.
-   `npm run typecheck` --- check TypeScript.
-   `npm run lint` --- lint supported TypeScript code.

Provide a `start.bat` that checks dependencies, builds the game if
needed, starts the server, and prints the usable URLs and network
addresses. A firewall helper may be included, but it must explain that
administrator approval may be required and must not silently weaken
firewall settings.

------------------------------------------------------------------------

## 5. Architecture

``` text
┌──────────────────────┐       WebSocket        ┌─────────────────────────┐
│ Android controller   │ ─────────────────────▶ │ Node.js server on laptop│
│                      │ ◀───────────────────── │                         │
│ Sensors, calibration,│                        │ Rooms, pairing, routing,│
│ buttons, haptics,    │                        │ validation, heartbeat   │
│ optional Glyph UI    │                        │ and static game hosting │
└──────────────────────┘                        └────────────┬────────────┘
                                                            │ WebSocket
                                                            ▼
                                                  ┌───────────────────────┐
                                                  │ Browser game          │
                                                  │ Three.js + Rapier     │
                                                  │ Physics, levels, HUD  │
                                                  └───────────────────────┘
```

The server is a relay, not a game engine. It owns room membership,
pairing, message validation, connection state, and routing. The browser
owns game physics and rendering. The phone owns sensor capture,
calibration reference, controller buttons, and haptic playback.

### Connection flow

1.  The browser opens the local game page and requests a room.
2.  The server creates or restores a room and returns a room code plus
    candidate local IP addresses.
3.  The browser displays a QR code containing the server address and
    room code.
4.  The phone scans the QR code, or the user enters the address and code
    manually.
5.  The server validates the join request and assigns a player slot.
6.  The phone calibrates its neutral pose and begins streaming state.
7.  The browser updates the game from the latest valid controller state.
8.  If the phone disconnects, the affected player is paused and the
    server reserves the slot temporarily.
9.  On reconnection, the phone resumes its previous slot when its
    session token is still valid.

The QR code is a convenience, not the only way to connect. Manual entry
must remain available.

------------------------------------------------------------------------

## 6. WebSocket protocol

Document every message in `docs/protocol.md`. Validate incoming messages
at the server boundary and reject malformed or oversized payloads.

Use JSON text frames for the first version. Keep high-frequency state
messages small and avoid sending data the game does not need.

### Message types

  ------------------------------------------------------------------------
  Direction               Type                    Purpose
  ----------------------- ----------------------- ------------------------
  Game → server           `host`                  Request a room;
                                                  optionally request a
                                                  known room after a page
                                                  refresh

  Server → game           `hosted`                Return room code, port,
                                                  and candidate LAN
                                                  addresses

  Phone → server          `hello`                 Join a room with room
                                                  code, device name, and
                                                  optional session token

  Server → phone          `welcome`               Confirm pairing and
                                                  return player ID, slot,
                                                  colour, and session
                                                  token

  Server → phone          `reject`                Explain a failed join,
                                                  such as invalid code or
                                                  full room

  Server → game           `players`               Report
                                                  connected/disconnected
                                                  player slots

  Server → phone          `host_status`           Tell the phone whether
                                                  the browser host is
                                                  connected

  Phone → game via server `s`                     Latest orientation and
                                                  acceleration state

  Phone → game via server `shake`                 Debounced discrete shake
                                                  event

  Phone → game via server `btn`                   Pause, action, or
                                                  recalibration event

  Phone/game ↔ server     `ping` / `pong`         Heartbeat, RTT, and
                                                  clock-offset estimation

  Game → phone via server `haptic`                Haptic event for a
                                                  specific player

  Game → phone via server `level`                 Optional compact level
                                                  representation for Glyph
                                                  preview

  Game → phone via server `ball`                  Optional ball position
                                                  for Glyph preview

  Game → phone via server `glyph`                 Optional high-level
                                                  Glyph animation state
  ------------------------------------------------------------------------

### Controller-state message

The state message should include:

-   `seq`: incrementing sequence number.
-   `ts`: client timestamp, with clock-offset correction if enabled.
-   `q`: orientation relative to the calibrated neutral pose,
    represented as a quaternion `[w, x, y, z]`.
-   `a`: linear acceleration `[x, y, z]`, used for shake
    detection/debugging where needed.
-   Optional button state if buttons are held rather than emitted as
    discrete events.

Use a sequence number to identify gaps and out-of-order messages. The
game should use **latest-wins** behaviour for continuous sensor state:
never build a backlog of stale tilt messages. Discrete events such as
`shake` and button presses must be handled separately so they are not
lost simply because a newer sensor frame arrived.

### Network rules

-   One host per room; start with two phone slots as the multiplayer
    target.
-   Four-character room codes should avoid ambiguous characters such as
    `0/O` and `1/I`.
-   Use a random session token to reclaim a slot after a brief
    disconnect.
-   Reserve a disconnected slot for 60 seconds, then release it.
-   Ping approximately once per second; treat a connection as dead after
    several missed heartbeats.
-   Drop stale continuous-state messages if the socket is backed up; do
    not queue seconds of old motion data.
-   Validate message types, finite numeric values, arrays, sizes, room
    membership, and player ownership.
-   Do not trust a client-supplied player ID to route a message to
    another player's phone.
-   Disable WebSocket compression unless measurements justify it.
-   Keep logs useful and bounded; avoid logging every 60 Hz sensor frame
    in normal operation.

------------------------------------------------------------------------

## 7. Android controller app

### Stack

-   Kotlin and Jetpack Compose.
-   OkHttp WebSocket client.
-   Kotlin coroutines.
-   Android `SensorManager`.
-   Google Play Services code scanner or another maintained QR scanning
    option, with manual pairing fallback.
-   `VibrationEffect` for haptics.
-   Nothing's official Glyph Matrix SDK behind an optional interface.

Use a supported Android SDK and document the chosen minimum/target SDK.
Do not assume the Glyph SDK is available on every Android phone.

### Screens

#### Screen A --- Pair

-   Scan QR button.
-   Manual server address and room-code fields.
-   Connection result and plain-language errors.
-   Helpful troubleshooting text for hotspot and Windows Firewall
    problems.

#### Screen B --- Calibrate

-   Ask the user to hold the phone in a comfortable neutral pose.
-   Capture the reference orientation after a short countdown.
-   Show confirmation and a live tilt preview.
-   Allow recalibration at any time.

#### Screen C --- Controller

-   Connection state: `Connecting`, `Waiting for game`, `Connected`,
    `Reconnecting`, or `Disconnected`.
-   Player slot/name and colour.
-   Tilt indicator with a visible neutral/deadzone region.
-   Live RTT, received sensor rate, and optional diagnostics.
-   Large, accessible buttons for recalibrate, pause, and action/jump.
-   Keep the screen awake during active play.
-   Pause streaming or notify the game when the app is backgrounded.

#### Screen D --- Settings

Keep this small. Include player name, sensitivity, haptics toggle, and
Glyph toggle. Do not add settings without a demonstrated need.

### Sensor capture

-   Use `TYPE_GAME_ROTATION_VECTOR` for orientation where available; it
    avoids dependence on a magnetometer.
-   Convert the rotation vector to a quaternion using Android's
    supported APIs.
-   Use `TYPE_LINEAR_ACCELERATION` for shake detection.
-   Sample sensors around 100 Hz where the device supports it, and send
    the latest state at 60 Hz.
-   Send only the newest sample on each send tick; never replay a
    backlog.
-   Handle unavailable sensors and lifecycle changes gracefully.
-   Verify the axis directions on the real phone before tuning the game.

### Calibration

Let `q_ref` be the orientation captured at calibration and `q_current`
be the current orientation. Calculate relative orientation using a
consistent quaternion convention, for example:

`q_rel = inverse(q_ref) * q_current`

Quaternion multiplication order depends on the coordinate convention.
Verify the result with unit tests and a live axis-debug view rather than
assuming the formula's signs are correct.

Map the relative orientation to pitch/roll control values in the game.
Clamp extreme tilt and provide a small configurable deadzone around
neutral. The calibration reference belongs on the phone; the game should
receive orientation relative to the user's chosen neutral pose.

### Shake detection

-   Use linear acceleration rather than raw acceleration so gravity is
    removed.
-   Start with a tunable threshold and debounce interval; a reasonable
    initial threshold is approximately 14 m/s² with a 600 ms cooldown.
-   Tune it on the actual device. Thresholds vary by hardware and how
    firmly the phone is held.
-   Send a discrete `shake` event once per detected action, not a
    repeated event on every sensor sample.
-   Provide an on-screen action button as a reliable fallback.

### Reconnection and lifecycle

-   Store the room, server address, and session token locally.
-   Use exponential reconnect backoff with jitter, capped at a few
    seconds.
-   Retry promptly when Android reports network connectivity has
    returned.
-   Resume the previous player slot if the token is still valid.
-   Stop or suspend sensor streaming when the app is backgrounded; tell
    the game to pause that player's board.
-   Never claim that reconnection works until it has been tested with
    the hotspot toggled off and on.

### Haptics

Map game events to short, distinguishable vibration patterns:

  Event                Feedback
  -------------------- ---------------------------
  Light wall contact   Short light tick
  Strong collision     Stronger short pulse
  Hole/fall            Longer warning pulse
  Checkpoint           Double pulse
  Win                  Short celebratory pattern
  Lost connection      Distinct warning pulse

Rate-limit repetitive wall-contact feedback to avoid constant buzzing.
Respect the app's haptics setting and check device support.

### Glyph Matrix --- optional module

Use the official Nothing Glyph Matrix developer kit and follow its
current setup instructions. Put all SDK calls behind a `GlyphController`
interface with a no-op implementation.

Suggested states:

-   Pairing: searching/radar animation.
-   Connected: confirmation animation.
-   Playing: compact maze preview with a ball marker, if the SDK
    supports the required display updates.
-   Win/loss/disconnect: distinct short animation.

The Glyph Matrix faces away from the player, so treat it as a secondary
status display and demo feature, not the primary game HUD. The game and
controller must work correctly when Glyph support is disabled or
unavailable. Device-specific setup, debug mode, keys, and SDK
verification are explicit manual test steps.

------------------------------------------------------------------------

## 8. Browser game: Tiltmaze

### Stack

-   Vite + TypeScript.
-   Three.js for rendering.
-   Rapier for rigid-body physics and collision events.
-   Web Audio for simple synthesized sound effects.
-   No account system, external assets service, or cloud requirement.

Keep the game performant on an ordinary laptop. Prefer a small number of
well-designed assets and readable visual feedback over elaborate
effects.

### Core mechanic

The phone's orientation controls the virtual board's tilt. The marble
rolls through a maze under physics simulation.

-   Phone tilt of approximately ±35° maps to a smaller board tilt,
    initially around ±18°.
-   Sensitivity and filtering must be tunable during development.
-   Tilt right should move the marble right; tilting the top edge away
    should have a consistent, documented effect.
-   Verify all axis signs on the physical device.
-   Use a fixed physics timestep (initially 1/120 s) with an
    accumulator.
-   Keep the physical floor stable and apply the tilt to the effective
    gravity vector while rendering the board's tilt. This is a practical
    way to avoid unnecessary collider instability; verify the visual and
    physical behaviour together.
-   Enable continuous collision detection on the marble if testing shows
    tunnelling.
-   Use a deadzone around neutral, but avoid excessive smoothing that
    makes the controller feel sluggish.
-   The render loop should read the latest controller state and apply
    input once per frame. Do not interpolate a long queue of stale
    sensor messages.
-   If the controller state becomes stale or the player disconnects,
    pause that player's board rather than continuing with an old tilt.

### Filtering

Start with a One Euro filter per control axis, with initial values such
as:

-   `minCutoff = 1.2`
-   `beta = 0.05`
-   `dCutoff = 1.0`

Treat these as starting points, not guaranteed optimal values. Tune by
feel on the real phone and expose a small debug control for
sensitivity/filter settings during development. Record final values in
the documentation.

### Shake/action behaviour

Choose one clear action and keep it consistent. Default: the action
button or a detected shake restarts the marble at the latest checkpoint
after a fall. If testing shows that shake-to-restart is awkward, use
shake for a short jump/boost instead---but choose one behaviour,
document it, and avoid accidental triggers.

### Levels

Start with two levels for the MVP, then add up to four:

1.  **Tutorial:** broad paths, no holes, teaches tilt.
2.  **Precision:** holes and a few narrow turns.
3.  **Checkpoint course:** narrow corridors and checkpoints.
4.  **Challenge:** combined hazards and more difficult routes.

Represent levels as simple data files, such as ASCII grids or typed
JSON:

-   `#` wall
-   `.` floor
-   `H` hole
-   `S` start
-   `G` goal
-   `C` checkpoint

Write a test that verifies every level has exactly one start and one
goal and that the goal is reachable from the start without crossing
walls or holes. The test does not replace playtesting; also verify that
the physical maze is actually beatable.

When the marble falls into a hole, play a clear fall animation and
return it to the latest checkpoint. The goal should stop the timer, show
a clear success state, and save the best time in `localStorage`.

### Visual and audio polish

Prioritize:

-   A clear view of the board and marble.
-   Distinct walls, holes, checkpoints, and goal.
-   Smooth camera movement that does not obscure the maze.
-   Subtle marble trail and restrained collision/goal effects.
-   Synthesized rolling, collision, checkpoint, fall, and success
    sounds.
-   Clear start, pause, restart, and completion states.
-   Stable performance near 60 FPS on the target laptop.

Avoid visual effects that make it harder to see the path or add latency.

### Lobby and HUD

The game lobby should show:

-   Room code and QR code.
-   Candidate server address, with a way to switch if automatic
    selection chooses the wrong network adapter.
-   Player slots and connection states.
-   A live tilt preview.
-   A clear instruction to calibrate on the phone before starting.
-   Start button and keyboard fallback for development.

The in-game HUD should show:

-   Timer and level.
-   Connection state.
-   Optional latency diagnostics, toggled with a key such as `L`.
-   Pause/restart instructions.

### Keyboard fallback

Support arrows/WASD for tilt, Space for action, and `R` for
recalibration or reset as appropriate. This allows the game and physics
to be developed without the phone connected. Label it as a development
fallback, not the primary controller.

------------------------------------------------------------------------

## 9. Latency: measure honestly

A live ping number is useful, but it is not the same as end-to-end
controller latency.

### Live metrics

Measure and label these separately:

-   **RTT:** round-trip network time to the server.
-   **Phone-to-game state age:** estimated time between a sensor sample
    and its application by the game, when clock synchronization is
    available.
-   **Received rate:** state frames received per second.
-   **Sequence gaps:** approximate lost or skipped state frames.
-   **Jitter:** variation in state age over a rolling window.
-   **Game FPS:** browser rendering rate.

Use a four-timestamp exchange where possible:

-   `t0`: client sends ping.
-   `t1`: server receives it.
-   `t2`: server sends pong.
-   `t3`: client receives pong.

Then estimate:

-   `RTT = (t3 - t0) - (t2 - t1)`
-   `clockOffset = ((t1 - t0) + (t2 - t3)) / 2`

Use a low-RTT recent sample to reduce the effect of scheduling jitter.
Document the timestamp clock used on each platform and verify the
calculations with tests.

Do not label `RTT / 2` as a guaranteed one-way latency measurement. The
route may be asymmetric, and clock and scheduling error remain.

### Real motion-to-photon test

For the final measurement:

1.  Record the phone and laptop display together at 240 fps or the
    highest practical frame rate.
2.  Perform at least 20 distinct, repeatable phone tilts.
3.  Count frames from the first visible phone movement to the first
    visible game response.
4.  Convert frame counts to milliseconds.
5.  Report the median and 90th percentile, plus recording frame rate and
    test conditions.
6.  Save the raw observations and calculation in `docs/latency.md`.

The test includes sensor sampling, processing, network, game update, and
display response. It is not a laboratory-grade instrument, but it is
more honest and useful than reporting ping alone.

### Latency design rules

-   Send the latest state at 60 Hz.
-   Never queue stale motion frames.
-   Keep messages small.
-   Avoid unnecessary work in the sensor callback.
-   Avoid expensive filtering or allocations in the hot path.
-   Keep physics stepping independent of render frame rate.
-   Do not add interpolation unless testing shows it improves the
    experience; interpolation can introduce intentional delay.
-   Measure before optimizing.

------------------------------------------------------------------------

## 10. Server implementation

### Room manager

Maintain an in-memory map of room codes to sessions. Each session
contains one game host and the configured number of controller slots.

Each player slot should track:

-   Player ID and slot.
-   Display name and colour.
-   Connection state.
-   Session token.
-   Last heartbeat time.
-   Disconnect time, if applicable.

### IP discovery

List non-internal IPv4 interfaces and display plausible private LAN
addresses. Exclude common virtual adapters where practical, but do not
assume adapter names are consistent. Show candidate addresses in the
lobby so the user can select the correct one.

Do not hardcode a laptop IP. The server should print the game URL,
WebSocket URL, candidate LAN IPs, and a helpful Windows Firewall hint at
startup.

### Reliability and security within scope

-   Validate room codes and session tokens.
-   Enforce room capacity and message-size limits.
-   Check that a controller belongs to the room receiving its messages.
-   Reclaim a player's slot only with a valid session token.
-   Keep the server bound to the intended interfaces and document its
    LAN-only exposure.
-   Provide `/health` for simple diagnostics.
-   Do not add authentication/account infrastructure beyond what the
    local demo needs.

### Tests

Use Vitest or an equivalent TypeScript test runner for:

-   Room creation and joining.
-   Invalid room codes and full rooms.
-   Session-token recovery inside and outside the grace period.
-   Message validation.
-   Routing to the correct room and player.
-   Disconnect notifications and slot release.
-   Latest-state/backpressure behaviour.
-   Heartbeat timeout handling.

------------------------------------------------------------------------

## 11. Milestones and acceptance tests

Work in order. After each milestone, update `docs/PROGRESS.md`, record
decisions in `docs/DECISIONS.md`, run the relevant tests, and commit
with a message such as `M1: connect phone to local server`.

### M0 --- Connectivity spike

Build the smallest possible WebSocket echo/ping server and a minimal
Android screen that connects to a manually entered `ws://` address.

**Acceptance:** - Server starts on Windows. - Phone connects through the
intended hotspot/network. - The phone displays live RTT. - Windows
Firewall and hotspot limitations are documented. - Record initial median
and p95 RTT.

Do not proceed until the physical phone and laptop can communicate
reliably.

### M1 --- End-to-end control pipe

Implement room creation/joining, QR generation, manual pairing, sensor
streaming, and a browser debug object/cube that responds to phone tilt.

**Acceptance:** - QR pairing works, with manual fallback. - The phone's
tilt visibly controls the browser scene. - Axis directions are
correct. - Sensor updates do not accumulate in a backlog. - The game can
be tested with the keyboard fallback.

### M2 --- Calibration and resilience

Implement neutral-pose calibration, filtering, connection states,
heartbeat, session tokens, disconnect handling, and automatic
reconnection.

**Acceptance:** - Calibration works from different comfortable holding
angles. - Unit tests verify quaternion math and axis conventions. - A
short network interruption recovers without re-pairing. - A disconnected
player's board pauses. - Invalid room codes and full rooms show
understandable errors.

### M3 --- Playable MVP maze

Implement the first complete level, marble physics, holes/fall recovery,
goal, timer, pause/restart, and basic audio/visual feedback.

**Acceptance:** - A person can complete the level with the phone. -
Physics remain stable at varying render frame rates. - The game remains
responsive during normal local-network use. - The level is tested on the
actual laptop and phone. - Keyboard fallback can complete the level too.

### M4 --- Diagnostics and reliability

Add the latency HUD, received-rate and dropped-frame counters,
clock-offset estimation, server validation, automated tests, and network
failure handling.

**Acceptance:** - Displayed metrics have clear definitions. - Test
results agree with expected calculations. - Hotspot toggling and app
background/foreground behaviour are tested. - No stale controller state
drives the game after disconnect.

### M5 --- Game polish

Add the remaining planned levels, checkpoints, best times, refined
visuals, and sound.

**Acceptance:** - Each level passes structural/solvability tests. - Each
level is manually playable. - The game sustains approximately 60 FPS on
the target laptop. - Visual effects do not obscure hazards or control
feedback.

### M6 --- Haptics and Glyph Matrix

Complete end-to-end haptic feedback. Add Glyph support behind the
optional `GlyphController` interface.

**Acceptance:** - Haptic patterns are distinct and rate-limited. - The
app remains fully functional with Glyph disabled. - On the Nothing Phone
(3), supported Glyph states are verified on the real device. - Any
required SDK setup or device-debug steps are documented.

### M7 --- Multiplayer

Implement two-player support first. Expand to four only after two-player
testing is reliable.

**Acceptance:** - Each phone controls only its assigned player. - Player
states, haptics, and latency metrics are associated with the correct
slot. - One player's disconnect does not break the other player's
connection. - Two phones can play simultaneously on the target network.

### M8 --- Packaging, documentation, and final QA

Finish the README, CI, release APK, demo script, and measured latency
report.

**Acceptance:** - A fresh clone can be run using the documented steps. -
CI builds the Android APK and runs server/game tests. - The release APK
installs on the target phone. - The demo recording shows real phone
control, pairing, calibration, feedback, and measured latency. - Known
limitations are stated plainly.

------------------------------------------------------------------------

## 12. Test matrix

Run the relevant tests during M2 and repeat the full matrix before
release.

-   Fresh install and first-time pairing.
-   QR scan and manual entry.
-   Invalid/expired room code.
-   Server unavailable during pairing.
-   Windows Firewall blocking the server.
-   Multiple network adapters enabled (VPN, WSL, virtual machines).
-   Hotspot disabled and re-enabled during play.
-   Phone temporarily out of range.
-   Phone app backgrounded and restored.
-   Phone screen locked/unlocked.
-   Browser tab refreshed.
-   Server restarted.
-   Phone rejoins inside and outside the 60-second grace period.
-   Two phones connected simultaneously.
-   Repeated collisions do not cause constant haptics.
-   Shake detection does not trigger repeatedly while the phone is held
    still.
-   Calibration works after rotating the phone to a different neutral
    pose.
-   Level files pass solvability and start/goal tests.
-   Keyboard fallback can complete each level.
-   A clean checkout follows the README successfully.

Record pass/fail and notes in `docs/PROGRESS.md` or
`docs/test-matrix.md`.

------------------------------------------------------------------------

## 13. CI, packaging, and documentation

### CI

Use GitHub Actions to:

-   Install pinned Node dependencies.
-   Run formatting/lint/type checks.
-   Run server and game tests.
-   Build the browser game.
-   Build the Android APK where the runner/toolchain supports it.
-   Attach the APK to a GitHub Release when a version tag is pushed.

Keep CI failures visible; do not bypass failing tests merely to produce
an APK.

### README outline

1.  One-sentence project pitch and demo GIF.
2.  Feature checklist separating completed, tested, and planned
    features.
3.  Requirements and quick start.
4.  Windows Firewall and hotspot troubleshooting.
5.  Architecture diagram and technology choices.
6.  Pairing flow and QR/manual setup.
7.  Sensor mapping, calibration, and control instructions.
8.  Reconnection behaviour.
9.  Latency definitions, measurement procedure, and actual results.
10. Haptics and optional Glyph Matrix support.
11. Repository structure, development commands, and tests.
12. Known limitations and next steps.

Do not claim a latency number, feature, or test result that has not
actually been measured or completed.

### Demo video --- 60--90 seconds

1.  Start the local server and show the room QR/code.
2.  Scan with the phone and show the connected state.
3.  Calibrate the phone.
4.  Tilt the phone and show immediate marble movement.
5.  Demonstrate a collision, checkpoint/fall, and haptic feedback.
6.  Show the latency HUD briefly.
7.  Demonstrate reconnection by briefly interrupting the network, if it
    is reliable enough to show.
8.  Show Glyph feedback and multiplayer only if those features are
    complete.
9.  End with the repository and actual measured latency result.

Record the shot list in `docs/demo-script.md`.

------------------------------------------------------------------------

## 14. Implementation rules for the coding agent

-   Work milestone by milestone; do not generate the entire project in
    one unverified pass.
-   Make reasonable engineering decisions without repeatedly asking the
    user. Record non-obvious decisions in `docs/DECISIONS.md`.
-   Stop and request human action only when physical-device testing,
    hotspot configuration, Android permissions, or Glyph debug setup is
    required.
-   Keep dependencies minimal and pinned.
-   Use strict TypeScript in the server and game.
-   Add tests for protocol, room management, quaternion math, level
    validation, and latency calculations.
-   Run the relevant checks at the end of every milestone.
-   Do not claim a test passed unless it was run and its result was
    observed.
-   Avoid hardcoded IP addresses, unexplained magic numbers, dead code,
    noisy logs, and unhandled promise failures.
-   Provide concise progress updates: completed, verified, blocked, and
    next step.
-   If a required SDK/API differs from this plan, inspect the
    installed/current official documentation and adapt the
    implementation. Do not invent APIs.
-   Keep the app usable without the Glyph SDK.
-   Prefer a smaller, verified working implementation over a large
    unfinished feature set.

------------------------------------------------------------------------

## 15. Out of scope

Do not build these unless the core project is already complete and there
is a clear reason:

-   Cloud relay or hosted backend.
-   WebRTC.
-   A binary telemetry protocol before profiling demonstrates a need.
-   iOS app.
-   Web-based phone controller.
-   Accounts, analytics, or cloud saves.
-   mDNS auto-discovery.
-   A separate marketing/showcase website.
-   More game modes that dilute polish on the marble maze.

The game lobby, a well-documented repository, a reliable APK, and a
clear demo video are the showcase.

------------------------------------------------------------------------

## 16. Initial configuration

Keep tunable values in named configuration files rather than scattering
constants across the codebase.

  ------------------------------------------------------------------------
  Setting                              Initial value Notes
  --------------------- ---------------------------- ---------------------
  Server port                                 `3000` Configurable through
                                                     `PORT`

  Sensor sampling                           `100 Hz` Use supported rate;
                                                     actual rate may vary

  State send rate                            `60 Hz` Latest sample only

  Heartbeat interval                           `1 s` Used for health and
                                                     RTT

  Dead-link timeout                            `3 s` Tune against real
                                                     test results

  Slot grace period                           `60 s` Allows brief
                                                     reconnection

  Reconnect backoff                `250 ms` to `2 s` Add jitter

  Initial maximum                                `2` Expand only after
  players                                            reliable two-player
                                                     tests

  Phone tilt mapping              ±35° to about ±18° Tune for comfort and
                                                     controllability

  Filter                           One Euro, initial Tune on device
                                  `1.2 / 0.05 / 1.0` 

  Shake threshold                    About `14 m/s²` Device-dependent;
                                                     tune

  Shake debounce                            `600 ms` Prevent repeated
                                                     triggers

  Physics timestep                         `1/120 s` Fixed-step
                                                     accumulator

  Target rendering                          `60 FPS` Measure on target
                                                     laptop
  ------------------------------------------------------------------------

These are starting values, not promises of performance. Validate them on
the actual hardware and record important adjustments in
`docs/DECISIONS.md`.

------------------------------------------------------------------------

## Final principle

**Prove the connection, then prove the controls, then make the game
excellent.** Keep the first playable version small and reliable. Add the
Glyph Matrix and multiplayer only on top of a core experience that
already works.
