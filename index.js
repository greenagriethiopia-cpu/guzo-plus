<!DOCTYPE html>
<html lang="am">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ጉዞ ፕላስ (Guzo Plus)</title>
  <link rel="manifest" href="https://guzo-plus-05wo.onrender.com/manifest.json" />
  <meta name="theme-color" content="#15803d" />
  <style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    body { margin: 0; background: #e2e8f0; color: #0f172a; }
    .wrap { max-width: 560px; margin: 0 auto; padding: 12px 14px 28px; }
    h1 { margin: 6px 0 12px; font-size: 1.55rem; color: #0f172a; font-weight: 700; }
    .card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 12px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    }
    .call-label { font-size: 0.9rem; color: #334155; margin-bottom: 8px; }
    .call-btn {
      display: block;
      width: 100%;
      text-align: center;
      background: #15803d;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 14px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 1rem;
    }
    .call-btn:hover { background: #166534; }
    .nav-links { display: flex; flex-wrap: wrap; gap: 12px; margin: 10px 0 14px; font-size: 0.95rem; }
    .nav-links a { color: #1d4ed8; text-decoration: underline; font-weight: 600; }
    .section-title { margin: 0 0 6px; font-size: 1.15rem; font-weight: 700; color: #0f172a; }
    .tariff { font-size: 0.85rem; color: #475569; margin-bottom: 12px; line-height: 1.4; }
    .fare-preview {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      padding: 8px 12px;
      border-radius: 7px;
      font-weight: 700;
      font-size: 0.92rem;
      margin-top: 10px;
    }
    label { display: block; font-size: 0.9rem; font-weight: 600; color: #1e293b; margin-top: 10px; margin-bottom: 4px; }
    input, select {
      width: 100%;
      padding: 10px 12px;
      border-radius: 7px;
      border: 1px solid #94a3b8;
      background: #ffffff;
      color: #0f172a;
      font-size: 0.95rem;
    }
    .submit-btn {
      margin-top: 14px;
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      background: #15803d;
      color: #ffffff;
      font-weight: 700;
      font-size: 1rem;
      cursor: pointer;
    }
    .submit-btn:hover { background: #166534; }
    #msg { margin-top: 10px; font-size: 0.9rem; font-weight: 600; min-height: 20px; }
    .ride-item { border-top: 1px solid #e2e8f0; padding: 9px 0; font-size: 0.88rem; color: #1e293b; }
    .ride-item:first-child { border-top: none; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>ጉዞ ፕላስ (Guzo Plus)</h1>

    <div class="card">
      <div class="call-label">በአንድ ንክኪ ይደውሉ (አንድሮይድ እና ሁሉም ስልክ):</div>
      <a class="call-btn" href="tel:0923579382">📞 ይደውሉ: 0923579382</a>
    </div>

    <div class="nav-links">
      <a href="#requestCard">ጉዞ</a>
      <a href="https://guzo-plus-05wo.onrender.com/driver" target="_blank" rel="noopener">አሽከርካሪ</a>
      <a href="https://guzo-plus-05wo.onrender.com/admin" target="_blank" rel="noopener">አስተዳደር</a>
      <a href="#recentCard">ፎርሞች</a>
    </div>

    <div id="requestCard" class="card">
      <h2 class="section-title">ጉዞ ይጠይቁ</h2>
      <div class="tariff">መነሻ 200 ብር | ጠዋት +50 | ማታ +50 | ሼር 25% ቅናሽ</div>

      <form id="rideForm">
        <label for="passengerName">ሙሉ ስም</label>
        <input id="passengerName" name="passengerName" placeholder="ሙሉ ስም ያስገቡ" required />

        <label for="phone">ስልክ ቁጥር</label>
        <input id="phone" name="phone" type="tel" placeholder="09..." required />

        <label for="pickup">መነሻ</label>
        <input id="pickup" name="pickup" placeholder="መነሻ ቦታ" required />

        <label for="dropoff">መድረሻ</label>
        <input id="dropoff" name="dropoff" placeholder="መድረሻ ቦታ" required />

        <label for="rideType">ዓይነት</label>
        <select id="rideType" name="rideType">
          <option value="shared">ሼር / ጋራ (25% ቅናሽ)</option>
          <option value="solo">የግል ጉዞ (Solo)</option>
        </select>

        <label for="timeTariff">ሰዓት ታሪፍ</label>
        <select id="timeTariff" name="timeTariff">
          <option value="now">አሁን ያለው ሰዓት</option>
          <option value="morning">ጠዋት (+50 ብር)</option>
          <option value="evening">ማታ (+50 ብር)</option>
        </select>

        <div class="fare-preview" id="farePreview">ግምታዊ ዋጋ፡ 150 ብር</div>

        <button class="submit-btn" type="submit">ጉዞ ይጠይቁ</button>
      </form>

      <div id="msg"></div>
    </div>

    <div id="recentCard" class="card">
      <h3 class="section-title">የቅርብ ጊዜ ጥያቄዎች</h3>
      <div id="ridesList">በመጫን ላይ...</div>
    </div>
  </div>

  <script>
    const API_BASE = "https://guzo-plus-05wo.onrender.com";
    const form = document.getElementById("rideForm");
    const msg = document.getElementById("msg");
    const ridesList = document.getElementById("ridesList");
    const rideTypeEl = document.getElementById("rideType");
    const timeTariffEl = document.getElementById("timeTariff");
    const farePreviewEl = document.getElementById("farePreview");

    function computeFare(rideType, timeTariff) {
      let base = 200;
      if (timeTariff === "morning" || timeTariff === "evening") {
        base += 50;
      }
      if (rideType === "shared") {
        base = Math.round(base * 0.75);
      }
      return base;
    }

    function updateFarePreview() {
      const price = computeFare(rideTypeEl.value, timeTariffEl.value);
      farePreviewEl.textContent = "ግምታዊ ዋጋ፡ " + price + " ብር";
    }

    rideTypeEl.addEventListener("change", updateFarePreview);
    timeTariffEl.addEventListener("change", updateFarePreview);
    updateFarePreview();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register(API_BASE + "/sw.js").catch(() => {});
      });
    }

    async function loadRides() {
      try {
        const res = await fetch(API_BASE + "/api/rides");
        if (!res.ok) {
          ridesList.textContent = "ዝርዝር ማምጣት አልተቻለም።";
          return;
        }
        const rides = await res.json();
        if (!Array.isArray(rides) || rides.length === 0) {
          ridesList.textContent = "ምንም የጉዞ ጥያቄ የለም።";
          return;
        }
        ridesList.innerHTML = rides
          .slice(0, 8)
          .map(
            (r) =>
              '<div class="ride-item"><strong>' +
              (r.passengerName || "ተጓዥ") +
              "</strong>: " +
              (r.pickup || "") +
              " → " +
              (r.dropoff || "") +
              " | <strong>" +
              (r.fare || 200) +
              " ብር</strong> (" +
              (r.status || "pending") +
              ")</div>"
          )
          .join("");
      } catch (_) {
        ridesList.textContent = "ዝርዝሩን ማምጣት አልተቻለም።";
      }
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.style.color = "#15803d";
      msg.textContent = "በመላክ ላይ...";

      const payload = {
        passengerName: document.getElementById("passengerName").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        pickup: document.getElementById("pickup").value.trim(),
        dropoff: document.getElementById("dropoff").value.trim(),
        rideType: rideTypeEl.value,
        timeTariff: timeTariffEl.value
      };

      try {
        const res = await fetch(API_BASE + "/api/rides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          msg.style.color = "#15803d";
          msg.textContent = "✅ ጥያቄዎ በ" + (data.fare || computeFare(payload.rideType, payload.timeTariff)) + " ብር ተመዝግቧል።";
          form.reset();
          updateFarePreview();
          loadRides();
        } else {
          msg.style.color = "#dc2626";
          msg.textContent = "❌ ስህተት፡ " + (data.error || "መላክ አልተቻለም");
        }
      } catch (err) {
        msg.style.color = "#dc2626";
        msg.textContent = "❌ የኔትወርክ ስህተት፡ " + err.message;
      }
    });

    loadRides();
  </script>
</body>
</html>
