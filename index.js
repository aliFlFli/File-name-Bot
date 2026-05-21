require('dotenv').config();

const { Telegraf, session } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());

const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = Number(process.env.CHANNEL_ID);

// =======================
// کیفیت‌ها
// =======================

const QUALITIES = ['540P', '720P'];

// =======================
// نام قسمت‌ها
// =======================

const episodeNames = [
  'اول',
  'دوم',
  'سوم',
  'چهارم',
  'پنجم',
  'ششم',
  'هفتم',
  'هشتم',
  'نهم',
  'دهم',
  'یازدهم',
  'دوازدهم و آخر',
  'سیزدهم',
  'چهاردهم',
  'پانزدهم',
  'شانزدهم و آخر',
  'هفدهم',
  'هجدهم',
  'نوزدهم',
  'بیستم و آخر'
];

function getEpisodeName(num) {
  return episodeNames[num - 1] || num;
}

// =======================
// استارت
// =======================

bot.start(async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('⛔ دسترسی ندارید');
  }

  ctx.session = {
    step: 'series',
    series: '',
    hashtag: '',
    fileCount: 0
  };

  await ctx.reply('🎬 اســم سریـالـت رو بفـرسـت.');
});

// =======================
// گرفتن اسم سریال
// =======================

bot.on('text', async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  if (ctx.session?.step === 'series') {

    const series = ctx.message.text.trim();

    const hashtag = '#' + series.replace(/\s+/g, '_');

    ctx.session.series = series;
    ctx.session.hashtag = hashtag;
    ctx.session.step = 'upload';

    return ctx.reply(
      '✅ حالا فایل‌ها را بفرست\n\nترتیب:\n540P → 720P'
    );
  }
});

// =======================
// آپلود فایل
// =======================

bot.on(['video', 'document'], async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  if (ctx.session?.step !== 'upload') {
    return ctx.reply('⚠️ اول /start را بزن');
  }

  try {

    // =======================
    // محاسبه قسمت و کیفیت
    // =======================

    const current = ctx.session.fileCount;

    const episode = Math.floor(current / 2) + 1;

    const quality = QUALITIES[current % 2];

    const episodeName = getEpisodeName(episode);

    // =======================
    // کپشن
    // =======================

    const caption =
`🎥 سریال "${ctx.session.hashtag}"
💠 قسمت ${episodeName}
🔸 کیفیت ${quality}
🔹 زیرنویس چسبیده فارسی
🌐 @KoreaMixPlus • @FaKorea 🌐`;

    // =======================
    // افزایش شمارنده
    // =======================

    ctx.session.fileCount++;

    // =======================
    // ارسال
    // =======================

    if (ctx.message.document) {

      await bot.telegram.sendDocument(
        CHANNEL_ID,
        ctx.message.document.file_id,
        {
          caption
        }
      );
    }

    else if (ctx.message.video) {

      await bot.telegram.sendVideo(
        CHANNEL_ID,
        ctx.message.video.file_id,
        {
          caption
        }
      );
    }

    await ctx.reply(
      `✅ قسمت ${episodeName} • ${quality}`
    );

  } catch (err) {

    console.log(err);

    ctx.reply('❌ خطا در ارسال');
  }
});

// =======================
// پایان
// =======================

bot.command('done', async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  ctx.session = null;

  await ctx.reply('✅ عملیات پایان یافت');
});

// =======================
// اجرا
// =======================

bot.launch();

console.log('🤖 Bot Started...');
