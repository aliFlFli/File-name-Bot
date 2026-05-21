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
// راهنما
// =======================

const helpMessage = `<b>📚 راهنمای ربات آپلود سریال</b>

<b>🎬 دستورات اصلی:</b>

/start - <b>شروع عملیات جدید</b>
/done - <b>پایان عملیات جاری</b>
/undo - <b>لغو آخرین فایل آپلودی</b>
/status - <b>نمایش وضعیت فعلی</b>
/help - <b>نمایش این راهنما</b>

<b>📋 مراحل کار:</b>

1️⃣ <b>/start رو بزن</b>
2️⃣ <b>اسم سریال رو بفرست</b>
3️⃣ <b>فایل‌ها رو به ترتیب بفرست:</b>
   • <b>قسمت اول 540P</b>
   • <b>قسمت اول 720P</b>
   • <b>قسمت دوم 540P</b>
   • <b>قسمت دوم 720P</b>
   • <b>و همینطور تا آخر...</b>

<b>⚠️ نکات مهم:</b>
• <b>فقط ادمین می‌تونه از ربات استفاده کنه</b>
• <b>فایل‌ها به کانال تنظیم شده ارسال می‌شن</b>
• <b>با /undo می‌تونی آخرین فایل رو لغو کنی</b>
• <b>با /status وضعیت فعلی رو ببین</b>
• <b>اسم سریال باید بین ۲ تا ۱۰۰ کاراکتر باشه</b>`;

// =======================
// دستور /help
// =======================

bot.command('help', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('<b>⛔ دسترسی ندارید</b>', { parse_mode: 'HTML' });
  }
  await ctx.reply(helpMessage, { parse_mode: 'HTML' });
});

// =======================
// استارت
// =======================

bot.start(async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('<b>⛔ دسترسی ندارید</b>', { parse_mode: 'HTML' });
  }

  ctx.session = {
    step: 'series',
    series: '',
    hashtag: '',
    fileCount: 0,
    lastMessageId: null // برای undo
  };

  await ctx.reply('<b>🎬 اســم سریـالـت رو بفـرسـت.</b>', { parse_mode: 'HTML' });
});

// =======================
// گرفتن اسم سریال
// =======================

bot.on('text', async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  if (ctx.session?.step === 'series') {

    const series = ctx.message.text.trim();

    // =======================
    // پیشنهاد ۲: اعتبارسنجی نام سریال
    // =======================
    if (series.length < 2 || series.length > 100) {
      return ctx.reply(
        '<b>⚠️ اسم سریال باید بین ۲ تا ۱۰۰ کاراکتر باشه. دوباره بفرست.</b>',
        { parse_mode: 'HTML' }
      );
    }

    // =======================
    // پیشنهاد ۵: بهبود ساخت هشتگ
    // =======================
    const hashtag = '#' + series
      .replace(/[^\w\sآ-ی]/g, '') // حذف کاراکترهای خاص (با پشتیبانی فارسی)
      .replace(/\s+/g, '_');

    ctx.session.series = series;
    ctx.session.hashtag = hashtag;
    ctx.session.step = 'upload';

    return ctx.reply(
      `<b>✅ سریال "${series}" ثبت شد!
🏷️ هشتگ: ${hashtag}

📤 حالا فایل‌ها را به ترتیب بفرست:
• قسمت اول 540P
• قسمت اول 720P
• قسمت دوم 540P
• قسمت دوم 720P
...</b>`,
      { parse_mode: 'HTML' }
    );
  }
});

// =======================
// پیشنهاد ۳: دستور /undo
// =======================

bot.command('undo', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  if (!ctx.session?.step) {
    return ctx.reply('<b>⚠️ هیچ عملیات فعالی نیست. /start رو بزن</b>', { parse_mode: 'HTML' });
  }

  if (ctx.session.fileCount > 0) {
    ctx.session.fileCount--;
    const currentEpisode = Math.floor(ctx.session.fileCount / 2) + 1;
    const currentQuality = QUALITIES[ctx.session.fileCount % 2];
    const episodeName = getEpisodeName(currentEpisode);

    await ctx.reply(
      `<b>↩️ آخرین فایل لغو شد!
📊 شمارنده فعلی: ${ctx.session.fileCount}
📌 فایل بعدی: قسمت ${episodeName} • ${currentQuality}</b>`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply('<b>⚠️ هیچ فایلی برای لغو وجود نداره</b>', { parse_mode: 'HTML' });
  }
});

// =======================
// پیشنهاد ۶: دستور /status
// =======================

