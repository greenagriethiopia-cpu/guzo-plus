const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf('9230639629:AAFD7yOnnr86UszesyVF4bhxo6pmR2gWqBk');

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

bot.hears('2', (ctx) => {
    ctx.reply('🚗 የመኪናዎን ታርጋ ቁጥር ያስገቡ:');
});

bot.launch();
console.log('🤖 የጉዞ ፕላስ አጭር እና የዘመነ ቦት በመስራት ላይ ይገኛል...');
