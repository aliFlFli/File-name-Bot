require('dotenv').config();

const { Telegraf, session } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = Number(process.env.CHANNEL_ID);

const QUALITIES = ['540P', '720P'];

// =======================
// توابع کمکی
// =======================

function getEpisodeName(num) {
  const persianNumbers = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم'];
  
  if (num <= 10) return persianNumbers[num - 1];
  if ([12, 16, 20].includes(num)) return `${num}م و آخر`;
  return `${num}م`;
}

function cleanForHashtag(text) {
  return '#' + text
    .trim()
    .replace(/[^\w\sآ-ی]/g, '')     // حذف کاراکترهای خاص
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
}

// =======================
// پیام‌ها
// =======================

const helpMessage = `<b>📚 راهنمای ربات آپلود سریال</b>

<b>🎬 دستورات:</b>
/start — شروع سریال جدید
/status — وضعیت فعلی
/undo — لغو آخرین آپلود
/done — پایان عملیات
/help — نمایش این پیام

<b>⚠️ مراحل کار:</b>
1. /start
2. ارسال نام سریال
3. ارسال فایل‌ها به ترتیب:
   • قسمت ۱ - 540P
   • قسمت ۱ - 720P
   • قسمت ۲ - 540P
   • ...
`;

bot.command('help', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;
  return ctx.reply(helpMessage, { parse_mode: 'HTML' });
});

// =======================
// Middleware ادمین
// =======================

bot.use((ctx, next) => {
  if (ctx.from?.id !== ADMIN_ID) {
    return ctx.reply('⛔ فقط ادمین اجازه استفاده دارد.');
  }
  return next();
});

// =======================
// استارت
// =======================

bot.command('start', async (ctx) => {
  ctx.session = {
    step: 'waiting_series',
    series: '',
    hashtag: '',
    fileCount: 0,
    uploadedMessages: []   // برای undo بهتر
  };

  await ctx.reply('<b>🎬 نام سریال را ارسال کنید:</b>', { parse_mode: 'HTML' });
});

// =======================
// دریافت نام سریال
// =======================

bot.on('text', async (ctx) => {
  if (ctx.session?.step !== 'waiting_series') return;

  const series = ctx.message.text.trim();

  if (series.length < 2 || series.length > 100) {
    return ctx.reply('⚠️ نام سریال باید بین ۲ تا ۱۰۰ کاراکتر باشد.', { parse_mode: 'HTML' });
  }

  const hashtag = cleanForHashtag(series);

  ctx.session.series = series;
  ctx.session.hashtag = hashtag;
  ctx.session.step = 'uploading';

  await ctx.reply(
    `<b>✅ سریال ثبت شد:</b> ${series}\n` +
    `<b>🏷️ هشتگ:</b> ${hashtag}\n\n` +
    `<b>📤 حالا فایل‌ها را به ترتیب بفرستید:</b>`,
    { parse_mode: 'HTML' }
  );
});

// =======================
// وضعیت
// =======================

bot.command('status', async (ctx) => {
  if (!ctx.session?.step) {
    return ctx.reply('❌ هیچ عملیات فعالی وجود ندارد. از /start شروع کنید.');
  }

  const count = ctx.session.fileCount;
  const currentEpisode = count > 0 ? Math.floor((count - 1) / 2) + 1 : 0;
  const nextEpisode = Math.floor(count / 2) + 1;
  const nextQuality = QUALITIES[count % 2];

  await ctx.reply(
    `<b>📊 وضعیت فعلی</b>\n\n` +
    `🎬 سریال: ${ctx.session.series}\n` +
    `🏷️ هشتگ: ${ctx.session.hashtag}\n` +
    `📁 فایل‌های آپلود شده: ${count}\n` +
    `✅ قسمت‌های کامل شده: ${currentEpisode}\n` +
    `📌 فایل بعدی: قسمت ${getEpisodeName(nextEpisode)} • ${nextQuality}`,
    { parse_mode: 'HTML' }
  );
});

// =======================
// Undo (بهبود یافته)
// =======================

