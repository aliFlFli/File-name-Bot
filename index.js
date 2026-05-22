require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());

// =====================================
// CONFIG
// =====================================

const ADMIN_ID = Number(process.env.ADMIN_ID);
const CHANNEL_ID = Number(process.env.CHANNEL_ID);

const QUALITIES = ['540P', '720P', '1080P'];

const DATA_DIR = path.join(__dirname, 'data');
const SESSION_FILE = path.join(DATA_DIR, 'sessions.json');
const LOG_FILE = path.join(DATA_DIR, 'bot.log');

// =====================================
// CREATE DATA DIR
// =====================================

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

if (!fs.existsSync(SESSION_FILE)) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({}));
}

// =====================================
// LOGGER
// =====================================

function log(text) {
  const line = `[${new Date().toLocaleString()}] ${text}\n`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line);
}

// =====================================
// DATABASE
// =====================================

function loadSessions() {
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSessions(data) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
}

function getUserSession(userId) {
  const sessions = loadSessions();
  return sessions[userId] || null;
}

function setUserSession(userId, data) {
  const sessions = loadSessions();
  sessions[userId] = data;
  saveSessions(sessions);
}

function deleteUserSession(userId) {
  const sessions = loadSessions();
  delete sessions[userId];
  saveSessions(sessions);
}

// =====================================
// EPISODE NAMES
// =====================================

const episodeNames = [
  'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم',
  'یازدهم', 'دوازدهم', 'سیزدهم', 'چهاردهم', 'پانزدهم', 'شانزدهم', 'هفدهم', 'هجدهم', 'نوزدهم', 'بیستم'
];

function getEpisodeName(num) {
  return episodeNames[num - 1] || `${num}`;
}

// =====================================
// GLASS BUTTONS KEYBOARD
// =====================================

const glassMainKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '💠 شروع عملیات', callback_data: 'glass_start', style: 'primary' }
      ],
      [
        { text: '📊 وضعیت فعلی', callback_data: 'glass_status', style: 'success' },
        { text: '↩️ حذف آخرین', callback_data: 'glass_undo', style: 'danger' },
        { text: '✅ پایان آپلود', callback_data: 'glass_done', style: 'success' }
      ],
      [
        { text: '❌ لغو عملیات', callback_data: 'glass_cancel', style: 'danger' }
      ],
      [
        { text: '📚 راهنما', callback_data: 'glass_help', style: 'primary' }
      ]
    ]
  }
};

const glassBackKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '🔙 بازگشت به منو', callback_data: 'glass_back', style: 'primary' }
      ]
    ]
  }
};

// =====================================
// HELP MESSAGE
// =====================================

const helpMessage = `
<b>💠 راهنما استفاده از کــــپشــــن یـــــار</b>

🎬 شروع - شروع عملیات آپلود
📊 وضعیت - مشاهده وضعیت فعلی
↩️ حذف آخرین - حذف آخرین فایل آپلود شده
✅ پایان - پایان عملیات
❌ لغو - لغو کامل عملیات
@KoreaMixPlus • @FaKorea
`;

// =====================================
// SECURITY MIDDLEWARE
// =====================================

bot.use(async (ctx, next) => {
  if (!ctx.from) return;
  if (ctx.from.id !== ADMIN_ID) return;
  try {
    await next();
  } catch (err) {
    log(`ERROR: ${err.message}`);
    try {
      await ctx.reply(`❌ خطا:\n${err.message}`);
    } catch {}
  }
});

// =====================================
// UTILITIES
// =====================================

function generateHashtag(text) {
  return '#' + text.replace(/[^a-zA-Z0-9آ-ی\s]/g, '').replace(/\s+/g, '_');
}

function detectQuality(fileName = '') {
  const name = fileName.toLowerCase();
  if (name.includes('1080')) return '1080P';
  if (name.includes('720')) return '720P';
  if (name.includes('540')) return '540P';
  if (name.includes('480')) return '480P';
  return null;
}

