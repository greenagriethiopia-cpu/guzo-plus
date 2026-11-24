const lastShownRidesByChat = new Map();

let telegramOffset = 0;
async function pollTelegramUpdates() {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    const fetchFn = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
    const res = await fetchFn(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?timeout=25&offset=${telegramOffset}`
    );
    const data = await res.json();
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        telegramOffset = update.update_id + 1;
        if (update.message && update.message.text) {
          const chatId = update.message.chat.id;
          const text = update.message.text.trim();

          if (text === '/start') {
            await sendTelegramMessage(
              chatId,
              'ሰላም! ወደ Guzo Plus እንኳን በደህና መጡ።\n\nየቅርብ ጊዜ የጉዞ ጥያቄዎችን ለማየት /rides ይላኩ ወይም ቁጥር (1, 2, 3...) ይምረጡ።'
            );
          } else if (text === '/rides' || text === 'ዝርዝር') {
            const rides = await Ride.find().sort({ createdAt: -1 }).limit(10);
            if (!rides.length) {
              await sendTelegramMessage(chatId, 'ምንም የተመዘገበ የጉዞ ጥያቄ የለም።');
            } else {
              lastShownRidesByChat.set(String(chatId), rides);
              const lines = rides.map((r, idx) =>
                `${idx + 1}. ${r.passengerName || 'ተጓዥ'} — ${r.status || 'pending'}\n📍 ${r.pickup || '-'} → 🎯 ${r.dropoff || '-'}`
              );
              await sendTelegramMessage(chatId, '📋 የቅርብ ጊዜ የጉዞ ጥያቄዎች:\n\n' + lines.join('\n\n'));
            }
          } else if (/^\d+$/.test(text)) {
            const num = parseInt(text, 10);
            let rides = lastShownRidesByChat.get(String(chatId));
            if (!rides || !rides.length) {
              rides = await Ride.find().sort({ createdAt: -1 }).limit(10);
              lastShownRidesByChat.set(String(chatId), rides);
            }
            const selected = rides[num - 1];
            if (!selected) {
              await sendTelegramMessage(chatId, `ቁጥር ${num} በዝርዝሩ ውስጥ አልተገኘም።`);
            } else {
              await sendTelegramMessage(
                chatId,
                `🚖 የተመረጠ የጉዞ ጥያቄ (#${num}):\n` +
                `ስም፡ ${selected.passengerName || '-'}\n` +
                `መነሻ፡ ${selected.pickup || '-'}\n` +
                `መድረሻ፡ ${selected.dropoff || '-'}\n` +
                `ሁኔታ (Status)፡ ${selected.status || 'pending'}\n\n` +
                `ለማጽደቅ: accept ${num}\n` +
                `ለማጠናቀቅ: complete ${num}`
              );
            }
          } else if (/^(accept|complete)\s+\d+$/i.test(text)) {
            const [, action, numStr] = text.match(/^(accept|complete)\s+(\d+)$/i);
            const num = parseInt(numStr, 10);
            const rides = lastShownRidesByChat.get(String(chatId)) || (await Ride.find().sort({ createdAt: -1 }).limit(10));
            const selected = rides[num - 1];
            if (!selected) {
              await sendTelegramMessage(chatId, `ቁጥር ${num} አልተገኘም።`);
            } else {
              const newStatus = action.toLowerCase() === 'accept' ? 'accepted' : 'completed';
              await Ride.findByIdAndUpdate(selected._id, { status: newStatus });
              await sendTelegramMessage(chatId, `✅ የጉዞ #${num} ሁኔታ ወደ "${newStatus}" ተቀይሯል።`);
            }
          } else {
            await sendTelegramMessage(
              chatId,
              'ትዕዛዝ አልታወቀም። /start ወይም /rides ይላኩ ወይም የጉዞ ቁጥር (1, 2...) ይላኩ።'
            );
          }
        }
      }
    }
  } catch (err) {
    console.error('Telegram polling error:', err.message);
  } finally {
    setTimeout(pollTelegramUpdates, 2000);
  }
}