bot.command('undo', async (ctx) => {
  if (!ctx.session?.uploadedMessages?.length) {
    return ctx.reply('⚠️ هیچ فایلی برای لغو وجود ندارد.');
  }

  const lastMsg = ctx.session.uploadedMessages.pop();
  ctx.session.fileCount--;

  try {
    await bot.telegram.deleteMessage(CHANNEL_ID, lastMsg.message_id);
    await ctx.reply('✅ آخرین فایل با موفقیت از کانال حذف شد.');
  } catch (err) {
    await ctx.reply('⚠️ فایل از کانال حذف نشد (ممکن است قبلاً حذف شده باشد).');
  }

  // نمایش فایل بعدی
  const nextEp = Math.floor(ctx.session.fileCount / 2) + 1;
  const nextQ = QUALITIES[ctx.session.fileCount % 2];
  await ctx.reply(`📌 فایل بعدی: قسمت ${getEpisodeName(nextEp)} • ${nextQ}`);
});

// =======================
// آپلود فایل (اصلی)
// =======================

bot.on(['video', 'document'], async (ctx) => {
  if (ctx.session?.step !== 'uploading') {
    return ctx.reply('⚠️ ابتدا با /start شروع کنید.');
  }

  const count = ctx.session.fileCount;
  const episode = Math.floor(count / 2) + 1;
  const quality = QUALITIES[count % 2];
  const episodeName = getEpisodeName(episode);

  const caption = `<b>${ctx.session.hashtag}</b>

🎬 قسمت ${episodeName}
📺 کیفیت ${quality}
🔖 زیرنویس چسبیده فارسی
🌐 @KoreaMixPlus • @FaKorea`;

  try {
    let sentMessage;

    if (ctx.message.video) {
      sentMessage = await bot.telegram.sendVideo(CHANNEL_ID, ctx.message.video.file_id, {
        caption,
        parse_mode: 'HTML'
      });
    } else if (ctx.message.document) {
      sentMessage = await bot.telegram.sendDocument(CHANNEL_ID, ctx.message.document.file_id, {
        caption,
        parse_mode: 'HTML'
      });
    }

    // ذخیره اطلاعات برای undo
    ctx.session.uploadedMessages.push({
      message_id: sentMessage.message_id
    });

    ctx.session.fileCount++;

    // پیام پیشرفت
    const nextEp = Math.floor(ctx.session.fileCount / 2) + 1;
    const nextQ = QUALITIES[ctx.session.fileCount % 2];

    await ctx.reply(
      `<b>✅ آپلود شد:</b> قسمت ${episodeName} • ${quality}\n` +
      `📊 کل فایل‌ها: ${ctx.session.fileCount}\n` +
      `📌 بعدی: قسمت ${getEpisodeName(nextEp)} • ${nextQ}`,
      { parse_mode: 'HTML' }
    );

  } catch (err) {
    console.error('Upload Error:', err);
    await ctx.reply(`❌ خطا در آپلود: ${err.message}`);
  }
});

// =======================
// پایان عملیات
// =======================

bot.command('done', async (ctx) => {
  if (!ctx.session?.series) {
    return ctx.reply('❌ هیچ عملیات فعالی وجود ندارد.');
  }

  const totalEpisodes = Math.floor(ctx.session.fileCount / 2);

  await ctx.reply(
    `<b>🎉 عملیات با موفقیت پایان یافت!</b>\n\n` +
    `📽️ سریال: ${ctx.session.series}\n` +
    `📊 تعداد قسمت‌های آپلود شده: ${totalEpisodes}\n` +
    `✅ تمام شد!`,
    { parse_mode: 'HTML' }
  );

  ctx.session = null; // پاک کردن جلسه
});

// =======================
// اجرا
// =======================

bot.launch()
  .then(() => {
    console.log('🤖 ربات با موفقیت راه‌اندازی شد');
    console.log('👤 فقط ادمین می‌تواند استفاده کند');
  })
  .catch(err => console.error('خطا در راه‌اندازی:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
