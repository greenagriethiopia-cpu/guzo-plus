
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
const DISPATCH_PHONE = process.env.DISPATCH_PHONE || '0923579382';
const SHORT_CODE = process.env.SHORT_CODE || '';

const BASE_FARE = Number(process.env.BASE_FARE || 200);
const MORNING_SURCHARGE = Number(process.env.MORNING_SURCHARGE || 50);
const EVENING_SURCHARGE = Number(process.env.EVENING_SURCHARGE || 50);
const SHARED_DISCOUNT_RATE = Number(process.env.SHARED_DISCOUNT_RATE || 0.25);

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

function getCurrentEthiopiaHour() {
  const now = new Date();
  return (now.getUTCHours() + 3) % 24;
}

function detectTimePeriod(selectedPeriod) {
  if (selectedPeriod === 'morning' || selectedPeriod === 'evening' || selectedPeriod === 'normal') {
    return selectedPeriod;
  }
  const hour = getCurrentEthiopiaHour();
  if (hour >= 6 && hour < 10) return 'morning';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'normal';
}

function periodLabel(period) {
  if (period === 'morning') return 'ጠዋት ታሪፍ (Peak)';
  if (period === 'evening') return 'ማታ ታሪፍ (Peak)';
  return 'መደበኛ ሰዓት ታሪፍ';
}

function rideModeLabel(mode) {
  return mode === 'shared' ? 'ሼር (ጋራ ጉዞ)' : 'የግል (ብቻዬን)';
}

function calculateFare({ rideMode, timeSlot }) {
  const period = detectTimePeriod(timeSlot);
  let fare = BASE_FARE;

  if (period === 'morning') {
    fare += MORNING_SURCHARGE;
  } else if (period === 'evening') {
    fare += EVENING_SURCHARGE;
  }

  const isShared = rideMode === 'shared';
  if (isShared) {
    fare = Math.round(fare * (1 - SHARED_DISCOUNT_RATE));
  }

  return {
    period,
    periodText: periodLabel(period),
    rideMode: isShared ? 'shared' : 'solo',
    rideModeText: rideModeLabel(isShared ? 'shared' : 'solo'),
    estimatedFare: fare,
  };
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
    `👥 *ዓይነት:* ${ride.rideModeText || rideModeLabel(ride.rideMode)}`,
    `🕒 *ታሪፍ:* ${ride.periodText || periodLabel(ride.timePeriod)}`,
    `💰 *ግምታዊ ዋጋ:* ${ride.estimatedFare ?? BASE_FARE} ብር`,
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
      const modeText = r.rideModeText || rideModeLabel(r.rideMode);
      const fareText = r.estimatedFare != null ? `${r.estimatedFare} ብር` : `${BASE_FARE} ብር`;
      lines.push(
        `${idx + 1}. *${r.name}* (${r.phone}) — _${r.status || 'pending'}_`,
        `   📍 ${r.pickup} → 🎯 ${r.dropoff}`,
        `   👥 ${modeText} | 💰 ${fareText}`
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

function readFormBody(req) {
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
      const params = new URLSearchParams(raw);
      const obj = {};
      for (const [k, v] of params.entries()) {
        obj[k] = v;
      }
      resolve(obj);
    });
    req.on('error', reject);
  });
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

