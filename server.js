try {
  require('dotenv').config();
} catch (_) {}

const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

try {
  const cors = require('cors');
  app.use(cors());
} catch (_) {
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

let Ride;
try {
  Ride = require('./models/Ride');
  if (!Ride || typeof Ride.create !== 'function') {
    throw new Error('Invalid Ride export');
  }
} catch (_) {
  const rideSchema = new mongoose.Schema(
    {
      passengerName: { type: String, default: '' },
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      pickup: { type: String, default: '' },
      dropoff: { type: String, default: '' },
      rideType: { type: String, default: 'solo' },
      timeTariff: { type: String, default: 'now' },
      fare: { type: Number, default: 200 },
      status: { type: String, default: 'pending' }
    },
    { timestamps: true }
  );
  Ride = mongoose.models.Ride || mongoose.model('Ride', rideSchema);
}

const driverSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    vehicleType: { type: String, default: 'ባጃጅ (Bajaj)' },
    plateNumber: { type: String, default: '' },
    area: { type: String, default: '' },
    status: { type: String, default: 'pending' }
  },
  { timestamps: true }
);

const Driver = mongoose.models.Driver || mongoose.model('Driver', driverSchema);

function calculateFare(rideType, timeTariff) {
  let base = 200;
  if (timeTariff === 'morning' || timeTariff === 'evening') {
    base += 50;
  }
  if (rideType === 'shared') {
    base = Math.round(base * 0.75);
  }
  return base;
}

async function httpFetch(url, options) {
  if (typeof fetch === 'function') {
    return fetch(url, options);
  }
  const mod = await import('node-fetch');
  return mod.default(url, options);
}

async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    const body = { chat_id: chatId, text: String(text) };
    if (replyMarkup) body.reply_markup = replyMarkup;
    await httpFetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('Telegram send error:', err.message);
  }
}

async function answerCallbackQuery(callbackQueryId, text) {
  if (!TELEGRAM_BOT_TOKEN || !callbackQueryId) return;
  try {
    await httpFetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: String(text) })
    });
  } catch (err) {
    console.error('Callback answer error:', err.message);
  }
}

const lastShownRidesByChat = new Map();
let telegramOffset = 0;

