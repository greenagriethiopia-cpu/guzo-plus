const path = require('path');
const fs = require('fs');

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
