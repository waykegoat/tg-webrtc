# 📞 Звонки — Telegram WebRTC Calling App

Telegram Web App для аудио/видеозвонков через WebRTC.

## Структура

```
zvonki/
├── backend/    — Сигнальный сервер (Node.js + Express + WebSocket)
├── frontend/   — Веб-приложение (Vue 3 + simple-peer)
├── bot/        — Telegram бот (отправляет кнопку Web App)
```

## Быстрый старт (локально)

### 1. Backend
```bash
cd backend
npm install
npm start
# Сервер запустится на http://localhost:3000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
# Dev-сервер на http://localhost:5173
```

### 3. Bot
```bash
cd bot
cp .env.example .env
# Отредактируйте .env — укажите BOT_TOKEN и WEB_APP_URL
npm install
npm start
```

## Деплой на Render

### Backend (Web Service)
- **Root Directory**: `backend`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Environment**: Node
- Render автоматически задаст `PORT`

### Frontend (Static Site)
- **Root Directory**: `frontend`
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`
- **Environment Variable**: `VITE_WS_URL=wss://your-backend.onrender.com`

### Bot
Бота можно запустить на Render как **Background Worker** или локально:
- **Root Directory**: `bot`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Environment Variables**: `BOT_TOKEN`, `WEB_APP_URL`

## Настройка BotFather

1. Откройте @BotFather
2. `/mybots` → выберите бота → Bot Settings → Menu Button
3. Установите URL фронтенда (например `https://zvonki-frontend.onrender.com`)

## Как пользоваться

1. Откройте бота в Telegram, нажмите `/start`
2. Нажмите кнопку «📞 Открыть Звонки»
3. Приложение покажет ваш Telegram ID
4. Отправьте ID собеседнику
5. Оба откройте приложение
6. Введите ID собеседника и нажмите «Видеозвонок» или «Аудиозвонок»

## TURN-сервер (при проблемах с NAT)

Если звонки не проходят, добавьте TURN-сервер в `frontend/src/App.vue` в массив `ICE_SERVERS`:

```js
{
  urls: 'turn:your-turn-server.com:3478',
  username: 'user',
  credential: 'password',
}
```

Бесплатные TURN можно получить на [metered.ca](https://www.metered.ca/stun-turn).
