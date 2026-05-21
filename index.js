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

// ===================== SETUP =====================
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(SESSION_FILE)) fs.writeFileSync(SESSION_FILE, JSON.stringify({}));

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
  } catch (e) { log(`SAVE ERROR: ${e.message}`); }
}

function deleteSession(userId) {
  try {
    const all = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    delete all[userId];
    fs.writeFileSync(SESSION_FILE, JSON.stringify(all, null, 2));
  } catch {}
}

// ===================== KEYBOARDS (شیشه‌ای) =====================
const keyboards = {
  main: {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎬 سریال جدید", callback_data: "new_series" }],
        [{ text: "📊 وضعیت فعلی", callback_data: "status" }],
        [{ text: "❌ لغو عملیات", callback_data: "cancel" }]
      ]
    }
  },

  afterSeries: {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✏️ ویرایش نام سریال", callback_data: "edit_series" }],
        [{ text: "📤 آماده آپلود فایل", callback_data: "ready_upload" }],
        [
          { text: "📊 وضعیت", callback_data: "status" },
          { text: "❌ لغو", callback_data: "cancel" }
        ]
      ]
    }
  },

  upload: {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "↩️ Undo آخرین", callback_data: "undo" },
          { text: "✅ پایان آپلود", callback_data: "done" }
        ],
        [
          { text: "📊 وضعیت", callback_data: "status" },
          { text: "🎬 سریال جدید", callback_data: "new_series" }
        ]
      ]
    }
  }
};

// ===================== HELPERS =====================
function generateHashtag(text) {
  return '#' + text.replace(/[^a-zA-Z0-9آ-ی\s]/g, '').replace(/\s+/g, '_');
}

function detectQuality(filename = '') {
  const n = filename.toLowerCase();
  if (n.includes('1080')) return '1080P';
  if (n.includes('720')) return '720P';
  if (n.includes('540') || n.includes('480')) return '540P';
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

const episodeNames = ['اول','دوم','سوم','چهارم','پنجم','ششم','هفتم','هشتم','نهم','دهم','یازدهم','دوازدهم','سیزدهم','چهاردهم','پانزدهم','شانزدهم','هفدهم','هجدهم','نوزدهم','بیستم'];

// ===================== BOT =====================
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== ADMIN_ID) return;
  return next().catch(err => log(`ERROR: ${err.message}`));
});

// Start
bot.start(async (ctx) => {
  const session = { step: 'series', series: '', hashtag: '', uploadedFiles: [], fileCount: 0 };
  saveSession(ctx.from.id, session);

  await ctx.reply(
    `🌟 <b>ربات آپلود سریال</b> 🌟\n\n` +
    `🎬 لطفاً نام سریال را ارسال کنید:`,
    { parse_mode: 'HTML', ...keyboards.main }
  );
});

// ===================== CALLBACKS =====================
bot.action('new_series', async (ctx) => {
  const session = { step: 'series', series: '', hashtag: '', uploadedFiles: [], fileCount: 0 };
  saveSession(ctx.from.id, session);
  await ctx.editMessageText(`🎬 <b>سریال جدید</b>\n\nنام سریال را بنویسید:`, { parse_mode: 'HTML' });
});

bot.action('status', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s) return ctx.answerCbQuery('⚠️ عملیاتی فعال نیست');

  await ctx.editMessageText(
    `📊 <b>وضعیت فعلی</b>\n\n` +
    `🎬 سریال: <b>${s.series || '—'}</b>\n` +
    `🏷 هشتگ: <code>${s.hashtag || '—'}</code>\n` +
    `📁 فایل آپلود شده: <b>${s.fileCount}</b>`,
    { parse_mode: 'HTML', ...keyboards.main }
  );
});

bot.action('cancel', async (ctx) => {
  deleteSession(ctx.from.id);
  await ctx.editMessageText(`❌ <b>عملیات لغو شد</b>`, { parse_mode: 'HTML', ...keyboards.main });
});

