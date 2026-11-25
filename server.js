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

async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    await httpFetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: String(text) })
    });
  } catch (err) {
    console.error('Telegram send error:', err.message);
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
              const lines = rides.map(
                (r, idx) =>
                  `${idx + 1}. ${r.passengerName || 'ተጓዥ'} (${r.phone || '-'}) — ${r.status || 'pending'}\n📍 ${r.pickup || '-'} → 🎯 ${r.dropoff || '-'} | 💰 ${r.fare || 200} ብር`
              );
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
              await sendTelegramMessage(
                chatId,
                `🚖 የተመረጠ የጉዞ ጥያቄ (#${num}):\n` +
                  `ስም፡ ${selected.passengerName || '-'}\n` +
                  `ስልክ፡ ${selected.phone || '-'}\n` +
                  `መነሻ፡ ${selected.pickup || '-'}\n` +
                  `መድረሻ፡ ${selected.dropoff || '-'}\n` +
                  `ዋጋ፡ ${selected.fare || 200} ብር\n` +
                  `ሁኔታ፡ ${selected.status || 'pending'}\n\n` +
                  `ለማጽደቅ: accept ${num}\n` +
                  `ለማጠናቀቅ: complete ${num}`
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
    theme_color: '#15803d',
    orientation: 'portrait'
  });
});

app.get('/sw.js', (req, res) => {
  const customSw = path.join(__dirname, 'public', 'sw.js');
  if (fs.existsSync(customSw)) {
    return res.sendFile(customSw);
  }
  res.type('application/javascript').send(
    'const CACHE_NAME="guzo-plus-v1";' +
      'self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(["/","/manifest.json"])));self.skipWaiting();});' +
      'self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});' +
      'self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});'
  );
});

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

