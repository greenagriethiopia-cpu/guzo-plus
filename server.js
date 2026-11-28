const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "";
const DB_NAME = process.env.MONGODB_DB || "guzo_plus";
const DATA_FILE = process.env.DATA_FILE || "/tmp/guzo-plus-data.json";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : "";

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));

const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}
app.use(express.static(__dirname));

let db = null;
let ridesCol = null;
let driversCol = null;

function readLocalStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = { rides: [], drivers: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf8");
      return initial;
    }
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      rides: Array.isArray(parsed.rides) ? parsed.rides : [],
      drivers: Array.isArray(parsed.drivers) ? parsed.drivers : [],
    };
  } catch (err) {
    return { rides: [], drivers: [] };
  }
}

function writeLocalStore(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function makeId() {
  return crypto.randomBytes(12).toString("hex");
}

function serializeDoc(doc) {
  if (!doc) return null;
  const copy = { ...doc };
  const id = copy._id ? String(copy._id) : copy.id;
  copy.id = id;
  copy._id = id;
  return copy;
}

function buildObjectIdFilter(id) {
  if (ObjectId.isValid(id) && String(new ObjectId(id)) === String(id)) {
    return { $or: [{ _id: new ObjectId(id) }, { id: String(id) }] };
  }
  return { id: String(id) };
}

async function initDatabase() {
  if (!MONGODB_URI) {
    console.log("MONGODB_URI / MONGO_URI not set; using local JSON store");
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI, {
      family: 4,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 45000,
      socketTimeoutMS: 45000,
    });
    await client.connect();
    db = client.db(DB_NAME);
    ridesCol = db.collection("rides");
    driversCol = db.collection("drivers");
    console.log("Connected to MongoDB database:", DB_NAME);
  } catch (err) {
    console.error("MongoDB connection failed, falling back to JSON store:", err);
    db = null;
    ridesCol = null;
    driversCol = null;
  }
}

async function getAllRides() {
  if (ridesCol) {
    const docs = await ridesCol.find({}).sort({ createdAt: -1 }).toArray();
    return docs.map(serializeDoc);
  }
  const store = readLocalStore();
  return [...store.rides].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
}

async function createRide(rideInput) {
  const newRide = {
    id: makeId(),
    fullName: rideInput.fullName,
    phone: rideInput.phone,
    pickup: rideInput.pickup,
    dropoff: rideInput.dropoff,
    vehicleType: rideInput.vehicleType || "ባጃጅ (Bajaj)",
    status: "pending",
    driverId: null,
    createdAt: new Date().toISOString(),
  };

  if (ridesCol) {
    const result = await ridesCol.insertOne(newRide);
    return serializeDoc({ ...newRide, _id: result.insertedId });
  }

  const store = readLocalStore();
  store.rides.unshift(newRide);
  writeLocalStore(store);
  return newRide;
}

async function findDriverById(driverId) {
  if (!driverId) return null;
  if (driversCol) {
    const doc = await driversCol.findOne(buildObjectIdFilter(driverId));
    return serializeDoc(doc);
  }
  const store = readLocalStore();
  return (
    store.drivers.find(
      (d) => String(d.id) === String(driverId) || String(d._id) === String(driverId)
    ) || null
  );
}

