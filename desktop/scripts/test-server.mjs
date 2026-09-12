// Kiểm thử máy chủ nội bộ của bản desktop bằng Node thường, không cần Electron:
// chạy server-host.js trên một bản sao database, gọi các API chính, thử sao lưu nóng và dừng an toàn.
//
//   node scripts/test-server.mjs                  kiểm thử bản gom trong build/app-server
//   node scripts/test-server.mjs --source         kiểm thử trực tiếp mã nguồn trong ../web
//   node scripts/test-server.mjs --db <tệp.db>    kiểm thử nâng cấp cấu trúc từ database phiên bản cũ
import {fork} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const useSource = args.includes('--source');
const oldDb = args[args.indexOf('--db') + 1];
const upgrade = args.includes('--db') && Boolean(oldDb);

const appServer = useSource ? path.join(path.dirname(desktop), 'web') : path.join(desktop, 'build', 'app-server');
const serverEntry = path.join(appServer, 'server', 'dist', 'index.js');
const schemaJson = path.join(desktop, 'build', 'schema.json');
const template = path.join(desktop, 'build', 'template.db');
const source = upgrade ? path.resolve(oldDb) : template;

for (const [file, hint] of [[serverEntry, 'Chạy "npm run prepare:app" trong thư mục desktop trước.'], [source, 'Không tìm thấy tệp database nguồn.']]) {
  if (!fs.existsSync(file)) {
    console.error(`Thiếu ${file}. ${hint}`);
    process.exit(1);
  }
}

const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const {port} = probe.address();
    probe.close(() => resolve(port));
  });
});

// Thư mục làm việc có dấu cách và chữ tiếng Việt để chắc chắn đường dẫn khó vẫn chạy được.
const work = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nhdt-test-')), 'dữ liệu kiểm thử');
fs.mkdirSync(work, {recursive: true});
const dbPath = path.join(work, 'ngân hàng.db');
fs.copyFileSync(source, dbPath);

const port = await freePort();
const env = {
  ...process.env,
  NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
  DATABASE_URL: `file:${dbPath.replace(/\\/g, '/')}`,
  JWT_SECRET: 'kiem-thu-khong-dung-cho-van-hanh-that-0123456789',
  AI_MODE: 'demo', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1',
  NHCH_SERVER_ENTRY: serverEntry, NHCH_SCHEMA_JSON: schemaJson, NHCH_BACKUP_DIR: path.join(work, 'backups'),
};

const require = createRequire(serverEntry);
const {PrismaClient} = require('@prisma/client');
async function query(sql) {
  const prisma = new PrismaClient({datasourceUrl: env.DATABASE_URL});
  try { return await prisma.$queryRawUnsafe(sql); } finally { await prisma.$disconnect(); }
}
const count = async (table) => Number((await query(`SELECT COUNT(*) AS n FROM "${table}"`))[0].n);
const before = upgrade ? {questions: await count('Question'), users: await count('User'), exams: await count('Exam'), attempts: await count('Attempt')} : null;

