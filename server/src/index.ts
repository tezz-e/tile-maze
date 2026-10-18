import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import {
  PACKET_SIZE,
  PACKET_TYPE_TELEMETRY,
  peekPacketType,
  peekPlayerSlot,
  parseControlMessage,
  serializeControlMessage,
  type ControlMessage,
} from '@tiltmaze/protocol';
import { getPrimaryLanIp, getLanInterfaces } from './networkDiscovery.js';
import { RoomManager, DEFAULT_GRACE_PERIOD_MS } from './RoomManager.js';
import { handleNtpPing } from './ntpSync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0'; // Listen on all network interfaces for LAN connectivity

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, perMessageDeflate: false });
const roomManager = new RoomManager();

// Track alive status for TCP keep-alive
interface ExtWebSocket extends WebSocket {
  isAlive?: boolean;
}

// Enable JSON middleware and CORS
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// API endpoint to discover server info, primary LAN IP, and room stats
app.get('/api/info', (req, res) => {
  const lanIp = getPrimaryLanIp();
  const allIps = getLanInterfaces();
  res.json({
    status: 'online',
    port: PORT,
    lanIp,
    allIps,
    activeRooms: roomManager.getActiveRoomCount(),
    timestamp: Date.now(),
  });
});

// Direct APK Download Endpoint (For judges & quick sideloading without Android Studio)
const apkCandidatePaths = [
  path.resolve(__dirname, '../../app-debug.apk'),
  path.resolve(__dirname, '../../app/app/build/outputs/apk/debug/app-debug.apk'),
];

app.get(['/apk', '/download/apk', '/tiltmaze.apk'], (req, res) => {
  for (const apkPath of apkCandidatePaths) {
    if (fs.existsSync(apkPath)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="Tiltmaze-Controller.apk"');
      return res.sendFile(apkPath);
    }
  }
  res.status(404).send('APK not found on server. Please download from GitHub Releases or build via `./gradlew assembleDebug`.');
});