async function assignDriverToRide(rideId, driverId) {
  const driver = await findDriverById(driverId);
  if (!driver) {
    return { error: "ሾፌሩ አልተገኘም", status: 404 };
  }

  const assignedDriverName = driver.fullName || driver.driverName || "";
  const assignedDriverPhone = driver.phone || driver.driverPhone || "";
  const assignedLicenseNumber = driver.licenseNumber || "";
  const assignedAt = new Date().toISOString();

  const updateFields = {
    driverId: String(driver.id),
    assignedDriverName,
    assignedDriverPhone,
    assignedLicenseNumber,
    status: "assigned",
    assignedAt,
  };

  if (ridesCol) {
    const res = await ridesCol.findOneAndUpdate(
      buildObjectIdFilter(rideId),
      { $set: updateFields },
      { returnDocument: "after" }
    );
    const updatedDoc = res && res.value ? res.value : res;
    if (!updatedDoc || !updatedDoc.pickup) {
      return { error: "የጉዞ ጥያቄ አልተገኘም", status: 404 };
    }
    return { ride: serializeDoc(updatedDoc), status: 200 };
  }

  const store = readLocalStore();
  const idx = store.rides.findIndex(
    (r) => String(r.id) === String(rideId) || String(r._id) === String(rideId)
  );
  if (idx === -1) {
    return { error: "የጉዞ ጥያቄ አልተገኘም", status: 404 };
  }
  store.rides[idx] = { ...store.rides[idx], ...updateFields };
  writeLocalStore(store);
  return { ride: serializeDoc(store.rides[idx]), status: 200 };
}

async function getAllDrivers() {
  if (driversCol) {
    const docs = await driversCol.find({}).sort({ createdAt: -1 }).toArray();
    return docs.map(serializeDoc);
  }
  const store = readLocalStore();
  return [...store.drivers].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
}

async function createDriver(driverInput) {
  const newDriver = {
    id: makeId(),
    fullName: driverInput.fullName,
    phone: driverInput.phone,
    vehicleType: driverInput.vehicleType,
    plateNumber: driverInput.plateNumber,
    licenseNumber: driverInput.licenseNumber,
    driverPhoto: driverInput.driverPhoto,
    status: "active",
    createdAt: new Date().toISOString(),
  };

  if (driversCol) {
    const result = await driversCol.insertOne(newDriver);
    return serializeDoc({ ...newDriver, _id: result.insertedId });
  }

  const store = readLocalStore();
  store.drivers.unshift(newDriver);
  writeLocalStore(store);
  return newDriver;
}

// --- Telegram Interactive Bot ---
const telegramSessions = new Map();

function mainMenuMessage() {
  return (
    "እንኳን ወደ ጉዞ ፕላስ (Guzo Plus) በደህና መጡ!\n\n" +
    "እባክዎ የሚፈልጉትን ቁጥር ይላኩ፦\n" +
    "1 - ጉዞ መጠየቅ (በቴሌግራም)\n" +
    "2 - እንደ ሾፌር መመዝገብ (በቴሌግራም)\n" +
    "3 - የቅርብ ጉዞዎች ሁኔታ ማየት"
  );
}

function vehicleChoiceMessage() {
  return (
    "የተሽከርካሪ አይነት ይምረጡ፦\n" +
    "1 - ባጃጅ (Bajaj)\n" +
    "2 - ሴዳን / መኪና (Sedan)\n" +
    "3 - ሚኒባስ / ሼር (Minibus)"
  );
}

function mapVehicleChoice(input) {
  const clean = String(input || "").trim();
  if (clean === "1") return "ባጃጅ (Bajaj)";
  if (clean === "2") return "ሴዳን (Sedan)";
  if (clean === "3") return "ሚኒባስ (Minibus)";
  return clean;
}

async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_API || !chatId) return;
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
  } catch (err) {
    console.error("Telegram sendMessage failed:", err);
  }
}

