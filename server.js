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
      `
