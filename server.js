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
    body {
      margin: 0;
      padding: 8px;
      font-family: sans-serif;
      font-size: 15px;
      background: #ffffff;
      color: #111111;
    }
    .wrap {
      max-width: 680px;
      margin: 0 auto;
    }
    h1 {
      font-size: 20px;
      margin: 4px 0;
      color: #15803d;
    }
    h2 {
      font-size: 17px;
      margin: 14px 0 6px;
      color: #14532d;
      border-bottom: 1px solid #cccccc;
      padding-bottom: 4px;
    }
    h3 {
      font-size: 15px;
      margin: 10px 0 4px;
    }
    p {
      margin: 4px 0 8px;
    }
    .nav {
      margin: 8px 0 12px;
    }
    .nav a {
      margin-right: 10px;
      color: #0369a1;
      font-weight: bold;
    }
    .box {
      border: 1px solid #bbbbbb;
      padding: 8px;
      margin-bottom: 12px;
      background: #fafafa;
    }
    .field {
      margin-bottom: 8px;
    }
    label {
      display: block;
      font-weight: bold;
      margin-bottom: 2px;
    }
    input, select, button {
      width: 100%;
      padding: 7px;
      font-size: 15px;
      border: 1px solid #666666;
    }
    button {
      background: #15803d;
      color: #ffffff;
      font-weight: bold;
      margin-top: 4px;
    }
    .btn-blue {
      background: #0369a1;
    }
    .btn-red {
      background: #b91c1c;
    }
    .item {
      border: 1px solid #cccccc;
      padding: 6px;
      margin-bottom: 6px;
      background: #ffffff;
    }
    .msg {
      margin-top: 6px;
      font-weight: bold;
    }
    .gallery-box img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 6px 0;
    }
    .foot {
      margin-top: 14px;
      font-size: 13px;
      color: #444444;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>ጉዞ ፕላስ (Guzo Plus)</h1>
    <p>ፈጣን እና አስተማማኝ የጉዞ አገልግሎት።</p>

    <div class="nav">
      <a href="#book">1. ጉዞ ይጠይቁ</a>
      <a href="#driver">2. አሽከርካሪ ምዝገባ</a>
      <a href="#admin">3. አስተዳደር</a>
      <a href="#photos">4. ፎቶዎች</a>
    </div>

    <div id="book" class="box">
      <h2>የጉዞ ጥያቄ ያስገቡ</h2>
      <form id="rideForm">
        <div class="field">
          <label for="name">ሙሉ ስም</label>
          <input id="name" name="name" type="text" required />
        </div>
        <div class="field">
          <label for="phone">ስልክ ቁጥር</label>
          <input id="phone" name="phone" type="tel" required />
        </div>
        <div class="field">
          <label for="pickup">መነሻ ቦታ</label>
          <input id="pickup" name="pickup" type="text" required />
        </div>
        <div class="field">
          <label for="dropoff">መድረሻ ቦታ</label>
          <input id="dropoff" name="dropoff" type="text" required />
        </div>
        <button type="submit">ጉዞ ይጠይቁ</button>
      </form>
      <div id="msg" class="msg"></div>
    </div>

    <div id="driver" class="box">
      <h2>የአሽከርካሪ ምዝገባ</h2>
      <form id="driverForm">
        <div class="field">
          <label for="driverName">የአሽከርካሪ ስም</label>
          <input id="driverName" name="driverName" type="text" required />
        </div>
        <div class="field">
          <label for="driverPhone">ስልክ ቁጥር</label>
          <input id="driverPhone" name="driverPhone" type="tel" required />
        </div>
        <div class="field">
          <label for="vehicleType">ተሽከርካሪ</label>
          <select id="vehicleType" name="vehicleType" required>
            <option value="Sedan / ሲዳን">Sedan / ሲዳን</option>
            <option value="Minivan / ሚኒቫን">Minivan / ሚኒቫን</option>
            <option value="SUV / ኤስ.ዩ.ቪ">SUV / ኤስ.ዩ.ቪ</option>
            <option value="Motorcycle / ሞተርሳይክል">Motorcycle / ሞተርሳይክል</option>
          </select>
        </div>
        <div class="field">
          <label for="plateNumber">ሰሌዳ ቁጥር</label>
          <input id="plateNumber" name="plateNumber" type="text" required />
        </div>
        <button type="submit" class="btn-blue">እንደ አሽከርካሪ ይመዝገቡ</button>
      </form>
      <div id="driverMsg" class="msg"></div>
    </div>

    <div id="admin" class="box">
      <h2>የአስተዳደር ክፍል</h2>
      <div class="field">
        <label for="adminPassInput">የይለፍ ቃል</label>
        <input id="adminPassInput" type="password" />
      </div>
      <button id="unlockAdminBtn" type="button" class="btn-blue">ግባ</button>
      <button id="lockAdminBtn" type="button" class="btn-red" style="display:none;">ውጣ</button>
      <div id="adminMsg" class="msg"></div>

      <h3>የጉዞ ጥያቄዎች</h3>
      <div id="ridesList"></div>

      <h3>የተመዘገቡ አሽከርካሪዎች</h3>
      <div id="driversList"></div>
    </div>

    <div id="photos" class="box gallery-box">
      <h2>የጉዞ ፕላስ ፎቶዎች</h2>
      <p>ዳታ ለመቆጠብ ፎቶዎች ሲፈለጉ ብቻ ይጫናሉ፦</p>
      <button id="loadPhotosBtn" type="button" class="btn-blue">ፎቶዎችን አሳይ</button>
      <div id="photosArea"></div>
    </div>

    <div class="foot">
      © 2026 Guzo Plus (ጉዞ ፕላስ) — https://guzo-plus-05wo.onrender.com/
    </div>
  </div>

  <script>
    var form = document.getElementById('rideForm');
    var msg = document.getElementById('msg');
    var driverForm = document.getElementById('driverForm');
    var driverMsg = document.getElementById('driverMsg');
    var ridesList = document.getElementById('ridesList');
    var driversList = document.getElementById('driversList');
    var adminMsg = document.getElementById('adminMsg');
    var passInput = document.getElementById('adminPassInput');
    var unlockBtn = document.getElementById('unlockAdminBtn');
    var lockBtn = document.getElementById('lockAdminBtn');
    var loadPhotosBtn = document.getElementById('loadPhotosBtn');
    var photosArea = document.getElementById('photosArea');

    var adminPassword = '';
    try {
      adminPassword = sessionStorage.getItem('guzo_admin_pass') || '';
    } catch (e) {}

    if (adminPassword) {
      passInput.value = adminPassword;
      lockBtn.style.display = 'block';
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

    function adminHeaders(extra) {
      var h = { 'x-admin-password': adminPassword };
      if (extra) {
        for (var k in extra) h[k] = extra[k];
      }
      return h;
    }

    function loadAdminData() {
      if (!adminPassword) {
        adminMsg.style.color = '#333333';
        adminMsg.textContent = 'ዝርዝሩን ለማየት የይለፍ ቃል ያስገቡ።';
        ridesList.innerHTML = '';
        driversList.innerHTML = '';
        return;
      }

      adminMsg.style.color = '#111111';
      adminMsg.textContent = 'እየተጫነ ነው...';

      Promise.all([
        fetch('/api/rides', { headers: adminHeaders() }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); }),
        fetch('/api/drivers', { headers: adminHeaders() }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
      ]).then(function(results) {
        var ridesRes = results[0];
        var driversRes = results[1];
        if (!ridesRes.ok || !driversRes.ok) {
          adminMsg.style.color = '#b91c1c';
          adminMsg.textContent = ridesRes.data.error || driversRes.data.error || 'የይለፍ ቃል ስህተት ነው።';
          ridesList.innerHTML = '';
          driversList.innerHTML = '';
          return;
        }
        adminMsg.textContent = '';
        lockBtn.style.display = 'block';

        var rides = ridesRes.data.rides || [];
        if (!rides.length) {
          ridesList.innerHTML = '<p>ምንም የጉዞ ጥያቄ የለም።</p>';
        } else {
          ridesList.innerHTML = rides.map(function(r) {
            return '<div class="item">' +
              '<div><b>' + escapeHtml(r.name) + '</b> (' + escapeHtml(r.phone) + ') - ' + escapeHtml(statusLabel(r.status)) + '</div>' +
              '<div>' + escapeHtml(r.pickup) + ' -> ' + escapeHtml(r.dropoff) + '</div>' +
              '<button type="button" class="btn-blue" onclick="updateStatus(\'' + r._id + '\', \'accepted\')">ተቀበል</button>' +
              '<button type="button" onclick="updateStatus(\'' + r._id + '\', \'completed\')">አጠናቅቅ</button>' +
              '<button type="button" class="btn-red" onclick="deleteRide(\'' + r._id + '\')">አጥፋ</button>' +
              '</div>';
          }).join('');
        }

        var drivers = driversRes.data.drivers || [];
        if (!drivers.length) {
          driversList.innerHTML = '<p>ምንም የተመዘገበ አሽከርካሪ የለም።</p>';
        } else {
          driversList.innerHTML = drivers.map(function(d) {
            return '<div class="item">' +
              '<div><b>' + escapeHtml(d.name) + '</b> (' + escapeHtml(d.phone) + ') - ' + escapeHtml(statusLabel(d.status)) + '</div>' +
              '<div>' + escapeHtml(d.vehicleType) + ' | ' + escapeHtml(d.plateNumber) + '</div>' +
              '<button type="button" class="btn-blue" onclick="updateDriverStatus(\'' + d._id + '\', \'approved\')">አጽድቅ</button>' +
              '<button type="button" class="btn-red" onclick="deleteDriver(\'' + d._id + '\')">አጥፋ</button>' +
              '</div>';
          }).join('');
        }
      }).catch(function() {
        adminMsg.style.color = '#b91c1c';
        adminMsg.textContent = 'የኔትወርክ ስህተት አጋጥሟል።';
      });
    }

    unlockBtn.onclick = function() {
      adminPassword = passInput.value.trim();
      if (!adminPassword) {
        adminMsg.style.color = '#b91c1c';
        adminMsg.textContent = 'እባክዎ የይለፍ ቃል ያስገቡ።';
        return;
      }
      try { sessionStorage.setItem('guzo_admin_pass', adminPassword); } catch (e) {}
      loadAdminData();
    };

    lockBtn.onclick = function() {
      adminPassword = '';
      passInput.value = '';
      try { sessionStorage.removeItem('guzo_admin_pass'); } catch (e) {}
      lockBtn.style.display = 'none';
      ridesList.innerHTML = '';
      driversList.innerHTML = '';
      adminMsg.style.color = '#333333';
      adminMsg.textContent = 'ተቆልፏል።';
    };

    window.updateStatus = function(id, status) {
      fetch('/api/rides/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: status })
      }).then(function(r) { if (r.ok) loadAdminData(); });
    };

    window.deleteRide = function(id) {
      fetch('/api/rides/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: adminHeaders()
      }).then(function(r) { if (r.ok) loadAdminData(); });
    };

    window.updateDriverStatus = function(id, status) {
      fetch('/api/drivers/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: status })
      }).then(function(r) { if (r.ok) loadAdminData(); });
    };

    window.deleteDriver = function(id) {
      fetch('/api/drivers/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: adminHeaders()
      }).then(function(r) { if (r.ok) loadAdminData(); });
    };

    form.onsubmit = function(e) {
      e.preventDefault();
      msg.style.color = '#111111';
      msg.textContent = 'እየተላከ ነው...';
      fetch('/api/rides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('name').value.trim(),
          phone: document.getElementById('phone').value.trim(),
          pickup: document.getElementById('pickup').value.trim(),
          dropoff: document.getElementById('dropoff').value.trim()
        })
      }).then(function(r) {
        return r.json().then(function(d) { return { ok: r.ok, data: d }; });
      }).then(function(res) {
        if (!res.ok) {
          msg.style.color = '#b91c1c';
          msg.textContent = res.data.error || 'መላክ አልተቻለም።';
          return;
        }
        msg.style.color = '#15803d';
        msg.textContent = 'የጉዞ ጥያቄዎ ተመዝግቧል!';
        form.reset();
        if (adminPassword) loadAdminData();
      }).catch(function() {
        msg.style.color = '#b91c1c';
        msg.textContent = 'የኔትወርክ ስህተት አጋጥሟል።';
      });
    };

    driverForm.onsubmit = function(e) {
      e.preventDefault();
      driverMsg.style.color = '#111111';
      driverMsg.textContent = 'እየተመዘገበ ነው...';
      fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('driverName').value.trim(),
          phone: document.getElementById('driverPhone').value.trim(),
          vehicleType: document.getElementById('vehicleType').value.trim(),
          plateNumber: document.getElementById('plateNumber').value.trim()
        })
      }).then(function(r) {
        return r.json().then(function(d) { return { ok: r.ok, data: d }; });
      }).then(function(res) {
        if (!res.ok) {
          driverMsg.style.color = '#b91c1c';
          driverMsg.textContent = res.data.error || 'መመዝገብ አልተቻለም።';
          return;
        }
        driverMsg.style.color = '#15803d';
        driverMsg.textContent = 'የአሽከርካሪ ምዝገባዎ ተልኳል!';
        driverForm.reset();
        if (adminPassword) loadAdminData();
      }).catch(function() {
        driverMsg.style.color = '#b91c1c';
        driverMsg.textContent = 'የኔትወርክ ስህተት አጋጥሟል።';
      });
    };

    loadPhotosBtn.onclick = function() {
      photosArea.innerHTML =
        '<p>ጉዞ ፕላስ • Guzo Plus</p><img src="/1795448273390.jpg" alt="ጉዞ ፕላስ" />' +
        '<p>የጉዞ ፕላስ ከተማ ማስታወቂያ</p><img src="/1795448572602.jpg" alt="ማስታወቂያ" />' +
        '<p>በመብራት ላይ የቆመ ጉዞ ፕላስ</p><img src="/1795448585057.jpg" alt="መኪና" />';
    };

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