function isValidPassword(pass) {
  const a = Buffer.from(String(pass || ''), 'utf8');
  const b = Buffer.from(String(ADMIN_PASSWORD), 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const allowedRootImages = new Set([
  '1795448273390.jpg',
  '1795448572602.jpg',
  '1795448585057.jpg',
]);

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="36" fill="#15803d"/>
  <text x="96" y="116" text-anchor="middle" font-size="76" font-family="sans-serif" fill="#ffffff" font-weight="bold">GP</text>
</svg>`;

const manifestJson = JSON.stringify({
  name: 'ጉዞ ፕላስ | Guzo Plus',
  short_name: 'ጉዞ ፕላስ',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#15803d',
  icons: [
    {
      src: '/icon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any maskable',
    },
  ],
});

function renderPage({ notice = '', noticeOk = true, adminPass = '', rides = [], drivers = [], showPhotos = false }) {
  const safePass = escapeHtml(adminPass);
  const rawPhone = String(DISPATCH_PHONE || '0923579382').trim();
  const cleanTelHref = rawPhone.replace(/[^0-9+*#]/g, '') || '0923579382';
  const safePhone = escapeHtml(rawPhone);
  const safeTelHref = escapeHtml(cleanTelHref);

  const rawShort = String(SHORT_CODE || '').trim();
  const cleanShortHref = rawShort.replace(/[^0-9+*#]/g, '');
  const shortCodeBtnHtml = cleanShortHref
    ? `<a class="call-btn btn-blue" href="tel:${escapeHtml(cleanShortHref)}">⚡ አጭር ቁጥር ይደውሉ: ${escapeHtml(rawShort)}</a>`
    : '';

  const passHiddenInput = adminPass
    ? `<input type="hidden" name="password" value="${safePass}" />`
    : '';

  const discountPercent = Math.round(SHARED_DISCOUNT_RATE * 100);

  let adminSectionHtml = `
    <div id="admin" class="box">
      <h2>አስተዳደር</h2>
      <form method="POST" action="/admin">
        <label for="adminPass">የይለፍ ቃል</label>
        <input id="adminPass" name="password" type="password" value="${safePass}" required />
        <button type="submit" class="btn-blue">ግባ</button>
      </form>
  `;

  if (adminPass) {
    adminSectionHtml += `
      <form method="POST" action="/admin/logout">
        <button type="submit" class="btn-red">ውጣ</button>
      </form>
      <h3>የጉዞ ጥያቄዎች</h3>
    `;

    if (!rides.length) {
      adminSectionHtml += `<p>ምንም የጉዞ ጥያቄ የለም።</p>`;
    } else {
      adminSectionHtml += rides.map((r) => {
        const modeText = r.rideModeText || rideModeLabel(r.rideMode);
        const fareText = r.estimatedFare != null ? `${r.estimatedFare} ብር` : `${BASE_FARE} ብር`;
        return `
        <div class="item">
          <div><b>${escapeHtml(r.name)}</b> (${escapeHtml(r.phone)}) - ${escapeHtml(statusLabel(r.status))}</div>
          <div>${escapeHtml(r.pickup)} -> ${escapeHtml(r.dropoff)}</div>
          <div>${escapeHtml(modeText)} | <b>${escapeHtml(fareText)}</b></div>
          <form method="POST" action="/admin/rides/${escapeHtml(String(r._id))}/status">
            ${passHiddenInput}
            <input type="hidden" name="status" value="accepted" />
            <button type="submit" class="btn-blue">ተቀበል</button>
          </form>
          <form method="POST" action="/admin/rides/${escapeHtml(String(r._id))}/status">
            ${passHiddenInput}
            <input type="hidden" name="status" value="completed" />
            <button type="submit">አጠናቅቅ</button>
          </form>
          <form method="POST" action="/admin/rides/${escapeHtml(String(r._id))}/delete">
            ${passHiddenInput}
            <button type="submit" class="btn-red">አጥፋ</button>
          </form>
        </div>
      `;
      }).join('');
    }

    adminSectionHtml += `<h3>አሽከርካሪዎች</h3>`;
    if (!drivers.length) {
      adminSectionHtml += `<p>ምንም የተመዘገበ አሽከርካሪ የለም።</p>`;
    } else {
      adminSectionHtml += drivers.map((d) => `
        <div class="item">
          <div><b>${escapeHtml(d.name)}</b> (${escapeHtml(d.phone)}) - ${escapeHtml(statusLabel(d.status))}</div>
          <div>${escapeHtml(d.vehicleType)} | ${escapeHtml(d.plateNumber)}</div>
          <form method="POST" action="/admin/drivers/${escapeHtml(String(d._id))}/status">
            ${passHiddenInput}
            <input type="hidden" name="status" value="approved" />
            <button type="submit" class="btn-blue">አጽድቅ</button>
          </form>
          <form method="POST" action="/admin/drivers/${escapeHtml(String(d._id))}/delete">
            ${passHiddenInput}
            <button type="submit" class="btn-red">አጥፋ</button>
          </form>
        </div>
      `).join('');
    }
  }

  adminSectionHtml += `</div>`;

  const photosHtml = showPhotos
    ? `
      <div id="photos" class="box">
        <h2>ፎቶዎች</h2>
        <img src="/1795448273390.jpg" alt="ጉዞ ፕላስ" />
        <img src="/1795448572602.jpg" alt="ማስታወቂያ" />
        <img src="/1795448585057.jpg" alt="መኪና" />
        <p><a href="/">ወደ መነሻ ይመለሱ</a></p>
      </div>
    `
    : '';

  const noticeBox = notice
    ? `<div class="notice ${noticeOk ? 'ok' : 'err'}">${escapeHtml(notice)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="am">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#15803d" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="google-site-verification" content="0uqsLANTDpAi_ixeaOjGyYczRGibpgfGZyc0DFEzdjU" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <title>ጉዞ ፕላስ | Guzo Plus</title>
  <style>
    body{margin:0;padding:8px;font-family:sans-serif;font-size:15px;background:#fff;color:#111}
    .wrap{max-width:640px;margin:0 auto}
    h1{font-size:20px;margin:4px 0;color:#15803d}
    h2{font-size:17px;margin:10px 0 6px;color:#14532d;border-bottom:1px solid #ccc;padding-bottom:3px}
    h3{font-size:15px;margin:8px 0 4px}
    p{margin:4px 0 8px}
    .nav{margin:8px 0}
    .nav a{margin-right:10px;color:#0369a1;font-weight:bold}
    .box{border:1px solid #bbb;padding:8px;margin-bottom:10px;background:#fafafa}
    label{display:block;font-weight:bold;margin:6px 0 2px}
    input,select,button{width:100%;padding:8px;font-size:15px;border:1px solid #666;box-sizing:border-box}
    button{background:#15803d;color:#fff;font-weight:bold;margin-top:6px;min-height:42px}
    .btn-blue{background:#0369a1}
    .btn-red{background:#b91c1c}
    .call-btn{display:block;padding:11px;background:#15803d;color:#fff;font-weight:bold;text-decoration:none;text-align:center;margin:4px 0;min-height:22px}
    .item{border:1px solid #ccc;padding:6px;margin-bottom:6px;background:#fff}
    .notice{padding:8px;margin-bottom:8px;font-weight:bold;border:1px solid #666}
    .ok{background:#dcfce7;color:#14532d}
    .err{background:#fee2e2;color:#991b1b}
    img{max-width:100%;height:auto;display:block;margin:6px 0}
    .foot{margin-top:12px;font-size:13px;color:#444}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>ጉዞ ፕላስ (Guzo Plus)</h1>
    <div class="box">
      <b>በአንድ ንክኪ ይደውሉ (አንድሮይድ እና ሁሉም ስልክ):</b>
      <a class="call-btn" href="tel:${safeTelHref}">📞 ይደውሉ: ${safePhone}</a>
      ${shortCodeBtnHtml}
    </div>

    <div class="nav">
      <a href="#book">ጉዞ</a>
      <a href="#driver">አሽከርካሪ</a>
      <a href="#admin">አስተዳደር</a>
      <a href="/photos">ፎቶዎች</a>
    </div>

    ${noticeBox}

    <div id="book" class="box">
      <h2>ጉዞ ይጠይቁ</h2>
      <p>መነሻ ${escapeHtml(String(BASE_FARE))} ብር | ጠዋት +${escapeHtml(String(MORNING_SURCHARGE))} | ማታ +${escapeHtml(String(EVENING_SURCHARGE))} | ሼር ${escapeHtml(String(discountPercent))}% ቅናሽ</p>
      <form method="POST" action="/rides">
        <label for="name">ሙሉ ስም</label>
        <input id="name" name="name" type="text" required />
        <label for="phone">ስልክ ቁጥር</label>
        <input id="phone" name="phone" type="tel" required />
        <label for="pickup">መነሻ</label>
        <input id="pickup" name="pickup" type="text" required />
        <label for="dropoff">መድረሻ</label>
        <input id="dropoff" name="dropoff" type="text" required />
        <label for="rideMode">ዓይነት</label>
        <select id="rideMode" name="rideMode" required>
          <option value="shared">ሼር / ጋራ (${escapeHtml(String(discountPercent))}% ቅናሽ)</option>
          <option value="solo">የግል (ብቻዬን)</option>
        </select>
        <label for="timeSlot">ሰዓት ታሪፍ</label>
        <select id="timeSlot" name="timeSlot" required>
          <option value="auto">አሁን ያለው ሰዓት</option>
          <option value="morning">ጠዋት (+${escapeHtml(String(MORNING_SURCHARGE))} ብር)</option>
          <option value="evening">ማታ (+${escapeHtml(String(EVENING_SURCHARGE))} ብር)</option>
          <option value="normal">መደበኛ</option>
        </select>
        <button type="submit">ጉዞ ይጠይቁ</button>
      </form>
    </div>

    <div id="driver" class="box">
      <h2>አሽከርካሪ ምዝገባ</h2>
      <form method="POST" action="/drivers">
        <label for="driverName">ስም</label>
        <input id="driverName" name="driverName" type="text" required />
        <label for="driverPhone">ስልክ ቁጥር</label>
        <input id="driverPhone" name="driverPhone" type="tel" required />
        <label for="vehicleType">ተሽከርካሪ</label>
        <select id="vehicleType" name="vehicleType" required>
          <option value="Sedan / ሲዳን">Sedan / ሲዳን</option>
          <option value="Minivan / ሚኒቫን">Minivan / ሚኒቫን</option>
          <option value="SUV / ኤስ.ዩ.ቪ">SUV / ኤስ.ዩ.ቪ</option>
          <option value="Motorcycle / ሞተርሳይክል">Motorcycle / ሞተርሳይክል</option>
        </select>
        <label for="plateNumber">ሰሌዳ</label>
        <input id="plateNumber" name="plateNumber" type="text" required />
        <button type="submit" class="btn-blue">ይመዝገቡ</button>
      </form>
    </div>

    ${adminSectionHtml}
    ${photosHtml}

    <div class="foot">© 2026 Guzo Plus — በአንድሮይድ Chrome ላይ "Add to Home screen" በመጠቀም እንደ ቀላል App ማስቀመጥ ይቻላል።</div>
  </div>
</body>
</html>`;
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function fetchAdminLists() {
  if (!db) return { rides: [], drivers: [] };
  const [rides, drivers] = await Promise.all([
    db.collection('rides').find().sort({ createdAt: -1 }).limit(50).toArray(),
    db.collection('drivers').find().sort({ createdAt: -1 }).limit(50).toArray(),
  ]);
  return { rides, drivers };
}

const server = http.createServer(async (req, res) => {
  const cleanUrl = (req.url || '/').split('?')[0];

  if (req.method === 'GET') {
    if (cleanUrl === '/manifest.webmanifest' || cleanUrl === '/manifest.json') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json; charset=utf-8' });
      return res.end(manifestJson);
    }

    if (cleanUrl === '/icon.svg') {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' });
      return res.end(svgIcon);
    }

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

    if (cleanUrl === '/health/db') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ status: dbStatus }));
    }

    if (cleanUrl === '/photos') {
      return sendHtml(res, 200, renderPage({ showPhotos: true }));
    }

    return sendHtml(res, 200, renderPage({}));
  }

  if (req.method === 'POST') {
    try {
      const body = await readFormBody(req);

      if (cleanUrl === '/rides') {
        if (!db) {
          return sendHtml(res, 503, renderPage({ notice: 'ዳታቤዝ እስካሁን አልተገናኘም።', noticeOk: false }));
        }
        const name = (body.name || '').trim();
        const phone = (body.phone || '').trim();
        const pickup = (body.pickup || '').trim();
        const dropoff = (body.dropoff || '').trim();
        const rideMode = (body.rideMode || 'shared').trim();
        const timeSlot = (body.timeSlot || 'auto').trim();

        if (!name || !phone || !pickup || !dropoff) {
          return sendHtml(res, 400, renderPage({ notice: 'ሁሉንም ባዶ ቦታዎች ይሙሉ።', noticeOk: false }));
        }

        const fareInfo = calculateFare({ rideMode, timeSlot });

        const doc = {
          name,
          phone,
          pickup,
          dropoff,
          rideMode: fareInfo.rideMode,
          rideModeText: fareInfo.rideModeText,
          timePeriod: fareInfo.period,
          periodText: fareInfo.periodText,
          estimatedFare: fareInfo.estimatedFare,
          status: 'pending',
          createdAt: new Date(),
        };
        await db.collection('rides').insertOne(doc);
        await sendTelegramNotification(doc);
        return sendHtml(res, 200, renderPage({
          notice: `የጉዞ ጥያቄዎ ተመዝግቧል! (${fareInfo.rideModeText} • ${fareInfo.periodText} • ግምታዊ ዋጋ: ${fareInfo.estimatedFare} ብር)`,
          noticeOk: true,
        }));
      }

      if (cleanUrl === '/drivers') {
        if (!db) {
          return sendHtml(res, 503, renderPage({ notice: 'ዳታቤዝ እስካሁን አልተገናኘም።', noticeOk: false }));
        }
        const name = (body.driverName || body.name || '').trim();
        const phone = (body.driverPhone || body.phone || '').trim();
        const vehicleType = (body.vehicleType || '').trim();
        const plateNumber = (body.plateNumber || '').trim();

        if (!name || !phone || !vehicleType || !plateNumber) {
          return sendHtml(res, 400, renderPage({ notice: 'ሁሉንም የአሽከርካሪ መረጃዎች ይሙሉ።', noticeOk: false }));
        }

        const doc = {
          name,
          phone,
          vehicleType,
          plateNumber,
          status: 'pending',
          createdAt: new Date(),
        };
        await db.collection('drivers').insertOne(doc);
        await sendDriverNotification(doc);
        return sendHtml(res, 200, renderPage({ notice: 'የአሽከርካሪ ምዝገባዎ በተሳካ ሁኔታ ተልኳል!', noticeOk: true }));
      }

      if (cleanUrl === '/admin') {
        const pass = (body.password || '').trim();
        if (!isValidPassword(pass)) {
          return sendHtml(res, 401, renderPage({ notice: 'የይለፍ ቃል ስህተት ነው።', noticeOk: false }));
        }
        const lists = await fetchAdminLists();
        return sendHtml(res, 200, renderPage({
          adminPass: pass,
          rides: lists.rides,
          drivers: lists.drivers,
        }));
      }

      if (cleanUrl === '/admin/logout') {
        return sendHtml(res, 200, renderPage({ notice: 'ተቆልፏል።', noticeOk: true }));
      }

      const rideStatusMatch = cleanUrl.match(/^\/admin\/rides\/([a-fA-F0-9]{24})\/status$/);
      if (rideStatusMatch) {
        const pass = (body.password || '').trim();
        if (!isValidPassword(pass)) {
          return sendHtml(res, 401, renderPage({ notice: 'የይለፍ ቃል ስህተት ነው።', noticeOk: false }));
        }
        const allowed = ['pending', 'accepted', 'completed'];
        if (db && allowed.includes(body.status)) {
          await db.collection('rides').updateOne(
            { _id: new ObjectId(rideStatusMatch[1]) },
            { $set: { status: body.status, updatedAt: new Date() } }
          );
        }
        const lists = await fetchAdminLists();
        return sendHtml(res, 200, renderPage({
          notice: 'የጉዞ ሁኔታ ተቀይሯል።',
          noticeOk: true,
          adminPass: pass,
          rides: lists.rides,
          drivers: lists.drivers,
        }));
      }

      const rideDeleteMatch = cleanUrl.match(/^\/admin\/rides\/([a-fA-F0-9]{24})\/delete$/);
      if (rideDeleteMatch) {
        const pass = (body.password || '').trim();
        if (!isValidPassword(pass)) {
          return sendHtml(res, 401, renderPage({ notice: 'የይለፍ ቃል ስህተት ነው።', noticeOk: false }));
        }
        if (db) {
          await db.collection('rides').deleteOne({ _id: new ObjectId(rideDeleteMatch[1]) });
        }
        const lists = await fetchAdminLists();
        return sendHtml(res, 200, renderPage({
          notice: 'የጉዞ ጥያቄ ተሰርዟል።',
          noticeOk: true,
          adminPass: pass,
          rides: lists.rides,
          drivers: lists.drivers,
        }));
      }

      const driverStatusMatch = cleanUrl.match(/^\/admin\/drivers\/([a-fA-F0-9]{24})\/status$/);
      if (driverStatusMatch) {
        const pass = (body.password || '').trim();
        if (!isValidPassword(pass)) {
          return sendHtml(res, 401, renderPage({ notice: 'የይለፍ ቃል ስህተት ነው።', noticeOk: false }));
        }
        const allowed = ['pending', 'approved'];
        if (db && allowed.includes(body.status)) {
          await db.collection('drivers').updateOne(
            { _id: new ObjectId(driverStatusMatch[1]) },
            { $set: { status: body.status, updatedAt: new Date() } }
          );
        }
        const lists = await fetchAdminLists();
        return sendHtml(res, 200, renderPage({
          notice: 'የአሽከርካሪ ሁኔታ ተቀይሯል።',
          noticeOk: true,
          adminPass: pass,
          rides: lists.rides,
          drivers: lists.drivers,
        }));
      }

      const driverDeleteMatch = cleanUrl.match(/^\/admin\/drivers\/([a-fA-F0-9]{24})\/delete$/);
      if (driverDeleteMatch) {
        const pass = (body.password || '').trim();
        if (!isValidPassword(pass)) {
          return sendHtml(res, 401, renderPage({ notice: 'የይለፍ ቃል ስህተት ነው።', noticeOk: false }));
        }
        if (db) {
          await db.collection('drivers').deleteOne({ _id: new ObjectId(driverDeleteMatch[1]) });
        }
        const lists = await fetchAdminLists();
        return sendHtml(res, 200, renderPage({
          notice: 'አሽከርካሪው ተሰርዟል።',
          noticeOk: true,
          adminPass: pass,
          rides: lists.rides,
          drivers: lists.drivers,
        }));
      }
    } catch (err) {
      return sendHtml(res, 400, renderPage({ notice: err.message || 'ስህተት አጋጥሟል።', noticeOk: false }));
    }
  }

  return sendHtml(res, 200, renderPage({}));
});

server.listen(PORT, async () => {
  console.log(`Guzo Plus server running on port ${PORT}`);
  await connectAtlas();
  pollTelegramUpdates();
});