// Serve built game static files from game/dist if available
const gameDistPath = path.resolve(__dirname, '../../game/dist');
if (fs.existsSync(gameDistPath)) {
  console.log(`[Static] Serving web game from ${gameDistPath}`);
  app.use(
    express.static(gameDistPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      },
    })
  );
  // SPA fallback to index.html
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(gameDistPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    const lanIp = getPrimaryLanIp();
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Tiltmaze: Kinetic Edition - Server</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #0b0f19; color: #f3f4f6; padding: 2rem; }
            .card { background: #161e2e; border: 1px solid #374151; padding: 1.5rem; border-radius: 8px; max-width: 600px; margin: auto; }
            h1 { color: #38bdf8; margin-top: 0; }
            code { background: #1f2937; padding: 0.2rem 0.4rem; border-radius: 4px; color: #a5f3fc; }
            .badge { display: inline-block; background: #059669; color: #fff; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.85rem; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Tiltmaze Relay Server</h1>
            <p><span class="badge">ONLINE</span> Running on port <code>${PORT}</code></p>
            <p><strong>Primary LAN IP:</strong> <code>${lanIp}</code></p>
            <p><strong>WebSocket URL:</strong> <code>ws://${lanIp}:${PORT}</code></p>
            <p>Game build directory not found. Run <code>npm run build</code> or start the Vite dev server with <code>npm run dev:game</code>.</p>
          </div>
        </body>
      </html>
    `);
  });
}

/**
 * Safely dispatches data over a WebSocket without throwing on closing states.
 */
export function safeSend(ws: WebSocket | null | undefined, data: any, options?: { binary?: boolean }): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(data, options as any, (err) => {
        if (err) console.warn('[WebSocket Send Error]', err.message);
      });
    } catch (err: any) {
      console.warn('[WebSocket Send Exception]', err.message);
    }
  }
}

/**
 * Processes incoming WebSocket message frames (binary telemetry or JSON control).
 */
export function onMessage(socket: ExtWebSocket, raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean): void {
  // =========================================================================
  // 1. DATA PLANE: Zero-Copy Binary Telemetry Hot Path (60Hz)
  // =========================================================================
  if (isBinary) {
    let buf: Buffer;
    if (Buffer.isBuffer(raw)) {
      buf = raw;
    } else if (raw instanceof ArrayBuffer) {
      buf = Buffer.from(raw);
    } else if (Array.isArray(raw)) {
      buf = Buffer.concat(raw);
    } else {
      return;
    }

    if (buf.length < PACKET_SIZE) return;

    const pType = peekPacketType(buf);
    if (pType !== PACKET_TYPE_TELEMETRY) return;

    const meta = roomManager.getSocketMetadata(socket);
    if (!meta || meta.role !== 'controller') return;

    if (meta.slot) {
      buf[1] = meta.slot;
    }

    const room = roomManager.getRoom(meta.roomCode);
    if (room && room.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
      // Backpressure check: if host socket send buffer exceeds ~2KB, drop frame to prevent latency spikes
      if (room.hostSocket.bufferedAmount > 2048) {
        return;
      }
      // Zero-copy direct pass-through to the laptop host socket
      safeSend(room.hostSocket, buf, { binary: true });
    }
    return;
  }

  // =========================================================================
  // 2. CONTROL PLANE: JSON Message Dispatcher
  // =========================================================================
  const text = Buffer.isBuffer(raw)
    ? raw.toString('utf-8')
    : Array.isArray(raw)
      ? Buffer.concat(raw).toString('utf-8')
      : raw instanceof ArrayBuffer
        ? Buffer.from(raw).toString('utf-8')
        : String(raw);
  const msg = parseControlMessage(text);
  if (!msg) {
    console.warn(`[WebSocket] Dropped malformed message: ${text.length > 256 ? text.slice(0, 256) + '...' : text}`);
    return;
  }

  switch (msg.type) {
    case 'HOST_CREATE_ROOM': {
      const { room, hostSessionId } = roomManager.createRoom(socket);
      const lanIp = getPrimaryLanIp();
      const reply: ControlMessage = {
        type: 'ROOM_CREATED',
        roomCode: room.code,
        hostSessionId,
        lanIp,
        port: PORT,
      };
      safeSend(socket, serializeControlMessage(reply));
      console.log(`[Room] Host created room ${room.code} (LAN: ${lanIp}:${PORT})`);
      break;
    }

    case 'HOST_RECONNECT': {
      const reconnected = roomManager.reconnectHost(msg.roomCode, msg.hostSessionId, socket);
      const lanIp = getPrimaryLanIp();
      if (reconnected) {
        const room = roomManager.getRoom(msg.roomCode)!;
        const reply: ControlMessage = {
          type: 'ROOM_CREATED',
          roomCode: room.code,
          hostSessionId: msg.hostSessionId,
          lanIp,
          port: PORT,
        };
        safeSend(socket, serializeControlMessage(reply));
        console.log(`[Room ${room.code}] Host reconnected with session ${msg.hostSessionId}`);
        for (const player of room.players.values()) {
          if (player.connected) {
            const joinNotif: ControlMessage = {
              type: 'PLAYER_JOINED',
              playerSlot: player.slot,
              sessionId: player.sessionId,
              deviceName: player.deviceName,
            };
            safeSend(socket, serializeControlMessage(joinNotif));
          }
        }
      } else {
        const { room, hostSessionId } = roomManager.createRoom(socket);
        const reply: ControlMessage = {
          type: 'ROOM_CREATED',
          roomCode: room.code,
          hostSessionId,
          lanIp,
          port: PORT,
        };
        safeSend(socket, serializeControlMessage(reply));
        console.log(`[Room] Host reconnect failed for ${msg.roomCode}; created new room ${room.code}`);
      }
      break;
    }

    case 'JOIN_ROOM': {
      const result = roomManager.joinRoom(msg.roomCode, socket, msg.sessionId, msg.deviceName);
      if (!result.success) {
        const err: ControlMessage = {
          type: 'ERROR',
          code: result.error,
          message: result.message,
        };
        safeSend(socket, serializeControlMessage(err));
        return;
      }

      // Send confirmation back to controller
      const joinedMsg: ControlMessage = {
        type: 'JOINED_ROOM',
        roomCode: result.room.code,
        playerSlot: result.slot,
        sessionId: result.sessionId,
        assignedName: result.assignedName,
      };
      safeSend(socket, serializeControlMessage(joinedMsg));

      // Notify host
      if (result.room.hostSocket && result.room.hostSocket.readyState === WebSocket.OPEN) {
        if (result.reconnected) {
          const reconMsg: ControlMessage = {
            type: 'PLAYER_RECONNECTED',
            playerSlot: result.slot,
            sessionId: result.sessionId,
          };
          safeSend(result.room.hostSocket, serializeControlMessage(reconMsg));
          console.log(`[Room ${result.room.code}] Player ${result.slot} reconnected (session: ${result.sessionId})`);
        } else {
          const joinNotif: ControlMessage = {
            type: 'PLAYER_JOINED',
            playerSlot: result.slot,
            sessionId: result.sessionId,
            deviceName: result.assignedName,
          };
          safeSend(result.room.hostSocket, serializeControlMessage(joinNotif));
          console.log(`[Room ${result.room.code}] Player ${result.slot} joined: ${result.assignedName}`);
        }
      }
      break;
    }

    case 'NTP_PING': {
      const pong = handleNtpPing(msg);
      safeSend(socket, serializeControlMessage(pong));
      break;
    }

    case 'HAPTIC_EVENT': {
      // Forward from host to designated controller
      const meta = roomManager.getSocketMetadata(socket);
      if (meta && meta.role === 'host') {
        const room = roomManager.getRoom(meta.roomCode);
        if (room) {
          const targetPlayer = room.players.get(msg.playerSlot);
          if (targetPlayer && targetPlayer.socket && targetPlayer.socket.readyState === WebSocket.OPEN) {
            safeSend(targetPlayer.socket, serializeControlMessage(msg));
          }
        }
      }
      break;
    }

    case 'CALIBRATE_REQUEST': {
      // Forward to controller
      const meta = roomManager.getSocketMetadata(socket);
      if (meta && meta.role === 'host') {
        const room = roomManager.getRoom(meta.roomCode);
        if (room) {
          if (msg.playerSlot) {
            const target = room.players.get(msg.playerSlot);
            if (target?.socket?.readyState === WebSocket.OPEN) {
              safeSend(target.socket, serializeControlMessage(msg));
            }
          } else {
            for (const p of room.players.values()) {
              if (p.socket?.readyState === WebSocket.OPEN) {
                safeSend(p.socket, serializeControlMessage(msg));
              }
            }
          }
        }
      }
      break;
    }

    case 'CALIBRATE_COMPLETE': {
      // Controller notified calibration finished; forward to host
      const meta = roomManager.getSocketMetadata(socket);
      if (meta && meta.role === 'controller') {
        const room = roomManager.getRoom(meta.roomCode);
        if (room?.hostSocket?.readyState === WebSocket.OPEN) {
          safeSend(room.hostSocket, serializeControlMessage(msg));
        }
      }
      break;
    }

    case 'GAME_STATE_SYNC': {
      // Host broadcasts state to all controllers
      const meta = roomManager.getSocketMetadata(socket);
      if (meta && meta.role === 'host') {
        const room = roomManager.getRoom(meta.roomCode);
        if (room) {
          const payload = serializeControlMessage(msg);
          for (const p of room.players.values()) {
            if (p.socket?.readyState === WebSocket.OPEN) {
              safeSend(p.socket, payload);
            }
          }
        }
      }
      break;
    }
  }
}

// WebSocket Connection Handling
wss.on('connection', (socket: ExtWebSocket, req) => {
  socket.isAlive = true;

  if (req.socket && typeof req.socket.setNoDelay === 'function') {
    req.socket.setNoDelay(true);
  }

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    try {
      onMessage(socket, raw, isBinary);
    } catch (err) {
      const msgStr = isBinary ? '<binary>' : (Buffer.isBuffer(raw) ? raw.toString('utf-8') : String(raw));
      console.warn(`[WebSocket] Dropped malformed message: ${msgStr.length > 256 ? msgStr.slice(0, 256) + '...' : msgStr}`);
    }
  });

  socket.on('close', () => {
    roomManager.handleDisconnect(
      socket,
      (room, slot, sessionId) => {
        // Called when 60s controller grace period expires
        if (room.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
          const leftMsg: ControlMessage = {
            type: 'PLAYER_LEFT',
            playerSlot: slot,
            sessionId,
          };
          safeSend(room.hostSocket, serializeControlMessage(leftMsg));
          console.log(`[Room ${room.code}] Player ${slot} grace period expired; slot freed`);
        }
      },
      (roomCode) => {
        console.log(`[Room ${roomCode}] Host grace period expired; room closed`);
      }
    );

    const meta = roomManager.getSocketMetadata(socket);
    if (meta && meta.role === 'controller' && meta.slot) {
      const room = roomManager.getRoom(meta.roomCode);
      if (room?.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
        const disconnectMsg: ControlMessage = {
          type: 'PLAYER_DISCONNECTED',
          playerSlot: meta.slot,
          sessionId: meta.sessionId,
          gracePeriodSeconds: DEFAULT_GRACE_PERIOD_MS / 1000,
        };
        safeSend(room.hostSocket, serializeControlMessage(disconnectMsg));
        console.log(`[Room ${meta.roomCode}] Player ${meta.slot} disconnected (60s grace active)`);
      }
    }
  });

  socket.on('error', (err) => {
    console.error('[WebSocket Error]', err.message);
  });
});

// Process-level resilience against crashes
process.on('uncaughtException', (err) => {
  console.error('[Server UncaughtException]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server UnhandledRejection]', reason);
});

server.on('error', (err) => {
  console.error('[HTTP Server Error]', err.message);
});

server.on('clientError', (err: any, socket: any) => {
  console.warn('[HTTP Client Error]', err.message);
  if (err.code === 'ECONNRESET' || !socket.writable) {
    try {
      socket.destroy();
    } catch {}
    return;
  }
  try {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  } catch {
    try {
      socket.destroy();
    } catch {}
  }
});

wss.on('error', (err) => {
  console.error('[WSS Server Error]', err.message);
});

// Periodic heartbeat to prune dead sockets
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const ext = ws as ExtWebSocket;
    if (ext.isAlive === false) {
      return ext.terminate();
    }
    ext.isAlive = false;
    ext.ping();
  });
}, 25000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// Start Server
if (!process.env.VITEST) {
  server.listen(PORT, HOST, () => {
    const lanIp = getPrimaryLanIp();
    console.log(`========================================================`);
    console.log(`  TILTMAZE: KINETIC EDITION - RELAY SERVER ONLINE      `);
    console.log(`========================================================`);
    console.log(`  Local HTTP / WS:   http://localhost:${PORT}`);
    console.log(`  LAN HTTP / WS:     http://${lanIp}:${PORT}`);
    console.log(`  WebSocket URL:     ws://${lanIp}:${PORT}`);
    console.log(`========================================================`);
  });
}

// Export server and instances for testing
export { app, server, wss, roomManager };
