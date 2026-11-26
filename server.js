const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient, ObjectId } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'guzo_plus';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'guzo2026';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

let db = null;
let dbStatus = 'Not configured (set MONGODB_URI)';
let telegramOffset = 0;
let telegramPollingStarted = false;

async function connectAtlas() {
  if (!MONGO_URI) {
    console.warn('MONGODB_URI is not set. Running without Atlas DB connection.');
    return;
  }

  const client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  });

  try {
    await client.connect();
    db = client.db(DB_NAME);
    await db.command({ ping: 1 });
    dbStatus = 'Connected to MongoDB Atlas';
    console.log('Connected to MongoDB Atlas successfully!');
  } catch (err) {
    db = null;
    dbStatus = `Connection failed: ${err.message}`;
    console.error('MongoDB Atlas connection error:', err.message);
  }
}

async function sendTelegramText(chatId, text) {
  const targetChat = chatId || TELEGRAM_CHAT_ID;
  if (!TELEGRAM_BOT_TOKEN || !targetChat) {
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChat,
        text,
        parse_mode: 'Markdown',
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('Telegram sendMessage failed:', errText);
    }
  } catch (err) {
    console.error('Telegram notification error:', err.message);
  }
}

async function sendTelegramNotification(ride) {
  const text = [
    '🚕 *አዲስ የጉዞ ጥያቄ — ጉዞ ፕላስ (Guzo Plus)*',
    `👤 *ስም:* ${ride.name}`,
    `📞 *ስልክ:* ${ride.phone}`,
    `📍 *መነሻ:* ${ride.pickup}`,
    `🎯 *መድረሻ:* ${ride.dropoff}`,
    `📌 *ሁኔታ:* ${ride.status || 'pending'}`,
  ].join('\n');
  await sendTelegramText(TELEGRAM_CHAT_ID, text);
}

async function sendDriverNotification(driver) {
  const text = [
    '🚗 *አዲስ የአሽከርካሪ ምዝገባ — ጉዞ ፕላስ (Guzo Plus)*',
    `👤 *ስም:* ${driver.name}`,
    `📞 *ስልክ:* ${driver.phone}`,
    `🚘 *ተሽከርካሪ:* ${driver.vehicleType}`,
    `🔢 *ሰሌዳ:* ${driver.plateNumber}`,
    `📌 *ሁኔታ:* ${driver.status || 'pending'}`,
  ].join('\n');
  await sendTelegramText(TELEGRAM_CHAT_ID, text);
}

async function handleTelegramMessage(msg) {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const rawText = (msg.text || '').trim();
  const lower = rawText.toLowerCase();

  if (lower === '/start' || lower === 'start' || lower === '/menu' || lower === 'menu') {
    const menuText = [
      '🚕 *እንኳን ወደ ጉዞ ፕላስ (Guzo Plus) በደህና መጡ!*',
      '',
      'የሚፈልጉትን አማራጭ ቁጥር ይላኩ፦',
      '1 — 📋 የቅርብ ጊዜ የጉዞ ጥያቄዎች',
      '2 — 🚗 የተመዘገቡ አሽከርካሪዎች',
      '🌐 ድረ-ገጽ፡ https://guzo-plus-05wo.onrender.com/',
    ].join('\n');
    await sendTelegramText(chatId, menuText);
    return;
  }

  if (rawText === '1' || lower === '/rides') {
    if (!db) {
      await sendTelegramText(chatId, '⚠️ ዳታቤዝ እስካሁን አልተገናኘም።');
      return;
    }
    const rides = await db.collection('rides').find().sort({ createdAt: -1 }).limit(10).toArray();
    if (!rides.length) {
      await sendTelegramText(chatId, 'ℹ️ እስካሁን የተመዘገበ የጉዞ ጥያቄ የለም።');
      return;
    }
    const lines = ['📋 *የቅርብ ጊዜ የጉዞ ጥያቄዎች:*', ''];
    rides.forEach((r, idx) => {
      lines.push(
        `${idx + 1}. *${r.name}* (${r.phone}) — _${r.status || 'pending'}_`,
        `   📍 ${r.pickup} → 🎯 ${r.dropoff}`
      );
    });
    await sendTelegramText(chatId, lines.join('\n'));
    return;
  }

  if (rawText === '2' || lower === '/drivers') {
    if (!db) {
      await sendTelegramText(chatId, '⚠️ ዳታቤዝ እስካሁን አልተገናኘም።');
      return;
    }
    const drivers = await db.collection('drivers').find().sort({ createdAt: -1 }).limit(10).toArray();
    if (!drivers.length) {
      await sendTelegramText(chatId, 'ℹ️ እስካሁን የተመዘገበ አሽከርካሪ የለም።');
      return;
    }
    const lines = ['🚗 *የተመዘገቡ አሽከርካሪዎች:*', ''];
    drivers.forEach((d, idx) => {
      lines.push(
        `${idx + 1}. *${d.name}* (${d.phone}) — _${d.status || 'pending'}_`,
        `   🚘 ${d.vehicleType} | 🔢 ${d.plateNumber}`
      );
    });
    await sendTelegramText(chatId, lines.join('\n'));
    return;
  }

  if (rawText) {
    await sendTelegramText(
      chatId,
      'ℹ️ ሜኑ ለማየት */start* ወይም *start* ይላኩ፣ ወይም *1* (ጉዞዎች) / *2* (አሽከርካሪዎች) ይምረጡ።'
    );
  }
}

