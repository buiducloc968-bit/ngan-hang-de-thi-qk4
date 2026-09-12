// Chuẩn bị bản desktop từ ứng dụng web trong thư mục web/:
//   1. build giao diện React và máy chủ Express (npm run build trong web/)
//   2. tạo database mẫu (cấu trúc mới nhất + dữ liệu trình diễn) và schema.json để nâng cấp dữ liệu cũ
//   3. gom máy chủ cùng các gói production vào build/app-server để đóng gói
// node scripts/prepare.mjs         -> đầy đủ, dùng trước khi đóng gói
// node scripts/prepare.mjs --dev   -> chỉ build lại phần đã thay đổi, bỏ bước 3
// Thêm --rebuild để buộc làm lại toàn bộ.
import {execFileSync, execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(path.dirname(desktop), 'web'); // mã nguồn ứng dụng web
const build = path.join(desktop, 'build');
const dev = process.argv.includes('--dev');
const force = process.argv.includes('--rebuild');
const win = process.platform === 'win32';
const env = {...process.env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1'};
const at = (p) => path.join(root, p);

const step = (text) => console.log(`\n> ${text}`);
function fail(text) {
  console.error(`\nLỖI: ${text}`);
  process.exit(1);
}
// Thời điểm sửa mới nhất trong một tệp hoặc thư mục (bỏ qua node_modules).
function newest(target) {
  if (!fs.existsSync(target)) return 0;
  const st = fs.statSync(target);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = 0;
  for (const e of fs.readdirSync(target, {withFileTypes: true})) {
    if (e.name !== 'node_modules') max = Math.max(max, newest(path.join(target, e.name)));
  }
  return max;
}
const oldest = (...files) => Math.min(...files.map((f) => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0)));

if (!fs.existsSync(at('node_modules/.prisma/client/index.js'))) {
  fail('Ứng dụng web chưa được cài đặt. Chạy CAI-DAT-VA-CHAY.bat ở thư mục gốc (hoặc "npm install" rồi "npm run setup" trong thư mục web) trước.');
}

// 1. Build web app
const webOutputs = [at('server/dist/index.js'), at('client/dist/index.html')];
const webSources = ['client/src', 'client/public', 'client/index.html', 'server/src'].map((p) => newest(at(p)));
if (!dev || force || oldest(...webOutputs) < Math.max(...webSources)) {
  step('Build giao diện và máy chủ (npm run build)');
  execSync('npm run build', {cwd: root, stdio: 'inherit', env});
} else {
  console.log('> Bản build web app đã mới nhất.');
}

// 2. Database mẫu và mô tả cấu trúc
const schemaPrisma = at('server/prisma/schema.prisma');
const template = path.join(build, 'template.db');
const schemaJson = path.join(build, 'schema.json');
if (!dev || force || oldest(template, schemaJson) < Math.max(newest(schemaPrisma), newest(at('server/prisma/seed.ts')))) {
  step('Tạo database mẫu: cấu trúc mới nhất + dữ liệu trình diễn');
  fs.mkdirSync(build, {recursive: true});
  const tmp = path.join(build, 'template.tmp.db');
  for (const f of [tmp, `${tmp}-journal`]) fs.rmSync(f, {force: true});
  const dbEnv = {...env, DATABASE_URL: `file:${tmp.replace(/\\/g, '/')}`};
  execFileSync(process.execPath, [at('node_modules/prisma/build/index.js'), 'db', 'push', '--schema', schemaPrisma, '--skip-generate'], {env: dbEnv, stdio: 'inherit'});
  execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {cwd: at('server'), env: dbEnv, stdio: 'inherit'});
  const {PrismaClient} = createRequire(at('server/package.json'))('@prisma/client');
  const db = new PrismaClient({datasourceUrl: dbEnv.DATABASE_URL});
  try {
    const schema = {tables: [], indexes: []};
    const tables = await db.$queryRawUnsafe("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY rootpage");
    for (const t of tables) {
      const columns = await db.$queryRawUnsafe(`PRAGMA table_info("${t.name}")`);
      schema.tables.push({
        name: t.name,
        sql: t.sql,
        columns: columns.map((c) => ({name: c.name, type: c.type, notnull: Number(c.notnull), dflt_value: c.dflt_value, pk: Number(c.pk)})),
      });
    }
    schema.indexes = await db.$queryRawUnsafe("SELECT name, tbl_name AS tableName, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name");
    fs.writeFileSync(schemaJson, `${JSON.stringify(schema, null, 2)}\n`);
    const [{n}] = await db.$queryRawUnsafe('SELECT COUNT(*) AS n FROM "Question"');
    console.log(`  ${schema.tables.length} bảng, ${schema.indexes.length} chỉ mục, ${Number(n)} câu hỏi mẫu`);
  } finally {
    await db.$disconnect();
  }
  fs.rmSync(template, {force: true});
  fs.renameSync(tmp, template);
} else {
  console.log('> Database mẫu đã mới nhất.');
}