app.post("/api/telegram/webhook", async (req, res) => {
  res.sendStatus(200);
  const message = req.body && (req.body.message || req.body.edited_message);
  if (!message || !message.chat) return;

  const chatId = message.chat.id;
  const incoming = String(message.text || "").trim();
  if (!incoming) return;

  if (incoming === "/start" || incoming.toLowerCase() === "menu") {
    telegramSessions.delete(chatId);
    await sendTelegramMessage(chatId, mainMenuMessage());
    return;
  }

  const session = telegramSessions.get(chatId);

  if (!session) {
    if (incoming === "1") {
      telegramSessions.set(chatId, { flow: "ride", step: "fullName", data: {} });
      await sendTelegramMessage(
        chatId,
        "የጉዞ ጥያቄ ለመመዝገብ እባክዎ ሙሉ ስምዎን ያስገቡ፦"
      );
      return;
    }

    if (incoming === "2") {
      telegramSessions.set(chatId, { flow: "driver", step: "fullName", data: {} });
      await sendTelegramMessage(
        chatId,
        "እንደ ሾፌር ለመመዝገብ እባክዎ ሙሉ ስምዎን ያስገቡ፦"
      );
      return;
    }

    if (incoming === "3") {
      try {
        const rides = await getAllRides();
        const recent = rides.slice(0, 5);
        if (!recent.length) {
          await sendTelegramMessage(
            chatId,
            "በአሁኑ ጊዜ የተመዘገበ የጉዞ ጥያቄ የለም። አዲስ ጉዞ ለመጠየቅ 1 ይላኩ ወይም /start ይበሉ።"
          );
          return;
        }
        const lines = recent.map(
          (r, idx) =>
            `${idx + 1}. ${r.fullName} (${r.phone}) — ${r.status || "pending"}\n   📍 ${r.pickup} → 🎯 ${r.dropoff}`
        );
        await sendTelegramMessage(
          chatId,
          `የቅርብ ጉዞዎች፦\n\n${lines.join("\n\n")}\n\nወደ ዋና ምርጫ ለመመለስ /start ይላኩ።`
        );
      } catch (err) {
        await sendTelegramMessage(
          chatId,
          "የጉዞ ዝርዝር ማምጣት አልተቻለም። እባክዎ /start ይላኩ።"
        );
      }
      return;
    }

    await sendTelegramMessage(chatId, mainMenuMessage());
    return;
  }

  if (session.flow === "ride") {
    if (session.step === "fullName") {
      session.data.fullName = incoming;
      session.step = "phone";
      await sendTelegramMessage(chatId, "እባክዎ ስልክ ቁጥርዎን ያስገቡ፦");
      return;
    }

    if (session.step === "phone") {
      session.data.phone = incoming;
      session.step = "vehicleType";
      await sendTelegramMessage(chatId, vehicleChoiceMessage());
      return;
    }

    if (session.step === "vehicleType") {
      session.data.vehicleType = mapVehicleChoice(incoming);
      session.step = "pickup";
      await sendTelegramMessage(chatId, "የመነሻ ቦታ (Pickup) ያስገቡ፦");
      return;
    }

    if (session.step === "pickup") {
      session.data.pickup = incoming;
      session.step = "dropoff";
      await sendTelegramMessage(chatId, "የመድረሻ ቦታ (Dropoff) ያስገቡ፦");
      return;
    }

    if (session.step === "dropoff") {
      session.data.dropoff = incoming;
      try {
        const ride = await createRide(session.data);
        telegramSessions.delete(chatId);
        await sendTelegramMessage(
          chatId,
          `የጉዞ ጥያቄዎ በስኬት ተመዝግቧል!\n` +
            `መለያ፦ ${ride.id}\n` +
            `ስም፦ ${ride.fullName}\n` +
            `ተሽከርካሪ፦ ${ride.vehicleType}\n` +
            `መነሻ፦ ${ride.pickup}\n` +
            `መድረሻ፦ ${ride.dropoff}\n\n` +
            `አዲስ ለመጀመር /start ይላኩ።`
        );
      } catch (err) {
        telegramSessions.delete(chatId);
        await sendTelegramMessage(
          chatId,
          "የጉዞ ጥያቄ ማስቀመጥ አልተቻለም። እባክዎ /start ብለው እንደገና ይሞክሩ።"
        );
      }
      return;
    }
  }

  if (session.flow === "driver") {
    if (session.step === "fullName") {
      session.data.fullName = incoming;
      session.step = "phone";
      await sendTelegramMessage(chatId, "እባክዎ ስልክ ቁጥርዎን ያስገቡ፦");
      return;
    }

    if (session.step === "phone") {
      session.data.phone = incoming;
      session.step = "vehicleType";
      await sendTelegramMessage(chatId, vehicleChoiceMessage());
      return;
    }

    if (session.step === "vehicleType") {
      session.data.vehicleType = mapVehicleChoice(incoming);
      session.step = "plateNumber";
      await sendTelegramMessage(chatId, "የታርጋ ቁጥር ያስገቡ፦");
      return;
    }

    if (session.step === "plateNumber") {
      session.data.plateNumber = incoming;
      session.step = "licenseNumber";
      await sendTelegramMessage(chatId, "የመንጃ ፈቃድ ቁጥር ያስገቡ፦");
      return;
    }

    if (session.step === "licenseNumber") {
      session.data.licenseNumber = incoming;
      try {
        const driver = await createDriver({
          ...session.data,
          driverPhoto: "telegram-bot",
        });
        telegramSessions.delete(chatId);
        await sendTelegramMessage(
          chatId,
          `የሾፌር ምዝገባዎ በስኬት ተጠናቋል!\n` +
            `ስም፦ ${driver.fullName}\n` +
            `ስልክ፦ ${driver.phone}\n` +
            `ተሽከርካሪ፦ ${driver.vehicleType}\n` +
            `ታርጋ፦ ${driver.plateNumber}\n\n` +
            `አዲስ ለመጀመር /start ይላኩ።`
        );
      } catch (err) {
        telegramSessions.delete(chatId);
        await sendTelegramMessage(
          chatId,
          "የሾፌር ምዝገባ ማስቀመጥ አልተቻለም። እባክዎ /start ብለው እንደገና ይሞክሩ።"
        );
      }
      return;
    }
  }
});