app.get('/', (req, res) => {
  res.type('html').send(
    '<!DOCTYPE html><html lang="am"><head><meta charset="UTF-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
      '<title>ጉዞ ፕላስ (Guzo Plus)</title>' +
      '<link rel="manifest" href="/manifest.json" />' +
      '<meta name="theme-color" content="#15803d" />' +
      '<style>' +
      '*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}' +
      'body{margin:0;background:#e2e8f0;color:#0f172a}' +
      '.wrap{max-width:560px;margin:0 auto;padding:12px 14px 28px}' +
      'h1{margin:6px 0 12px;font-size:1.55rem;color:#0f172a;font-weight:700}' +
      '.card{background:#ffffff;border:1px solid #cbd5e1;border-radius:10px;padding:14px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06)}' +
      '.call-label{font-size:0.9rem;color:#334155;margin-bottom:8px}' +
      '.call-btn{display:block;width:100%;text-align:center;background:#15803d;color:#ffffff;text-decoration:none;padding:12px 14px;border-radius:8px;font-weight:700;font-size:1rem}' +
      '.call-btn:hover{background:#166534}' +
      '.nav-links{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 14px;font-size:0.95rem}' +
      '.nav-links a{color:#1d4ed8;text-decoration:underline;font-weight:600}' +
      '.section-title{margin:0 0 6px;font-size:1.1rem;font-weight:700;color:#0f172a}' +
      '.tariff{font-size:0.84rem;color:#475569;margin-bottom:12px;line-height:1.4}' +
      'label{display:block;font-size:0.88rem;font-weight:600;color:#1e293b;margin-top:10px;margin-bottom:4px}' +
      'input,select{width:100%;padding:10px 12px;border-radius:7px;border:1px solid #94a3b8;background:#ffffff;color:#0f172a;font-size:0.95rem}' +
      '.submit-btn{margin-top:14px;width:100%;padding:12px;border:none;border-radius:8px;background:#15803d;color:#ffffff;font-weight:700;font-size:1rem;cursor:pointer}' +
      '.submit-btn:hover{background:#166534}' +
      '#msg{margin-top:10px;font-size:0.9rem;font-weight:600;min-height:20px}' +
      '.ride-item{border-top:1px solid #e2e8f0;padding:9px 0;font-size:0.88rem;color:#1e293b}' +
      '.ride-item:first-child{border-top:none}' +
      '</style></head><body>' +
      '<div class="wrap">' +
      '<h1>ጉዞ ፕላስ (Guzo Plus)</h1>' +
      '<div class="card">' +
      '<div class="call-label">በአንድ ንክኪ ይደውሉ (አንድሮይድ እና ሁሉም ስልክ):</div>' +
      '<a class="call-btn" href="tel:0923579382">📞 ይደውሉ: 0923579382</a>' +
      '</div>' +
      '<div class="nav-links">' +
      '<a href="#requestCard">ጉዞ</a>' +
      '<a href="/admin">አስተናጋሪ</a>' +
      '<a href="/admin">አስተዳደር</a>' +
      '<a href="#recentCard">ፎርሞች</a>' +
      '</div>' +
      '<div id="requestCard" class="card">' +
      '<h2 class="section-title">ጉዞ ይጠይቁ</h2>' +
      '<div class="tariff">መነሻ 200 ብር | ጠዋት +50 | ማታ +50 | ሼር 25% ቅናሽ</div>' +
      '<form id="rideForm">' +
      '<label for="passengerName">ሙሉ ስም</label>' +
      '<input id="passengerName" name="passengerName" placeholder="ሙሉ ስም ያስገቡ" required />' +
      '<label for="phone">ስልክ ቁጥር</label>' +
      '<input id="phone" name="phone" type="tel" placeholder="09..." required />' +
      '<label for="pickup">መነሻ</label>' +
      '<input id="pickup" name="pickup" placeholder="መነሻ ቦታ" required />' +
      '<label for="dropoff">መድረሻ</label>' +
      '<input id="dropoff" name="dropoff" placeholder="መድረሻ ቦታ" required />' +
      '<label for="rideType">ዓይነት</label>' +
      '<select id="rideType" name="rideType">' +
      '<option value="shared">ሼር / ጋራ (25% ቅናሽ)</option>' +
      '<option value="solo">የግል ጉዞ (Solo)</option>' +
      '</select>' +
      '<label for="timeTariff">ሰዓት ታሪፍ</label>' +
      '<select id="timeTariff" name="timeTariff">' +
      '<option value="now">አሁን ያለው ሰዓት</option>' +
      '<option value="morning">ጠዋት (+50 ብር)</option>' +
      '<option value="evening">ማታ (+50 ብር)</option>' +
      '</select>' +
      '<button class="submit-btn" type="submit">ጉዞ ይጠይቁ</button>' +
      '</form>' +
      '<div id="msg"></div>' +
      '</div>' +
      '<div id="recentCard" class="card">' +
      '<h3 class="section-title">የቅርብ ጊዜ ጥያቄዎች</h3>' +
      '<div id="ridesList">በመጫን ላይ...</div>' +
      '</div>' +
      '</div>' +
      '<script>' +
      'if("serviceWorker" in navigator){window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").catch(()=>{});});}' +
      'const form=document.getElementById("rideForm"),msg=document.getElementById("msg"),ridesList=document.getElementById("ridesList");' +
      'async function loadRides(){try{const res=await fetch("/api/rides");if(!res.ok){ridesList.textContent="ዝርዝር ማምጣት አልተቻለም።";return;}' +
      'const rides=await res.json();if(!Array.isArray(rides)||rides.length===0){ridesList.textContent="ምንም የጉዞ ጥያቄ የለም።";return;}' +
      'ridesList.innerHTML=rides.slice(0,8).map(r=>"<div class=\\"ride-item\\"><strong>"+(r.passengerName||"ተጓዥ")+"</strong>: "+(r.pickup||"")+" → "+(r.dropoff||"")+" | <strong>"+(r.fare||200)+" ብር</strong> ("+(r.status||"pending")+")</div>").join("");}catch(_){ridesList.textContent="ዝርዝሩን ማምጣት አልተቻለም።";}}' +
      'form.addEventListener("submit",async(e)=>{e.preventDefault();msg.style.color="#15803d";msg.textContent="በመላክ ላይ...";' +
      'const payload={passengerName:document.getElementById("passengerName").value.trim(),phone:document.getElementById("phone").value.trim(),pickup:document.getElementById("pickup").value.trim(),dropoff:document.getElementById("dropoff").value.trim(),rideType:document.getElementById("rideType").value,timeTariff:document.getElementById("timeTariff").value};' +
      'try{const res=await fetch("/api/rides",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});' +
      'const data=await res.json();if(res.ok){msg.style.color="#15803d";msg.textContent="✅ ጥያቄዎ በ"+(data.fare||200)+" ብር ተመዝግቧል።";form.reset();loadRides();}else{msg.style.color="#dc2626";msg.textContent="❌ ስህተት፡ "+(data.error||"መላክ አልተቻለም");}}catch(err){msg.style.color="#dc2626";msg.textContent="❌ የኔትወርክ ስህተት፡ "+err.message;}});' +
      'loadRides();</script></body></html>'
  );
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
    const rideType = req.body.rideType || 'solo';
    const timeTariff = req.body.timeTariff || 'now';
    const fare = calculateFare(rideType, timeTariff);
    const ride = await Ride.create({ ...req.body, rideType, timeTariff, fare });
    if (TELEGRAM_CHAT_ID) {
      await sendTelegramMessage(
        TELEGRAM_CHAT_ID,
        `🚖 አዲስ የጉዞ ጥያቄ (Guzo Plus)\nስም፡ ${ride.passengerName || '-'}\nስልክ፡ ${ride.phone || '-'}\nከ፡ ${ride.pickup || '-'}\nወደ፡ ${ride.dropoff || '-'}\nዓይነት፡ ${rideType} | ዋጋ፡ ${fare} ብር`
      );
    }
    res.status(201).json(ride);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/rides/:id', async (req, res) => {
  const pass = req.headers['x-admin-password'];
  if (pass !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'የተሳሳተ የአስተዳዳሪ ይለፍ ቃል' });
  }
  try {
    const updated = await Ride.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'ጉዞው አልተገኘም' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/rides/:id', async (req, res) => {
  const pass = req.headers['x-admin-password'];
  if (pass !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'የተሳሳተ የአስተዳዳሪ ይለፍ ቃል' });
  }
  try {
    await Ride.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/admin', (req, res) => {
  res.type('html').send(
    '<!DOCTYPE html><html lang="am"><head><meta charset="UTF-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
      '<title>ጉዞ ፕላስ | አስተዳደር</title>' +
      '<style>*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}' +
      'body{margin:0;background:#e2e8f0;color:#0f172a}' +
      '.wrap{max-width:760px;margin:0 auto;padding:12px 14px 28px}' +
      '.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}' +
      '.top h1{margin:0;font-size:1.35rem;color:#0f172a}' +
      '.top a{color:#15803d;font-weight:700;text-decoration:none}' +
      '.card{background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:14px;margin-bottom:12px}' +
      '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}' +
      '.stat{background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px;text-align:center}' +
      '.stat b{display:block;font-size:1.25rem;color:#15803d}' +
      'input{width:100%;padding:10px;border-radius:7px;border:1px solid #94a3b8;margin-top:6px}' +
      'button{padding:8px 12px;border:none;border-radius:7px;font-weight:700;cursor:pointer;margin-top:8px;margin-right:6px}' +
      '.btn-green{background:#15803d;color:#fff;width:100%;padding:11px}' +
      '.btn-ok{background:#16a34a;color:#fff}' +
      '.btn-done{background:#2563eb;color:#fff}' +
      '.btn-del{background:#dc2626;color:#fff}' +
      '.ride{border-top:1px solid #e2e8f0;padding:10px 0}' +
      '.ride:first-child{border-top:none}</style></head><body>' +
      '<div class="wrap"><div class="top"><h1>ጉዞ ፕላስ - አስተዳደር</h1><a href="/">← ዋና ገጽ</a></div>' +
      '<div id="loginBox" class="card"><h3>የአስተዳዳሪ መግቢያ</h3>' +
      '<input id="adminPass" type="password" placeholder="የአስተዳዳሪ ይለፍ ቃል" />' +
      '<button class="btn-green" onclick="loginAdmin()">ግባ</button></div>' +
      '<div id="panel" style="display:none"><div class="stats">' +
      '<div class="stat"><b id="sTotal">0</b><span>ጠቅላላ</span></div>' +
      '<div class="stat"><b id="sPending" style="color:#ca8a04">0</b><span>በመጠባበቅ</span></div>' +
      '<div class="stat"><b id="sDone" style="color:#2563eb">0</b><span>የተጠናቀቁ</span></div></div>' +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center">' +
      '<h3 style="margin:0">የጉዞ ጥያቄዎች</h3><button class="btn-done" style="margin:0" onclick="loadAdminRides()">አድስ</button></div>' +
      '<div id="adminList" style="margin-top:10px">በመጫን ላይ...</div></div></div></div>' +
      '<script>' +
      'let savedPass=sessionStorage.getItem("guzo_admin_pass")||"";' +
      'if(savedPass){document.getElementById("loginBox").style.display="none";document.getElementById("panel").style.display="block";loadAdminRides();}' +
      'function loginAdmin(){const p=document.getElementById("adminPass").value.trim();if(!p)return;savedPass=p;sessionStorage.setItem("guzo_admin_pass",p);document.getElementById("loginBox").style.display="none";document.getElementById("panel").style.display="block";loadAdminRides();}' +
      'async function loadAdminRides(){const list=document.getElementById("adminList");try{const res=await fetch("/api/rides");const rides=await res.json();' +
      'document.getElementById("sTotal").textContent=rides.length;' +
      'document.getElementById("sPending").textContent=rides.filter(r=>(r.status||"pending")==="pending").length;' +
      'document.getElementById("sDone").textContent=rides.filter(r=>r.status==="completed").length;' +
      'if(!rides.length){list.textContent="ምንም የጉዞ ጥያቄ የለም።";return;}' +
      'list.innerHTML=rides.map(r=>"<div class=\\"ride\\"><div><strong>"+(r.passengerName||"ተጓዥ")+"</strong> ("+(r.phone||"-")+") — <strong>"+(r.fare||200)+" ብር</strong> ["+(r.status||"pending")+"]</div>"+' +
      '"<div style=\\"color:#475569;margin:4px 0\\">📍 "+(r.pickup||"-")+" → 🎯 "+(r.dropoff||"-")+" ("+(r.rideType||"solo")+")</div>"+' +
      '"<div><button class=\\"btn-ok\\" onclick=\\"setStatus(\'"+r._id+"\',\'accepted\')\\">አጽድቅ</button>"+' +
      '"<button class=\\"btn-done\\" onclick=\\"setStatus(\'"+r._id+"\',\'completed\')\\">አጠናቅቅ</button>"+' +
      '"<button class=\\"btn-del\\" onclick=\\"delRide(\'"+r._id+"\')\\">አጥፋ</button></div></div>").join("");}catch(e){list.textContent="ስህተት ተፈጥሯል።";}}' +
      'async function setStatus(id,status){const res=await fetch("/api/rides/"+id,{method:"PATCH",headers:{"Content-Type":"application/json","x-admin-password":savedPass},body:JSON.stringify({status})});if(res.status===401){alert("የተሳሳተ የይለፍ ቃል!");sessionStorage.removeItem("guzo_admin_pass");location.reload();return;}loadAdminRides();}' +
      'async function delRide(id){if(!confirm("ይህንን ጥያቄ ማጥፋት ይፈልጋሉ?"))return;const res=await fetch("/api/rides/"+id,{method:"DELETE",headers:{"x-admin-password":savedPass}});if(res.status===401){alert("የተሳሳተ የይለፍ ቃል!");sessionStorage.removeItem("guzo_admin_pass");location.reload();return;}loadAdminRides();}' +
      '</script></body></html>'
  );
});
app.get('/driver', (req, res) => {
  res.type('html').send(
    '<!DOCTYPE html><html lang="am"><head><meta charset="UTF-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
      '<title>ጉዞ ፕላስ | የሾፌር መመዝገቢያ</title>' +
      '<style>*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}' +
      'body{margin:0;background:#e2e8f0;color:#0f172a}' +
      '.wrap{max-width:560px;margin:0 auto;padding:12px 14px 28px}' +
      'h1{margin:6px 0 12px;font-size:1.45rem;color:#0f172a}' +
      '.nav{display:flex;gap:12px;margin-bottom:12px;font-size:0.95rem}' +
      '.nav a{color:#1d4ed8;font-weight:600;text-decoration:underline}' +
      '.card{background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:14px;margin-bottom:12px}' +
      'label{display:block;font-size:0.88rem;font-weight:600;margin-top:10px;margin-bottom:4px}' +
      'input,select{width:100%;padding:10px 12px;border-radius:7px;border:1px solid #94a3b8;background:#fff}' +
      '.btn{margin-top:14px;width:100%;padding:12px;border:none;border-radius:8px;background:#15803d;color:#fff;font-weight:700;font-size:1rem;cursor:pointer}' +
      '#dMsg{margin-top:10px;font-weight:600;min-height:20px}' +
      '.item{border-top:1px solid #e2e8f0;padding:8px 0;font-size:0.88rem}' +
      '.item:first-child{border-top:none}</style></head><body>' +
      '<div class="wrap"><h1>ጉዞ ፕላስ - የሾፌር መመዝገቢያ</h1>' +
      '<div class="nav"><a href="/">ጉዞ</a><a href="/driver">አሽከርካሪ</a><a href="/admin">አስተዳደር</a></div>' +
      '<div class="card"><h2 style="margin:0 0 8px;font-size:1.1rem">አዲስ አሽከርካሪ ይመዝገቡ</h2>' +
      '<form id="driverForm">' +
      '<label for="fullName">ሙሉ ስም</label><input id="fullName" required placeholder="የሾፌሩ ሙሉ ስም" />' +
      '<label for="phone">ስልክ ቁጥር</label><input id="phone" type="tel" required placeholder="09..." />' +
      '<label for="vehicleType">የተሽከርካሪ ዓይነት</label>' +
      '<select id="vehicleType"><option value="ባጃጅ (Bajaj)">ባጃጅ (Bajaj)</option><option value="መኪና (Sedan)">መኪና (Sedan)</option><option value="ሚኒባስ (Minibus)">ሚኒባስ (Minibus)</option></select>' +
      '<label for="plateNumber">ሰሌዳ ቁጥር</label><input id="plateNumber" placeholder="ለምሳሌ፡ AA-..." />' +
      '<label for="area">የሚሰሩበት አካባቢ</label><input id="area" placeholder="ለምሳሌ፡ ጎተራ፣ ቦሌ፣ ሳሪስ" />' +
      '<button class="btn" type="submit">አሽከርካሪ መዝግብ</button></form><div id="dMsg"></div></div>' +
      '<div class="card"><h3 style="margin:0 0 8px">የተመዘገቡ አሽከርካሪዎች</h3><div id="driversList">በመጫን ላይ...</div></div></div>' +
      '<script>' +
      'const dForm=document.getElementById("driverForm"),dMsg=document.getElementById("dMsg"),dList=document.getElementById("driversList");' +
      'async function loadDrivers(){try{const r=await fetch("/api/drivers");const list=await r.json();' +
      'if(!Array.isArray(list)||!list.length){dList.textContent="ገና የተመዘገበ አሽከርካሪ የለም።";return;}' +
      'dList.innerHTML=list.slice(0,10).map(d=>"<div class=\\"item\\"><strong>"+d.fullName+"</strong> ("+d.phone+") — "+d.vehicleType+" | "+(d.area||"-")+"</div>").join("");}catch(_){dList.textContent="ዝርዝር ማምጣት አልተቻለም።";}}' +
      'dForm.addEventListener("submit",async(e)=>{e.preventDefault();dMsg.style.color="#15803d";dMsg.textContent="በመመዝገብ ላይ...";' +
      'const payload={fullName:document.getElementById("fullName").value.trim(),phone:document.getElementById("phone").value.trim(),vehicleType:document.getElementById("vehicleType").value,plateNumber:document.getElementById("plateNumber").value.trim(),area:document.getElementById("area").value.trim()};' +
      'try{const r=await fetch("/api/drivers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});' +
      'if(r.ok){dMsg.style.color="#15803d";dMsg.textContent="✅ አሽከርካሪው በስኬት ተመዝግቧል።";dForm.reset();loadDrivers();}else{const err=await r.json();dMsg.style.color="#dc2626";dMsg.textContent="❌ "+(err.error||"ስህተት");}}catch(err){dMsg.style.color="#dc2626";dMsg.textContent="❌ "+err.message;}});' +
      'loadDrivers();</script></body></html>'
  );
});

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
  pollTelegramUpdates();
});