function detectEpisode(fileName = '') {
  const patterns = [
    /e(\d+)/i,
    /ep(\d+)/i,
    /episode[ ._-]?(\d+)/i,
    /part[ ._-]?(\d+)/i,
    /(?:^|\D)(\d{1,2})(?:\D|$)/
  ];
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

async function safeSend(method, ...args) {
  try {
    return await method(...args);
  } catch (err) {
    if (err.parameters?.retry_after) {
      const retry = err.parameters.retry_after;
      log(`FloodWait ${retry}s`);
      await new Promise(res => setTimeout(res, retry * 1000));
      return await method(...args);
    }
    throw err;
  }
}

// =====================================
// COMMANDS
// =====================================

bot.start(async (ctx) => {
  await ctx.reply(
    '<b>به کــــپشــــن یـــــار خـوش اومـدی.💠</b>',
    { parse_mode: 'HTML', ...glassMainKeyboard }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(helpMessage, { parse_mode: 'HTML', ...glassMainKeyboard });
});

bot.command('status', async (ctx) => {
  const sessionData = getUserSession(ctx.from.id);
  if (!sessionData) {
    return ctx.reply('⚠️ عملیات فعالی وجود ندارد', glassMainKeyboard);
  }
  await ctx.reply(
    `<b>📊 وضعیت فعلی</b>\n\n🎬 سریال: ${sessionData.series || 'ندارد'}\n🏷 هشتگ: ${sessionData.hashtag || 'ندارد'}\n📁 فایل‌ها: ${sessionData.fileCount}`,
    { parse_mode: 'HTML', ...glassMainKeyboard }
  );
});

bot.command('cancel', async (ctx) => {
  deleteUserSession(ctx.from.id);
  await ctx.reply('❌ عملیات لغو شد', glassMainKeyboard);
});

bot.command('done', async (ctx) => {
  const sessionData = getUserSession(ctx.from.id);
  if (!sessionData) {
    return ctx.reply('⚠️ عملیات فعالی وجود ندارد', glassMainKeyboard);
  }
  const total = sessionData.fileCount;
  deleteUserSession(ctx.from.id);
  await ctx.reply(`<b>✅ عملیات پایان یافت</b>\n\n📁 تعداد فایل‌ها: ${total}`, { parse_mode: 'HTML', ...glassMainKeyboard });
});

bot.command('undo', async (ctx) => {
  const sessionData = getUserSession(ctx.from.id);
  if (!sessionData) {
    return ctx.reply('⚠️ عملیات فعالی وجود ندارد', glassMainKeyboard);
  }
  if (!sessionData.uploadedFiles.length) {
    return ctx.reply('⚠️ فایلی برای حذف وجود ندارد', glassMainKeyboard);
  }
  const last = sessionData.uploadedFiles.pop();
  try {
    await bot.telegram.deleteMessage(CHANNEL_ID, last.messageId);
    sessionData.fileCount--;
    setUserSession(ctx.from.id, sessionData);
    await ctx.reply(`<b>↩️ آخرین فایل حذف شد</b>\n\n📀 قسمت: ${getEpisodeName(last.episode)}\n🔸 کیفیت: ${last.quality}`, { parse_mode: 'HTML', ...glassMainKeyboard });
  } catch (err) {
    log(`UNDO ERROR: ${err.message}`);
    await ctx.reply('❌ حذف فایل ناموفق بود', glassMainKeyboard);
  }
});

// =====================================
// CALLBACK HANDLERS
// =====================================

bot.action('glass_start', async (ctx) => {
  await ctx.answerCbQuery();
  
  const sessionData = {
    step: 'series',
    series: '',
    hashtag: '',
    uploadedFiles: [],
    fileCount: 0,
    createdAt: Date.now()
  };
  
  setUserSession(ctx.from.id, sessionData);
  
  await ctx.reply(
    '<b>🎬 اسم سریال را ارسال کن</b>\n\n(متن رو تایپ کن و بفرست)',
    { parse_mode: 'HTML', ...glassBackKeyboard }
  );
});

bot.action('glass_status', async (ctx) => {
  await ctx.answerCbQuery();
  
  const sessionData = getUserSession(ctx.from.id);
  
  if (!sessionData) {
    return ctx.reply('⚠️ عملیات فعالی وجود ندارد\n\nاز دکمه 🎬 شروع استفاده کن.', glassBackKeyboard);
  }
  
  await ctx.reply(
    `<b>📊 وضعیت فعلی</b>\n\n🎬 سریال: ${sessionData.series || 'ندارد'}\n🏷 هشتگ: ${sessionData.hashtag || 'ندارد'}\n📁 فایل‌ها: ${sessionData.fileCount}\n📌 مرحله: ${sessionData.step === 'series' ? 'دریافت اسم سریال' : 'در حال آپلود'}`,
    { parse_mode: 'HTML', ...glassBackKeyboard }
  );
});

bot.action('glass_undo', async (ctx) => {
  await ctx.answerCbQuery();
  
  const sessionData = getUserSession(ctx.from.id);
  
  if (!sessionData) {
    return ctx.reply('⚠️ عملیات فعالی وجود ندارد', glassBackKeyboard);
  }
  
  if (!sessionData.uploadedFiles.length) {
    return ctx.reply('⚠️ فایلی برای حذف وجود ندارد', glassBackKeyboard);
  }
  
  const last = sessionData.uploadedFiles.pop();
  
  try {
    await bot.telegram.deleteMessage(CHANNEL_ID, last.messageId);
    sessionData.fileCount--;
    setUserSession(ctx.from.id, sessionData);
    
    await ctx.reply(
      `<b>↩️ آخرین فایل حذف شد</b>\n\n📀 قسمت: ${getEpisodeName(last.episode)}\n🔸 کیفیت: ${last.quality}`,
      { parse_mode: 'HTML', ...glassBackKeyboard }
    );
  } catch (err) {
    log(`UNDO ERROR: ${err.message}`);
    await ctx.reply('❌ حذف فایل ناموفق بود', glassBackKeyboard);
  }
});

bot.action('glass_done', async (ctx) => {
  await ctx.answerCbQuery();
  
  const sessionData = getUserSession(ctx.from.id);
  
  if (!sessionData) {
    return ctx.reply('⚠️ عملیات فعالی وجود ندارد', glassMainKeyboard);
  }
  
  const total = sessionData.fileCount;
  deleteUserSession(ctx.from.id);
  
  await ctx.reply(
    `<b>✅ عملیات پایان یافت</b>\n\n📁 تعداد فایل‌ها: ${total}\n🎉 آپلود کامل شد`,
    { parse_mode: 'HTML', ...glassMainKeyboard }
  );
});

bot.action('glass_cancel', async (ctx) => {
  await ctx.answerCbQuery();
  deleteUserSession(ctx.from.id);
  await ctx.reply('❌ عملیات لغو شد', glassMainKeyboard);
});

bot.action('glass_help', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(helpMessage, { parse_mode: 'HTML', ...glassBackKeyboard });
});

bot.action('glass_back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('🔙 منوی اصلی:', glassMainKeyboard);
});

