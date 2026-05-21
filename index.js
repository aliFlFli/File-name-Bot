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

  const line =
    `[${new Date().toLocaleString()}] ${text}\n`;

  console.log(line);

  fs.appendFileSync(LOG_FILE, line);
}

// =====================================
// DATABASE
// =====================================

function loadSessions() {

  try {

    return JSON.parse(
      fs.readFileSync(SESSION_FILE, 'utf8')
    );

  } catch {

    return {};
  }
}

function saveSessions(data) {

  fs.writeFileSync(
    SESSION_FILE,
    JSON.stringify(data, null, 2)
  );
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
  'بیستم'
];

function getEpisodeName(num) {

  return episodeNames[num - 1] || `${num}`;
}

// =====================================
// HELP
// =====================================

const helpMessage = `
<b>📚 راهنمای ربات آپلود سریال</b>

/start - شروع
/status - وضعیت
/undo - حذف آخرین فایل
/done - پایان
/cancel - لغو
/help - راهنما

✅ ذخیره دائمی سشن
✅ Undo واقعی
✅ تشخیص کیفیت
✅ تشخیص قسمت
✅ Anti Crash
`;

// =====================================
// MIDDLEWARE
// =====================================

bot.use(async (ctx, next) => {

  if (ctx.from?.id !== ADMIN_ID) {

    return ctx.reply('⛔ دسترسی ندارید');
  }

  try {

    await next();

  } catch (err) {

    log(`ERROR: ${err.message}`);

    try {

      await ctx.reply(
        `❌ خطا:\n${err.message}`
      );

    } catch {}
  }
});

// =====================================
// UTILITIES
// =====================================

function generateHashtag(text) {

  return '#'
    + text
      .replace(/[^a-zA-Z0-9آ-ی\s]/g, '')
      .replace(/\s+/g, '_');
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

    if (match) {

      return Number(match[1]);
    }
  }

  return null;
}

async function safeSend(method, ...args) {

  try {

    return await method(...args);

  } catch (err) {

    if (err.parameters?.retry_after) {

      const retry =
        err.parameters.retry_after;

      log(`FloodWait ${retry}s`);

      await new Promise(res =>
        setTimeout(res, retry * 1000)
      );

      return await method(...args);
    }

    throw err;
  }
}

// =====================================
// START
// =====================================

bot.start(async (ctx) => {

  const sessionData = {

    step: 'series',

    series: '',

    hashtag: '',

    uploadedFiles: [],

    fileCount: 0,

    createdAt: Date.now()
  };

  setUserSession(
    ctx.from.id,
    sessionData
  );

  await ctx.reply(
    '<b>🎬 اسم سریال را ارسال کن</b>',
    {
      parse_mode: 'HTML'
    }
  );
});

// =====================================
// HELP
// =====================================

bot.command('help', async (ctx) => {

  await ctx.reply(helpMessage, {
    parse_mode: 'HTML'
  });
});

// =====================================
// STATUS
// =====================================

bot.command('status', async (ctx) => {

  const sessionData =
    getUserSession(ctx.from.id);

  if (!sessionData) {

    return ctx.reply(
      '⚠️ عملیات فعالی وجود ندارد'
    );
  }

  const nextEpisode =
    sessionData.fileCount + 1;

  await ctx.reply(
`
<b>📊 وضعیت فعلی</b>

🎬 سریال: ${sessionData.series}
🏷 هشتگ: ${sessionData.hashtag}
📁 فایل‌ها: ${sessionData.fileCount}
📌 قسمت بعدی: ${nextEpisode}
`,
    {
      parse_mode: 'HTML'
    }
  );
});

// =====================================
// CANCEL
// =====================================

bot.command('cancel', async (ctx) => {

  deleteUserSession(ctx.from.id);

  await ctx.reply(
    '❌ عملیات لغو شد'
  );
});

// =====================================
// DONE
// =====================================

bot.command('done', async (ctx) => {

  const sessionData =
    getUserSession(ctx.from.id);

  if (!sessionData) {

    return ctx.reply(
      '⚠️ عملیات فعالی وجود ندارد'
    );
  }

  const total =
    sessionData.fileCount;

  deleteUserSession(ctx.from.id);

  await ctx.reply(
`
<b>✅ عملیات پایان یافت</b>

📁 تعداد فایل‌ها: ${total}
🎉 آپلود کامل شد
`,
    {
      parse_mode: 'HTML'
    }
  );
});

// =====================================
// UNDO
// =====================================