bot.action('done', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s) return;
  const total = s.fileCount;
  deleteSession(ctx.from.id);

  await ctx.editMessageText(
    `🎉 <b>عملیات با موفقیت به پایان رسید!</b>\n\n` +
    `🎬 سریال: ${s.series}\n` +
    `📊 تعداد قسمت: <b>${total}</b>\n` +
    `🏷 هشتگ: ${s.hashtag}`,
    { parse_mode: 'HTML', ...keyboards.main }
  );
});

bot.action('undo', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s?.uploadedFiles?.length) return ctx.answerCbQuery('⚠️ فایلی برای حذف وجود ندارد');

  const last = s.uploadedFiles.pop();
  s.fileCount--;

  try {
    await bot.telegram.deleteMessage(CHANNEL_ID, last.messageId);
    saveSession(ctx.from.id, s);

    await ctx.editMessageText(
      `↩️ <b>آخرین فایل حذف شد</b>\n\n📀 قسمت ${last.episode} | ${last.quality}\n📁 باقی‌مانده: ${s.fileCount}`,
      { parse_mode: 'HTML', ...keyboards.upload }
    );
  } catch {
    ctx.answerCbQuery('❌ حذف ناموفق');
  }
});

bot.action('ready_upload', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (s) s.step = 'upload';
  saveSession(ctx.from.id, s);

  await ctx.editMessageText(
    `📤 <b>آماده ارسال فایل</b>\n\n` +
    `🎬 سریال: <b>${s.series}</b>\n` +
    `🏷 ${s.hashtag}\n\n` +
    `حالا ویدیو یا فایل قسمت‌ها را ارسال کنید`,
    { parse_mode: 'HTML', ...keyboards.upload }
  );
});

// ===================== TEXT =====================
bot.on('text', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s || s.step !== 'series') return;

  const series = ctx.message.text.trim();
  if (series.length < 2) return ctx.reply('⚠️ نام سریال کوتاه است');

  s.series = series;
  s.hashtag = generateHashtag(series);
  s.step = 'upload';
  saveSession(ctx.from.id, s);

  await ctx.reply(
    `✅ <b>سریال ثبت شد!</b>\n\n` +
    `🎬 ${series}\n` +
    `🏷 ${s.hashtag}`,
    { parse_mode: 'HTML', ...keyboards.afterSeries }
  );
});

// ===================== FILE UPLOAD =====================
bot.on(['document', 'video'], async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s || s.step !== 'upload') return ctx.reply('⚠️ ابتدا /start بزن', keyboards.main);

  const file = ctx.message.document || ctx.message.video;
  const fileName = file.file_name || '';

  let quality = detectQuality(fileName) || QUALITIES[s.fileCount % QUALITIES.length];
  let episode = detectEpisode(fileName) || s.fileCount + 1;
  const epName = episodeNames[episode-1] || episode;

  const caption = `<b>🎥 ${s.hashtag}\n• قسمت ${epName}\n🔸 کیفیت ${quality}\n🔹 زیرنویس چسبیده فارسی\n🌐 @KoreaMixPlus • @FaKorea</b>`;

  try {
    let sent;
    if (ctx.message.document) {
      sent = await bot.telegram.sendDocument(CHANNEL_ID, file.file_id, {
        caption, parse_mode: 'HTML', disable_content_type_detection: true
      });
    } else {
      sent = await bot.telegram.sendVideo(CHANNEL_ID, file.file_id, { caption, parse_mode: 'HTML' });
    }

    s.uploadedFiles.push({ messageId: sent.message_id, episode, quality });
    s.fileCount++;
    saveSession(ctx.from.id, s);

    await ctx.reply(
      `✅ <b>فایل با موفقیت آپلود شد!</b>\n\n` +
      `📀 قسمت ${epName}\n🔸 کیفیت \( {quality}\n📁 مجموع: <b> \){s.fileCount}</b>`,
      { parse_mode: 'HTML', ...keyboards.upload }
    );

  } catch (err) {
    log(`UPLOAD ERROR: ${err.message}`);
    await ctx.reply('❌ خطا در آپلود فایل');
  }
});

bot.launch();
log('🚀 ربات آپلود سریال (نسخه شیشه‌ای کامل) شروع شد');
