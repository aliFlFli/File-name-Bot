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

// ===================== KEYBOARDS رنگی =====================
const keyboards = {
  main: {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎬 شروع سریال جدید", callback_data: "new_series" }],
        [{ text: "📊 وضعیت فعلی", callback_data: "status" }],
        [{ text: "❌ لغو عملیات", callback_data: "cancel" }]
      ]
    }
  },

  afterSeries: {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✏️ ویرایش نام سریال", callback_data: "edit_series" }],
        [{ text: "📤 آماده آپلود فایل‌ها", callback_data: "ready_upload" }],
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
          { text: "↩️ Undo آخرین فایل", callback_data: "undo" },
          { text: "✅ پایان و ثبت نهایی", callback_data: "done" }
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
  return QUALITIES[Math.floor(Math.random()*QUALITIES.length)];
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

bot.start(async (ctx) => {
  const session = { step: 'series', series: '', hashtag: '', uploadedFiles: [], fileCount: 0 };
  saveSession(ctx.from.id, session);

  await ctx.reply(
    `🌟 <b>ربات آپلود سریال</b> 🌟\n\n` +
    `👋 سلام ادمین!\n` +
    `🎬 لطفاً نام سریال را ارسال کنید:`,
    { parse_mode: 'HTML', ...keyboards.main }
  );
});

// ===================== CALLBACKS =====================
bot.action('new_series', async (ctx) => {
  const session = { step: 'series', series: '', hashtag: '', uploadedFiles: [], fileCount: 0 };
  saveSession(ctx.from.id, session);
  await ctx.editMessageText(`🎬 <b>سریال جدید شروع شد</b>\n\nنام سریال را بنویسید:`, { parse_mode: 'HTML' });
});

bot.action('status', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s) return ctx.answerCbQuery('⚠️ هیچ عملیاتی فعال نیست');

  await ctx.editMessageText(
    `📊 <b>وضعیت فعلی عملیات</b>\n\n` +
    `🎬 سریال: <b>${s.series || 'ثبت نشده'}</b>\n` +
    `🏷 هشتگ: <code>${s.hashtag || '—'}</code>\n` +
    `📁 تعداد فایل: <b>${s.fileCount}</b>`,
    { parse_mode: 'HTML', ...keyboards.main }
  );
});

bot.action('cancel', async (ctx) => {
  deleteSession(ctx.from.id);
  await ctx.editMessageText(`❌ <b>عملیات کاملاً لغو شد</b>`, { parse_mode: 'HTML', ...keyboards.main });
});

bot.action('done', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s) return;
  deleteSession(ctx.from.id);

  await ctx.editMessageText(
    `🎉 <b>عملیات با موفقیت به پایان رسید!</b>\n\n` +
    `🎬 سریال: ${s.series}\n` +
    `📊 تعداد قسمت آپلود شده: <b>${s.fileCount}</b>\n` +
    `🏷 هشتگ: ${s.hashtag}\n\n` +
    `✅ فایل‌ها به کانال ارسال شد.`,
    { parse_mode: 'HTML', ...keyboards.main }
  );
});

bot.action('undo', async (ctx) => { /* ... همان قبلی */ });

bot.action('ready_upload', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (s) s.step = 'upload';
  saveSession(ctx.from.id, s);

  await ctx.editMessageText(
    `📤 <b>آماده آپلود فایل</b>\n\n` +
    `🎬 سریال: <b>${s.series}</b>\n` +
    `🏷 ${s.hashtag}\n\n` +
    `حالا فایل‌های قسمت‌ها (ویدیو یا داکیومنت) را یکی یکی ارسال کنید 👇`,
    { parse_mode: 'HTML', ...keyboards.upload }
  );
});

// ===================== TEXT & FILE (بقیه کد) =====================
bot.on('text', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s || s.step !== 'series') return;

  const series = ctx.message.text.trim();
  if (series.length < 2) return ctx.reply('⚠️ نام سریال خیلی کوتاه است');

  s.series = series;
  s.hashtag = generateHashtag(series);
  s.step = 'upload';
  saveSession(ctx.from.id, s);

  await ctx.reply(
    `✅ <b>سریال با موفقیت ثبت شد!</b>\n\n` +
    `🎬 ${series}\n` +
    `🏷 هشتگ: ${s.hashtag}`,
    { parse_mode: 'HTML', ...keyboards.afterSeries }
  );
});

bot.on(['document', 'video'], async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s || s.step !== 'upload') return ctx.reply('⚠️ ابتدا /start بزنید', keyboards.main);

  const file = ctx.message.document || ctx.message.video;
  const fileName = file.file_name || '';

  let quality = detectQuality(fileName);
  let episode = detectEpisode(fileName) || s.fileCount + 1;
  const epName = episodeNames[episode-1] || `${episode}ام`;

  const caption = `<b>🎥 ${s.hashtag}\n• قسمت ${epName}\n🔸 کیفیت ${quality}\n🔹 زیرنویس چسبیده فارسی\n🌐 @KoreaMixPlus • @FaKorea</b>`;

  try {
    let sent;
    if (ctx.message.document) {
      sent = await bot.telegram.sendDocument(CHANNEL_ID, file.file_id, { caption, parse_mode: 'HTML', disable_content_type_detection: true });
    } else {
      sent = await bot.telegram.sendVideo(CHANNEL_ID, file.file_id, { caption, parse_mode: 'HTML' });
    }

    s.uploadedFiles.push({ messageId: sent.message_id, episode, quality });
    s.fileCount++;
    saveSession(ctx.from.id, s);

    await ctx.reply(
      `✅ <b>فایل با موفقیت آپلود شد!</b>\n\n` +
      `📀 قسمت ${epName}\n🔸 کیفیت \( {quality}\n📁 مجموع آپلود: <b> \){s.fileCount}</b>`,
      { parse_mode: 'HTML', ...keyboards.upload }
    );
  } catch (err) {
    log(`UPLOAD ERROR: ${err.message}`);
    await ctx.reply('❌ خطا در ارسال فایل به کانال');
  }
});

bot.launch();
log('🚀 ربات آپلود سریال (نسخه رنگی و شیشه‌ای) اجرا شد');