// 3. Gom máy chủ chạy kèm cho bản đóng gói
if (!dev) {
  step('Gom máy chủ chạy kèm vào build/app-server');
  const out = path.join(build, 'app-server');
  fs.rmSync(out, {recursive: true, force: true});
  const junk = /\.(map|d\.ts|d\.mts|d\.cts|md|markdown)$/i;
  const copy = (from, to, keep = () => true) => fs.cpSync(from, to, {recursive: true, filter: (src) => !junk.test(src) && keep(src)});

  copy(at('server/dist'), path.join(out, 'server/dist'));
  copy(at('client/dist'), path.join(out, 'client/dist'));
  const serverPkg = JSON.parse(fs.readFileSync(at('server/package.json'), 'utf8'));
  fs.writeFileSync(path.join(out, 'server/package.json'), `${JSON.stringify({name: serverPkg.name, version: serverPkg.version, private: true, type: 'module'}, null, 2)}\n`);

  // Chỉ chép các gói production máy chủ cần (kể cả phụ thuộc gián tiếp), giữ nguyên cấu trúc node_modules.
  const findPackage = (name, fromDir) => {
    for (let dir = fromDir; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'node_modules', name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
      if (dir === root || !dir.startsWith(root)) return null;
    }
  };
  const copied = new Set();
  const missing = [];
  const visit = (name, fromDir, optional) => {
    const dir = findPackage(name, fromDir);
    if (!dir) {
      if (!optional) missing.push(`${name} (cần bởi ${path.relative(root, fromDir) || 'server'})`);
      return;
    }
    if (copied.has(dir)) return;
    copied.add(dir);
    const nested = path.join(dir, 'node_modules');
    copy(dir, path.join(out, path.relative(root, dir)), (src) => src !== nested && !src.startsWith(nested + path.sep));
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const dep of Object.keys(pkg.dependencies || {})) visit(dep, dir, false);
    for (const dep of Object.keys(pkg.optionalDependencies || {})) visit(dep, dir, true);
  };
  for (const dep of Object.keys(serverPkg.dependencies)) visit(dep, at('server'), false);
  if (missing.length) fail(`Thiếu gói: ${missing.join(', ')}. Chạy "npm install" trong thư mục web.`);
  copy(at('node_modules/.prisma'), path.join(out, 'node_modules/.prisma'));
  // Máy chủ dùng query engine dạng thư viện gốc (.node) qua runtime/library.js;
  // bỏ các engine wasm/edge của Prisma cho những hệ CSDL khác (~58 MB).
  const prismaRuntime = path.join(out, 'node_modules/@prisma/client/runtime');
  for (const f of fs.readdirSync(prismaRuntime)) if (/^query_(engine|compiler)_bg\./.test(f)) fs.rmSync(path.join(prismaRuntime, f));
  fs.rmSync(path.join(out, 'node_modules/.prisma/client/query_engine_bg.wasm'), {force: true});

  const size = (p) => {
    const st = fs.statSync(p);
    return st.isDirectory() ? fs.readdirSync(p).reduce((sum, n) => sum + size(path.join(p, n)), 0) : st.size;
  };
  console.log(`  ${copied.size} gói, ${(size(out) / 1048576).toFixed(1)} MB`);
}

console.log('\nĐã chuẩn bị xong bản desktop.');
