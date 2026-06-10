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
const SERIALS_FILE = path.join(DATA_DIR, 'serials.json');

// =====================================
// CREATE DATA DIR & FILES
// =====================================

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

if (!fs.existsSync(SESSION_FILE)) {
  fs.writeFileSync(SESSION_FILE, JSON.stringify({}));
}

if (!fs.existsSync(SERIALS_FILE)) {
  fs.writeFileSync(SERIALS_FILE, JSON.stringify({}));
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
// IN-MEMORY STORAGE (بهینه)
// =====================================

const userSessions = new Map();     // userId → sessionData
const serialsMap = new Map();       // key (lowercase) → serialData

let lastSaveTime = Date.now();
let isSaving = false;

// =====================================
// LOAD INITIAL DATA
// =====================================

function loadInitialData() {
  // Load Serials
  try {
    if (fs.existsSync(SERIALS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SERIALS_FILE, 'utf8'));
      for (const [key, value] of Object.entries(data)) {
        serialsMap.set(key, value);
      }
      log(`📚 ${serialsMap.size} سریال از فایل لود شد`);
    }
  } catch (err) {
    log(`خطا در لود سریال‌ها: ${err.message}`);
  }

  // Load Sessions
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      for (const [key, value] of Object.entries(data)) {
        userSessions.set(Number(key), value);
      }
      log(`👤 ${userSessions.size} جلسه فعال لود شد`);
    }
  } catch (err) {
    log(`خطا در لود سشن‌ها: ${err.message}`);
  }
}

// =====================================
// SAVE FUNCTIONS (بهینه)
// =====================================

function saveSerialsToFile() {
  if (isSaving) return;
  isSaving = true;
  try {
    const data = Object.fromEntries(serialsMap);
    fs.writeFileSync(SERIALS_FILE, JSON.stringify(data, null, 2));
    lastSaveTime = Date.now();
    log('💾 سریال‌ها ذخیره شدند');
  } catch (err) {
    log(`❌ خطا در ذخیره سریال‌ها: ${err.message}`);
  } finally {
    isSaving = false;
  }
}

function saveSessionsToFile() {
  try {
    const data = Object.fromEntries(userSessions);
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
    lastSaveTime = Date.now();
  } catch (err) {
    log(`❌ خطا در ذخیره سشن‌ها: ${err.message}`);
  }
}

function autoSave() {
  const timeSince = Date.now() - lastSaveTime;
  if (timeSince > 30000) {
    log(`🔄 ذخیره خودکار (${timeSince}ms از آخرین ذخیره)`);
    if (userSessions.size > 0) saveSessionsToFile();
    if (serialsMap.size > 0) saveSerialsToFile();
  }
}

// =====================================
// SESSIONS DATABASE (با Map)
// =====================================

function getUserSession(userId) {
  return userSessions.get(userId) || null;
}

function setUserSession(userId, data) {
  userSessions.set(userId, data);
  autoSave();
}

function deleteUserSession(userId) {
  userSessions.delete(userId);
  autoSave();
}

// =====================================
// SERIALS DATABASE (با Map)
// =====================================

function addSerial(englishName, persianHashtag, addedBy) {
  const key = englishName.toLowerCase();
  serialsMap.set(key, {
    english: englishName,
    hashtag: persianHashtag,
    addedBy: addedBy,
    addedAt: Date.now()
  });
  saveSerialsToFile();
  return true;
}

function removeSerial(englishName) {
  const key = englishName.toLowerCase();
  if (serialsMap.has(key)) {
    serialsMap.delete(key);
    saveSerialsToFile();
    return true;
  }
  return false;
}

function detectSerial(fileName) {
  const lowerName = fileName.toLowerCase();
  for (const [key, value] of serialsMap) {
    if (lowerName.includes(key)) {
      return value;
    }
  }
  return null;
}

