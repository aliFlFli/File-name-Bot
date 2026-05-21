require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = Number(process.env.CHANNEL_ID);

const QUALITIES = ['540P', '720P', '1080P'];

const DATA_DIR = path.join(__dirname, 'data');
const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');
const LOG_FILE = path.join(DATA_DIR, 'bot.log');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(SESSION_FILE)) fs.writeFileSync(SESSION_FILE, JSON.stringify({}));

// ===================== LOGGER =====================
function log(text) {
  const line = `[${new Date().toLocaleString()}] ${text}\n`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line);
}

// ===================== SESSION =====================
function getSession(userId) {
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    return data[userId] || null;
  } catch { return null; }
}

function saveSession(userId, data) {
  try {
    const all = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    all[userId] = data;
    fs.writeFileSync(SESSION_FILE, JSON.stringify(all, null, 2));
  } catch (e) { log(`Save Error: ${e.message}`); }
}

function deleteSession(userId) {
  try {
    const all = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    delete all[userId];
    fs.writeFileSync(SESSION_FILE, JSON.stringify(all, null, 2));
  } catch {}
}

// ===================== KEYBOARDS =====================
function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎬 شروع سریال جدید", callback_data: "new_series" }],
        [{ text: "📊 وضعیت فعلی", callback_data: "status" }],
        [{ text: "❌ لغو همه", callback_data: "cancel" }]
      ]
    }
  };
}

function afterSeriesKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✏️ ویرایش نام سریال", callback_data: "edit_series" }],
        [{ text: "📤 شروع آپلود فایل", callback_data: "ready_to_upload" }],
        [
          { text: "📊 وضعیت", callback_data: "status" },
          { text: "❌ لغو", callback_data: "cancel" }
        ]
      ]
    }
  };
}

function uploadKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "↩️ Undo آخرین فایل", callback_data: "undo" },
          { text: "✅ پایان آپلود", callback_data: "done" }
        ],
        [
          { text: "📊 وضعیت", callback_data: "status" },
          { text: "🎬 سریال جدید", callback_data: "new_series" }
        ]
      ]
    }
  };
}

// ===================== HELPERS =====================
function generateHashtag(text) {
  return '#' + text.replace(/[^a-zA-Z0-9آ-ی\s]/g, '').replace(/\s+/g, '_');
}

function detectQuality(filename = '') {
  const name = filename.toLowerCase();
  if (name.includes('1080')) return '1080P';
  if (name.includes('720')) return '720P';
  if (name.includes('540') || name.includes('480')) return '540P';
  return null;
}

function detectEpisode(filename = '') {
  const patterns = [/e(\d+)/i, /ep(\d+)/i, /episode[ ._-]?(\d+)/i, /part[ ._-]?(\d+)/i, /(?:^|\D)(\d{1,2})(?:\D|$)/];
  for (const p of patterns) {
    const m = filename.match(p);
    if (m) return Number(m[1]);
  }
  return null;
}

// ===================== BOT =====================
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== ADMIN_ID) return;
  return next().catch(err => {
    log(`ERROR: ${err.message}`);
    ctx.reply('❌ خطایی رخ داد').catch(() => {});
  });
});

bot.start(async (ctx) => {
  const session = {
    step: 'series',
    series: '',
    hashtag: '',
    uploadedFiles: [],
    fileCount: 0
  };
  saveSession(ctx.from.id, session);

  await ctx.reply(
    `🎬 <b>ربات آپلود سریال</b>\n\n` +
    `👋 خوش آمدی!\n` +
    `لطفاً اسم سریال را ارسال کن:`,
    { parse_mode: 'HTML', ...mainMenu() }
  );
});

// ===================== CALLBACKS =====================
bot.action('new_series', async (ctx) => {
  const session = { step: 'series', series: '', hashtag: '', uploadedFiles: [], fileCount: 0 };
  saveSession(ctx.from.id, session);
  await ctx.editMessageText(
    `🎬 <b>سریال جدید شروع شد</b>\n\n` +
    `نام سریال را ارسال کنید:`,
    { parse_mode: 'HTML' }
  );
});

bot.action('status', async (ctx) => {
  const session = getSession(ctx.from.id);
  if (!session) return ctx.answerCbQuery('⚠️ هیچ عملیاتی فعال نیست');

  const text = `📊 <b>وضعیت فعلی</b>\n\n` +
    `🎬 سریال: <b>${session.series || 'ثبت نشده'}</b>\n` +
    `🏷 هشتگ: <code>${session.hashtag || '-'}</code>\n` +
    `📁 تعداد فایل: <b>${session.fileCount}</b>`;

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...mainMenu() });
});

bot.action('cancel', async (ctx) => {
  deleteSession(ctx.from.id);
  await ctx.editMessageText('❌ <b>عملیات با موفقیت لغو شد</b>', { parse_mode: 'HTML', ...mainMenu() });
});

