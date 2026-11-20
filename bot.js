const { Telegraf, Markup } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

// /start ትዕዛዝ ሲሰጥ አዝራሮችን ማሳየት
bot.start((ctx) => {
    ctx.reply(
        '🚗 እንኳን ወደ ጉዞ ፕላስ (Guzo Plus) በደህና መጡ!\n\nእባክዎ የሚፈልጉትን ሚና ይምረጡ:',
        Markup.inlineKeyboard([
            [Markup.button.callback('👤 ተሳፋሪ (Passenger)', 'role_passenger')],
            [Markup.button.callback('🚗 ሾፌር (Driver)', 'role_driver')]
        ])
    );
});

// ተሳፋሪ ሲመረጥ
bot.action('role_passenger', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('👤 የመነሻ እና የመድረሻ ቦታዎን ያስገቡ:');
});

// ሾፌር ሲመረጥ
bot.action('role_driver', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('🚗 የመኪናዎን ታርጋ ቁጥር ያስገቡ:');
});

// በአጭር ቁጥር 1 ወይም 2 ሲጻፍ
bot.hears('1', (ctx) => {
    ctx.reply('👤 የመነሻ እና የመድረሻ ቦታዎን ያስገቡ:');
});

bot.hears('2', (ctx) // የተጠቃሚዎችን ጊዜያዊ ሁኔታ ለማስቀመጥ
const userState = {};

// ተሳፋሪ ሲመረጥ ወይም 1 ሲጻፍ
bot.action('role_passenger', async (ctx) => {
  await ctx.answerCbQuery();
  userState[ctx.from.id] = { role: 'passenger', step: 'pickup' };
  await ctx.reply('👤 የመነሻ ቦታዎን ያስገቡ (ለምሳሌ፡ ሳሪስ መገናኛ):');
});

bot.hears('1', (ctx) => {
  userState[ctx.from.id] = { role: 'passenger', step: 'pickup' };
  ctx.reply('👤 የመነሻ ቦታዎን ያስገቡ (ለምሳሌ፡ ሳሪስ መገናኛ):');
});

// ሹፌር ሲመረጥ ወይም 2 ሲጻፍ
bot.action('role_driver', async (ctx) => {
  await ctx.answerCbQuery();
  userState[ctx.from.id] = { role: 'driver', step: 'plate' };
  await ctx.reply('🚗 የመኪናዎን ታርጋ ቁጥር ያስገቡ:');
});

bot.hears('2', (ctx) => {
  userState[ctx.from.id] = { role: 'driver', step: 'plate' };
  ctx.reply('🚗 የመኪናዎን ታርጋ ቁጥር ያስገቡ:');
});

// የጽሁፍ መልዕክቶችን ማስተናገድ
bot.on('text', (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith('/') || text === '1' || text === '2') return;

  const state = userState[ctx.from.id];
  if (!state) {
    return ctx.reply('እባክዎ መጀመሪያ /start ይበሉ ወይም 1 (ተሳፋሪ) / 2 (ሹፌር) ይምረጡ።');
  }

  if (state.role === 'passenger') {
    if (state.step === 'pickup') {
      state.pickup = text;
      state.step = 'destination';
      return ctx.reply(`📍 መነሻ፡ ${state.pickup}\nአሁን የመድረሻ ቦታዎን ያስገቡ:`);
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


bot.launch();
console.log('🤖 የጉዞ ፕላስ አጭር እና የዘመነ ቦት በመስራት ላይ ይገኛል...');
