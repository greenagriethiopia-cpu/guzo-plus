// 1. በ accept_trip ውስጥ editMessageText ላይ የጉዞ መጨረሻ/መሰረዣ ቁልፎችን ማከል
await ctx.editMessageText(
  `✅ *ጉዞው ተቀባይነት አግኝቷል!*\n\n` +
  `🧍 ተሳፋሪ: *${claimedTrip.passengerName}*\n` +
  `📍 መነሻ: *${claimedTrip.pickup}*\n` +
  `🏁 መድረሻ: *${claimedTrip.destination}*\n` +
  `💰 ግምታዊ ዋጋ: *${claimedTrip.estimatedFare} ብር*\n` +
  `🚘 የመኪና ታርጋ: *${claimedTrip.plateNumber || 'አልተገለጸም'}*\n\n` +
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

// 2. ጉዞውን ማጠናቀቅ (completed)
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

    await ctx.answerCbQuery('🏁 ጉዞው በተሳካ ሁኔታ ተጠናቋል!');
    await ctx.editMessageText(
      `🏁 *ጉዞው ተጠናቋል!*\n\n` +
      `🧍 ተሳፋሪ: *${updatedTrip.passengerName}*\n` +
      `📍 መነሻ: *${updatedTrip.pickup}*\n` +
      `🏁 መድረሻ: *${updatedTrip.destination}*\n` +
      `💰 ክፍያ: *${updatedTrip.estimatedFare} ብር*\n` +
      `📌 ሁኔታ: *completed*`,
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

// 3. ጉዞውን መሰረዝ (cancelled)
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

    await ctx.answerCbQuery('❌ ጉዞው ተሰርዟል።');
    await ctx.editMessageText(
      `❌ *ጉዞው ተሰርዟል!*\n\n` +
      `🧍 ተሳፋሪ: *${cancelledTrip.passengerName}*\n` +
      `📍 መነሻ: *${cancelledTrip.pickup}*\n` +
      `🏁 መድረሻ: *${cancelledTrip.destination}*\n` +
      `📌 ሁኔታ: *cancelled*`,
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
