
const http = require('node:http');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';

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
    await client.db('admin').command({ ping: 1 });
    dbStatus = 'Connected to MongoDB Atlas';
    console.log('Connected to MongoDB Atlas successfully!');
  } catch (err) {
    dbStatus = `Connection failed: ${err.message}`;
    console.error('MongoDB Atlas connection error:', err.message);
  }
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
      margin: 48px auto;
      background: #ffffff;
      padding: 36px 28px;
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
      margin: 0 0 12px;
      font-size: 32px;
      color: #15803d;
    }
    .lead {
      font-size: 17px;
      color: #374151;
      margin: 0 0 24px;
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 14px;
      margin: 24px 0 28px;
      text-align: left;
    }
    .box {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
    }
    .box h3 {
      margin: 0 0 6px;
      font-size: 16px;
      color: #111827;
    }
    .box p {
      margin: 0;
      font-size: 14px;
      color: #4b5563;
    }
    .btn {
      display: inline-block;
      background: #15803d;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 10px;
      font-weight: bold;
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

    <a class="btn" href="#contact">አገልግሎት ይጀምሩ</a>

    <div id="contact" class="footer">
      © 2026 Guzo Plus (ጉዞ ፕላስ) — https://guzo-plus-05wo.onrender.com/
    </div>
  </main>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/health/db') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: dbStatus }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(htmlPage);
});

server.listen(PORT, () => {
  console.log(`Guzo Plus server running on port ${PORT}`);
  connectAtlas();
});