async function pollTelegramUpdates() {
  if (!TELEGRAM_BOT_TOKEN || telegramPollingStarted) return;
  telegramPollingStarted = true;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`);
  } catch {}

  console.log('Telegram bot polling started.');

  while (true) {
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${telegramOffset}&timeout=25`;
      const res = await fetch(url);
      if (!res.ok) {
        const errText = await res.text();
        console.warn('Telegram getUpdates status:', res.status, errText);
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      const data = await res.json();
      const updates = Array.isArray(data.result) ? data.result : [];
      for (const upd of updates) {
        if (typeof upd.update_id === 'number') {
          telegramOffset = upd.update_id + 1;
        }
        if (upd.message) {
          await handleTelegramMessage(upd.message);
        }
      }
    } catch (err) {
      console.error('Telegram polling loop error:', err.message);
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 1e6) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function isAdminAuthorized(req) {
  const headerVal = req.headers['x-admin-password'] || '';
  const a = Buffer.from(String(headerVal), 'utf8');
  const b = Buffer.from(String(ADMIN_PASSWORD), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const allowedRootImages = new Set([
  '1795448273390.jpg',
  '1795448572602.jpg',
  '1795448585057.jpg',
]);

const htmlPage = `<!DOCTYPE html>
<html lang="am">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="google-site-verification" content="0uqsLANTDpAi_ixeaOjGyYczRGibpgfGZyc0DFEzdjU" />
  <title>ጉዞ ፕላስ | Guzo Plus</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f3f7f4;
      color: #16241c;
      line-height: 1.6;
    }
    .hero {
      max-width: 780px;
      margin: 36px auto;
      background: #ffffff;
      padding: 32px 24px;
      border-radius: 16px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.08);
      text-align: center;
    }
    .badge {
      display: inline-block;
      background: #dcfce7;
      color: #166534;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 30px;
      color: #15803d;
    }
    .lead {
      font-size: 16px;
      color: #374151;
      margin: 0 0 22px;
    }
    .gallery {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin: 20px 0 24px;
    }
    .gallery figure {
      margin: 0;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
    }
    .gallery img {
      width: 100%;
      height: 185px;
      object-fit: cover;
      display: block;
    }
    .gallery figcaption {
      padding: 8px 10px;
      font-size: 13px;
      color: #374151;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
      margin: 20px 0 26px;
      text-align: left;
    }
    .box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 14px;
    }
    .box h3 {
      margin: 0 0 4px;
      font-size: 15px;
      color: #111827;
    }
    .box p {
      margin: 0;
      font-size: 13px;
      color: #4b5563;
    }
    .card {
      margin-top: 22px;
      padding: 20px;
      background: #f8faf9;
      border: 1px solid #d1fae5;
      border-radius: 14px;
      text-align: left;
    }
    .card h2 {
      margin: 0 0 14px;
      font-size: 20px;
      color: #14532d;
      text-align: center;
    }
    .card h3 {
      margin: 18px 0 10px;
      font-size: 16px;
      color: #14532d;
    }
    .field {
      margin-bottom: 12px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 4px;
      color: #1f2937;
    }
    input, select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 15px;
      background: #ffffff;
    }
    .btn {
      width: 100%;
      background: #15803d;
      color: #ffffff;
      border: none;
      padding: 12px 20px;
      border-radius: 10px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    }
    .btn:hover {
      background: #166534;
    }
    .btn-sm {
      width: auto;
      padding: 7px 12px;
      font-size: 13px;
      border-radius: 6px;
      margin-right: 6px;
      margin-top: 6px;
    }
    .btn-secondary {
      background: #0369a1;
    }
    .btn-secondary:hover {
      background: #075985;
    }
    .btn-danger {
      background: #b91c1c;
    }
    .btn-danger:hover {
      background: #991b1b;
    }
    #msg, #driverMsg, #adminMsg {
      margin-top: 10px;
      font-size: 14px;
      font-weight: bold;
      text-align: center;
    }
    .login-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .login-row input {
      flex: 1 1 200px;
    }
    .ride-item {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .ride-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .status-pill {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: bold;
      background: #fef3c7;
      color: #92400e;
    }
    .status-accepted {
      background: #dbeafe;
      color: #1e40af;
    }
    .status-completed {
      background: #dcfce7;
      color: #166534;
    }
    .ride-meta {
      font-size: 13px;
      color: #374151;
      margin-top: 6px;
    }
    .footer {
      margin-top: 24px;
      font-size: 13px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <main class="hero">
    <div class="badge">ጉዞ ፕላስ • Guzo Plus</div>
    <h1>ፈጣን እና አስተማማኝ የጉዞ አገልግሎት</h1>
    <p class="lead">
      በአዲስ አበባ እና በዙሪያዋ ፈጣን፣ ምቹ እና አስተማማኝ የጉዞና የትራንስፖርት መፍትሄ።<br />
      Fast, safe, and reliable ride-sharing experience.
    </p>

    <section class="gallery">
      <figure>
        <img src="/1795448273390.jpg" alt="ጉዞ ፕላስ የከተማ ትራንስፖርት" />
        <figcaption>ጉዞ ፕላስ • Guzo Plus</figcaption>
      </figure>
      <figure>
        <img src="/1795448572602.jpg" alt="ጉዞ ፕላስ ትልቅ ስክሪን ማስታወቂያ" />
        <figcaption>የጉዞ ፕላስ ከተማ ማስታወቂያ</figcaption>
      </figure>
      <figure>
        <img src="/1795448585057.jpg" alt="ጉዞ ፕላስ በመብራት ላይ የቆመ መኪና" />
        <figcaption>በመብራት ላይ የቆመ ጉዞ ፕላስ</figcaption>
      </figure>
    </section>

    <section class="features">
      <div class="box">
        <h3>ፈጣን ጥሪ</h3>
        <p>በቀላሉ እና በፍጥነት ቅርብ ያለ ተሽከርካሪ ያግኙ።</p>
      </div>
      <div class="box">
        <h3>አስተማማኝነት</h3>
        <p>ግልጽ ክፍያ እና ደህንነቱ የተጠበቀ የጉዞ ልምድ።</p>
      </div>
      <div class="box">
        <h3>ቀላል አጠቃቀም</h3>
        <p>በስልክ እና በድረ-ገጽ በቀላሉ የሚደረስ አገልግሎት።</p>
      </div>
    </section>

    <section id="book" class="card">
      <h2>የጉዞ ጥያቄ ያስገቡ (Request a Ride)</h2>
      <form id="rideForm">
        <div class="field">
          <label for="name">ሙሉ ስም</label>
          <input id="name" name="name" type="text" required placeholder="ለምሳሌ፡ አበበ ከበደ" />
        </div>
        <div class="field">
          <label for="phone">ስልክ ቁጥር</label>
          <input id="phone" name="phone" type="tel" required placeholder="09..." />
        </div>
        <div class="field">
          <label for="pickup">መነሻ ቦታ (Pickup)</label>
          <input id="pickup" name="pickup" type="text" required placeholder="ለምሳሌ፡ ጎተራ" />
        </div>
        <div class="field">
          <label for="dropoff">መድረሻ ቦታ (Drop-off)</label>
          <input id="dropoff" name="dropoff" type="text" required placeholder="ለምሳሌ፡ ቦሌ" />
        </div>
        <button class="btn" type="submit">ጉዞ ይጠይቁ</button>
      </form>
      <div id="msg"></div>
    </section>
<div id="admin-status" class="status-banner" role="status"></div>

<div id="rides-list"></div>

    <section id="driver-register" class="card">
      <h2>የአሽከርካሪ ምዝገባ (Driver Registration)</h2>
      <form id="driverForm">
        <div class="field">
          <label for="driverName">የአሽከርካሪ ሙሉ ስም</label>
          <input id="driverName" name="driverName" type="text" required placeholder="ለምሳሌ፡ ታደሰ በቀለ" />
        </div>
        <div class="field">
          <label for="driverPhone">ስልክ ቁጥር</label>
          <input id="driverPhone" name="driverPhone" type="tel" required placeholder="09..." />
        </div>
        <div class="field">
          <label for="vehicleType">የተሽከርካሪ ዓይነት (Vehicle Type)</label>
          <select id="vehicleType" name="vehicleType" required>
            <option value="Sedan / ሲዳን">Sedan / ሲዳን</option>
            <option value="Minivan / ሚኒቫን">Minivan / ሚኒቫን</option>
            <option value="SUV / ኤስ.ዩ.ቪ">SUV / ኤስ.ዩ.ቪ</option>
            <option value="Motorcycle / ሞተርሳይክል">Motorcycle / ሞተርሳይክል</option>
          </select>
        </div>
        <div class="field">
          <label for="plateNumber">የሰሌዳ ቁጥር (Plate Number)</label>
          <input id="plateNumber" name="plateNumber" type="text" required placeholder="ለምሳሌ፡ 3-A12345 AA" />
        </div>
        <button class="btn btn-secondary" type="submit">እንደ አሽከርካሪ ይመዝገቡ</button>
      </form>
      <div id="driverMsg"></div>
    </section>

    <section id="admin" class="card">
      <h2>የአስተዳደር ክፍል — የይለፍ ቃል ያስገቡ</h2>
      <div class="login-row">
        <input id="adminPassInput" type="password" placeholder="የአስተዳደር የይለፍ ቃል (Password)" />
        <button id="unlockAdminBtn" class="btn btn-sm btn-secondary" type="button">ግባ</button>
        <button id="lockAdminBtn" class="btn btn-sm btn-danger" type="button" style="display:none;">ውጣ (Lock)</button>
      </div>
      <div id="adminMsg"></div>
      <h3>የጉዞ ጥያቄዎች</h3>
      <div id="ridesList"></div>
      <h3>የተመዘገቡ አሽከርካሪዎች</h3>
      <div id="driversList"></div>
    </section>

    <div class="footer">
      © 2026 Guzo Plus (ጉዞ ፕላስ) — https://guzo-plus-05wo.onrender.com/
    </div>
  </main>

  <script>
    const form = document.getElementById('rideForm');
    const msg = document.getElementById('msg');
    const driverForm = document.getElementById('driverForm');
    const driverMsg = document.getElementById('driverMsg');
    const ridesList = document.getElementById('ridesList');
    const driversList = document.getElementById('driversList');
    const adminMsg = document.getElementById('adminMsg');
    const passInput = document.getElementById('adminPassInput');
    const unlockBtn = document.getElementById('unlockAdminBtn');
    const lockBtn = document.getElementById('lockAdminBtn');

    let adminPassword = sessionStorage.getItem('guzo_admin_pass') || '';
    if (adminPassword) {
      passInput.value = adminPassword;
      lockBtn.style.display = 'inline-block';
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function statusLabel(status) {
      if (status === 'accepted' || status === 'approved') return 'ተቀባይነት አግኝቷል';
      if (status === 'completed') return 'ተጠናቋል';
      return 'በመጠባበቅ ላይ';
    }

    function statusClass(status) {
      if (status === 'accepted' || status === 'approved') return 'status-pill status-accepted';
      if (status === 'completed') return 'status-pill status-completed';
      return 'status-pill';
    }

    function adminHeaders(extra = {}) {
      return {
        ...extra,
        'x-admin-password': adminPassword,
      };
    }

    async function loadAdminData() {
      if (!adminPassword) {
        adminMsg.style.color = '#4b5563';
        adminMsg.textContent = 'ዝርዝሩን ለማየት የአስተዳደር የይለፍ ቃል ያስገቡ።';
        ridesList.innerHTML = '';
        driversList.innerHTML = '';
        return;
      }

      adminMsg.style.color = '#374151';
      adminMsg.textContent = 'መረጃዎች እየተጫኑ ነው...';
      try {
        const [ridesRes, driversRes] = await Promise.all([
          fetch('/api/rides', { headers: adminHeaders() }),
          fetch('/api/drivers', { headers: adminHeaders() }),
        ]);
        const ridesData = await ridesRes.json();
        const driversData = await driversRes.json();

        if (!ridesRes.ok || !driversRes.ok) {
          adminMsg.style.color = '#b91c1c';
          adminMsg.textContent = ridesData.error || driversData.error || 'የይለፍ ቃል ስህተት ነው።';
          ridesList.innerHTML = '';
          driversList.innerHTML = '';
          return;
        }

        adminMsg.textContent = '';
        lockBtn.style.display = 'inline-block';

        const rides = ridesData.rides || [];
        if (!rides.length) {
          ridesList.innerHTML = '<p style="text-align:center;color:#6b7280;">እስካሁን የተመዘገበ የጉዞ ጥያቄ የለም።</p>';
        } else {
          ridesList.innerHTML = rides.map((r) => \`
            <div class="ride-item">
              <div class="ride-top">
                <strong>\${escapeHtml(r.name)} (\${escapeHtml(r.phone)})</strong>
                <span class="\${statusClass(r.status)}">\${statusLabel(r.status)}</span>
              </div>
              <div class="ride-meta">
                መነሻ፡ <strong>\${escapeHtml(r.pickup)}</strong> → መድረሻ፡ <strong>\${escapeHtml(r.dropoff)}</strong>
              </div>
              <div>
                <button class="btn btn-sm btn-secondary" type="button" onclick="updateStatus('\${r._id}', 'accepted')">ተቀበል</button>
                <button class="btn btn-sm" type="button" onclick="updateStatus('\${r._id}', 'completed')">አጠናቅቅ</button>
                <button class="btn btn-sm btn-danger" type="button" onclick="deleteRide('\${r._id}')">አጥፋ</button>
              </div>
            </div>
          \`).join('');
        }

        const drivers = driversData.drivers || [];
        if (!drivers.length) {
          driversList.innerHTML = '<p style="text-align:center;color:#6b7280;">እስካሁን የተመዘገበ አሽከርካሪ የለም።</p>';
        } else {
          driversList.innerHTML = drivers.map((d) => \`
            <div class="ride-item">
              <div class="ride-top">
                <strong>\${escapeHtml(d.name)} (\${escapeHtml(d.phone)})</strong>
                <span class="\${statusClass(d.status)}">\${statusLabel(d.status)}</span>
              </div>
              <div class="ride-meta">
                ተሽከርካሪ፡ <strong>\${escapeHtml(d.vehicleType)}</strong> | ሰሌዳ፡ <strong>\${escapeHtml(d.plateNumber)}</strong>
              </div>
              <div>
                <button class="btn btn-sm btn-secondary" type="button" onclick="updateDriverStatus('\${d._id}', 'approved')">አጽድቅ</button>
                <button class="btn btn-sm btn-danger" type="button" onclick="deleteDriver('\${d._id}')">አጥፋ</button>
              </div>
            </div>
          \`).join('');
        }
      } catch {
        adminMsg.style.color = '#b91c1c';
        adminMsg.textContent = 'ዝርዝሩን ሲጫን የኔትወርክ ስህተት አጋጥሟል።';
      }
    }

    unlockBtn.addEventListener('click', () => {
      adminPassword = passInput.value.trim();
      if (!adminPassword) {
        adminMsg.style.color = '#b91c1c';
        adminMsg.textContent = 'እባክዎ የይለፍ ቃል ያስገቡ።';
        return;
      }
      sessionStorage.setItem('guzo_admin_pass', adminPassword);
      loadAdminData();
    });

    lockBtn.addEventListener('click', () => {
      adminPassword = '';
      passInput.value = '';
      sessionStorage.removeItem('guzo_admin_pass');
      lockBtn.style.display = 'none';
      ridesList.innerHTML = '';
      driversList.innerHTML = '';
      adminMsg.style.color = '#4b5563';
      adminMsg.textContent = 'ተቆልፏል። እንደገና ለማየት የይለፍ ቃል ያስገቡ።';
    });

    window.updateStatus = async function(id, status) {
      try {
        const res = await fetch('/api/rides/' + encodeURIComponent(id), {
          method: 'PATCH',
          headers: adminHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ status }),
        });
        if (res.ok) loadAdminData();
      } catch {}
    };

    window.deleteRide = async function(id) {
      try {
        const res = await fetch('/api/rides/' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: adminHeaders(),
        });
        if (res.ok) loadAdminData();
      } catch {}
    };

    window.updateDriverStatus = async function(id, status) {
      try {
        const res = await fetch('/api/drivers/' + encodeURIComponent(id), {
          method: 'PATCH',
          headers: adminHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ status }),
        });
        if (res.ok) loadAdminData();
      } catch {}
    };

    window.deleteDriver = async function(id) {
      try {
        const res = await fetch('/api/drivers/' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: adminHeaders(),
        });
        if (res.ok) loadAdminData();
      } catch {}
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.style.color = '#1f2937';
      msg.textContent = 'እየተላከ ነው...';

      const payload = {
        name: document.getElementById('name').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        pickup: document.getElementById('pickup').value.trim(),
        dropoff: document.getElementById('dropoff').value.trim(),
      };

      try {
        const res = await fetch('/api/rides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          msg.style.color = '#b91c1c';
          msg.textContent = data.error || 'መላክ አልተቻለም።';
          return;
        }
        msg.style.color = '#15803d';
        msg.textContent = 'የጉዞ ጥያቄዎ በተሳካ ሁኔታ ተመዝግቧል!';
        form.reset();
        if (adminPassword) loadAdminData();
      } catch {
        msg.style.color = '#b91c1c';
        msg.textContent = 'የኔትወርክ ስህተት አጋጥሟል።';
      }
    });

    driverForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      driverMsg.style.color = '#1f2937';
      driverMsg.textContent = 'እየተመዘገበ ነው...';

      const payload = {
        name: document.getElementById('driverName').value.trim(),
        phone: document.getElementById('driverPhone').value.trim(),
        vehicleType: document.getElementById('vehicleType').value.trim(),
        plateNumber: document.getElementById('plateNumber').value.trim(),
      };

      try {
        const res = await fetch('/api/drivers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          driverMsg.style.color = '#b91c1c';
          driverMsg.textContent = data.error || 'መመዝገብ አልተቻለም።';
          return;
        }
        driverMsg.style.color = '#15803d';
        driverMsg.textContent = 'የአሽከርካሪ ምዝገባዎ በተሳካ ሁኔታ ተልኳል! በቅርቡ ይገመገማል።';
        driverForm.reset();
        if (adminPassword) loadAdminData();
      } catch {
        driverMsg.style.color = '#b91c1c';
        driverMsg.textContent = 'የኔትወርክ ስህተት አጋጥሟል።';
      }
    });

    loadAdminData();
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const cleanUrl = (req.url || '/').split('?')[0];

  if (req.method === 'GET') {
    const rootFile = cleanUrl.replace(/^\/+/, '');
    if (allowedRootImages.has(rootFile)) {
      const filePath = path.join(__dirname, rootFile);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        return fs.createReadStream(filePath).pipe(res);
      }
    }

    if (cleanUrl.startsWith('/public/')) {
      const safeRel = path.normalize(cleanUrl.replace(/^\/public\//, ''));
      if (safeRel.startsWith('..')) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Forbidden');
      }
      const filePath = path.join(__dirname, 'public', safeRel);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        return fs.createReadStream(filePath).pipe(res);
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Image not found');
    }
  }

  if (cleanUrl === '/health/db' && req.method === 'GET') {
    return sendJson(res, 200, { status: dbStatus });
  }

  if (cleanUrl === '/api/rides' && req.method === 'GET') {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'ያልተፈቀደ (Unauthorized) — ትክክለኛ የይለፍ ቃል ያስገቡ።' });
    }
    if (!db) return sendJson(res, 503, { error: 'Database not connected' });
    const rides = await db.collection('rides').find().sort({ createdAt: -1 }).limit(50).toArray();
    return sendJson(res, 200, { rides });
  }

  if (cleanUrl === '/api/rides' && req.method === 'POST') {
    if (!db) return sendJson(res, 503, { error: 'Database not connected' });
    try {
      const body = await readJsonBody(req);
      const name = (body.name || '').trim();
      const phone = (body.phone || '').trim();
      const pickup = (body.pickup || '').trim();
      const dropoff = (body.dropoff || '').trim();

      if (!name || !phone || !pickup || !dropoff) {
        return sendJson(res, 400, { error: 'ሁሉንም ባዶ ቦታዎች ይሙሉ።' });
      }

      const doc = {
        name,
        phone,
        pickup,
        dropoff,
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await db.collection('rides').insertOne(doc);
      await sendTelegramNotification(doc);
      return sendJson(res, 201, { ok: true, id: result.insertedId, ride: doc });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'Invalid request' });
    }
  }

  const rideIdMatch = cleanUrl.match(/^\/api\/rides\/([a-fA-F0-9]{24})$/);
  if (rideIdMatch) {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'ያልተፈቀደ (Unauthorized) — ትክክለኛ የይለፍ ቃል ያስገቡ።' });
    }
    if (!db) return sendJson(res, 503, { error: 'Database not connected' });
    const _id = new ObjectId(rideIdMatch[1]);

    if (req.method === 'PATCH') {
      try {
        const body = await readJsonBody(req);
        const allowed = ['pending', 'accepted', 'completed'];
        if (!allowed.includes(body.status)) {
          return sendJson(res, 400, { error: 'ልክ ያልሆነ ሁኔታ (status)' });
        }
        const result = await db.collection('rides').updateOne(
          { _id },
          { $set: { status: body.status, updatedAt: new Date() } }
        );
        if (!result.matchedCount) return sendJson(res, 404, { error: 'ጥያቄው አልተገኘም' });
        return sendJson(res, 200, { ok: true, status: body.status });
      } catch (err) {
        return sendJson(res, 400, { error: err.message || 'Invalid request' });
      }
    }

    if (req.method === 'DELETE') {
      const result = await db.collection('rides').deleteOne({ _id });
      if (!result.deletedCount) return sendJson(res, 404, { error: 'ጥያቄው አልተገኘም' });
      return sendJson(res, 200, { ok: true });
    }
  }

  if (cleanUrl === '/api/drivers' && req.method === 'GET') {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'ያልተፈቀደ (Unauthorized) — ትክክለኛ የይለፍ ቃል ያስገቡ።' });
    }
    if (!db) return sendJson(res, 503, { error: 'Database not connected' });
    const drivers = await db.collection('drivers').find().sort({ createdAt: -1 }).limit(50).toArray();
    return sendJson(res, 200, { drivers });
  }

  if (cleanUrl === '/api/drivers' && req.method === 'POST') {
    if (!db) return sendJson(res, 503, { error: 'Database not connected' });
    try {
      const body = await readJsonBody(req);
      const name = (body.name || '').trim();
      const phone = (body.phone || '').trim();
      const vehicleType = (body.vehicleType || '').trim();
      const plateNumber = (body.plateNumber || '').trim();

      if (!name || !phone || !vehicleType || !plateNumber) {
        return sendJson(res, 400, { error: 'ሁሉንም የአሽከርካሪ መረጃዎች ይሙሉ።' });
      }

      const doc = {
        name,
        phone,
        vehicleType,
        plateNumber,
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await db.collection('drivers').insertOne(doc);
      await sendDriverNotification(doc);
      return sendJson(res, 201, { ok: true, id: result.insertedId, driver: doc });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'Invalid request' });
    }
  }

  const driverIdMatch = cleanUrl.match(/^\/api\/drivers\/([a-fA-F0-9]{24})$/);
  if (driverIdMatch) {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: 'ያልተፈቀደ (Unauthorized) — ትክክለኛ የይለፍ ቃል ያስገቡ።' });
    }
    if (!db) return sendJson(res, 503, { error: 'Database not connected' });
    const _id = new ObjectId(driverIdMatch[1]);

    if (req.method === 'PATCH') {
      try {
        const body = await readJsonBody(req);
        const allowed = ['pending', 'approved'];
        if (!allowed.includes(body.status)) {
          return sendJson(res, 400, { error: 'ልክ ያልሆነ ሁኔታ (status)' });
        }
        const result = await db.collection('drivers').updateOne(
          { _id },
          { $set: { status: body.status, updatedAt: new Date() } }
        );
        if (!result.matchedCount) return sendJson(res, 404, { error: 'አሽከርካሪው አልተገኘም' });
        return sendJson(res, 200, { ok: true, status: body.status });
      } catch (err) {
        return sendJson(res, 400, { error: err.message || 'Invalid request' });
      }
    }

    if (req.method === 'DELETE') {
      const result = await db.collection('drivers').deleteOne({ _id });
      if (!result.deletedCount) return sendJson(res, 404, { error: 'አሽከርካሪው አልተገኘም' });
      return sendJson(res, 200, { ok: true });
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlPage);
});

server.listen(PORT, async () => {
  console.log(`Guzo Plus server running on port ${PORT}`);
  await connectAtlas();
  pollTelegramUpdates();
});
