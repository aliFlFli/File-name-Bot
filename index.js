require('dotenv').config();

const { Telegraf, session } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());

const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = Number(process.env.CHANNEL_ID);

// =========================
// کیفیت‌ها
// =========================

const QUALITIES = ['540P', '720P'];

// =========================
// نام قسمت‌ها
// =========================

const persianEpisodes = [
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
  'دوازدهم',
  'سیزدهم',
  'چهاردهم',
  'پانزدهم',
  'شانزدهم',
  'هفدهم',
  'هجدهم',
  'نوزدهم',
  'بیستم',
  'بیست و یکم',
  'بیست و دوم',
  'بیست و سوم',
  'بیست و چهارم',
  'بیست و پنجم',
  'بیست و ششم',
  'بیست و هفتم',
  'بیست و هشتم',
  'بیست و نهم',
  'سی‌ام'
];

function getEpisodeName(number) {
  return persianEpisodes[number - 1] || number;
}

// =========================
// استارت
// =========================

bot.start(async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('⛔ دسترسی ندارید');
  }

  ctx.session = {
    step: 'series_name',
    episode: 1,
    qualityIndex: 0
  };

  await ctx.reply('🎬 اسم سریال را ارسال کن');
});

// =========================
// گرفتن اسم سریال
// =========================

bot.on('text', async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  if (ctx.session?.step === 'series_name') {

    const name = ctx.message.text.trim();

    const hashtag = '#' + name.replace(/\s+/g, '_');

    ctx.session.seriesName = name;
    ctx.session.hashtag = hashtag;
    ctx.session.step = 'upload';

    return ctx.reply(
      '✅ حالا فایل‌ها را دوتادوتا ارسال کن\n\nاول: 540P\nدوم: 720P'
    );
  }
});

// =========================
// ارسال فایل
// =========================

bot.on(['video', 'document'], async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  if (ctx.session?.step !== 'upload') {
    return ctx.reply('⚠️ اول /start را بزن');
  }

  try {

    const episode = ctx.session.episode;

    const quality = QUALITIES[ctx.session.qualityIndex];

    const episodeName = getEpisodeName(episode);

    const caption =
`🎥 سریال " ${ctx.session.hashtag} "

🔘 قسمت ${episodeName}

🔸 کیفیت ${quality}

🔹 زیرنویس چسبیده فارسی

🌐 @KoreaMixPlus • @FaKorea 🌐`;

    // =========================
    // فایل
    // =========================

    if (ctx.message.document) {

      const fileId = ctx.message.document.file_id;

      await bot.telegram.sendDocument(
        CHANNEL_ID,
        fileId,
        {
          caption
        }
      );
    }

    // =========================
    // ویدیو
    // =========================

    else if (ctx.message.video) {

      const fileId = ctx.message.video.file_id;

      await bot.telegram.sendVideo(
        CHANNEL_ID,
        fileId,
        {
          caption
        }
      );
    }

    await ctx.reply(
      `✅ قسمت ${episodeName} • ${quality} ارسال شد`
    );

    // =========================
    // مدیریت کیفیت و قسمت
    // =========================

    ctx.session.qualityIndex++;

    if (ctx.session.qualityIndex >= QUALITIES.length) {

      ctx.session.qualityIndex = 0;

      ctx.session.episode++;
    }

  } catch (err) {

    console.log(err);

    ctx.reply('❌ خطا در ارسال');
  }
});

// =========================
// پایان
// =========================

bot.command('done', async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  ctx.session = null;

  await ctx.reply('✅ عملیات پایان یافت');
});

// =========================
// اجرا
// =========================

bot.launch();

console.log('🤖 Bot Started...');
