const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is missing!');
}

const bot = new Telegraf(BOT_TOKEN || 'MISSING_TOKEN');

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

const userSessions = new Map();

function estimateFare(pickup, destination) {
  const cleanPickup = (pickup || '').trim();
  const cleanDestination = (destination || '').trim();

  if (!cleanPickup || !cleanDestination) {
    return 150;
  }

  if (cleanPickup.toLowerCase() === cleanDestination.toLowerCase()) {
    return 150;
  }

  const baseFare = 150;
  const routeFactor = (cleanPickup.length + cleanDestination.length) * 6;
  const cappedExtra = Math.min(Math.max(routeFactor, 30), 300);
  const rawFare = baseFare + cappedExtra;

  return Math.round(rawFare / 10) * 10;
}

async function connectDB() {
  if (!MONGO_URI) {
    console.log('⚠️ MONGO_URI አልተገኘም - ዳታቤዝ ሳይገናኝ ቀጥሏል');
    return;
  }
  await mongoose.connect(MONGO_URI);
  console.log('🍃 ከMongoDB Atlas ጋር በተሳካ ሁኔታ ተገናኝቷል!');
}

bot.start(async (ctx) => {
  const telegramId = String(ctx.from.id);
  userSessions.delete(telegramId);

  await ctx.reply(
    `🚕 *እንኳን ወደ ጉዞ ፕላስ (Guzo Plus) በደህና መጡ!*\n\n` +
    `እባክዎ የሚፈልጉትን አማራጭ ይምረጡ፦\n` +
    `1 — 🧍 የተሳፋሪ ጉዞ ማዘዝ\n` +
    `2 — 🚗 እንደ ሹፌር መመዝገብ / ታርጋ ማዘመን\n` +
    `3 — 🔄 የሹፌር ሁኔታ መቀያየር (Available / Busy)\n` +
    `4 — 📊 የሹፌር ገቢ እና የተጠናቀቁ ጉዞዎች`,
    { parse_mode: 'Markdown' }
  );
});