async function registerTelegramWebhook() {
  const baseUrl =
    process.env.RENDER_EXTERNAL_URL || "https://guzo-plus-05wo.onrender.com";
  if (!TELEGRAM_API || !baseUrl) {
    console.log("TELEGRAM_BOT_TOKEN not set; skipping webhook registration");
    return;
  }
  try {
    const webhookUrl = `${baseUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
    await fetch(`${TELEGRAM_API}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    console.log("Telegram webhook registered:", webhookUrl);
  } catch (err) {
    console.error("Telegram setWebhook failed:", err);
  }
}

// --- API Routes ---
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Guzo Plus",
    storage: ridesCol ? "mongodb" : "local-json",
    telegramConfigured: Boolean(TELEGRAM_API),
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/admin/login", (req, res) => {
  const password = String((req.body && req.body.password) || "");
  if (password && password === ADMIN_PASSWORD) {
    return res.json({ ok: true, message: "ገብተዋል" });
  }
  return res.status(401).json({ ok: false, message: "የይለፍ ቃል የተሳሳተ ነው" });
});

app.get("/api/rides", async (req, res) => {
  try {
    const rides = await getAllRides();
    res.json({ ok: true, rides });
  } catch (err) {
    res.status(500).json({ ok: false, message: "የጉዞ ዝርዝር ማምጣት አልተቻለም" });
  }
});

app.post("/api/rides", async (req, res) => {
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || "").trim();
    const phone = String(body.phone || "").trim();
    const pickup = String(body.pickup || "").trim();
    const dropoff = String(body.dropoff || "").trim();
    const vehicleType = String(body.vehicleType || "ባጃጅ (Bajaj)").trim();

    if (!fullName || !phone || !pickup || !dropoff) {
      return res
        .status(400)
        .json({ ok: false, message: "እባክዎ ሁሉንም የጉዞ መረጃዎች በትክክል ይሙሉ" });
    }

    const ride = await createRide({ fullName, phone, pickup, dropoff, vehicleType });
    res.status(201).json({ ok: true, message: "የጉዞ ጥያቄ ተመዝግቧል", ride });
  } catch (err) {
    res.status(500).json({ ok: false, message: "የጉዞ ጥያቄ መመዝገብ አልተቻለም" });
  }
});

