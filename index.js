require('dotenv').config();

const { Telegraf, session } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());

const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = process.env.CHANNEL_ID;

// =========================
// تبدیل عدد به فارسی
// =========================

const persianNumbers = [
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
  return persianNumbers[number - 1] || `${number}`;
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
    episode: 1
  };

  await ctx.reply('🎬 اسم سریال را ارسال کن');
});

// =========================
// متن‌ها
// =========================

bot.on('text', async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  // مرحله اسم سریال
  if (ctx.session?.step === 'series_name') {

    const seriesName = ctx.message.text.trim();

    const hashtag = '#' + seriesName.replace(/\s+/g, '_');

    ctx.session.seriesName = seriesName;
    ctx.session.hashtag = hashtag;
    ctx.session.step = 'quality';

    return ctx.reply('🎞 کیفیت را وارد کن\nمثال: 720p');
  }

  // مرحله کیفیت
  if (ctx.session?.step === 'quality') {

    ctx.session.quality = ctx.message.text.trim();
    ctx.session.step = 'upload';

    return ctx.reply(
      '✅ حالا فایل‌های ویدیویی را بفرست\n\nهر فایل = یک قسمت'
    );
  }
});

// =========================
// ویدیو و فایل
// =========================

bot.on(['video', 'document'], async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  if (ctx.session?.step !== 'upload') {
    return ctx.reply('⚠ اول /start را بزن');
  }

  const episodeNumber = ctx.session.episode;

  const episodeName = getEpisodeName(episodeNumber);

  const caption =
`🎥 سریال " ${ctx.session.hashtag} "

🔘 قسمت ${episodeName}

🔸 کیفیت ${ctx.session.quality.toUpperCase()}

🔹 زیرنویس چسبیده فارسی

🌐 @KoreaMixPlus • @FaKorea 🌐`;

  try {

    // اگر ویدیو بود
    if (ctx.message.video) {

      const fileId = ctx.message.video.file_id;

      await bot.telegram.sendVideo(
        CHANNEL_ID,
        fileId,
        {
          caption
        }
      );
    }

    // اگر فایل بود
    else if (ctx.message.document) {

      const fileId = ctx.message.document.file_id;

      await bot.telegram.sendDocument(
        CHANNEL_ID,
        fileId,
        {
          caption
        }
      );
    }

    await ctx.reply(
      `✅ قسمت ${episodeName} ارسال شد`
    );

    ctx.session.episode++;

  } catch (err) {

    console.log(err);

    ctx.reply('❌ خطا در ارسال فایل');
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
// ران
// =========================

bot.launch();

console.log('🤖 Bot is running...');
