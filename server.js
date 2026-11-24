
try {
  require('dotenv').config();
} catch (_) {
  // Render injects environment variables directly into process.env
}

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Ride = require('./models/Ride');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Guzo Plus' });
});

async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    const fetchFn = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
    await fetchFn(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (err) {
    console.error('Telegram send error:', err.message);
  }
}

let telegramOffset = 0;
async function pollTelegramUpdates() {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const fetchFn = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
    const res = await fetchFn(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=25&offset=${telegramOffset}`
    );
    const data = await res.json();
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        telegramOffset = update.update_id + 1;
        if (update.message && update.message.text) {
          const chatId = update.message.chat.id;
          const text = update.message.text.trim();
          if (text === '/start') {
            await sendTelegramMessage(chatId, 'ሰላም! ወደ Guzo Plus እንኳን በደህና መጡ።');
          }
        }
      }
    }
  } catch (err) {
    console.error('Telegram polling error:', err.message);
  } finally {
    setTimeout(pollTelegramUpdates, 2000);
  }
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

async function connectAtlas() {
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI or MONGODB_URI is missing');
    return;
  }
  await mongoose.connect(MONGO_URI, {
    family: 4,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 45000
  });
  console.log('✅ Connected to MongoDB successfully!');
}

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  try {
    await connectAtlas();
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
  }
  if (typeof pollTelegramUpdates === 'function') {
    pollTelegramUpdates();
  }
});