bot.command('status', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  if (!ctx.session?.step) {
    return ctx.reply('<b>ℹ️ هیچ عملیات فعالی نیست. /start رو بزن</b>', { parse_mode: 'HTML' });
  }

  const currentEpisode = ctx.session.fileCount > 0 
    ? Math.floor((ctx.session.fileCount - 1) / 2) + 1 
    : 1;
  const nextQuality = QUALITIES[ctx.session.fileCount % 2];
  const nextEpisode = Math.floor(ctx.session.fileCount / 2) + 1;
  const nextEpisodeName = getEpisodeName(nextEpisode);

  await ctx.reply(
    `<b>📊 وضعیت فعلی:

🎬 سریال: ${ctx.session.series}
🏷️ هشتگ: ${ctx.session.hashtag}
📁 تعداد فایل‌های آپلودی: ${ctx.session.fileCount}
✅ آخرین قسمت تکمیل شده: ${currentEpisode}
📌 فایل بعدی: قسمت ${nextEpisodeName} • ${nextQuality}
📌 مرحله: ${ctx.session.step === 'series' ? 'دریافت نام سریال' : 'آپلود فایل'}</b>`,
    { parse_mode: 'HTML' }
  );
});

// =======================
// آپلود فایل
// =======================

bot.on(['video', 'document'], async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  if (ctx.session?.step !== 'upload') {
    return ctx.reply('<b>⚠️ اول /start را بزن</b>', { parse_mode: 'HTML' });
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
`<b>🎥 سریال "${ctx.session.hashtag}"
💠 قسمت ${episodeName}
🔸 کیفیت ${quality}
🔹 زیرنویس چسبیده فارسی
🌐 @KoreaMixPlus • @FaKorea 🌐</b>`;

    // =======================
    // افزایش شمارنده
    // =======================

    ctx.session.fileCount++;

    // =======================
    // ارسال
    // =======================

    let sentMessage;

    if (ctx.message.document) {

      sentMessage = await bot.telegram.sendDocument(
        CHANNEL_ID,
        ctx.message.document.file_id,
        {
          caption,
          parse_mode: 'HTML'
        }
      );
    }

    else if (ctx.message.video) {

      sentMessage = await bot.telegram.sendVideo(
        CHANNEL_ID,
        ctx.message.video.file_id,
        {
          caption,
          parse_mode: 'HTML'
        }
      );
    }

    // ذخیره آیدی پیام برای امکان undo در آینده
    ctx.session.lastMessageId = sentMessage?.message_id;

    // =======================
    // پیشنهاد ۴: نمایش پیشرفت
    // =======================
    const nextEpisode = Math.floor(ctx.session.fileCount / 2) + 1;
    const nextQuality = QUALITIES[ctx.session.fileCount % 2];
    const nextEpisodeName = getEpisodeName(nextEpisode);

    await ctx.reply(
      `<b>✅ قسمت ${episodeName} • ${quality} آپلود شد
📊 کل فایل‌های آپلودی: ${ctx.session.fileCount}
📌 فایل بعدی: قسمت ${nextEpisodeName} • ${nextQuality}</b>`,
      { parse_mode: 'HTML' }
    );

  } catch (err) {

    // =======================
    // پیشنهاد ۱: مدیریت خطای بهتر
    // =======================
    console.error('❌ خطا در ارسال فایل:', {
      message: err.message,
      code: err.code,
      description: err.description,
      session: ctx.session
    });

    // برگردوندن شمارنده به عقب در صورت خطا
    if (ctx.session.fileCount > 0) {
      ctx.session.fileCount--;
    }

    await ctx.reply(
      `<b>❌ خطا در ارسال فایل: ${err.message}
🔄 شمارنده به عقب برگشت. دوباره تلاش کن.</b>`,
      { parse_mode: 'HTML' }
    );
  }
});

// =======================
// پایان
// =======================

bot.command('done', async (ctx) => {

  if (ctx.from.id !== ADMIN_ID) return;

  const totalEpisodes = Math.floor(ctx.session.fileCount / 2);

  ctx.session = null;

  await ctx.reply(
    `<b>✅ عملیات پایان یافت
📊 مجموع قسمت‌های آپلود شده: ${totalEpisodes}
🎉 کارت تموم شد!</b>`,
    { parse_mode: 'HTML' }
  );
});

// =======================
// اجرا
// =======================

bot.launch();

console.log('🤖 Bot Started...');
console.log('📚 برای راهنما /help رو بزنید');
