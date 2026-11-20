const { Telegraf, Markup } = require('telegraf');

const botToken = process.env.BOT_TOKEN;
if (!botToken) {
  console.error('❌ BOT_TOKEN environment variable አልተገኘም!');
  process.exit(1);
}

const bot = new Telegraf(botToken);
const userState = {};

// /start ትዕዛዝ ሲመጣ አማራጮችን ማሳየት
bot.start(async (ctx) => {
  await ctx.reply(
    '🚗 እንኳን ወደ ጉዞ ፕላስ (Guzo Plus) በደህና መጡ!\n\nእባክዎ የሚፈልጉትን ሚና ይምረጡ፡',
    Markup.inlineKeyboard([
      [Markup.button.callback('👤 ተሳፋሪ (Passenger)', 'role_passenger')],
      [Markup.button.callback('🚗 ሹፌር (Driver)', 'role_driver')],
    ])
  );
});

// ተሳፋሪ ሲመረጥ (ቁልፍ ወይም 1)
async function startPassengerFlow(ctx) {
  userState[ctx.from.id] = { role: 'passenger', step: 'pickup' };
  await ctx.reply('👤 የመነሻ ቦታዎን ያስገቡ (ለምሳሌ፡ ሳሪስ መገናኛ):');
}

bot.action('role_passenger', async (ctx) => {
  await ctx.answerCbQuery();
  await startPassengerFlow(ctx);
});

bot.hears('1', async (ctx) => {
  await startPassengerFlow(ctx);
});

// ሹፌር ሲመረጥ (ቁልፍ ወይም 2)
async function startDriverFlow(ctx) {
  userState[ctx.from.id] = { role: 'driver', step: 'plate' };
  await ctx.reply('🚗 የመኪናዎን ታርጋ ቁጥር ያስገቡ:');
}

bot.action('role_driver', async (ctx) => {
  await ctx.answerCbQuery();
  await startDriverFlow(ctx);
});

bot.hears('2', async (ctx) => {
  await startDriverFlow(ctx);
});

// የጽሁፍ መልዕክቶችን በቅደም ተከተል ማስተናገድ
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/') || text === '1' || text === '2') return;

  const state = userState[ctx.from.id];
  if (!state) {
    return ctx.reply(
      'እባክዎ መጀመሪያ /start ይበሉ ወይም 1 (ተሳፋሪ) / 2 (ሹፌር) ይምረጡ።'
    );
  }

  if (state.role === 'passenger') {
    if (state.step === 'pickup') {
      state.pickup = text;
      state.step = 'destination';
      return ctx.reply(
        `📍 መነሻ፡ ${state.pickup}\nአሁን የመድረሻ ቦታዎን ያስገቡ:`
      );
    }

    if (state.step === 'destination') {
      state.destination = text;
      state.step = 'done';
      return ctx.reply(
        `✅ የጉዞ ጥያቄዎ ተመዝግቧል!\n\n` +
          `👤 ተሳፋሪ፡ ${ctx.from.first_name || 'ተጠቃሚ'}\n` +
          `📍 መነሻ፡ ${state.pickup}\n` +
          `🏁 መድረሻ፡ ${state.destination}\n\n` +
          `አሽከርካሪ እየተፈለገ ነው...`
      );
    }
  }

  if (state.role === 'driver' && state.step === 'plate') {
    state.plate = text;
    state.step = 'active';
    return ctx.reply(
      `✅ የሹፌር መረጃ ተመዝግቧል!\n\n` +
        `🚗 ታርጋ፡ ${state.plate}\n` +
        `አሁን የጉዞ ጥያቄዎችን ለመቀበል ዝግጁ ነዎት።`
    );
  }
});

// ቦቱን ማስነሳት (ሰርቨሩን እንዳያቋርጥ በ catch መያዝ)
bot
  .launch()
  .then(() => {
    console.log('🤖🚗 የጉዞ ፕላስ ቦት በተሳካ ሁኔታ ተነስቷል!');
  })
  .catch((err) => {
    console.error('❌ የTelegram ቦት ማስነሳት አልተቻለም:', err.message);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
