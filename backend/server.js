require('dotenv').config();
const express = require('express');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const WEB_APP_URL = process.env.WEB_APP_URL || '';

app.use(cors());
app.use(express.json());

// ─── In-memory stores ───
const clients = new Map();   // userId -> WebSocket (online users)
const users = new Map();     // userId -> { id, firstName, lastName, username, lastSeen }

// ─── REST API ───

app.get('/', (req, res) => {
  res.json({ status: 'ok', online: clients.size, registered: users.size });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Get all registered contacts with online status
app.get('/api/contacts', (req, res) => {
  const exclude = req.query.exclude;
  const list = [];
  for (const [id, user] of users) {
    if (id === exclude) continue;
    list.push({
      ...user,
      online: clients.has(id),
    });
  }
  list.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
  res.json(list);
});

// Register / update user profile (called from frontend on load)
app.post('/api/register', (req, res) => {
  const { id, firstName, lastName, username } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  const uid = String(id);
  users.set(uid, {
    id: uid,
    firstName: firstName || '',
    lastName: lastName || '',
    username: username || '',
    lastSeen: Date.now(),
  });
  console.log(`[API] User registered/updated: ${uid} (${firstName || 'no name'})`);
  res.json({ ok: true });
});

// ─── Telegram Bot notification ───
function sendBotNotification(targetUserId, callerInfo) {
  if (!BOT_TOKEN) {
    console.log('[Bot] No BOT_TOKEN, skipping notification');
    return;
  }
  const callerName = callerInfo.firstName || callerInfo.username || callerInfo.id;
  const text = `📞 Входящий звонок от <b>${callerName}</b>!\n\nОткройте приложение, чтобы принять.`;

  const payload = JSON.stringify({
    chat_id: targetUserId,
    text,
    parse_mode: 'HTML',
    reply_markup: WEB_APP_URL ? JSON.stringify({
      inline_keyboard: [[{
        text: '📞 Открыть Звонки',
        web_app: { url: WEB_APP_URL },
      }]],
    }) : undefined,
  });

  const req = https.request({
    hostname: 'api.telegram.org',
    path: `/bot${BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  }, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`[Bot] Notification sent to ${targetUserId}`);
      } else {
        console.error(`[Bot] Failed to notify ${targetUserId}:`, body);
      }
    });
  });
  req.on('error', (e) => console.error('[Bot] Request error:', e.message));
  req.write(payload);
  req.end();
}

// ─── WebSocket signaling ───
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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
        // Update user profile if provided
        if (msg.profile) {
          users.set(userId, {
            id: userId,
            firstName: msg.profile.firstName || '',
            lastName: msg.profile.lastName || '',
            username: msg.profile.username || '',
            lastSeen: Date.now(),
          });
        }
        console.log(`[WS] User online: ${userId} (total: ${clients.size})`);
        ws.send(JSON.stringify({ type: 'registered', userId }));
        break;
      }

      case 'call': {
        const targetId = String(msg.targetUserId);
        const targetWs = clients.get(targetId);
        if (targetWs && targetWs.readyState === 1) {
          targetWs.send(JSON.stringify({
            type: 'call',
            from: userId,
            payload: msg.payload || null,
          }));
        } else {
          // Target offline — send bot notification
          const callerInfo = users.get(userId) || { id: userId };
          sendBotNotification(targetId, callerInfo);
          ws.send(JSON.stringify({
            type: 'offline',
            targetUserId: targetId,
            message: 'Пользователь не в сети. Отправлено уведомление.',
          }));
        }
        break;
      }

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
      if (users.has(userId)) {
        users.get(userId).lastSeen = Date.now();
      }
      console.log(`[WS] User offline: ${userId} (total: ${clients.size})`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for user ${userId}:`, err.message);
  });
});

// Ping/pong heartbeat
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});
