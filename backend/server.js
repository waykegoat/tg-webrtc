require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', connections: clients.size });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

const server = http.createServer(app);

// WebSocket signaling server
const wss = new WebSocketServer({ server });

// userId -> WebSocket
const clients = new Map();

wss.on('connection', (ws) => {
  let userId = null;

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      console.error('[WS] Invalid JSON:', e.message);
      return;
    }

    switch (msg.type) {
      case 'register': {
        userId = String(msg.userId);
        clients.set(userId, ws);
        console.log(`[WS] User registered: ${userId} (total: ${clients.size})`);
        ws.send(JSON.stringify({ type: 'registered', userId }));
        break;
      }

      case 'call':
      case 'answer':
      case 'candidate':
      case 'signal':
      case 'hangup':
      case 'reject':
      case 'busy': {
        const targetId = String(msg.targetUserId);
        const targetWs = clients.get(targetId);
        if (targetWs && targetWs.readyState === 1) {
          targetWs.send(JSON.stringify({
            type: msg.type,
            from: userId,
            payload: msg.payload || null,
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            message: `User ${targetId} is not online`,
          }));
        }
        break;
      }

      default:
        console.log(`[WS] Unknown message type: ${msg.type}`);
    }
  });

  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      console.log(`[WS] User disconnected: ${userId} (total: ${clients.size})`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for user ${userId}:`, err.message);
  });
});

// Ping/pong to detect dead connections
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log('[WS] Terminating dead connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});
