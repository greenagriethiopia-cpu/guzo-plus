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
    