// =====================================
// SERIES NAME (TEXT INPUT)
// =====================================

bot.on('text', async (ctx, next) => {
  const sessionData = getUserSession(ctx.from.id);
  if (!sessionData) return next();
  if (sessionData.step !== 'series') return next();
  
  const series = ctx.message.text.trim();
  if (series.length < 2 || series.length > 100) {
    return ctx.reply('⚠️ اسم سریال نامعتبر است');
  }
  
  sessionData.series = series;
  sessionData.hashtag = generateHashtag(series);
  sessionData.step = 'upload';
  setUserSession(ctx.from.id, sessionData);
  
  await ctx.reply(
    `<b>✅ سریال ثبت شد</b>\n\n🎬 ${series}\n🏷 ${sessionData.hashtag}\n\n📤 حالا فایل‌ها را ارسال کن`,
    { parse_mode: 'HTML', ...glassMainKeyboard }
  );
});

// =====================================
// FILE UPLOAD
// =====================================

bot.on(['document', 'video'], async (ctx) => {
  const sessionData = getUserSession(ctx.from.id);
  
  if (!sessionData) {
    return ctx.reply('⚠️ ابتدا /start را بزن', glassMainKeyboard);
  }
  
  if (sessionData.step !== 'upload') {
    return ctx.reply('⚠️ هنوز اسم سریال ثبت نشده', glassMainKeyboard);
  }
  
  const file = ctx.message.document || ctx.message.video;
  const fileName = file.file_name || 'Unknown';
  
  log(`UPLOAD: ${fileName}`);
  
  let quality = detectQuality(fileName);
  if (!quality) {
    quality = QUALITIES[sessionData.fileCount % QUALITIES.length];
  }
  
  let episode = detectEpisode(fileName);
  if (!episode) {
    episode = sessionData.fileCount + 1;
  }
  
  const episodeName = getEpisodeName(episode);
  
  const caption = `<b>✨ سریال "${sessionData.hashtag}"
💠 قسمت ${episodeName}
🔸 کیفیت ${quality}
🔹 زیرنویس چسبیده فارسی
🌐 @KoreaMixPlus • @FaKorea 🌐</b>`;
  
  let sent;
  
  try {
    if (ctx.message.document) {
      sent = await safeSend(
        bot.telegram.sendDocument.bind(bot.telegram),
        CHANNEL_ID,
        file.file_id,
        { caption, parse_mode: 'HTML', disable_content_type_detection: true }
      );
    } else {
      sent = await safeSend(
        bot.telegram.sendVideo.bind(bot.telegram),
        CHANNEL_ID,
        file.file_id,
        { caption, parse_mode: 'HTML' }
      );
    }
    
    sessionData.uploadedFiles.push({
      messageId: sent.message_id,
      episode,
      quality,
      fileName,
      uploadedAt: Date.now()
    });
    
    sessionData.fileCount++;
    setUserSession(ctx.from.id, sessionData);
    
    await ctx.reply(
      `<b>✅ فایل آپلود شد</b>\n\n📀 قسمت ${episodeName}\n🔸 کیفیت ${quality}\n\n📁 مجموع فایل‌ها: ${sessionData.fileCount}`,
      { parse_mode: 'HTML', ...glassMainKeyboard }
    );
    
  } catch (err) {
    log(`SEND ERROR: ${err.message}`);
    await ctx.reply(`❌ خطا در ارسال فایل\n\n${err.message}`, glassMainKeyboard);
  }
});

// =====================================
// UNKNOWN MESSAGE
// =====================================

bot.on('message', async (ctx) => {
  const sessionData = getUserSession(ctx.from.id);
  if (!sessionData) {
    await ctx.reply('⚠️ پیام نامعتبر\n\nاز دکمه‌های شیشه‌ای استفاده کن یا /start بزن', glassMainKeyboard);
  }
});

// =====================================
// BOT START
// =====================================

bot.launch().then(() => {
  log('🤖 Bot Started with Glass Buttons ✨');
  console.log('✅ ربات با موفقیت اجرا شد!');
}).catch((err) => {
  log(`LAUNCH ERROR: ${err.message}`);
  console.error('❌ خطا در اجرای ربات:', err);
});

// =====================================
// ANTI CRASH
// =====================================

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT: ${err.message}`);
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  log(`UNHANDLED: ${err}`);
  console.error('Unhandled Rejection:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
