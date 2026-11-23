
const http = require('node:http');
const crypto = require('node:crypto');
const { MongoClient, ObjectId } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'guzo_plus';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'guzo2026';

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
    #msg, #adminMsg {
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

    <section id="admin" class="card">
      <h2>የአስተዳደር ክፍል — የይለፍ ቃል ያስገቡ</h2>
      <div class="login-row">
        <input id="adminPassInput" type="password" placeholder="የአስተዳደር የይለፍ ቃል (Password)" />
        <button id="unlockAdminBtn" class="btn btn-sm btn-secondary" type="button">ግባ</button>
        <button id="lockAdminBtn" class="btn btn-sm btn-danger" type="button" style="display:none;">ውጣ (Lock)</button>
      </div>
      <div id="adminMsg"></div>
      <div id="ridesList"></div>
    </section>

    <div class="footer">
      © 2026 Guzo Plus (ጉዞ ፕላስ) — https://guzo-plus-05wo.onrender.com/
    </div>
  </main>

  <script>
    const form = document.getElementById('rideForm');
    const msg = document.getElementById('msg');
    const ridesList = document.getElementById('ridesList');
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
      if (status === 'accepted') return 'ተቀባይነት አግኝቷል';
      if (status === 'completed') return 'ተጠናቋል';
      return 'በመጠባበቅ ላይ';
    }

    function statusClass(status) {
      if (status === 'accepted') return 'status-pill status-accepted';
      if (status === 'completed') return 'status-pill status-completed';
      return 'status-pill';
    }

    function adminHeaders(extra = {}) {
      return {
        ...extra,
        'x-admin-password': adminPassword,
      };
    }

    async function loadRides() {
      if (!adminPassword) {
        adminMsg.style.color = '#4b5563';
        adminMsg.textContent = 'ዝርዝሩን ለማየት የአስተዳደር የይለፍ ቃል ያስገቡ።';
        ridesList.innerHTML = '';
        return;
      }

      adminMsg.style.color = '#374151';
      adminMsg.textContent = 'ጥያቄዎች እየተጫኑ ነው...';
      try {
        const res = await fetch('/api/rides', { headers: adminHeaders() });
        const data = await res.json();
        if (!res.ok) {
          adminMsg.style.color = '#b91c1c';
          adminMsg.textContent = data.error || 'የይለፍ ቃል ስህተት ነው።';
          ridesList.innerHTML = '';
          return;
        }
        adminMsg.textContent = '';
        lockBtn.style.display = 'inline-block';
        const rides = data.rides || [];
        if (!rides.length) {
          ridesList.innerHTML = '<p style="text-align:center;color:#6b7280;">እስካሁን የተመዘገበ የጉዞ ጥያቄ የለም።</p>';
          return;
        }
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
      loadRides();
    });

    lockBtn.addEventListener('click', () => {
      adminPassword = '';
      passInput.value = '';
      sessionStorage.removeItem('guzo_admin_pass');
      lockBtn.style.display = 'none';
      ridesList.innerHTML = '';
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
        if (res.ok) loadRides();
      } catch {}
    };

    window.deleteRide = async function(id) {
      try {
        const res = await fetch('/api/rides/' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: adminHeaders(),
        });
        if (res.ok) loadRides();
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
        if (adminPassword) loadRides();
      } catch {
        msg.style.color = '#b91c1c';
        msg.textContent = 'የኔትወርክ ስህተት አጋጥሟል።';
      }
    });

    loadRides();
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const cleanUrl = (req.url || '/').split('?')[0];

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

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlPage);
});

server.listen(PORT, () => {
  console.log(`Guzo Plus server running on port ${PORT}`);
  connectAtlas();
});
