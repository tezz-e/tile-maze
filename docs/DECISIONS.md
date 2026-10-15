# Architectural Decisions Record (ADR)

## ADR 1: 20-Byte Binary ArrayBuffer Telemetry over JSON
- **Context:** Streaming 60–100Hz motion data using JSON causes continuous string allocations, garbage collector pauses, and parsing latency.
- **Decision:** Use a 20-byte fixed binary format with `DataView` on the web and `ByteBuffer` in Kotlin.
- **Consequence:** Zero memory allocation on hot path, sub-millisecond serialization, and zero-copy server forwarding.

## ADR 2: Rotated Gravity Engine over Artificial Velocity Impulses
- **Context:** Pushing the marble with artificial linear velocity forces feels unnatural and arcade-like, and causes kinematic penetration on rotating colliders.
- **Decision:** Keep the physics solver planar and dynamically rotate Rapier's global gravity vector: $\vec{g} = \mathbf{R}_{board} \cdot [0, -9.81, 0]^T$.
- **Consequence:** Mathematically pure physical simulation of a real wooden labyrinth board, with zero mesh tunneling or collider clipping.

## ADR 3: Adaptive One Euro Filter over Fixed Low-Pass Filters
- **Context:** Fixed EMA or low-pass filters introduce lag during sudden flicks or fail to eliminate micro-tremors at rest.
- **Decision:** Implement Casiez's Adaptive One Euro filter dynamically varying cutoff from 1.0Hz at rest to 30Hz under high angular velocity.
- **Consequence:** Rock-solid stability when holding neutral posture with instantaneous response to rapid flicks.

## ADR 4: Single-Port Server for Static Assets and WebSockets
- **Context:** Running a separate Vite dev server and WebSocket server requires managing CORS, firewall ports, and multi-URL pairing.
- **Decision:** Single Node.js server serves both the built game and the WebSocket endpoint on port 3000.
