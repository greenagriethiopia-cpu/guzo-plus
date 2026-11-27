const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const MONGODB_URI = process.env.MONGODB_URI || "";
const DB_NAME = process.env.MONGODB_DB || "guzo_plus";
const DATA_FILE = process.env.DATA_FILE || "/tmp/guzo-plus-data.json";

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
      drivers: Array.isArray(parsed.drivers) ? parsed.drivers : []
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
    console.log("MONGODB_URI not set; using local JSON store:", DATA_FILE);
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    ridesCol = db.collection("rides");
    driversCol = db.collection("drivers");
    console.log("Connected to MongoDB database:", DB_NAME);
  } catch (err) {
    console.error("MongoDB connection failed, falling back to JSON store:", err.message);
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
    status: "pending",
    driverId: null,
    assignedDriverName: null,
    assignedDriverPhone: null,
    assignedLicenseNumber: null,
    createdAt: new Date().toISOString()
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
  const found = store.drivers.find(
    (d) => String(d.id) === String(driverId) || String(d._id) === String(driverId)
  );
  return found ? serializeDoc(found) : null;
}

async function assignDriverToRide(rideId, driverId) {
  const driver = await findDriverById(driverId);
  if (!driver) {
    return { error: "የተመረጠው አሽከርካሪ አልተገኘም።", status: 404 };
  }

  const assignedDriverName = driver.fullName || driver.driverName || "አሽከርካሪ";
  const assignedDriverPhone = driver.phone || driver.driverPhone || "";
  const assignedLicenseNumber = driver.licenseNumber || "";
  const assignedAt = new Date().toISOString();

  const updateFields = {
    driverId: String(driver.id),
    assignedDriverName,
    assignedDriverPhone,
    assignedLicenseNumber,
    status: "assigned",
    assignedAt
  };

  if (ridesCol) {
    const res = await ridesCol.findOneAndUpdate(
      buildObjectIdFilter(rideId),
      { $set: updateFields },
      { returnDocument: "after" }
    );
    const updatedDoc = res && res.value ? res.value : res;
    if (!updatedDoc || !updatedDoc.pickup) {
      return { error: "የጉዞ ጥያቄው አልተገኘም።", status: 404 };
    }
    return { ride: serializeDoc(updatedDoc), status: 200 };
  }

  const store = readLocalStore();
  const idx = store.rides.findIndex(
    (r) => String(r.id) === String(rideId) || String(r._id) === String(rideId)
  );
  if (idx === -1) {
    return { error: "የጉዞ ጥያቄው አልተገኘም።", status: 404 };
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
    createdAt: new Date().toISOString()
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

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "Guzo Plus",
    storage: ridesCol ? "mongodb" : "local-json",
    timestamp: new Date().toISOString()
  });
});

app.post("/api/admin/login", (req, res) => {
  const password = String((req.body && req.body.password) || "");
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ ok: false, message: "የአስተዳደር የይለፍ ቃል የተሳሳተ ነው።" });
  }
  return res.json({ ok: true, message: "በስኬት ገብተዋል።" });
});

app.get("/api/rides", async (req, res) => {
  try {
    const rides = await getAllRides();
    res.json({ ok: true, rides });
  } catch (err) {
    res.status(500).json({ ok: false, message: "የጉዞ ጥያቄዎችን ማምጣት አልተቻለም።" });
  }
});

app.post("/api/rides", async (req, res) => {
  try {
    const body = req.body || {};
    const fullName = String(body.fullName || body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const pickup = String(body.pickup || "").trim();
    const dropoff = String(body.dropoff || "").trim();

    if (!fullName || !phone || !pickup || !dropoff) {
      return res.status(400).json({
        ok: false,
        message: "እባክዎ ሙሉ ስም፣ ስልክ ቁጥር፣ መነሻ ቦታ እና መድረሻ ቦታ ያስገቡ።"
      });
    }

    const ride = await createRide({ fullName, phone, pickup, dropoff });
    res.status(201).json({ ok: true, message: "የጉዞ ጥያቄዎ በስኬት ተልኳል።", ride });
  } catch (err) {
    res.status(500).json({ ok: false, message: "የጉዞ ጥያቄ ማስገባት አልተቻለም።" });
  }
});

app.post("/api/rides/:id/assign-driver", async (req, res) => {
  try {
    const rideId = String(req.params.id || "").trim();
    const driverId = String((req.body && req.body.driverId) || "").trim();

    if (!rideId || !driverId) {
      return res.status(400).json({
        ok: false,
        message: "የጉዞ መለያ እና የአሽከርካሪ መለያ ያስፈልጋሉ።"
      });
    }

    const result = await assignDriverToRide(rideId, driverId);
    if (result.error) {
      return res.status(result.status).json({ ok: false, message: result.error });
    }

    res.json({
      ok: true,
      message: "አሽከርካሪው በስኬት ተመድቧል።",
      ride: result.ride
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: "አሽከርካሪ መመደብ አልተሳካም።" });
  }
});

app.get("/api/drivers", async (req, res) => {
  try {
    const drivers = await getAllDrivers();
    res.json({ ok: true, drivers });
  } catch (err) {
    res.status(500).json({ ok: false, message: "የተመዘገቡ አሽከርካሪዎችን ማምጣት አልተቻለም።" });
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
        message: "እባክዎ ሙሉ ስም፣ ስልክ፣ የተሽከርካሪ አይነት፣ ሰሌዳ ቁጥር እና የመንጃ ፈቃድ ቁጥር ያስገቡ።"
      });
    }

    if (!driverPhoto) {
      return res.status(400).json({
        ok: false,
        message: "እባክዎ የመንጃ ፈቃድ ወይም የአሽከርካሪ ፎቶ ያስገቡ።"
      });
    }

    const driver = await createDriver({
      fullName,
      phone,
      vehicleType,
      plateNumber,
      licenseNumber,
      driverPhoto
    });

    res.status(201).json({
      ok: true,
      message: "እንደ አሽከርካሪ በስኬት ተመዝግበዋል።",
      driver
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: "የአሽከርካሪ ምዝገባ አልተሳካም።" });
  }
});

app.get(["/", "/admin", "/index.html"], (req, res) => {
  const candidates = [
    path.join(publicDir, "index.html"),
    path.join(__dirname, "index.html")
  ];
  const existing = candidates.find((p) => fs.existsSync(p));
  if (existing) {
    return res.sendFile(existing);
  }
  res.status(404).send("index.html not found");
});
const  = process.env.MONGODB_URI || process.env.MONGO_URI || "";
const client = new MongoClient(MONGODB_URI, {
  family: 4,
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 45000,
  socketTimeoutMS: 45000
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Guzo Plus server listening on port ${PORT}`);
  });
});
