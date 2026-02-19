require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-frontend.onrender.com';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is required! Set it in .env file.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

console.log('[Bot] Started polling...');

// /start command — sends Web App button
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'пользователь';

  bot.sendMessage(chatId, `Привет, ${userName}! 👋\n\nНажми кнопку ниже, чтобы открыть приложение для звонков.\n\nТвой Telegram ID: <code>${msg.from.id}</code>\nОтправь его собеседнику, чтобы он мог тебе позвонить.`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '📞 Открыть Звонки',
            web_app: { url: WEB_APP_URL },
          },
        ],
      ],
    },
  });
});

// /help command
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '📞 <b>Как пользоваться:</b>\n\n' +
    '1. Нажми /start и открой приложение\n' +
    '2. Узнай свой Telegram ID (он показан в сообщении)\n' +
    '3. Отправь свой ID собеседнику\n' +
    '4. Введи ID собеседника в приложении\n' +
    '5. Нажми "Видеозвонок" или "Аудиозвонок"\n' +
    '6. Собеседник должен быть онлайн в приложении\n\n' +
    '⚡ Оба участника должны открыть Web App перед звонком!',
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