bot.command('undo', async (ctx) => {

  const sessionData =
    getUserSession(ctx.from.id);

  if (!sessionData) {

    return ctx.reply(
      '⚠️ عملیات فعالی وجود ندارد'
    );
  }

  if (
    !sessionData.uploadedFiles.length
  ) {

    return ctx.reply(
      '⚠️ فایلی برای حذف وجود ندارد'
    );
  }

  const last =
    sessionData.uploadedFiles.pop();

  try {

    await bot.telegram.deleteMessage(
      CHANNEL_ID,
      last.messageId
    );

    sessionData.fileCount--;

    setUserSession(
      ctx.from.id,
      sessionData
    );

    await ctx.reply(
`
<b>↩️ آخرین فایل حذف شد</b>

📀 قسمت: ${last.episode}
🔸 کیفیت: ${last.quality}
`,
      {
        parse_mode: 'HTML'
      }
    );

  } catch (err) {

    log(`UNDO ERROR: ${err.message}`);

    await ctx.reply(
      '❌ حذف فایل ناموفق بود'
    );
  }
});

// =====================================
// SERIES NAME
// =====================================

bot.on('text', async (ctx, next) => {

  const sessionData =
    getUserSession(ctx.from.id);

  if (!sessionData) {

    return next();
  }

  if (
    sessionData.step !== 'series'
  ) {

    return next();
  }

  const series =
    ctx.message.text.trim();

  if (
    series.length < 2 ||
    series.length > 100
  ) {

    return ctx.reply(
      '⚠️ اسم سریال نامعتبر است'
    );
  }

  sessionData.series = series;

  sessionData.hashtag =
    generateHashtag(series);

  sessionData.step = 'upload';

  setUserSession(
    ctx.from.id,
    sessionData
  );

  await ctx.reply(
`
<b>✅ سریال ثبت شد</b>

🎬 ${series}
🏷 ${sessionData.hashtag}

📤 فایل‌ها را ارسال کن
`,
    {
      parse_mode: 'HTML'
    }
  );
});

// =====================================
// FILE UPLOAD
// =====================================

bot.on(
  ['document', 'video'],
  async (ctx) => {

    const sessionData =
      getUserSession(ctx.from.id);

    if (!sessionData) {

      return ctx.reply(
        '⚠️ ابتدا /start را بزن'
      );
    }

    if (
      sessionData.step !== 'upload'
    ) {

      return ctx.reply(
        '⚠️ هنوز اسم سریال ثبت نشده'
      );
    }

    const file =
      ctx.message.document
      || ctx.message.video;

    const fileName =
      file.file_name || 'Unknown';

    log(`UPLOAD: ${fileName}`);

    let quality =
      detectQuality(fileName);

    if (!quality) {

      quality =
        QUALITIES[
          sessionData.fileCount
          % QUALITIES.length
        ];
    }

    let episode =
      detectEpisode(fileName);

    if (!episode) {

      episode =
        sessionData.fileCount + 1;
    }

    const episodeName =
      getEpisodeName(episode);

    const caption = `
<b>
🎬 ${sessionData.series}
🏷 ${sessionData.hashtag}

📀 قسمت ${episodeName}
🔸 کیفیت ${quality}
🔹 زیرنویس فارسی

🌐 @KoreaMixPlus
</b>`;

    let sent;

    try {

      if (ctx.message.document) {

        sent = await safeSend(
          bot.telegram.sendDocument.bind(
            bot.telegram
          ),

          CHANNEL_ID,

          file.file_id,

          {
            caption,

            parse_mode: 'HTML',

            disable_content_type_detection: true
          }
        );
      }

      else {

        sent = await safeSend(
          bot.telegram.sendVideo.bind(
            bot.telegram
          ),

          CHANNEL_ID,

          file.file_id,

          {
            caption,

            parse_mode: 'HTML'
          }
        );
      }

      sessionData.uploadedFiles.push({

        messageId:
          sent.message_id,

        episode,

        quality,

        fileName,

        uploadedAt:
          Date.now()
      });

      sessionData.fileCount++;

      setUserSession(
        ctx.from.id,
        sessionData
      );

      await ctx.reply(
`
<b>✅ فایل آپلود شد</b>

📀 قسمت ${episodeName}
🔸 کیفیت ${quality}

📁 مجموع فایل‌ها:
${sessionData.fileCount}
`,
        {
          parse_mode: 'HTML'
        }
      );

    } catch (err) {

      log(
        `SEND ERROR: ${err.message}`
      );

      await ctx.reply(
`
❌ خطا در ارسال فایل

${err.message}
`
      );
    }
  }
);

// =====================================
// UNKNOWN
// =====================================

bot.on('message', async (ctx) => {

  await ctx.reply(
    '⚠️ پیام نامعتبر'
  );
});

// =====================================
// BOT START
// =====================================

bot.launch();

log('🤖 Bot Started');

// =====================================
// ANTI CRASH
// =====================================

process.on(
  'uncaughtException',
  (err) => {

    log(
      `UNCAUGHT: ${err.message}`
    );
  }
);

process.on(
  'unhandledRejection',
  (err) => {

    log(
      `UNHANDLED: ${err}`
    );
  }
);

// =====================================
// STOP
// =====================================

process.once(
  'SIGINT',
  () => bot.stop('SIGINT')
);

process.once(
  'SIGTERM',
  () => bot.stop('SIGTERM')
);
