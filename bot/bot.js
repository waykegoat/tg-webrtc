require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-frontend.onrender.com';
const BACKEND_URL = process.env.BACKEND_URL || 'https://tg-webrtcbackend.onrender.com';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is required! Set it in .env file.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('[Bot] Started polling...');

// /start command — handles both normal start and referral links
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const userName = msg.from.first_name || 'пользователь';
  const param = (match[1] || '').trim();

  // Register this user on the backend
  try {
    await fetch(`${BACKEND_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: userId,
        firstName: msg.from.first_name || '',
        lastName: msg.from.last_name || '',
        username: msg.from.username || '',
      }),
    });
  } catch (e) {
    console.error('[Bot] Register error:', e.message);
  }

  // Handle referral: /start add_123456
  if (param.startsWith('add_')) {
    const friendId = param.slice(4);
    if (friendId && friendId !== userId) {
      try {
        await fetch(`${BACKEND_URL}/api/add-friend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, friendId }),
        });
        bot.sendMessage(chatId,
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
        return;
      } catch (e) {
        console.error('[Bot] Add friend error:', e.message);
      }
    }
  }

  // Normal /start
  bot.sendMessage(chatId,
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
});

// /help command
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '📞 <b>Как пользоваться:</b>\n\n' +
    '1. Нажми /start и открой приложение\n' +
    '2. Во вкладке «Контакты» увидишь друзей\n' +
    '3. Нажми кнопку «Пригласить» чтобы добавить контакт\n' +
    '4. Или введи Telegram ID во вкладке «Набрать»\n' +
    '5. Нажми аудио или видео для звонка\n\n' +
    '🔗 Ты также можешь поделиться ссылкой-приглашением из приложения!',
    { parse_mode: 'HTML' }
  );
});

// /myid command
bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `Твой Telegram ID: <code>${msg.from.id}</code>`, {
    parse_mode: 'HTML',
  });
});

bot.on('polling_error', (err) => {
  console.error('[Bot] Polling error:', err.code, err.message);
});
