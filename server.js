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
      fare: { type: Number, default: 0 },
      status: { type: String, default: 'pending' }
    },
    { timestamps: true }
  );
  Ride = mongoose.models.Ride || mongoose.model('Ride', rideSchema);
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
                  `${idx + 1}. ${r.passengerName || 'ተጓዥ'} — ${r.status || 'pending'}\n📍 ${r.pickup || '-'} → 🎯 ${r.dropoff || '-'}`
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

const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

app.get('/', (req, res) => {
  const indexHtmlPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    return res.sendFile(indexHtmlPath);
  }

  res.type('html').send(
    '<!DOCTYPE html><html lang="am"><head><meta charset="UTF-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
      '<title>ጉዞ ፕላስ | Guzo Plus</title>' +
      '<style>*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}' +
      'body{margin:0;background:#0f172a;color:#f8fafc}' +
      'header{background:#1e293b;padding:18px 20px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}' +
      'header h1{margin:0;font-size:1.35rem;color:#22c55e}' +
      'header p{margin:4px 0 0;font-size:0.9rem;color:#cbd5e1}' +
      'header a{background:#334155;color:#f8fafc;text-decoration:none;padding:8px 12px;border-radius:8px;font-size:0.85rem;font-weight:600}' +
      'main{max-width:720px;margin:20px auto;padding:0 16px}' +
      '.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:18px;margin-bottom:16px}' +
      '.badge{display:inline-block;background:#14532d;color:#86efac;padding:4px 10px;border-radius:999px;font-size:0.8rem;margin-bottom:10px}' +
      'label{display:block;font-size:0.9rem;margin-top:10px;margin-bottom:4px;color:#e2e8f0}' +
      'input,select{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff}' +
      'button{margin-top:14px;width:100%;padding:12px;border:none;border-radius:8px;background:#22c55e;color:#052e16;font-weight:700;font-size:1rem;cursor:pointer}' +
      '#msg{margin-top:12px;font-size:0.9rem;color:#86efac;min-height:20px}' +
      '.ride-item{border-top:1px solid #334155;padding:10px 0;font-size:0.9rem}' +
      '.ride-item:first-child{border-top:none}</style></head><body>' +
      '<header><div><h1>ጉዞ ፕላስ (Guzo Plus)</h1><p>የጉዞ ጥያቄ ማስተላለፊያ እና የአገልግሎት ገጽ</p></div><a href="/admin">🛠️ አስተዳደር</a></header>' +
      '<main><div class="card"><span class="badge">● አገልግሎቱ ቀጥታ ነው</span>' +
      '<h2>አዲስ የጉዞ ጥያቄ ይላኩ</h2><form id="rideForm">' +
      '<label for="passengerName">ስም</label><input id="passengerName" name="passengerName" placeholder="ሙሉ ስም" required />' +
      '<label for="phone">ስልክ ቁጥር</label><input id="phone" name="phone" placeholder="09..." />' +
      '<label for="pickup">መነሻ ቦታ</label><input id="pickup" name="pickup" placeholder="ለምሳሌ፡ ጎተራ" required />' +
      '<label for="dropoff">መድረሻ ቦታ</label><input id="dropoff" name="dropoff" placeholder="ለምሳሌ፡ ቦሌ" required />' +
      '<label for="rideType">የጉዞ አይነት</label><select id="rideType" name="rideType">' +
      '<option value="solo">የግል ጉዞ (Solo)</option><option value="shared">የጋራ ጉዞ (Shared)</option></select>' +
      '<button type="submit">ጉዞ ይጠይቁ</button></form><div id="msg"></div></div>' +
      '<div class="card"><h3>የቅርብ ጊዜ ጥያቄዎች</h3><div id="ridesList">በመጫን ላይ...</div></div></main>' +
      '<script>const form=document.getElementById("rideForm"),msg=document.getElementById("msg"),ridesList=document.getElementById("ridesList");' +
      'async function loadRides(){try{const res=await fetch("/api/rides");if(!res.ok){ridesList.textContent="ዝርዝር ማምጣት አልተቻለም።";return;}' +
      'const rides=await res.json();if(!Array.isArray(rides)||rides.length===0){ridesList.textContent="ምንም የጉዞ ጥያቄ የለም።";return;}' +
      'ridesList.innerHTML=rides.slice(0,10).map(r=>"<div class=\\"ride-item\\"><strong>"+(r.passengerName||"ተጓዥ")+"</strong>: "+(r.pickup||"")+" → "+(r.dropoff||"")+" ("+(r.status||"pending")+")</div>").join("");}catch(_){ridesList.textContent="ዝርዝሩን ማምጣት አልተቻለም።";}}' +
      'form.addEventListener("submit",async(e)=>{e.preventDefault();msg.textContent="በመላክ ላይ...";' +
      'const payload={passengerName:document.getElementById("passengerName").value.trim(),phone:document.getElementById("phone").value.trim(),pickup:document.getElementById("pickup").value.trim(),dropoff:document.getElementById("dropoff").value.trim(),rideType:document.getElementById("rideType").value};' +
      'try{const res=await fetch("/api/rides",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});' +
      'const data=await res.json();if(res.ok){msg.textContent="✅ የጉዞ ጥያቄዎ በስኬት ተመዝግቧል።";form.reset();loadRides();}else{msg.textContent="❌ ስህተት፡ "+(data.error||"መላክ አልተቻለም");}}catch(err){msg.textContent="❌ የኔትወርክ ስህተት፡ "+err.message;}});' +
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
    const ride = await Ride.create(req.body);
    if (TELEGRAM_CHAT_ID) {
      await sendTelegramMessage(
        TELEGRAM_CHAT_ID,
        `🚖 አዲስ የጉዞ ጥያቄ (Guzo Plus)\nስም፡ ${ride.passengerName || '-'}\nስልክ፡ ${ride.phone || '-'}\nከ፡ ${ride.pickup || '-'}\nወደ፡ ${ride.dropoff || '-'}`
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
      '<title>ጉዞ ፕላስ | አስተዳደር ክፍል</title>' +
      '<style>*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}' +
      'body{margin:0;background:#0f172a;color:#f8fafc}' +
      'header{background:#1e293b;padding:16px 20px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center}' +
      'header h1{margin:0;font-size:1.25rem;color:#38bdf8}' +
      'header a{color:#94a3b8;text-decoration:none;font-size:0.9rem}' +
      'main{max-width:860px;margin:20px auto;padding:0 16px}' +
      '.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:16px}' +
      '.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}' +
      '.stat{background:#0f172a;border:1px solid #334155;border-radius:10px;padding:12px;text-align:center}' +
      '.stat b{display:block;font-size:1.4rem;color:#22c55e}' +
      'input{width:100%;padding:10px 12px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;margin-top:6px}' +
      'button{padding:8px 12px;border:none;border-radius:8px;font-weight:600;cursor:pointer;margin-top:8px;margin-right:6px}' +
      '.btn-primary{background:#38bdf8;color:#082f49;width:100%;padding:11px}' +
      '.btn-accept{background:#22c55e;color:#052e16}' +
      '.btn-complete{background:#3b82f6;color:#fff}' +
      '.btn-del{background:#ef4444;color:#fff}' +
      '.ride{border-top:1px solid #334155;padding:12px 0}' +
      '.ride:first-child{border-top:none}' +
      '.badge{padding:2px 8px;border-radius:999px;font-size:0.78rem;background:#334155}' +
      '</style></head><body>' +
      '<header><h1>🛠️ ጉዞ ፕላስ - አስተዳደር</h1><a href="/">← ወደ ዋናው ገጽ</a></header>' +
      '<main>' +
      '<div id="loginBox" class="card"><h3>የአስተዳዳሪ መግቢያ</h3>' +
      '<input id="adminPass" type="password" placeholder="የአስተዳዳሪ ይለፍ ቃል ያስገቡ" />' +
      '<button class="btn-primary" onclick="loginAdmin()">ግባ</button><div id="loginMsg" style="color:#f87171;margin-top:8px"></div></div>' +
      '<div id="panel" style="display:none">' +
      '<div class="stats">' +
      '<div class="stat"><b id="sTotal">0</b><span>ጠቅላላ</span></div>' +
      '<div class="stat"><b id="sPending" style="color:#facc15">0</b><span>በመጠባበቅ ላይ</span></div>' +
      '<div class="stat"><b id="sDone" style="color:#38bdf8">0</b><span>የተጠናቀቁ</span></div>' +
      '</div>' +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center">' +
      '<h3 style="margin:0">ሁሉም የጉዞ ጥያቄዎች</h3>' +
      '<button class="btn-complete" style="margin:0" onclick="loadAdminRides()">አድስ (Refresh)</button></div>' +
      '<div id="adminList" style="margin-top:10px">በመጫን ላይ...</div></div></div>' +
      '</main>' +
      '<script>' +
      'let savedPass=sessionStorage.getItem("guzo_admin_pass")||"";' +
      'if(savedPass){document.getElementById("loginBox").style.display="none";document.getElementById("panel").style.display="block";loadAdminRides();}' +
      'function loginAdmin(){const p=document.getElementById("adminPass").value.trim();if(!p)return;savedPass=p;sessionStorage.setItem("guzo_admin_pass",p);document.getElementById("loginBox").style.display="none";document.getElementById("panel").style.display="block";loadAdminRides();}' +
      'async function loadAdminRides(){const list=document.getElementById("adminList");try{const res=await fetch("/api/rides");const rides=await res.json();' +
      'document.getElementById("sTotal").textContent=rides.length;' +
      'document.getElementById("sPending").textContent=rides.filter(r=>(r.status||"pending")==="pending").length;' +
      'document.getElementById("sDone").textContent=rides.filter(r=>r.status==="completed").length;' +
      'if(!rides.length){list.textContent="ምንም የጉዞ ጥያቄ የለም።";return;}' +
      'list.innerHTML=rides.map(r=>"<div class=\\"ride\\"><div><strong>"+(r.passengerName||"ተጓዥ")+"</strong> ("+(r.phone||"ስልክ የለም")+") <span class=\\"badge\\">"+(r.status||"pending")+"</span></div>"+' +
      '"<div style=\\"color:#cbd5e1;margin:4px 0\\">📍 "+(r.pickup||"-")+" → 🎯 "+(r.dropoff||"-")+" | "+(r.rideType||"solo")+"</div>"+' +
      '"<div><button class=\\"btn-accept\\" onclick=\\"setStatus(\'"+r._id+"\',\'accepted\')\\">አጽድቅ (Accept)</button>"+' +
      '"<button class=\\"btn-complete\\" onclick=\\"setStatus(\'"+r._id+"\',\'completed\')\\">አጠናቅቅ (Complete)</button>"+' +
      '"<button class=\\"btn-del\\" onclick=\\"delRide(\'"+r._id+"\')\\">አጥፋ</button></div></div>").join("");}catch(e){list.textContent="ስህተት ተፈጥሯል።";}}' +
      'async function setStatus(id,status){const res=await fetch("/api/rides/"+id,{method:"PATCH",headers:{"Content-Type":"application/json","x-admin-password":savedPass},body:JSON.stringify({status})});if(res.status===401){alert("የተሳሳተ የይለፍ ቃል!");sessionStorage.removeItem("guzo_admin_pass");location.reload();return;}loadAdminRides();}' +
      'async function delRide(id){if(!confirm("ይህንን ጥያቄ ማጥፋት ይፈልጋሉ?"))return;const res=await fetch("/api/rides/"+id,{method:"DELETE",headers:{"x-admin-password":savedPass}});if(res.status===401){alert("የተሳሳተ የይለፍ ቃል!");sessionStorage.removeItem("guzo_admin_pass");location.reload();return;}loadAdminRides();}' +
      '</script></body></html>'
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