app.post("/api/rides/:id/assign-driver", async (req, res) => {
  try {
    const rideId = String(req.params.id || "").trim();
    const driverId = String((req.body && req.body.driverId) || "").trim();

    if (!rideId || !driverId) {
      return res
        .status(400)
        .json({ ok: false, message: "የጉዞ መለያ እና የሾፌር መለያ ያስፈልጋል" });
    }

    const result = await assignDriverToRide(rideId, driverId);
    if (result.error) {
      return res.status(result.status).json({ ok: false, message: result.error });
    }

    res.json({ ok: true, message: "ሾፌር ተመድቧል", ride: result.ride });
  } catch (err) {
    res.status(500).json({ ok: false, message: "ሾፌር መመደብ አልተቻለም" });
  }
});

app.get("/api/drivers", async (req, res) => {
  try {
    const drivers = await getAllDrivers();
    res.json({ ok: true, drivers });
  } catch (err) {
    res.status(500).json({ ok: false, message: "የሾፌሮች ዝርዝር ማምጣት አልተቻለም" });
  }
});

app.post("/api/drivers", async (req, res) => {
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || body.driverName || "").trim();
    const phone = String(body.phone || body.driverPhone || "").trim();
    const vehicleType = String(body.vehicleType || "").trim();
    const plateNumber = String(body.plateNumber || "").trim();
    const licenseNumber = String(body.licenseNumber || "").trim();
    const driverPhoto = String(body.driverPhoto || "").trim();

    if (!fullName || !phone || !vehicleType || !plateNumber || !licenseNumber) {
      return res.status(400).json({
        ok: false,
        message: "እባክዎ ሙሉ ስም፣ ስልክ፣ የተሽከርካሪ አይነት፣ ታርጋ እና ፈቃድ ቁጥር ያስገቡ",
      });
    }

    if (!driverPhoto) {
      return res
        .status(400)
        .json({ ok: false, message: "እባክዎ የሾፌር ፎቶ ያስገቡ" });
    }

    const driver = await createDriver({
      fullName,
      phone,
      vehicleType,
      plateNumber,
      licenseNumber,
      driverPhoto,
    });

    res.status(201).json({ ok: true, message: "አዲስ አሽከርካሪ በስኬት ተመዝግቧል", driver });
  } catch (err) {
    res.status(500).json({ ok: false, message: "የአሽከርካሪ ምዝገባ አልተቻለም" });
  }
});

// --- PWA Manifest & Service Worker ---
app.get("/manifest.json", (req, res) => {
  const candidates = [
    path.join(publicDir, "manifest.json"),
    path.join(__dirname, "manifest.json"),
  ];
  const existing = candidates.find((p) => fs.existsSync(p));
  if (existing) return res.sendFile(existing);

  res.type("application/manifest+json").json({
    id: "/",
    name: "ጉዞ ፕላስ • Guzo Plus",
    short_name: "ጉዞ ፕላስ",
    description: "የተሳፋሪ የጉዞ ጥያቄ እና የሾፌር ምዝገባ አገልግሎት",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "am",
    background_color: "#f7f5fc",
    theme_color: "#7bed85",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  });
});

app.get("/sw.js", (req, res) => {
  const candidates = [
    path.join(publicDir, "sw.js"),
    path.join(__dirname, "sw.js"),
  ];
  const existing = candidates.find((p) => fs.existsSync(p));
  if (existing) return res.sendFile(existing);

  res.type("application/javascript").send(`
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
  `);
});

app.get(["/", "/admin", "/index.html"], (req, res) => {
  const candidates = [
    path.join(publicDir, "index.html"),
    path.join(__dirname, "index.html"),
  ];
  const existing = candidates.find((p) => fs.existsSync(p));
  if (existing) {
    return res.sendFile(existing);
  }
  res.status(404).send("index.html not found");
});

app.listen(PORT, () => {
  console.log(`Guzo Plus server listening on port ${PORT}`);
  initDatabase();
  registerTelegramWebhook();
});
