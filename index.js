require('dotenv').config();

const { Telegraf, session } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// =======================
// تنظیمات
// =======================
const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = Number(process.env.CHANNEL_ID);

const QUALITIES = ['540P', '720P'];

// =======================
// Middleware ها
// =======================
bot.use(session()); // ← مهم: session باید قبل از همه چیز باشه

// چک ادمین
bot.use((ctx, next) => {
  if (ctx.from?.id !== ADMIN_ID) {
    return ctx.reply('⛔ فقط ادمین اجازه استفاده از ربات را دارد.');
  }
  return next();
});

// =======================
// توابع کمکی
// =======================
function getEpisodeName(num) {
  const names = ['اول','دوم','سوم','چهارم','پنجم','ششم','هفتم','هشتم','نهم','دهم'];
  if (num <= 10) return names[num - 1];
  if ([12, 16, 20].includes(num)) return `${num}م و آخر`;
  return `${num}م`;
}

function cleanForHashtag(text) {
  return '#' + text
    .trim()
    .replace(/[^\w\sآ-ی]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
}

// =======================
// دستور /start
// =======================
bot.command('start', async (ctx) => {
  ctx.session = {
    step: 'waiting_series',
    series: '',
    hashtag: '',
    fileCount: 0,
    uploadedMessages: []
  };

  await ctx.reply('<b>🎬 ۱نام سریال را ارسال کنید:</b>', { parse_mode: 'HTML' });
});

// =======================
// دریافت نام سریال
// =======================
bot.on('text', async (ctx) => {
  // فقط وقتی در مرحله دریافت نام سریال هستیم اجرا بشه
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
    `<b>✅ سریال با موفقیت ثبت شد!</b>\n\n` +
    `🎬 سریال: <b>${series}</b>\n` +
    `🏷️ هشتگ: <b>${hashtag}</b>\n\n` +
    `📤 حالا فایل‌ها را **به ترتیب** ارسال کنید:\n\n` +
    `قسمت ۱ - 540P\n` +
    `قسمت ۱ - 720P\n` +
    `قسمت ۲ - 540P\n` +
    `قسمت ۲ - 720P\n...`,
    { parse_mode: 'HTML' }
  );
});

// =======================
// آپلود فایل (ویدیو یا داکیومنت)
// =======================
bot.on(['video', 'document'], async (ctx) => {
  if (ctx.session?.step !== 'uploading') {
    return ctx.reply('⚠️ ابتدا دستور /start را بزنید و نام سریال را وارد کنید.', { parse_mode: 'HTML' });
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
        caption: caption,
        parse_mode: 'HTML'
      });
    } else if (ctx.message.document) {
      sentMessage = await bot.telegram.sendDocument(CHANNEL_ID, ctx.message.document.file_id, {
        caption: caption,
        parse_mode: 'HTML'
      });
    }

    // ذخیره برای undo
    ctx.session.uploadedMessages.push({ message_id: sentMessage.message_id });
    ctx.session.fileCount++;

    const nextEpisode = Math.floor(ctx.session.fileCount / 2) + 1;
    const nextQuality = QUALITIES[ctx.session.fileCount % 2];

    await ctx.reply(
      `<b>✅ آپلود شد</b>\n` +
      `📽️ قسمت ${episodeName} • ${quality}\n` +
      `📊 فایل‌های آپلود شده: ${ctx.session.fileCount}\n` +
      `📌 بعدی: قسمت ${getEpisodeName(nextEpisode)} • ${nextQuality}`,
      { parse_mode: 'HTML' }
    );

  } catch (err) {
    console.error('Upload Error:', err);
    await ctx.reply('❌ خطا در ارسال فایل به کانال. دوباره امتحان کنید.');
  }
});

// =======================
// Undo
// =======================
bot.command('undo', async (ctx) => {
  if (!ctx.session?.uploadedMessages?.length) {
    return ctx.reply('⚠️ هیچ فایلی برای لغو وجود ندارد.');
  }

  const lastMsg = ctx.session.uploadedMessages.pop();
  ctx.session.fileCount = Math.max(0, ctx.session.fileCount - 1);

  try {
    await bot.telegram.deleteMessage(CHANNEL_ID, lastMsg.message_id);
    await ctx.reply('✅ آخرین فایل از کانال حذف شد.');
  } catch (e) {
    await ctx.reply('⚠️ فایل از کانال حذف نشد (احتمالاً قبلاً حذف شده).');
  }
});

// =======================
// Status
// =======================
bot.command('status', async (ctx) => {
  if (!ctx.session?.series) {
    return ctx.reply('❌ هیچ عملیات فعالی وجود ندارد. از /start شروع کنید.');
  }

  const count = ctx.session.fileCount;
  const nextEp = Math.floor(count / 2) + 1;
  const nextQ = QUALITIES[count % 2];

  await ctx.reply(
    `<b>📊 وضعیت فعلی</b>\n\n` +
    `🎬 سریال: ${ctx.session.series}\n` +
    `🏷️ هشتگ: ${ctx.session.hashtag}\n` +
    `📁 فایل آپلود شده: ${count}\n` +
    `📌 فایل بعدی: قسمت ${getEpisodeName(nextEp)} • ${nextQ}`,
    { parse_mode: 'HTML' }
  );
});

// =======================
// Done
// =======================
bot.command('done', async (ctx) => {
  if (!ctx.session?.series) {
    return ctx.reply('❌ هیچ عملیات فعالی وجود ندارد.');
  }

  const total = Math.floor(ctx.session.fileCount / 2);
  await ctx.reply(
    `<b>🎉 عملیات با موفقیت پایان یافت!</b>\n\n` +
    `📽️ سریال: ${ctx.session.series}\n` +
    `📊 تعداد قسمت آپلود شده: ${total}`,
    { parse_mode: 'HTML' }
  );

  ctx.session = null;
});

// =======================
// اجرا
// =======================
bot.launch()
  .then(() => console.log('🚀 ربات با موفقیت راه‌اندازی شد'))
  .catch(err => console.error('خطا:', err));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