async function pollTelegramUpdates() {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const res = await httpFetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=25&offset=${telegramOffset}`
    );
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        telegramOffset = update.update_id + 1;

        if (update.callback_query) {
          const cq = update.callback_query;
          const chatId = cq.message && cq.message.chat ? cq.message.chat.id : null;
          const parts = String(cq.data || '').split(':');
          const action = parts[0];
          const rideId = parts[1];

          if ((action === 'accepted' || action === 'completed') && rideId) {
            const updated = await Ride.findByIdAndUpdate(
              rideId,
              { status: action },
              { new: true }
            );
            await answerCallbackQuery(cq.id, `ወደ ${action} ተቀይሯል`);
            if (chatId && updated) {
              const pName = updated.passengerName || updated.name || 'ተጓዥ';
              await sendTelegramMessage(
                chatId,
                `✅ ${pName} (${updated.pickup || '-'} → ${updated.dropoff || '-'}) ሁኔታ ወደ "${action}" ተቀይሯል።`
              );
            }
          }
          continue;
        }

        if (update.message && typeof update.message.text === 'string') {
          const chatId = update.message.chat.id;
          const text = update.message.text.trim();

          if (text === '/start') {
            await sendTelegramMessage(
              chatId,
              'ሰላም! ወደ ጉዞ ፕላስ (Guzo Plus) እንኳን በደህና መጡ።\n\nየቅርብ ጊዜ ጥያቄዎችን ለማየት /rides ይላኩ ወይም ቁጥር (1, 2, 3...) ይላኩ።'
            );
          } else if (text === '/rides' || text === 'ዝርዝር') {
            const rides = await Ride.find().sort({ createdAt: -1 }).limit(10);
            if (!rides.length) {
              await sendTelegramMessage(chatId, 'ምንም የተመዘገበ የጉዞ ጥያቄ የለም።');
            } else {
              lastShownRidesByChat.set(String(chatId), rides);
              const lines = rides.map((r, idx) => {
                const pName = r.passengerName || r.name || 'ተጓዥ';
                return `${idx + 1}. ${pName} — ${r.status || 'pending'}\n📍 ${r.pickup || '-'} → 🎯 ${r.dropoff || '-'}`;
              });
              await sendTelegramMessage(chatId, '📋 የቅርብ ጊዜ የጉዞ ጥያቄዎች:\n\n' + lines.join('\n\n'));
            }
          } else if (/^\d+$/.test(text)) {
            const num = parseInt(text, 10);
            let rides = lastShownRidesByChat.get(String(chatId));
            if (!rides || !rides.length) {
              rides = await Ride.find().sort({ createdAt: -1 }).limit(10);
              lastShownRidesByChat.set(String(chatId), rides);
            }
            const selected = rides[num - 1];
            if (!selected) {
              await sendTelegramMessage(chatId, `ቁጥር ${num} በዝርዝሩ ውስጥ አልተገኘም።`);
            } else {
              const pName = selected.passengerName || selected.name || '-';
              const keyboard = {
                inline_keyboard: [
                  [
                    { text: '✅ አጽድቅ (Accept)', callback_data: `accepted:${selected._id}` },
                    { text: '🏁 አጠናቅቅ (Complete)', callback_data: `completed:${selected._id}` }
                  ]
                ]
              };
              await sendTelegramMessage(
                chatId,
                `🚖 የተመረጠ የጉዞ ጥያቄ (#${num}):\n` +
                  `ስም፡ ${pName}\n` +
                  `ስልክ፡ ${selected.phone || '-'}\n` +
                  `መነሻ፡ ${selected.pickup || '-'}\n` +
                  `መድረሻ፡ ${selected.dropoff || '-'}\n` +
                  `ዋጋ፡ ${selected.fare || 200} ብር\n` +
                  `ሁኔታ፡ ${selected.status || 'pending'}`,
                keyboard
              );
            }
          } else if (/^(accept|complete)\s+\d+$/i.test(text)) {
            const match = text.match(/^(accept|complete)\s+(\d+)$/i);
            const action = match[1].toLowerCase();
            const num = parseInt(match[2], 10);
            const rides =
              lastShownRidesByChat.get(String(chatId)) ||
              (await Ride.find().sort({ createdAt: -1 }).limit(10));
            const selected = rides[num - 1];
            if (!selected) {
              await sendTelegramMessage(chatId, `ቁጥር ${num} አልተገኘም።`);
            } else {
              const newStatus = action === 'accept' ? 'accepted' : 'completed';
              await Ride.findByIdAndUpdate(selected._id, { status: newStatus });
              await sendTelegramMessage(chatId, `✅ የጉዞ #${num} ሁኔታ ወደ "${newStatus}" ተቀይሯል።`);
            }
          } else {
            await sendTelegramMessage(
              chatId,
              'ትዕዛዝ አልታወቀም። /start ወይም /rides ይላኩ ወይም የጉዞ ቁጥር (1, 2...) ይላኩ።'
            );
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

app.get('/manifest.json', (req, res) => {
  const customManifest = path.join(__dirname, 'public', 'manifest.json');
  if (fs.existsSync(customManifest)) {
    return res.sendFile(customManifest);
  }
  res.json({
    name: 'ጉዞ ፕላስ | Guzo Plus',
    short_name: 'ጉዞ ፕላስ',
    description: 'የጉዞ ጥያቄ ማስተላለፊያ እና የአገልግሎት መተግበሪያ',
    start_url: '/',
    display: 'standalone',
    background_color: '#f1f5f9',
    theme_color: '#15
