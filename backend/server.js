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
const clients = new Map();        // userId -> WebSocket
const users = new Map();          // userId -> { id, firstName, lastName, username, lastSeen }
const friends = new Map();        // userId -> Set<friendId>
const callLogs = [];              // [{ id, callerId, receiverId, startTime, duration, type, status }]
const notifyLimits = new Map();   // userId -> last notification timestamp
const NOTIFY_COOLDOWN = 120_000;  // 2 min between notifications to same user
const MAX_CALL_LOGS = 500;        // keep last N logs in memory

// ─── Helpers ───
function getFriends(uid) {
  if (!friends.has(uid)) friends.set(uid, new Set());
  return friends.get(uid);
}

function addFriend(a, b) {
  getFriends(a).add(b);
  getFriends(b).add(a);
}

function userInfo(uid) {
  return users.get(uid) || { id: uid, firstName: '', lastName: '', username: '' };
}

// ─── REST API ───

app.get('/', (req, res) => {
  res.json({ status: 'ok', online: clients.size, registered: users.size });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Register / update user profile
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
  res.json({ ok: true });
});

// Get contacts: only friends (added via referral link)
app.get('/api/contacts', (req, res) => {
  const uid = req.query.userId || req.query.exclude;
  const myFriends = getFriends(uid);
  const list = [];
  for (const friendId of myFriends) {
    const user = users.get(friendId);
    if (!user) continue;
    list.push({
      ...user,
      online: clients.has(friendId),
      isFriend: true,
    });
  }
  // Online first
  list.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0));
  res.json(list);
});

// Add mutual friendship (referral)
app.post('/api/add-friend', (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId) return res.status(400).json({ error: 'userId and friendId required' });
  const a = String(userId);
  const b = String(friendId);
  if (a === b) return res.status(400).json({ error: 'cannot add yourself' });
  addFriend(a, b);
  console.log(`[Friends] ${a} <-> ${b}`);
  res.json({ ok: true });
});

// Save call log
app.post('/api/call-log', (req, res) => {
  const { callerId, receiverId, startTime, duration, type, status } = req.body;
  if (!callerId || !receiverId) return res.status(400).json({ error: 'callerId and receiverId required' });
  const log = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    callerId: String(callerId),
    receiverId: String(receiverId),
    callerName: userInfo(String(callerId)),
    receiverName: userInfo(String(receiverId)),
    startTime: startTime || Date.now(),
    duration: duration || 0,
    type: type || 'audio',
    status: status || 'completed',
  };
  callLogs.push(log);
  if (callLogs.length > MAX_CALL_LOGS) callLogs.splice(0, callLogs.length - MAX_CALL_LOGS);
  res.json({ ok: true, log });
});

// Get call history for user
app.get('/api/history', (req, res) => {
  const uid = req.query.userId;
  if (!uid) return res.status(400).json({ error: 'userId required' });
  const history = callLogs
    .filter((l) => l.callerId === uid || l.receiverId === uid)
    .reverse()
    .slice(0, 50)
    .map((l) => ({
      ...l,
      callerName: userInfo(l.callerId),
      receiverName: userInfo(l.receiverId),
    }));
  res.json(history);
});

// ─── Bot notification (rate-limited) ───
function sendBotNotification(targetUserId, callerInfo) {
  if (!BOT_TOKEN) return;

  // Rate limit check
  const now = Date.now();
  const lastNotify = notifyLimits.get(targetUserId) || 0;
  if (now - lastNotify < NOTIFY_COOLDOWN) {
    console.log(`[Bot] Rate limited for ${targetUserId} (cooldown ${Math.ceil((NOTIFY_COOLDOWN - (now - lastNotify)) / 1000)}s)`);
    return;
  }
  notifyLimits.set(targetUserId, now);

  const callerName = callerInfo.firstName || callerInfo.username || callerInfo.id;
  const text = `📞 Входящий звонок от <b>${callerName}</b>!\n\nОткройте приложение, чтобы принять.`;

  const replyMarkup = WEB_APP_URL ? {
    inline_keyboard: [[{ text: '📞 Открыть Звонки', web_app: { url: WEB_APP_URL } }]],
  } : undefined;

  const payload = JSON.stringify({
    chat_id: targetUserId,
    text,
    parse_mode: 'HTML',
    reply_markup: replyMarkup ? JSON.stringify(replyMarkup) : undefined,
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
      if (res.statusCode === 200) console.log(`[Bot] Notification sent to ${targetUserId}`);
      else console.error(`[Bot] Failed:`, body);
    });
  });
  req.on('error', (e) => console.error('[Bot] Error:', e.message));
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
    try { msg = JSON.parse(data); } catch { return; }

    switch (msg.type) {
      case 'register': {
        userId = String(msg.userId);
        clients.set(userId, ws);
        if (msg.profile) {
          users.set(userId, {
            id: userId,
            firstName: msg.profile.firstName || '',
            lastName: msg.profile.lastName || '',
            username: msg.profile.username || '',
            lastSeen: Date.now(),
          });
        }
        ws.send(JSON.stringify({ type: 'registered', userId }));
        break;
      }

      case 'call': {
        const targetId = String(msg.targetUserId);
        const targetWs = clients.get(targetId);
        if (targetWs && targetWs.readyState === 1) {
          targetWs.send(JSON.stringify({ type: 'call', from: userId, payload: msg.payload || null }));
        } else {
          const callerInfo = users.get(userId) || { id: userId };
          sendBotNotification(targetId, callerInfo);
          ws.send(JSON.stringify({
            type: 'offline',
            targetUserId: targetId,
            message: 'Не в сети. Уведомление отправлено.',
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
          targetWs.send(JSON.stringify({ type: msg.type, from: userId, payload: msg.payload || null }));
        }
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (userId) {
      clients.delete(userId);
      if (users.has(userId)) users.get(userId).lastSeen = Date.now();
    }
  });

  ws.on('error', () => {});
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));
