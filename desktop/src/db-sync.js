'use strict';
// Bổ sung cấu trúc còn thiếu cho database của phiên bản cũ để khớp bản phát hành
// (tương đương prisma db push cho các thay đổi không mất dữ liệu): tạo bảng, thêm cột, thêm/bỏ chỉ mục.
// Không xóa hay sửa dữ liệu; luôn sao lưu trước khi thay đổi.
const fs = require('node:fs');
const path = require('node:path');

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;
const sqlString = (text) => `'${String(text).replace(/'/g, "''")}'`;
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

async function planChanges(prisma, schema) {
  const rows = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
  const existing = new Set(rows.map((r) => r.name));
  const plan = [];
  for (const table of schema.tables) {
    if (!existing.has(table.name)) {
      plan.push({sql: table.sql, note: `tạo bảng ${table.name}`});
      continue;
    }
    const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info(${quote(table.name)})`);
    const have = new Set(columns.map((c) => c.name));
    for (const col of table.columns) {
      if (have.has(col.name)) continue;
      const def = col.dflt_value;
      if (col.pk || (col.notnull && def == null) || (def != null && /CURRENT_|\(/i.test(def))) {
        throw new Error(`Không tự bổ sung được cột ${table.name}.${col.name} cho dữ liệu cũ.`);
      }
      plan.push({
        sql: `ALTER TABLE ${quote(table.name)} ADD COLUMN ${quote(col.name)} ${col.type}${col.notnull ? ' NOT NULL' : ''}${def != null ? ` DEFAULT ${def}` : ''}`,
        note: `thêm cột ${table.name}.${col.name}`,
      });
    }
  }
  // Chỉ mục cũ không còn trong bản phát hành (ví dụ ràng buộc duy nhất đã được nới cho chế độ ôn luyện nhiều lượt)
  // phải bỏ đi như prisma db push, nếu không dữ liệu mới hợp lệ vẫn bị chặn.
  const wanted = new Set(schema.indexes.map((i) => i.name));
  const managed = new Set(schema.tables.map((t) => t.name));
  const indexes = await prisma.$queryRawUnsafe("SELECT name, tbl_name AS tableName FROM sqlite_master WHERE type='index' AND sql IS NOT NULL");
  for (const index of indexes) {
    if (managed.has(index.tableName) && !wanted.has(index.name)) plan.push({sql: `DROP INDEX ${quote(index.name)}`, note: `bỏ chỉ mục cũ ${index.name}`});
  }
  for (const index of schema.indexes) {
    if (!existing.has(index.name)) plan.push({sql: index.sql, note: `tạo chỉ mục ${index.name}`, optional: true});
  }
  return plan;
}

async function syncDatabase({prisma, schemaFile, backupDir, log}) {
  let schema = null;
  if (schemaFile && fs.existsSync(schemaFile)) schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  else log('[bỏ qua kiểm tra cấu trúc dữ liệu: chưa có schema.json]');
  const plan = schema ? await planChanges(prisma, schema) : [];
  let backup = '';
  if (plan.length) {
    fs.mkdirSync(backupDir, {recursive: true});
    backup = path.join(backupDir, `truoc-nang-cap-${stamp()}.db`);
    await prisma.$executeRawUnsafe(`VACUUM INTO ${sqlString(backup)}`);
    log(`[nâng cấp cấu trúc dữ liệu: ${plan.length} thay đổi, bản sao lưu trước nâng cấp: ${backup}]`);
    for (const step of plan) {
      try {
        await prisma.$executeRawUnsafe(step.sql);
        log(`  + ${step.note}`);
      } catch (err) {
        if (!step.optional) throw new Error(`Không ${step.note} được: ${err.message}. Dữ liệu trước nâng cấp: ${backup}`);
        log(`  ! bỏ qua ${step.note}: ${err.message}`);
      }
    }
  }
  let users = 0;
  try {
    const [row] = await prisma.$queryRawUnsafe('SELECT COUNT(*) AS n FROM "User"');
    users = Number(row.n);
  } catch { /* chưa có bảng người dùng */ }
  return {changes: plan.length, users, backup};
}

module.exports = {syncDatabase, planChanges, sqlString};
