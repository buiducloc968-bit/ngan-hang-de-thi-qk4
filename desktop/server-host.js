'use strict';
// Tiến trình con chạy backend Express của ứng dụng web (server/dist/index.js trong bản gom) bên trong Electron.
// Trước khi mở máy chủ: bổ sung cấu trúc database còn thiếu (có sao lưu).
// Cũng chạy được bằng Node thường qua child_process.fork để kiểm thử.
const path = require('node:path');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const {syncDatabase, sqlString} = require('./src/db-sync');

const env = process.env;
const channel = process.parentPort
  ? {send: (m) => process.parentPort.postMessage(m), listen: (fn) => process.parentPort.on('message', (e) => fn(e.data))}
  : {send: (m) => process.send && process.send(m), listen: (fn) => process.on('message', fn)};
let dbModule = null;

function fatal(err) {
  console.error(err && err.stack ? err.stack : err);
  const message = err && err.code === 'EADDRINUSE'
    ? `Cổng ${env.PORT} đang được chương trình khác sử dụng.`
    : String((err && err.message) || err);
  try { channel.send({type: 'fatal', message}); } catch { /* tiến trình cha đã đóng */ }
  setTimeout(() => process.exit(1), 300);
}
process.on('uncaughtException', fatal);
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

channel.listen(async (msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'shutdown') {
    try { if (dbModule) await dbModule.db.$disconnect(); } finally { process.exit(0); }
  }
  const reply = (ok, result, error) => channel.send({type: 'reply', id: msg.id, ok, result, error});
  try {
    if (msg.type === 'env') {
      // Áp dụng cài đặt AI ngay: backend đọc các biến này tại thời điểm xử lý từng yêu cầu.
      for (const key of ['AI_MODE', 'OPENAI_API_KEY', 'OPENAI_MODEL']) {
        if (typeof msg.values?.[key] === 'string') process.env[key] = msg.values[key];
      }
      reply(true, {});
      return;
    }
    if (msg.type !== 'backup') throw new Error('Yêu cầu không hợp lệ.');
    if (!dbModule) throw new Error('Máy chủ nội bộ chưa sẵn sàng.');
    const target = path.resolve(String(msg.target));
    // VACUUM INTO tạo bản sao nhất quán ngay cả khi đang có người sử dụng.
    await dbModule.db.$executeRawUnsafe(`VACUUM INTO ${sqlString(target)}`);
    reply(true, {target});
  } catch (err) {
    reply(false, null, err.message);
  }
});

async function main() {
  const {PrismaClient} = createRequire(env.NHCH_SERVER_ENTRY)('@prisma/client');
  const prisma = new PrismaClient({datasourceUrl: env.DATABASE_URL});
  try {
    const info = await syncDatabase({prisma, schemaFile: env.NHCH_SCHEMA_JSON, backupDir: env.NHCH_BACKUP_DIR, log: (t) => console.log(t)});
    channel.send({type: 'synced', ...info});
  } finally {
    await prisma.$disconnect();
  }
  await import(pathToFileURL(env.NHCH_SERVER_ENTRY).href);
  dbModule = await import(pathToFileURL(path.join(path.dirname(env.NHCH_SERVER_ENTRY), 'db.js')).href);
}

main().catch(fatal);
