require('dotenv').config();
const https = require('https');
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-frontend.onrender.com';
const BACKEND_URL = process.env.BACKEND_URL || 'https://tg-webrtcbackend.onrender.com';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is required!');
  process.exit(1);
}

console.log('[Bot] Starting...');
console.log('[Bot] BACKEND_URL:', BACKEND_URL);
console.log('[Bot] WEB_APP_URL:', WEB_APP_URL);

// ─── Helper: POST to backend ───
function postBackend(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const url = new URL(path, BACKEND_URL);
    console.log(`[Bot] POST ${url.href}`);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        console.log(`[Bot] Response ${res.statusCode}: ${body}`);
        resolve(body);
      });
    });
    req.on('error', (e) => {
      console.error(`[Bot] Request error:`, e.message);
      reject(e);
    });
    req.write(payload);
    req.end();
  });
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ─── Handle ALL messages (no regex issues) ───
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const text = (msg.text || '').trim();

  console.log(`[Bot] Message from ${userId}: "${text}"`);

  // ─── /start with optional deep link param ───
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const param = parts[1] || '';

    console.log(`[Bot] /start param="${param}"`);

    // Register user
    try {
      await postBackend('/api/register', {
        id: userId,
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        username: msg.from.username || '',
      });
    } catch (e) {
      console.error('[Bot] Register failed:', e.message);
    }

    // Referral: /start add_USERID
    if (param.startsWith('add_')) {
      const friendId = param.slice(4);
      console.log(`[Bot] Adding friend: ${userId} <-> ${friendId}`);
      if (friendId && friendId !== userId) {
        try {
          await postBackend('/api/add-friend', {
            userId,
            friendId,
            userProfile: {
              firstName: msg.from.first_name || '',
              lastName: msg.from.last_name || '',
              username: msg.from.username || '',
            },
          });
          return bot.sendMessage(chatId,
            `✅ Контакт добавлен!\n\nТеперь вы можете звонить друг другу.`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{
                  text: '📞 Открыть Звонки',
                  web_app: { url: WEB_APP_URL },
                }]],
              },
            }
          );
        } catch (e) {
          console.error('[Bot] Add friend failed:', e.message);
        }
      }
    }

    // Normal /start
    const userName = msg.from.first_name || 'пользователь';
    return bot.sendMessage(chatId,
      `Привет, ${userName}! 👋\n\n` +
      `Нажми кнопку ниже, чтобы открыть приложение для звонков.\n\n` +
      `Твой Telegram ID: <code>${msg.from.id}</code>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{
            text: '📞 Открыть Звонки',
            web_app: { url: WEB_APP_URL },
          }]],
        },
      }
    );
  }

  // ─── /help ───
  if (text.startsWith('/help')) {
    return bot.sendMessage(chatId,
      '📞 <b>Как пользоваться:</b>\n\n' +
      '1. Нажми /start и открой приложение\n' +
      '2. Во вкладке «Контакты» увидишь друзей\n' +
      '3. Нажми кнопку «Пригласить» чтобы добавить контакт\n' +
      '4. Или введи Telegram ID во вкладке «Набрать»\n' +
      '5. Нажми аудио или видео для звонка\n\n' +
      '🔗 Поделись ссылкой-приглашением из приложения!',
      { parse_mode: 'HTML' }
    );
  }

  // ─── /myid ───
  if (text.startsWith('/myid')) {
    return bot.sendMessage(chatId, `Твой Telegram ID: <code>${msg.from.id}</code>`, {
      parse_mode: 'HTML',
    });
  }
});

bot.on('polling_error', (err) => {
  console.error('[Bot] Polling error:', err.code, err.message);
});

console.log('[Bot] Ready, listening for messages...');