const child = fork(path.join(desktop, 'server-host.js'), [], {cwd: work, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
let log = '';
child.stdout.on('data', (d) => { log += d; });
child.stderr.on('data', (d) => { log += d; });
const messages = [];
child.on('message', (m) => messages.push(m));
const exited = new Promise((resolve) => child.on('exit', resolve));

const base = `http://127.0.0.1:${port}`;
let passed = 0;
const ok = (cond, label) => {
  if (!cond) throw new Error(`HỎNG: ${label}`);
  passed++;
  console.log('  đạt · ' + label);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = async (url, options = {}) => {
  const r = await fetch(base + url, options);
  return {status: r.status, body: await r.json()};
};
const bytes = async (url, options = {}) => {
  const r = await fetch(base + url, options);
  return {status: r.status, buffer: Buffer.from(await r.arrayBuffer())};
};
function ask(type, payload) {
  const id = Date.now() + Math.random();
  return new Promise((resolve, reject) => {
    const onMessage = (m) => {
      if (m.type !== 'reply' || m.id !== id) return;
      child.off('message', onMessage);
      if (m.ok) resolve(m.result); else reject(new Error(m.error));
    };
    child.on('message', onMessage);
    child.send({type, id, ...payload});
  });
}
async function waitHealthy() {
  const start = Date.now();
  while (Date.now() - start < 90000) {
    const fatal = messages.find((m) => m.type === 'fatal');
    if (fatal) throw new Error(`máy chủ báo lỗi: ${fatal.message}`);
    if (child.exitCode !== null) throw new Error('máy chủ dừng khi đang khởi động');
    try { if ((await fetch(`${base}/api/health`)).ok) return Date.now() - start; } catch { /* chờ tiếp */ }
    await sleep(200);
  }
  throw new Error('quá thời gian chờ máy chủ khởi động');
}

console.log(`Kiểm thử máy chủ nội bộ (${useSource ? 'mã nguồn ../web' : 'bản gom build/app-server'}${upgrade ? ', nâng cấp database cũ' : ''})`);
try {
  const ms = await waitHealthy();
  ok(true, `máy chủ sẵn sàng sau ${ms} ms, đường dẫn dữ liệu có dấu cách và tiếng Việt`);
  const synced = messages.find((m) => m.type === 'synced');
  ok(Boolean(synced), 'đã kiểm tra cấu trúc database trước khi mở máy chủ');

  const html = await (await fetch(`${base}/`)).text();
  ok(html.includes('<div id="root">'), 'phục vụ giao diện React');
  const asset = html.match(/src="(\/assets\/[^"]+\.js)"/);
  ok(asset && (await fetch(base + asset[1])).status === 200, 'phục vụ tệp JavaScript của giao diện');

  if (upgrade) {
    ok(synced.changes > 0, `đã bổ sung ${synced.changes} thay đổi cấu trúc cho database cũ`);
    ok(fs.existsSync(synced.backup), 'đã sao lưu trước khi nâng cấp cấu trúc');
  } else {
    ok(synced.changes === 0, 'database mới không cần nâng cấp cấu trúc');
  }

  if (synced.users > 0) {
    const tokens = {};
    for (const username of ['admin', 'giaovien', 'hocvien']) {
      const r = await json('/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, password: '123456'})});
      if (r.status === 200) tokens[username] = r.body.token;
    }
    if (!upgrade) ok(Object.keys(tokens).length === 3, 'ba tài khoản trình diễn đăng nhập được (bcrypt + JWT)');
    const token = tokens.admin || tokens.giaovien;
    if (token) {
      const headers = {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'};
      const questions = await json('/api/questions?page=1&pageSize=25', {headers});
      ok(questions.status === 200 && typeof questions.body.total === 'number', `ngân hàng câu hỏi trả về ${questions.body.total} câu`);
      ok((await json('/api/stats', {headers})).status === 200, 'thống kê');
      ok((await json('/api/analysis/questions', {headers})).status === 200, 'phân tích câu hỏi');
      for (const format of ['xlsx', 'docx']) {
        const r = await bytes(`/api/questions?format=${format}`, {headers});
        ok(r.status === 200 && r.buffer.subarray(0, 2).toString() === 'PK', `xuất ngân hàng câu hỏi ra ${format} (${r.buffer.length} byte)`);
      }
      const document = 'Quân đội nhân dân Việt Nam được thành lập ngày 22/12/1944. Đội Việt Nam Tuyên truyền Giải phóng quân là tổ chức tiền thân của Quân đội nhân dân Việt Nam. Giáo dục truyền thống cần gắn với trách nhiệm thực hiện nhiệm vụ của mỗi quân nhân. Quân nhân cần đoàn kết, giúp đỡ đồng đội cùng tiến bộ và giữ gìn mối quan hệ gắn bó với nhân dân.';
      const ai = await json('/api/ai/generate', {method: 'POST', headers, body: JSON.stringify({document, topic: 'Truyền thống Quân đội nhân dân Việt Nam', audience: 'Học viên', count: 3, type: 'SINGLE', level: 'Nhận biết', extra: ''})});
      ok(ai.status === 200 && ai.body.questions.length === 3, 'trợ lý AI chế độ DEMO tạo được 3 câu hỏi');
      const exams = await json('/api/exams', {headers});
      ok(exams.status === 200 && Array.isArray(exams.body), `danh sách đề kiểm tra (${exams.body.length} đề)`);
      if (exams.body.length) {
        const r = await bytes(`/api/exams/${exams.body[0].id}/export`, {headers});
        ok(r.status === 200 && r.buffer.subarray(0, 2).toString() === 'PK', 'xuất đề kiểm tra ra Word');
      }
    }
  }

  const target = path.join(work, 'bản sao lưu.db');
  await ask('backup', {target});
  ok(fs.readFileSync(target).subarray(0, 15).toString() === 'SQLite format 3', 'sao lưu nóng bằng VACUUM INTO khi máy chủ đang chạy');

  child.send({type: 'shutdown'});
  ok(await exited === 0, 'dừng máy chủ an toàn, mã thoát 0');

  if (upgrade) {
    const {planChanges} = require(path.join(desktop, 'src', 'db-sync.js'));
    const prisma = new PrismaClient({datasourceUrl: env.DATABASE_URL});
    const plan = await planChanges(prisma, JSON.parse(fs.readFileSync(schemaJson, 'utf8')));
    await prisma.$disconnect();
    ok(plan.length === 0, `cấu trúc đã khớp bản phát hành ${JSON.stringify(plan.map((p) => p.note))}`);
    const after = {questions: await count('Question'), users: await count('User'), exams: await count('Exam'), attempts: await count('Attempt')};
    ok(JSON.stringify(after) === JSON.stringify(before), `giữ nguyên dữ liệu cũ ${JSON.stringify(after)}`);
  }

  fs.renameSync(dbPath, `${dbPath}.da-giai-phong`);
  ok(true, 'tệp database được giải phóng sau khi dừng');

  console.log(`\nĐẠT toàn bộ ${passed} kiểm tra.`);
  fs.rmSync(path.dirname(work), {recursive: true, force: true});
} catch (err) {
  console.error(`\n${err.message}\n--- nhật ký máy chủ ---\n${log.slice(-3000)}`);
  console.error(`Thư mục kiểm thử giữ lại để xem: ${work}`);
  child.kill();
  process.exitCode = 1;
}