bot.action('done', async (ctx) => {
  const session = getSession(ctx.from.id);
  if (!session) return;

  const total = session.fileCount;
  deleteSession(ctx.from.id);

  await ctx.editMessageText(
    `🎉 <b>عملیات با موفقیت پایان یافت!</b>\n\n` +
    `🎬 سریال: ${session.series}\n` +
    `📊 تعداد قسمت: <b>${total}</b>\n` +
    `🏷 هشتگ: ${session.hashtag}\n\n` +
    `✅ همه فایل‌ها به کانال ارسال شد.`,
    { parse_mode: 'HTML', ...mainMenu() }
  );
});

bot.action('undo', async (ctx) => {
  const session = getSession(ctx.from.id);
  if (!session?.uploadedFiles?.length) {
    return ctx.answerCbQuery('⚠️ فایلی برای Undo وجود ندارد');
  }

  const last = session.uploadedFiles.pop();
  session.fileCount--;

  try {
    await bot.telegram.deleteMessage(CHANNEL_ID, last.messageId);
    saveSession(ctx.from.id, session);

    await ctx.editMessageText(
      `↩️ <b>آخرین فایل حذف شد</b>\n\n` +
      `📀 قسمت: ${last.episode}\n` +
      `🔸 کیفیت: ${last.quality}\n` +
      `📁 باقی‌مانده: ${session.fileCount}`,
      { parse_mode: 'HTML', ...uploadKeyboard() }
    );
  } catch {
    await ctx.answerCbQuery('❌ حذف ناموفق بود');
  }
});

bot.action('ready_to_upload', async (ctx) => {
  const session = getSession(ctx.from.id);
  if (session) session.step = 'upload';
  saveSession(ctx.from.id, session);

  await ctx.editMessageText(
    `📤 <b>آماده آپلود فایل</b>\n\n` +
    `🎬 سریال: <b>${session.series}</b>\n` +
    `🏷 هشتگ: <code>${session.hashtag}</code>\n\n` +
    `حالا فایل‌های قسمت‌ها (ویدیو یا داکیومنت) را ارسال کنید`,
    { parse_mode: 'HTML', ...uploadKeyboard() }
  );
});

// ===================== TEXT (Series Name) =====================
bot.on('text', async (ctx) => {
  const session = getSession(ctx.from.id);
  if (!session || session.step !== 'series') return;

  const series = ctx.message.text.trim();
  if (series.length < 2) return ctx.reply('⚠️ نام سریال خیلی کوتاه است');

  session.series = series;
  session.hashtag = generateHashtag(series);
  session.step = 'upload';
  saveSession(ctx.from.id, session);

  await ctx.reply(
    `✅ <b>سریال ثبت شد!</b>\n\n` +
    `🎬 ${series}\n` +
    `🏷 ${session.hashtag}\n\n` +
    `📤 حالا فایل‌ها را ارسال کنید`,
    { parse_mode: 'HTML', ...afterSeriesKeyboard() }
  );
});

// ===================== FILE UPLOAD =====================
bot.on(['document', 'video'], async (ctx) => {
  const session = getSession(ctx.from.id);
  if (!session || session.step !== 'upload') {
    return ctx.reply('⚠️ ابتدا /start بزنید', mainMenu());
  }

  const file = ctx.message.document || ctx.message.video;
  const fileName = file.file_name || 'Unknown';

  let quality = detectQuality(fileName) || QUALITIES[session.fileCount % QUALITIES.length];
  let episode = detectEpisode(fileName) || session.fileCount + 1;
  const episodeName = ['اول','دوم','سوم','چهارم','پنجم','ششم','هفتم','هشتم','نهم','دهم'][episode-1] || episode;

  const caption = 
`<b>🎥 ${session.hashtag}
• قسمت ${episodeName}
🔸 کیفیت ${quality}
🔹 زیرنویس چسبیده فارسی
🌐 @KoreaMixPlus • @FaKorea</b>`;

  let sent;
  try {
    if (ctx.message.document) {
      sent = await bot.telegram.sendDocument(CHANNEL_ID, file.file_id, { caption, parse_mode: 'HTML', disable_content_type_detection: true });
    } else {
      sent = await bot.telegram.sendVideo(CHANNEL_ID, file.file_id, { caption, parse_mode: 'HTML' });
    }

    session.uploadedFiles.push({ messageId: sent.message_id, episode, quality });
    session.fileCount++;
    saveSession(ctx.from.id, session);

    await ctx.reply(
      `✅ <b>فایل آپلود شد!</b>\n\n` +
      `📀 قسمت ${episodeName}\n` +
      `🔸 کیفیت ${quality}\n` +
      `📁 مجموع: <b>${session.fileCount}</b>`,
      { parse_mode: 'HTML', ...uploadKeyboard() }
    );

  } catch (err) {
    log(`Upload Error: ${err.message}`);
    await ctx.reply('❌ خطا در ارسال فایل');
  }
});

bot.launch();
log('🚀 ربات آپلود سریال با استایل شیشه‌ای راه‌اندازی شد');
