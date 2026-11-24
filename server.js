try {
  require('dotenv').config();
} catch (_) {
  // Render injects environment variables directly into process.env
}

const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const Ride = require('./models/Ride');

const app = express();
app.use(express.json());

let corsMiddleware = null;
try {
  const cors = require('cors');
  corsMiddleware = cors();
} catch (_) {
  corsMiddleware = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}
app.use(corsMiddleware);

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

app.get('/', (req, res) => {
  const indexHtmlPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    return res.sendFile(indexHtmlPath);
  }

  res.type('html').send(`<!DOCTYPE html>
<html lang="am">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ጉዞ ፕላስ | Guzo Plus</title>
  <style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    body { margin: 0; background: #0f172a; color: #f8fafc; }
    header { background: #1e293b; padding: 18px 20px; border-bottom: 1px solid #334155; }
    header h1 { margin: 0; font-size: 1.4rem; color: #22c55e; }
    header p { margin: 4px 0 0; font-size: 0.9rem; color: #cbd5e1; }
    main { max-width: 720px; margin: 20px auto; padding: 0 16px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 18px; margin-bottom: 16px; }
    .badge { display: inline-block; background: #14532d; color: #86efac; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; margin-bottom: 10px; }
    label { display: block; font-size: 0.9rem; margin-top: 10px; margin-bottom: 4px; color: #e2e8f0; }
    input, select { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: #fff; }
    button { margin-top: 14px; width: 100%; padding: 12px; border: none; border-radius: 8px; background: #22c55e; color: #052e16; font-weight: 700; font-size: 1rem; cursor: pointer; }
    button:hover { background: #16a34a; color: #fff; }
    #msg { margin-top: 12px; font-size: 0.9rem; color: #86efac; min-height: 20px; }
    .ride-item { border-top: 1px solid #334155; padding: 10px 0; font-size: 0.9rem; }
    .ride-item:first-child { border-top: none; }
  </style>
</head>
<body>
  <header>
    <h1>ጉዞ ፕላስ (Guzo Plus)</h1>
    <p>የጉዞ ጥያቄ ማስተላለፊያ እና የአገልግሎት ገጽ</p>
  </header>
  <main>
    <div class="card">
      <span class="badge">● አገልግሎቱ ቀጥታ ነው</span>
      <h2>አዲስ የጉዞ ጥያቄ ይላኩ</h2>
      <form id="rideForm">
        <label for="passengerName">ስም</label>
        <input id="passengerName" name="passengerName" placeholder="ሙሉ ስም" required />

        <label for="pickup">መነሻ ቦታ</label>
        <input id="pickup" name="pickup" placeholder="ለምሳሌ፡ ጎተራ" required />

        <label for="dropoff">መድረሻ ቦታ</label>
        <input id="dropoff" name="dropoff" placeholder="ለምሳሌ፡ ቦሌ" required />

        <label for="rideType">የጉዞ አይነት</label>
        <select id="rideType" name="rideType">
          <option value="solo">የግል ጉዞ (Solo)</option>
          <option value="shared">የጋራ ጉዞ (Shared)</option>
        </select>

        <button type="submit">ጉዞ ይጠይቁ</button>
      </form>
      <div id="msg"></div>
    </div>

    <div class="card">
      <h3>የቅርብ ጊዜ ጥያቄዎች</h3>
      <div id="ridesList">በመጫን ላይ...</div>
    </div>
  </main>

  <script>
    const form = document.getElementById('rideForm');
    const msg = document.getElementById('msg');
    const ridesList = document.getElementById('ridesList');

    async function loadRides() {
      try {
        const res = await fetch('/api/rides');
        if (!res.ok) {
          ridesList.textContent = 'ገና የጉዞ ዝርዝር አልተመዘገበም።';
          return;
        }
        const rides = await res.json();
        if (!Array.isArray(rides) || rides.length === 0) {
          ridesList.textContent = 'ምንም የጉዞ ጥያቄ የለም።';
          return;
        }
        ridesList.innerHTML = rides.slice(0, 10).map(r =>
          '<div class="ride-item"><strong>' + (r.passengerName || 'ተጓዥ') + '</strong>: ' +
          (r.pickup || '') + ' → ' + (r.dropoff || '') + ' (' + (r.status || 'pending') + ')</div>'
        ).join('');
      } catch (_) {
        ridesList.textContent = 'ዝርዝሩን ማምጣት አልተቻለም።';
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = 'በመላክ ላይ...';
      const payload = {
        passengerName: document.getElementById('passengerName').value.trim(),
        pickup: document.getElementById('pickup').value.trim(),
        dropoff: document.getElementById('dropoff').value.trim(),
        rideType: document.getElementById('rideType').value
      };
      try {
        const res = await fetch('/api/rides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          msg.textContent = '✅ የጉዞ ጥያቄዎ በስኬት ተመዝግቧል።';
          form.reset();
          loadRides();
        } else {
          msg.textContent = '❌ ስህተት፡ ' + (data.error || 'መላክ አልተቻለም');
        }
      } catch (err) {
        msg.textContent = '❌ የኔትወርክ ስህተት፡ ' + err.message;
      }
    });

    loadRides();
  </script>
</body>
</html>`);
});

app.get('/api/rides', async (req, res) => {
  try {
    const rides = await Ride.find().sort({ createdAt: -1 }).limit(25);
    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rides', async (req, res) => {
  try {
    const ride = await Ride.create(req.body);
    if (TELEGRAM_CHAT_ID) {
      await sendTelegramMessage(
        TELEGRAM_CHAT_ID,
        `🚖 አዲስ የጉዞ ጥያቄ (Guzo Plus)\nስም፡ ${ride.passengerName || '-'}\nከ፡ ${ride.pickup || '-'}\nወደ፡ ${ride.dropoff || '-'}`
      );
    }
    res.status(201).json(ride);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
