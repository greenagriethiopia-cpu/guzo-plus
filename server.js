
const http = require('node:http');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'guzo_plus';

let db = null;
let dbStatus = 'Not configured (set MONGODB_URI)';

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
      max-width: 720px;
      margin: 40px auto;
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
      margin-bottom: 14px;
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
    .booking-card {
      margin-top: 24px;
      padding: 20px;
      background: #f8faf9;
      border: 1px solid #d1fae5;
      border-radius: 14px;
      text-align: left;
    }
    .booking-card h2 {
      margin: 0 0 14px;
      font-size: 20px;
      color: #14532d;
      text-align: center;
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
    input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 15px;
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
    #msg {
      margin-top: 12px;
      font-size: 14px;
      font-weight: bold;
      text-align: center;
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

    <section id="book" class="booking-card">
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

    <div class="footer">
      © 2026 Guzo Plus (ጉዞ ፕላስ) — https://guzo-plus-05wo.onrender.com/
    </div>
  </main>

  <script>
    const form = document.getElementById('rideForm');
    const msg = document.getElementById('msg');

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
      } catch {
        msg.style.color = '#b91c1c';
        msg.textContent = 'የኔትወርክ ስህተት አጋጥሟል።';
      }
    });
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/health/db' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: dbStatus }));
    return;
  }

  if (req.url === '/api/rides' && req.method === 'GET') {
    if (!db) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Database not connected' }));
      return;
    }
    const rides = await db.collection('rides').find().sort({ createdAt: -1 }).limit(20).toArray();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ rides }));
    return;
  }

  if (req.url === '/api/rides' && req.method === 'POST') {
    if (!db) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Database not connected' }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      const name = (body.name || '').trim();
      const phone = (body.phone || '').trim();
      const pickup = (body.pickup || '').trim();
      const dropoff = (body.dropoff || '').trim();

      if (!name || !phone || !pickup || !dropoff) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'ሁሉንም ባዶ ቦታዎች ይሙሉ።' }));
        return;
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
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, id: result.insertedId, ride: doc }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message || 'Invalid request' }));
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlPage);
});

server.listen(PORT, () => {
  console.log(`Guzo Plus server running on port ${PORT}`);
  connectAtlas();
});