function getAllSerials() {
  return Array.from(serialsMap.values());
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
<b>💠 راهنمای ربات کــــپشــــن یـــــار </b>

🎬 <b>شروع عملیات:</b> شروع آپلود دستی سریال
📊 <b>وضعیت:</b> مشاهده وضعیت آپلودهای خود
↩️ <b>حذف آخرین:</b> حذف آخرین فایل آپلود شده
✅ <b>پایان:</b> پایان عملیات آپلود
❌ <b>لغو:</b> لغو کامل عملیات

<b>🤖 آپلود خودکار:</b>
- فقط کافیست فایل را بفرستید
- ربات سریال، قسمت و کیفیت را تشخیص میدهد
- نیازی به شروع عملیات نیست

<b>📝 دستورات ادمین:</b>
/addserial - ثبت سریال جدید
/serials - لیست سریال‌ها
/delserial - حذف سریال

@CapYarBot
`;

// =====================================
// UTILITIES
// =====================================

function generateHashtag(text) {
  return '#' + text.replace(/[^a-zA-Z0-9آ-ی\s]/g, '').replace(/\s+/g, '_');
}

function detectQuality(fileName = '') {
  const name = fileName.toLowerCase();
  if (name.includes('1080') || name.includes('1080p')) return '1080P';
  if (name.includes('720') || name.includes('720p')) return '720P';
  if (name.includes('540') || name.includes('540p')) return '540P';
  if (name.includes('480') || name.includes('480p')) return '480P';
  return null;
}

function detectEpisode(fileName = '') {
  const patterns = [
    /[Ee](\d+)/,
    /[Ee][Pp](\d+)/,
    /[Ee]pisode[ ._-]?(\d+)/,
    /part[ ._-]?(\d+)/i,
    /قسمت[ ._-]?(\d+)/,
    /(\d+)[\s_-]*قسمت/,
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

async function deleteMessage(ctx, messageId) {
  try {
    await ctx.deleteMessage(messageId);
  } catch (err) {
    // خطا نادیده گرفته میشود
  }
}

// =====================================
// COMMANDS
// =====================================

bot.start(async (ctx) => {
  await ctx.reply(
    '<b>💠 به کــــپشــــن یـــــار خوش اومدی.\n @CapYarBot</b>',
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
  if (!sessionData.uploadedFiles?.length) {
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
// ADMIN COMMANDS
// =====================================

bot.command('addserial', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('❌ فقط ادمین میتونه سریال ثبت کنه');
  }
  
  const text = ctx.message.text;
  const parts = text.split(' ');
  
  if (parts.length < 3) {
    return ctx.reply(
      '❌ دستور صحیح:\n\n/addserial اسم_انگلیسی #هشتگ_فارسی\n\nمثال:\n/addserial My.Royal.Nemesis #دشمن_سلطنتی_من'
    );
  }
  
  const englishName = parts[1];
  let persianHashtag = parts[2];
  
  if (!persianHashtag.startsWith('#')) {
    persianHashtag = '#' + persianHashtag;
  }
  
  addSerial(englishName, persianHashtag, ctx.from.id);
  
  await ctx.reply(
    `✅ سریال با موفقیت ثبت شد!\n\n📀 اسم انگلیسی: ${englishName}\n🏷 هشتگ: ${persianHashtag}\n\n📤 حالا کاربران میتونن فایل‌های این سریال رو مستقیم آپلود کنن.`
  );
});

bot.command('serials', async (ctx) => {
  const serials = getAllSerials();
  
  if (serials.length === 0) {
    return ctx.reply('📭 هیچ سریالی ثبت نشده است.\n\nبرای ثبت سریال جدید از دستور /addserial استفاده کنید.');
  }
  
  let message = '📋 لیست سریال‌های ثبت شده:\n\n';
  serials.forEach((s, i) => {
    message += `${i+1}. ${s.english}\n   ${s.hashtag}\n\n`;
  });
  
  await ctx.reply(message);
});

bot.command('delserial', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply('❌ فقط ادمین');
  }
  
  const englishName = ctx.message.text.split(' ')[1];
  if (!englishName) {
    return ctx.reply('❌ اسم انگلیسی سریال رو وارد کن\n\nمثال: /delserial My.Royal.Nemesis');
  }
  
  if (removeSerial(englishName)) {
    await ctx.reply(`✅ سریال ${englishName} حذف شد.`);
  } else {
    await ctx.reply(`❌ سریال ${englishName} یافت نشد.`);
  }
});

// =====================================
// CALLBACK HANDLERS
// =====================================

bot.action('glass_start', async (ctx) => {
  await ctx.answerCbQuery();
  await deleteMessage(ctx, ctx.callbackQuery.message.message_id);
  
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
  await deleteMessage(ctx, ctx.callbackQuery.message.message_id);
  
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
  await deleteMessage(ctx, ctx.callbackQuery.message.message_id);
  
  const sessionData = getUserSession(ctx.from.id);
  
  if (!sessionData) {
    return ctx.reply('⚠️ عملیات فعالی وجود ندارد', glassBackKeyboard);
  }
  
  if (!sessionData.uploadedFiles?.length) {
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
  await deleteMessage(ctx, ctx.callbackQuery.message.message_id);
  
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
  await deleteMessage(ctx, ctx.callbackQuery.message.message_id);
  deleteUserSession(ctx.from.id);
  await ctx.reply('❌ عملیات لغو شد', glassMainKeyboard);
});

bot.action('glass_help', async (ctx) => {
  await ctx.answerCbQuery();
  await deleteMessage(ctx, ctx.callbackQuery.message.message_id);
  await ctx.reply(helpMessage, { parse_mode: 'HTML', ...glassBackKeyboard });
});

bot.action('glass_back', async (ctx) => {
  await ctx.answerCbQuery();
  await deleteMessage(ctx, ctx.callbackQuery.message.message_id);
  await ctx.reply('🔙 منوی اصلی:', glassMainKeyboard);
});

// =====================================
// TEXT HANDLER (دستی)
// =====================================

bot.on('text', async (ctx) => {
  // چک کردن دستورات ادمین اول
  if (ctx.message.text.startsWith('/')) return;
  
  const sessionData = getUserSession(ctx.from.id);
  if (!sessionData) return;
  if (sessionData.step !== 'series') return;
  
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
// FILE UPLOAD (آپلود خودکار هوشمند)
// =====================================

bot.on(['document', 'video'], async (ctx) => {
  const userId = ctx.from.id;
  const file = ctx.message.document || ctx.message.video;
  const fileName = file.file_name || 'Unknown';
  
  log(`📤 UPLOAD from ${userId}: ${fileName}`);
  
  // تشخیص سریال از اسم فایل
  const serial = detectSerial(fileName);
  
  if (!serial) {
    return ctx.reply(
      '❌ سریال مورد نظر در سیستم ثبت نشده است!\n\n' +
      'لطفاً با ادمین تماس بگیرید تا سریال را ثبت کند.\n\n' +
      '📋 برای مشاهده سریال‌های موجود: /serials'
    );
  }
  
  // تشخیص کیفیت
  let quality = detectQuality(fileName);
  if (!quality) {
    if (fileName.toLowerCase().includes('540')) quality = '540P';
    else if (fileName.toLowerCase().includes('720')) quality = '720P';
    else if (fileName.toLowerCase().includes('1080')) quality = '1080P';
    else quality = '720P';
  }
  
  // تشخیص قسمت
  let episode = detectEpisode(fileName);
  if (!episode) {
    return ctx.reply(
      '❌ نتونستم شماره قسمت رو تشخیص بدم!\n\n' +
      `اسم فایل: ${fileName}\n\n` +
      'لطفاً اسم فایل رو به شکلی بذارید که شامل E01 یا قسمت ۱ یا ep1 باشه.\n\n' +
      'مثال: My.Series.E01.720p.mkv'
    );
  }
  
  const episodeName = getEpisodeName(episode);
  const hashtag = serial.hashtag;
  
  // ساخت کپشن
  const caption = `<b> 🍿 سریال " ${hashtag} "
💠 قسمت ${episodeName}
🔸 کیفیت ${quality}
🔹 زیرنویس چسبیده فارسی
🌐 @KoreaMixPlus • @FaKorea 🌐</b>`;
  
  try {
    let sent;
    
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
    
    // ذخیره در سشن کاربر
    let userSession = getUserSession(userId);
    if (!userSession) {
      userSession = { uploadedFiles: [], fileCount: 0 };
    }
    userSession.uploadedFiles.push({
      messageId: sent.message_id,
      episode,
      quality,
      fileName,
      serial: serial.english,
      uploadedAt: Date.now()
    });
    userSession.fileCount++;
    setUserSession(userId, userSession);
    
    await ctx.reply(
      `✅ فایل با موفقیت ارسال شد!\n\n` +
      `🎬 سریال: ${serial.hashtag}\n` +
      `📀 قسمت: ${episodeName}\n` +
      `🔸 کیفیت: ${quality}\n\n` +
      `📁 مجموع ارسال‌های شما: ${userSession.fileCount}`,
      { parse_mode: 'HTML', ...glassMainKeyboard }
    );
    
    log(`✅ SUCCESS: ${fileName} -> ${hashtag} E${episode}`);
    
  } catch (err) {
    log(`❌ SEND ERROR: ${err.message}`);
    await ctx.reply(`❌ خطا در ارسال فایل\n\n${err.message}`, glassMainKeyboard);
  }
});

// =====================================
// GRACEFUL SHUTDOWN
// =====================================

async function shutdown() {
  log('🛑 در حال ذخیره نهایی داده‌ها قبل از خاموشی...');
  if (userSessions.size > 0) saveSessionsToFile();
  if (serialsMap.size > 0) saveSerialsToFile();
  await bot.stop('SIGTERM');
  process.exit(0);
}

// =====================================
// BOT START
// =====================================

bot.launch().then(() => {
  loadInitialData();
  
  log('🤖 Bot Started with Glass Buttons + In-Memory Map ✨');
  console.log('✅ ربات با موفقیت اجرا شد (ذخیره‌سازی بهینه با Map)');
  console.log('📋 دستورات ادمین: /addserial , /serials , /delserial');

  // Auto save every 30 seconds
  setInterval(autoSave, 30000);
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

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
