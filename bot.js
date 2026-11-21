const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is missing!');
}

const bot = new Telegraf(BOT_TOKEN || 'MISSING_TOKEN');

// --- Mongoose Schemas ---
const driverSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  name: { type: String, default: 'ሹፌር' },
  plateNumber: { type: String, required: true },
  isAvailable: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const tripSchema = new mongoose.Schema({
  passengerId: { type: String, required: true },
  passengerName: { type: String, default: 'ተሳፋሪ' },
  pickup: { type: String, required: true },
  destination: { type: String, required: true },
  estimatedFare: { type: Number, required: true },
  driverId: { type: String, default: null },
  driverName: { type: String, default: null },
  plateNumber: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'completed', 'cancelled'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

const Driver = mongoose.models.Driver || mongoose.model('Driver', driverSchema);
const Trip = mongoose.models.Trip || mongoose.model('Trip', tripSchema);

// --- In-memory user conversation state ---
const userSessions = new Map();

// --- Helper: Simple Fare Estimator (ETB) ---
function estimateFare(pickup, destination) {
  const baseFare = 120;
  const combinedLength = (pickup || '').length + (destination || '').length;
  const variableFare = Math.min(Math.max(combinedLength * 5, 30), 250);
  return baseFare + variableFare;
}

// --- Connect to MongoDB ---
async function connectDB() {
  if (!MONGO_URI) {
    console.log('ℹ️ MONGO_URI አልተዋቀረም — በጊዜያዊ ማህደረ ትውስታ እየሰራ ነው።');
    return;
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log('🍃 ከMongoDB Atlas ጋር በተሳካ ሁኔታ ተገናኝቷል!');
  } catch (err) {
    console.error('⚠️ MongoDB ግንኙነት አልተሳካም:', err.message);
  }
}

// --- Main Menu ---
function sendMainMenu(ctx, customHeader = null) {
  const text =
    (customHeader ? `${customHeader}\n\n` : '') +
    '🚕 *እንኳን ወደ ጉዞ ፕላስ (Guzo Plus) በደህና መጡ!*\n\n' +
    'እባክዎ የሚፈልጉትን አማራጭ ይምረጡ፦\n' +
    '*1* — 🧍 የተሳፋሪ ጉዞ ማዘዝ\n' +
    '*2* — 🚗 እንደ ሹፌር መመዝገብ / ታርጋ ማዘመን';

  return ctx.reply(text, { parse_mode: 'Markdown' });
}

// --- /start Command ---
bot.start(async (ctx) => {
  const userId = String(ctx.from.id);
  userSessions.delete(userId);
  await sendMainMenu(ctx);
});

// --- Driver Accepts Trip Button Callback ---
bot.action(/^accept_trip_(.+)$/, async (ctx) => {
  try {
    const tripId = ctx.match[1];
    const driverTelegramId = String(ctx.from.id);
    const driverDisplayName =
      [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') || 'ሹፌር';

    const driverRecord = await Driver.findOne({ telegramId: driverTelegramId });
    if (!driverRecord) {
      await ctx.answerCbQuery('⚠️ በመጀመሪያ እንደ ሹፌር መመዝገብ አለብዎት (/start -> 2)።', {
        show_alert: true
      });
      return;
    }

    // Atomically claim the trip only if it is still 'pending'
    const claimedTrip = await Trip.findOneAndUpdate(
      { _id: tripId, status: 'pending' },
      {
        $set: {
          status: 'accepted',
          driverId: driverTelegramId,
          driverName: driverRecord.name || driverDisplayName,
          plateNumber: driverRecord.plateNumber
        }
      },
      { new: true }
    );

    if (!claimedTrip) {
      await ctx.answerCbQuery('❌ ይህ ጉዞ ቀድሞ በሌላ ሹፌር ተወስዷል ወይም ተዘግቷል።', {
        show_alert: true
      });
      return;
    }

    await ctx.answerCbQuery('✅ ጉዞውን በተሳካ ሁኔታ ተቀብለዋል!');

    // Update the driver's notification message
    await ctx.editMessageText(
      `✅ *ጉዞውን ተቀብለዋል!*\n\n` +
        `🧍 ተሳፋሪ: *${claimedTrip.passengerName}*\n` +
        `📍 መነሻ: *${claimedTrip.pickup}*\n` +
        `🏁 መድረሻ: *${claimedTrip.destination}*\n` +
        `💰 ግምታዊ ዋጋ: *${claimedTrip.estimatedFare} ብር*\n` +
        `🚗 የእርስዎ ታርጋ: *${claimedTrip.plateNumber}*\n\n` +
        `እባክዎ ተሳፋሪውን ለመቀበል ወደ መነሻ ቦታ ይንቀሳቀሱ።`,
      { parse_mode: 'Markdown' }
    );

    // Notify the passenger with driver details and plate number
    await bot.telegram.sendMessage(
      claimedTrip.passengerId,
      `🎉 *ሹፌር ተገኝቷል! ጉዞዎ ተቀባይነት አግኝቷል።*\n\n` +
        `🚗 ሹፌር: *${claimedTrip.driverName}*\n` +
        `🔢 የመኪና ታርጋ: *${claimedTrip.plateNumber}*\n` +
        `📍 መነሻ: *${claimedTrip.pickup}*\n` +
        `🏁 መድረሻ: *${claimedTrip.destination}*\n` +
        `💰 ግምታዊ ዋጋ: *${claimedTrip.estimatedFare} ብር*\n\n` +
        `ሹፌሩ በቅርቡ ወደ መነሻ ቦታዎ ይደርሳል። መልካም ጉዞ!`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('❌ Error handling accept_trip:', err.message);
    try {
      await ctx.answerCbQuery('⚠️ ስህተት አጋጥሟል፣ እባክዎ እንደገና ይሞክሩ።', {
        show_alert: true
      });
     (_) {}
  }
});

// --- Text Message Flow ---
bot.on('text', async (ctx) => {
  const userId = String(ctx.from.id);
  const text = (ctx.message.text || '').trim();
  const fullName =
    [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') ||
    ctx.from.username ||
    'ተጠቃሚ';

  if (text === '/menu') {
    userSessions.delete(userId);
    return sendMainMenu(ctx);
  }

  const session = userSessions.get(userId);

  // If user is currently in a multi-step flow
  if (session) {
    if (session.step === 'passenger_pickup') {
      session.pickup = text;
      session.step = 'passenger_destination';
      userSessions.set(userId, session);
      return ctx.reply('🏁 *የመድረሻ ቦታዎን ያስገቡ* (ለምሳሌ፡ ቦሌ):', {
        parse_mode: 'Markdown'
      });
    }

    if (session.step === 'passenger_destination') {
      const pickup = session.pickup;
      const destination = text;
      const estimatedFare = estimateFare(pickup, destination);
      userSessions.delete(userId);

      try {
        const newTrip = await Trip.create({
          passengerId: userId,
          passengerName: fullName,
          pickup,
          destination,
          estimatedFare,
          status: 'pending'
        });

        await ctx.reply(
          `✅ *የጉዞ ጥያቄዎ ተመዝግቧል!*\n\n` +
            `📍 መነሻ: *${pickup}*\n` +
            `🏁 መድረሻ: *${destination}*\n` +
            `💰 ግምታዊ ዋጋ: *${estimatedFare} ብር*\n\n` +
            `🔎 አቅራቢያ ያሉ ሹፌሮችን እየፈለግን ነው... ሹፌር ሲቀበል ወዲያውኑ እናሳውቅዎታለን።`,
          { parse_mode: 'Markdown' }
        );

        // Notify all registered drivers with an Accept button
        const drivers = await Driver.find({});
        const dispatchText =
          `🚨 *አዲስ የጉዞ ጥያቄ ደርሷል!*\n\n` +
          `🧍 ተሳፋሪ: *${fullName}*\n` +
          `📍 መነሻ: *${pickup}*\n` +
          `🏁 መድረሻ: *${destination}*\n` +
          `💰 ግምታዊ ዋጋ: *${estimatedFare} ብር*`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('✅ ጉዞውን ተቀበል', `accept_trip_${newTrip._id}`)]
        ]);

        for (const drv of drivers) {
          if (!drv.telegramId) continue;
          try {
            await bot.telegram.sendMessage(drv.telegramId, dispatchText, {
              parse_mode: 'Markdown',
              ...keyboard
            });
          } catch (notifyErr) {
            console.error(`⚠️ Failed to notify driver ${drv.telegramId}:`, notifyErr.message);
          }
        }
      } catch (err) {
        console.error('❌ Error creating trip:', err.message);
        await ctx.reply('⚠️ የጉዞ ጥያቄውን ማስቀመጥ አልተቻለም። እባክዎ እንደገና ይሞክሩ።');
      }
      return;
    }

    if (session.step === 'driver_plate') {
      const plateNumber = text;
      userSessions.delete(userId);

      try {
        const savedDriver = await Driver.findOneAndUpdate(
          { telegramId: userId },
          {
            $set: {
              telegramId: userId,
              name: fullName,
              plateNumber,
              isAvailable: true
            }
          },
          { upsert: true, new: true }
        );

        await ctx.reply(
          `✅ *የሹፌር መረጃ ተመዝግቧል!*\n\n` +
            `👤 ስም: *${savedDriver.name}*\n` +
            `🚗 ታርጋ: *${savedDriver.plateNumber}*\n\n` +
            `አሁን የጉዞ ጥያቄዎችን ለመቀበል ዝግጁ ነዎት::`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) {
        console.error('❌ Error saving driver:', err.message);
        await ctx.reply('⚠️ የሹፌር መረጃን ማስቀመጥ አልተቻለም። እባክዎ እንደገና ይሞክሩ።');
      }
      return;
    }
  }

  // Main menu choices
  if (text === '1') {
    userSessions.set(userId, { step: 'passenger_pickup' });
    return ctx.reply('🧍 *የመነሻ ቦታዎን ያስገቡ* (ለምሳሌ፡ ጎተራ 47):', {
      parse_mode: 'Markdown'
    });
  }

  if (text === '2') {
    userSessions.set(userId, { step: 'driver_plate' });
    return ctx.reply('🚗 *የመኪናዎን ታርጋ ቁጥር ያስገቡ* (ለምሳሌ፡ 3 1234):', {
      parse_mode: 'Markdown'
    });
  }

  return sendMainMenu(ctx, 'ℹ️ እባክዎ *1* ወይም *2* ይምረጡ (ወይም `/start` ይላኩ)።');
});

// --- Launch Helper (called by server.js) ---
async function startBot() {
  await connectDB();

  if (!BOT_TOKEN) {
    console.warn('⚠️ BOT_TOKEN አልተገኘም؛ ቦቱ አልተጀመረም።');
    return;
  }

  try {
    // Clear any stale webhook so long polling runs cleanly without 409 conflict
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });
    await bot.launch({ dropPendingUpdates: false });
    console.log('🤖 ጉዞ ፕላስ Telegram ቦት በተሳካ ሁኔታ ተጀምሯል!');
  } catch (err) {
    console.error('❌ Bot launch error:', err.message);
  }
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = { bot, startBot };
