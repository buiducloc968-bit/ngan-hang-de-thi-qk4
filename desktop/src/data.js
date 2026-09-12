'use strict';
// Thao tác trên tệp SQLite: kiểm tra, sao chép an toàn, khởi tạo từ bản mẫu.
const fs = require('node:fs');
const path = require('node:path');

const SQLITE_HEADER = Buffer.from('53514c69746520666f726d6174203300', 'hex'); // "SQLite format 3" + byte 0

function isSqlite(file) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(16);
      return fs.readSync(fd, buf, 0, 16, 0) === 16 && buf.equals(SQLITE_HEADER);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

const toDatabaseUrl = (file) => `file:${path.resolve(file).replace(/\\/g, '/')}`;

// Chép tệp dữ liệu kèm nhật ký SQLite (nếu có). Ghi qua tệp tạm để lỗi giữa chừng không làm hỏng tệp đích.
function copyDatabase(from, to) {
  fs.mkdirSync(path.dirname(to), {recursive: true});
  const tmp = `${to}.tmp-${process.pid}`;
  fs.copyFileSync(from, tmp);
  for (const suffix of ['-journal', '-wal', '-shm']) fs.rmSync(to + suffix, {force: true});
  fs.renameSync(tmp, to);
  for (const suffix of ['-journal', '-wal']) if (fs.existsSync(from + suffix)) fs.copyFileSync(from + suffix, to + suffix);
}

// Trả về true nếu vừa tạo tệp dữ liệu mới từ bản mẫu (cấu trúc mới nhất + tài khoản trình diễn).
function ensureDatabase(dbPath, paths) {
  if (fs.existsSync(dbPath)) {
    if (!isSqlite(dbPath)) throw new Error(`Tệp dữ liệu không hợp lệ: ${dbPath}`);
    return false;
  }
  if (!fs.existsSync(paths.templateDb)) {
    throw new Error(paths.packaged
      ? 'Thiếu dữ liệu khởi tạo (template.db). Hãy cài đặt lại phần mềm.'
      : `Chưa có tệp dữ liệu ${dbPath}. Chạy "npm start" trong thư mục desktop để tạo dữ liệu mẫu.`);
  }
  copyDatabase(paths.templateDb, dbPath);
  return true;
}

module.exports = {isSqlite, stamp, samePath, toDatabaseUrl, copyDatabase, ensureDatabase};