bot.on('text', async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);
    const text = (ctx.message.text || '').trim();
    const passengerName =
      [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') ||
      ctx.from.username ||
      'ተሳፋሪ';

    const session = userSessions.get(telegramId);

    if (!session) {
      if (text === '1') {
        userSessions.set(telegramId, { step: 'awaiting_pickup' });
        await ctx.reply('🧍 *የመነሻ ቦታዎን ያስገቡ (ለምሳሌ፡ ጎተራ 47):*', { parse_mode: 'Markdown' });
        return;
      }

      if (text === '2') {
        userSessions.set(telegramId, { step: 'awaiting_plate' });
        await ctx.reply('🚗 *እባክዎ የመኪናዎን ታርጋ ያስገቡ (ለምሳሌ፡ 3-AA-12345):*', { parse_mode: 'Markdown' });
        return;
      }

      if (text === '3') {
        const existingDriver = await Driver.findOne({ telegramId });
        if (!existingDriver) {
          await ctx.reply('⚠️ መጀመሪያ እንደ ሹፌር ይመዝገቡ (አማራጭ *2* ይላኩ)።', { parse_mode: 'Markdown' });
          return;
        }

        const nextStatus = !existingDriver.isAvailable;
        const updatedDriver = await Driver.findOneAndUpdate(
          { telegramId },
          { $set: { isAvailable: nextStatus } },
          { new: true }
        );

        await ctx.reply(
          updatedDriver.isAvailable
            ? `🟢 *አሁን ዝግጁ (Available) ነዎት!*\nአዳዲስ የጉዞ ጥያቄዎች ይደርስዎታል።`
            : `🔴 *አሁን በጉዞ ላይ / ያልተመቸ (Busy) ነዎት!*\nአዳዲስ የጉዞ ጥያቄዎች ለጊዜው አይላኩልዎትም።`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      if (text === '4') {
        const existingDriver = await Driver.findOne({ telegramId });
        if (!existingDriver) {
          await ctx.reply('⚠️ መጀመሪያ እንደ ሹፌር ይመዝገቡ (አማራጭ *2* ይላኩ)።', { parse_mode: 'Markdown' });
          return;
        }

        const completedTrips = await Trip.find({
          driverId: telegramId,
          status: 'completed'
        });

        const totalCompleted = completedTrips.length;
        const totalEarnings = completedTrips.reduce(
          (sum, trip) => sum + (Number(trip.estimatedFare) || 0),
          0
        );

        await ctx.reply(
          `📊 *የሹፌር ማጠቃለያ (Guzo Plus)*\n\n` +
          `👤 ሹፌር: *${existingDriver.name}*\n` +
          `🚘 ታርጋ: *${existingDriver.plateNumber}*\n` +
          `📌 የአሁን ሁኔታ: *${existingDriver.isAvailable ? '🟢 Available (ዝግጁ)' : '🔴 Busy (በጉዞ ላይ)'}*\n` +
          `🏁 የተጠናቀቁ ጉዞዎች: *${totalCompleted}*\n` +
          `💰 ግምታዊ ጠቅላላ ገቢ: *${totalEarnings} ብር*`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await ctx.reply(
        'እባክዎ *1* (ተሳፋሪ)፣ *2* (ሹፌር)፣ *3* (ሁኔታ መቀያየር) ወይም *4* (ገቢ እና ጉዞዎች) ይምረጡ፣ ወይም /start ይላኩ።',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (session.step === 'awaiting_pickup') {
      if (!text) {
        await ctx.reply('⚠️ እባክዎ የመነሻ ቦታ ያስገቡ።');
        return;
      }
      userSessions.set(telegramId, { step: 'awaiting_destination', pickup: text });
      await ctx.reply('🏁 *የመድረሻ ቦታዎን ያስገቡ (ለምሳሌ፡ ቦሌ):*', { parse_mode: 'Markdown' });
      return;
    }

    if (session.step === 'awaiting_destination') {
      if (!text) {
        await ctx.reply('⚠️ እባክዎ የመድረሻ ቦታ ያስገቡ።');
        return;
      }

      const pickup = session.pickup;
      const destination = text;
      const estimatedFare = estimateFare(pickup, destination);
      userSessions.delete(telegramId);

      const trip = await Trip.create({
        passengerId: telegramId,
        passengerName,
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
        `🔍 አቅራቢያ ያሉ ሹፌሮችን እየፈለግን ነው... ሹፌር ሲቀበል ወዲያውኑ እናሳውቅዎታለን::`,
        { parse_mode: 'Markdown' }
      );

      const drivers = await Driver.find({ isAvailable: true });
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ ጉዞውን ተቀበል', `accept_trip_${trip._id}`)]
      ]);

      const dispatchText =
        `🚨 *አዲስ የጉዞ ጥያቄ ደርሷል!*\n\n` +
        `🧍 ተሳፋሪ: *${passengerName}*\n` +
        `📍 መነሻ: *${pickup}*\n` +
        `🏁 መድረሻ: *${destination}*\n` +
        `💰 ግምታዊ ዋጋ: *${estimatedFare} ብር*`;

      for (const drv of drivers) {
        try {
          await bot.telegram.sendMessage(drv.telegramId, dispatchText, {
            parse_mode: 'Markdown',
            ...keyboard
          });
        } catch (err) {
          console.error(`⚠️ Failed to notify driver ${drv.telegramId}:`, err.message);
        }
      }
      return;
    }

    if (session.step === 'awaiting_plate') {
      if (!text) {
        await ctx.reply('⚠️ እባክዎ ትክክለኛ የመኪና ታርጋ ያስገቡ።');
        return;
      }

      userSessions.delete(telegramId);

      const driver = await Driver.findOneAndUpdate(
        { telegramId },
        {
          $set: {
            telegramId,
            name: passengerName,
            plateNumber: text,
            isAvailable: true
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await ctx.reply(
        `✅ *እንደ ሹፌር በተሳካ ሁኔታ ተመዝግበዋል!*\n\n` +
        `👤 ስም: *${driver.name}*\n` +
        `🚘 ታርጋ: *${driver.plateNumber}*\n` +
        `🟢 ሁኔታ: *ዝግጁ (Available)*\n\n` +
        `አዳዲስ የጉዞ ጥያቄዎች ሲመጡ ወዲያውኑ ይደርስዎታል።`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    console.error('❌ Error handling message:', err.message);
    await ctx.reply('⚠️ ችግር ተፈጥሯል። እባክዎ እንደገና ይሞክሩ ወይም /start ይላኩ።');
  }
});

bot.action(/^accept_trip_(.+)$/, async (ctx) => {
  try {
    const tripId = ctx.match[1];
    const driverTelegramId = String(ctx.from.id);
    const driverName =
      [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ') ||
      ctx.from.username ||
      'ሹፌር';

    const driver = await Driver.findOne({ telegramId: driverTelegramId });
    if (!driver) {
      await ctx.answerCbQuery('⚠️ ጉዞ ለመቀበል መጀመሪያ እንደ ሹፌር ይመዝገቡ (አማራጭ 2)።', { show_alert: true });
      return;
    }

    const claimedTrip = await Trip.findOneAndUpdate(
      { _id: tripId, status: 'pending' },
      {
        $set: {
          status: 'accepted',
          driverId: driverTelegramId,
          driverName: driver.name || driverName,
          plateNumber: driver.plateNumber
        }
      },
      { new: true }
    );

    if (!claimedTrip) {
      await ctx.answerCbQuery('⚠️ ይህ ጉዞ አስቀድሞ በሌላ ሹፌር ተወስዷል ወይም ተዘግቷል።', { show_alert: true });
      return;
    }

    await Driver.findOneAndUpdate(
      { telegramId: driverTelegramId },
      { $set: { isAvailable: false } }
    );

    await ctx.answerCbQuery('✅ ጉዞውን ተቀብለዋል! (ሁኔታዎ Busy ሆኗል)');

    await ctx.editMessageText(
      `✅ *ጉዞው ተቀባይነት አግኝቷል!*\n\n` +
      `🧍 ተሳፋሪ: *${claimedTrip.passengerName}*\n` +
      `📍 መነሻ: *${claimedTrip.pickup}*\n` +
      `🏁 መድረሻ: *${claimedTrip.destination}*\n` +
      `💰 ግምታዊ ዋጋ: *${claimedTrip.estimatedFare} ብር*\n` +
      `🚘 የመኪና ታርጋ: *${claimedTrip.plateNumber || 'አልተገለጸም'}*\n` +
      `🔴 የሹፌር ሁኔታ: *Busy (በጉዞ ላይ)*\n\n` +
      `ጉዞውን ሲጨርሱ ወይም ሲሰርዙ ከታች ያሉትን ቁልፎች ይጠቀሙ፦`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🏁 ጉዞውን ጨርስ', `complete_trip_${claimedTrip._id}`),
            Markup.button.callback('❌ ጉዞውን ሰርዝ', `cancel_trip_${claimedTrip._id}`)
          ]
        ])
      }
    );

    await bot.telegram.sendMessage(
      claimedTrip.passengerId,
      `🎉 *ሹፌር ተገኝቷል! ጉዞዎ ተቀባይነት አግኝቷል።*\n\n` +
      `🚘 ሹፌር: *${claimedTrip.driverName}*\n` +
      `🔢 የመኪና ታርጋ: *${claimedTrip.plateNumber}*\n` +
      `📍 መነሻ: *${claimedTrip.pickup}*\n` +
      `🏁 መድረሻ: *${claimedTrip.destination}*\n` +
      `💰 ግምታዊ ዋጋ: *${claimedTrip.estimatedFare} ብር*`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('❌ Error accepting trip:', err.message);
    try { await ctx.answerCbQuery('⚠️ ጉዞውን መቀበል አልተቻለም።', { show_alert: true }); } catch (_) {}
  }
});

bot.action(/^complete_trip_(.+)$/, async (ctx) => {
  try {
    const tripId = ctx.match[1];
    const driverTelegramId = String(ctx.from.id);

    const updatedTrip = await Trip.findOneAndUpdate(
      { _id: tripId, driverId: driverTelegramId, status: 'accepted' },
      { $set: { status: 'completed' } },
      { new: true }
    );

    if (!updatedTrip) {
      await ctx.answerCbQuery('⚠️ ይህ ጉዞ አልተገኘም ወይም አስቀድሞ ተጠናቋል።', { show_alert: true });
      return;
    }

    await Driver.findOneAndUpdate(
      { telegramId: driverTelegramId },
      { $set: { isAvailable: true } }
    );

    await ctx.answerCbQuery('🏁 ጉዞው ተጠናቋል! (ሁኔታዎ Available ተመልሷል)');
    await ctx.editMessageText(
      `🏁 *ጉዞው ተጠናቋል!*\n\n` +
      `🧍 ተሳፋሪ: *${updatedTrip.passengerName}*\n` +
      `📍 መነሻ: *${updatedTrip.pickup}*\n` +
      `🏁 መድረሻ: *${updatedTrip.destination}*\n` +
      `💰 ክፍያ: *${updatedTrip.estimatedFare} ብር*\n` +
      `📌 ሁኔታ: *completed*\n` +
      `🟢 የሹፌር ሁኔታ: *Available (ዝግጁ)*`,
      { parse_mode: 'Markdown' }
    );

    await bot.telegram.sendMessage(
      updatedTrip.passengerId,
      `🏁 *ጉዞዎ በሰላም ተጠናቋል!*\n\n` +
      `📍 መነሻ: *${updatedTrip.pickup}*\n` +
      `🏁 መድረሻ: *${updatedTrip.destination}*\n` +
      `💰 ክፍያ: *${updatedTrip.estimatedFare} ብር*\n` +
      `ስለተጠቀሙን እናመሰግናለን! ጉዞ ፕላስ።`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('❌ Error completing trip:', err.message);
    try { await ctx.answerCbQuery('⚠️ ጉዞውን መጨረስ አልተቻለም።', { show_alert: true }); } catch (_) {}
  }
});

bot.action(/^cancel_trip_(.+)$/, async (ctx) => {
  try {
    const tripId = ctx.match[1];
    const driverTelegramId = String(ctx.from.id);

    const cancelledTrip = await Trip.findOneAndUpdate(
      { _id: tripId, driverId: driverTelegramId, status: 'accepted' },
      { $set: { status: 'cancelled' } },
      { new: true }
    );

    if (!cancelledTrip) {
      await ctx.answerCbQuery('⚠️ ይህ ጉዞ አልተገኘም ወይም አስቀድሞ ተዘግቷል።', { show_alert: true });
      return;
    }

    await Driver.findOneAndUpdate(
      { telegramId: driverTelegramId },
      { $set: { isAvailable: true } }
    );

    await ctx.answerCbQuery('❌ ጉዞው ተሰርዟል። (ሁኔታዎ Available ተመልሷል)');
    await ctx.editMessageText(
      `❌ *ጉዞው ተሰርዟል!*\n\n` +
      `🧍 ተሳፋሪ: *${cancelledTrip.passengerName}*\n` +
      `📍 መነሻ: *${cancelledTrip.pickup}*\n` +
      `🏁 መድረሻ: *${cancelledTrip.destination}*\n` +
      `📌 ሁኔታ: *cancelled*\n` +
      `🟢 የሹፌር ሁኔታ: *Available (ዝግጁ)*`,
      { parse_mode: 'Markdown' }
    );

    await bot.telegram.sendMessage(
      cancelledTrip.passengerId,
      `❌ *ይቅርታ፣ የተቀበለው ጉዞ ተሰርዟል።*\n\n` +
      `📍 መነሻ: *${cancelledTrip.pickup}*\n` +
      `🏁 መድረሻ: *${cancelledTrip.destination}*\n` +
      `እንደገና ለመጠየቅ /start ይላኩ።`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('❌ Error cancelling trip:', err.message);
    try { await ctx.answerCbQuery('⚠️ ጉዞውን መሰረዝ አልተቻለም።', { show_alert: true }); } catch (_) {}
  }
});

async function startBot() {
  await connectDB();
  if (!BOT_TOKEN) {
    console.log('⚠️ BOT_TOKEN ባለመኖሩ ቦቱ አልተጀመረም።');
    return;
  }
  await bot.launch();
  console.log('🤖 ጉዞ ፕላስ (Guzo Plus) Telegram ቦት ተጀምሯል!');
}

module.exports = { startBot };

