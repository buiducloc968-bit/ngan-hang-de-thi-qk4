// Kiểm thử ứng dụng desktop thật qua Chrome DevTools Protocol: mở cửa sổ, đăng nhập, mở các trang,
// mở cửa sổ Cài đặt, lưu cài đặt AI rồi thoát. Ảnh chụp màn hình được lưu lại để đối chiếu.
//
//   node scripts/test-app.mjs               chạy từ mã nguồn
//   node scripts/test-app.mjs --packaged    chạy bản đã đóng gói trong release/win-unpacked
//
// Kiểm thử luôn dùng một bản sao database trong thư mục tạm; nếu thư mục cấu hình thật đã tồn tại
// thì dừng lại để không đụng vào dữ liệu đang dùng.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packaged = process.argv.includes('--packaged');
const RENDERER_PORT = 9333;
const MAIN_PORT = 9334;

function appDataDir(name) {
  if (process.platform === 'win32') return path.join(process.env.APPDATA, name);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', name);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), name);
}

function electronExecutable() {
  const dir = path.join(desktop, 'node_modules', 'electron');
  const file = path.join(dir, 'path.txt');
  if (!fs.existsSync(file)) return null;
  return path.join(dir, 'dist', fs.readFileSync(file, 'utf8').trim());
}

const exe = packaged
  ? path.join(desktop, 'release', 'win-unpacked', 'NganHangDeThi.exe')
  : electronExecutable();
const template = packaged
  ? path.join(desktop, 'release', 'win-unpacked', 'resources', 'template.db')
  : path.join(desktop, 'build', 'template.db');
const userData = appDataDir(packaged ? 'NganHangDeThi' : 'NganHangDeThi-dev');

if (!exe || !fs.existsSync(exe)) {
  console.error(`Thiếu tệp chạy ${exe}. ${packaged ? 'Chạy "npm run dist" trước.' : 'Chạy "npm start" hoặc "node scripts/ensure-electron.mjs" trước.'}`);
  process.exit(1);
}
if (!fs.existsSync(template)) {
  console.error(`Thiếu database mẫu ${template}. Chạy "npm run prepare:app" trước.`);
  process.exit(1);
}
if (fs.existsSync(userData)) {
  console.error(`Thư mục ${userData} đã tồn tại. Đóng phần mềm và chuyển thư mục này đi nơi khác rồi chạy lại, để kiểm thử không đụng vào dữ liệu thật.`);
  process.exit(2);
}
for (const port of [RENDERER_PORT, MAIN_PORT]) {
  const busy = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(true));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(false)));
  });
  if (busy) {
    console.error(`Cổng ${port} đang bận nên không gắn được công cụ kiểm thử. Đóng chương trình đang dùng cổng này rồi chạy lại.`);
    process.exit(1);
  }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nhdt-app-'));
const db = path.join(work, 'dữ liệu kiểm thử.db');
fs.copyFileSync(template, db);
fs.mkdirSync(userData, {recursive: true});
fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({databasePath: db}));

const args = [...(packaged ? [] : [desktop]), `--remote-debugging-port=${RENDERER_PORT}`, `--inspect=${MAIN_PORT}`];
const child = spawn(exe, args, {cwd: desktop, stdio: ['ignore', 'pipe', 'pipe']});
let output = '';
child.stdout.on('data', (d) => { output += d; });
child.stderr.on('data', (d) => { output += d; });
const exited = new Promise((resolve) => child.on('exit', resolve));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const targets = async (port) => {
  try { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { return []; }
};
async function waitFor(fn, timeout, label) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await fn(); if (value) return value; } catch { /* thử lại */ }
    await sleep(300);
  }
  throw new Error(`quá thời gian chờ: ${label}`);
}
class Session {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const {resolve, reject} = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    };
    this.open = new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({id, method, params}));
    return new Promise((resolve, reject) => this.pending.set(id, {resolve, reject}));
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true});
    if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description || ''}`);
    return r.result.value;
  }
  async screenshot(name) {
    const r = await this.send('Page.captureScreenshot', {format: 'png'});
    fs.writeFileSync(path.join(work, name), Buffer.from(r.data, 'base64'));
  }
  close() { try { this.ws.close(); } catch { /* đã đóng */ } }
}
let passed = 0;
const ok = (cond, label) => {
  if (!cond) throw new Error(`HỎNG: ${label}`);
  passed++;
  console.log('  đạt · ' + label);
};
const fillInput = (selector, value) => `(()=>{const el=document.querySelector(${JSON.stringify(selector)});const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`;

console.log(`Kiểm thử ứng dụng desktop (${packaged ? 'bản đã đóng gói' : 'chạy từ mã nguồn'})`);
try {
  const started = Date.now();
  const page = await waitFor(async () => (await targets(RENDERER_PORT)).find((t) => t.type === 'page' && /^http:\/\/localhost:\d+\//.test(t.url)), 120000, 'cửa sổ chính mở giao diện từ máy chủ nội bộ');
  ok(true, `cửa sổ chính mở ${page.url} sau ${Date.now() - started} ms`);
  const web = new Session(page.webSocketDebuggerUrl);
  await web.open;

  await waitFor(() => web.eval("!!document.querySelector('.login-card form')"), 30000, 'trang đăng nhập');
  ok(true, 'hiển thị trang đăng nhập');
  ok(await web.eval('window.desktopApp && window.desktopApp.isDesktop === true'), 'cầu nối desktop được nạp');
  ok(await web.eval("window.print.toString().includes('desktopApp')"), 'window.print chuyển sang hộp thoại In / Lưu PDF của bản desktop');
  ok(await web.eval("typeof require === 'undefined' && typeof process === 'undefined'"), 'giao diện không truy cập được Node.js (sandbox)');
  await web.screenshot('1-dang-nhap.png');

  await web.eval(fillInput('.login-card input[autocomplete="username"]', 'admin'));
  await web.eval(fillInput('.login-card input[type="password"]', '123456'));
  await web.eval("document.querySelector('.login-card form button.primary').click(); true");
  await waitFor(() => web.eval("!!document.querySelector('aside nav')"), 30000, 'không gian làm việc');
  ok(true, 'đăng nhập quản trị viên qua máy chủ nội bộ');
  const questions = await waitFor(() => web.eval("(()=>{const s=document.querySelector('.stat-card strong');return s&&/\\d/.test(s.textContent)?s.textContent:''})()"), 20000, 'số liệu trang chủ');
  ok(questions === '35', `trang chủ hiển thị ${questions} câu hỏi`);
  await web.screenshot('2-trang-chu.png');

  await web.eval("[...document.querySelectorAll('aside nav button')].find(b=>b.textContent.includes('Ngân hàng câu hỏi')).click(); true");
  const rows = await waitFor(() => web.eval("document.querySelectorAll('table tbody tr').length"), 20000, 'bảng câu hỏi');
  ok(rows === 25, `ngân hàng câu hỏi hiển thị ${rows} dòng ở trang đầu`);
  await web.screenshot('3-ngan-hang.png');

  await web.eval("[...document.querySelectorAll('aside nav button')].find(b=>b.textContent.includes('Kết quả kiểm tra')).click(); true");
  await waitFor(() => web.eval("document.querySelector('.page-title h1') && document.querySelector('.page-title h1').textContent === 'Kết quả kiểm tra'"), 20000, 'trang Kết quả kiểm tra');
  ok(true, 'mở được trang Kết quả kiểm tra');

  // Tạo một bài làm thật qua API để kiểm tra nút xuất bảng điểm (nút chỉ hiện khi đã có bài làm).
  const submitted = await web.eval(`(async()=>{
    const login=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'hocvien',password:'123456'})}).then(r=>r.json());
    const h={'Content-Type':'application/json',Authorization:'Bearer '+login.token};
    const exams=await fetch('/api/exams',{headers:h}).then(r=>r.json());
    const attempt=await fetch('/api/exams/'+exams[0].id+'/start',{method:'POST',headers:h}).then(r=>r.json());
    const answers={};attempt.questions.forEach((q,i)=>{answers[i]=q.type==='SHORT'?'Bài làm kiểm thử':[0]});
    const done=await fetch('/api/attempts/'+attempt.id+'/answers',{method:'PUT',headers:h,body:JSON.stringify({answers,submit:true})}).then(r=>r.json());
    return done.status;
  })()`);
  ok(['PENDING', 'GRADED'].includes(submitted), `học viên nộp được bài qua máy chủ nội bộ (trạng thái ${submitted})`);

  await web.eval("[...document.querySelectorAll('aside nav button')].find(b=>b.textContent.includes('Trang chủ')).click(); true");
  await sleep(300);
  await web.eval("[...document.querySelectorAll('aside nav button')].find(b=>b.textContent.includes('Kết quả kiểm tra')).click(); true");
  const exportButton = await waitFor(() => web.eval("(()=>{const b=[...document.querySelectorAll('.page-title button')].find(x=>x.textContent.includes('Xuất bảng điểm'));return b?b.textContent:''})()"), 20000, 'nút xuất bảng điểm');
  ok(exportButton.includes('Excel'), `trang Kết quả hiện nút "${exportButton}" khi đã có bài làm`);
  ok(await web.eval("document.querySelectorAll('table tbody tr').length") === 1, 'bảng kết quả hiện bài vừa nộp');
  await web.screenshot('4-ket-qua.png');

  await web.eval("[...document.querySelectorAll('aside nav button')].find(b=>b.textContent.includes('Tạo đề kiểm tra')).click(); true");
  await waitFor(() => web.eval("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Xem trước / Xuất đề'))"), 20000, 'danh sách đề kiểm tra');
  await web.screenshot('5-de-kiem-tra.png');

  // Xem trước đề: nơi tạo mã đề thi giấy và nhập bài thi giấy
  await web.eval("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Xem trước / Xuất đề')).click(); true");
  await waitFor(() => web.eval("(()=>{const h=document.querySelector('dialog[open] .modal-head h2');return h&&h.textContent.includes('Xem trước')})()"), 20000, 'cửa sổ xem trước đề');
  ok(await web.eval("[...document.querySelectorAll('dialog[open] .section-heading p')].some(p=>p.textContent.includes('Nhập bài thi giấy'))"), 'xem trước đề có mục Nhập bài thi giấy');
  ok(await web.eval("document.querySelectorAll('dialog[open] form select').length >= 2"), 'mục nhập bài giấy có ô chọn học viên và mã đề');
  await web.screenshot('6-nhap-bai-thi-giay.png');
  await web.eval("document.querySelector('dialog[open] .modal-head button.icon').click(); true");
  await sleep(500);

  // Tiến trình chính: mở cửa sổ Cài đặt bằng menu
  const mainTarget = await waitFor(async () => (await targets(MAIN_PORT))[0], 15000, 'trình gỡ lỗi tiến trình chính');
  const main = new Session(mainTarget.webSocketDebuggerUrl);
  await main.open;
  const labels = await main.eval("require('electron').Menu.getApplicationMenu().items.map(i=>i.label).join(' | ')");
  ok(labels.includes('Tệp') && labels.includes('Công cụ'), `menu tiếng Việt: ${labels}`);
  await main.eval("require('electron').Menu.getApplicationMenu().items[0].submenu.items.find(i=>i.label.startsWith('Cài đặt')).click(); true");
  const settingsTarget = await waitFor(async () => (await targets(RENDERER_PORT)).find((t) => t.type === 'page' && t.url.endsWith('settings.html')), 15000, 'cửa sổ Cài đặt');
  const settings = new Session(settingsTarget.webSocketDebuggerUrl);
  await settings.open;
  const shownDb = await waitFor(() => settings.eval("document.getElementById('db-path').value"), 10000, 'nội dung cửa sổ Cài đặt');
  ok(shownDb === db, 'cửa sổ Cài đặt hiển thị đúng tệp dữ liệu đang dùng');
  ok(await settings.eval("document.getElementById('server-note').textContent.includes('localhost')"), 'cửa sổ Cài đặt cho biết máy chủ nội bộ đang chạy');
  await settings.screenshot('5-cai-dat.png');

  await settings.eval("document.querySelector('input[name=mode][value=openai]').click(); document.getElementById('ai-form').requestSubmit(); true");
  const refused = await waitFor(() => settings.eval("(()=>{const s=document.getElementById('status');return !s.hidden&&s.classList.contains('error')?s.textContent:''})()"), 10000, 'thông báo thiếu khóa API');
  ok(refused.includes('cần khóa API'), `chặn bật OpenAI khi chưa có khóa: "${refused}"`);

  await settings.eval("document.querySelector('input[name=mode][value=demo]').click(); document.getElementById('model').value='gpt-4.1-mini'; document.getElementById('ai-form').requestSubmit(); true");
  const saved = await waitFor(() => settings.eval("(()=>{const s=document.getElementById('status');return !s.hidden&&!s.classList.contains('error')&&s.textContent.startsWith('Đã lưu')?s.textContent:''})()"), 60000, 'lưu cài đặt AI');
  ok(Boolean(saved), `lưu cài đặt AI: "${saved}"`);
  await sleep(1000);
  const current = (await targets(RENDERER_PORT)).find((t) => t.id === page.id);
  ok(current && current.url.startsWith(page.url.replace(/\/$/, '')), 'cửa sổ chính giữ nguyên địa chỉ sau khi lưu cài đặt');
  ok(await web.eval("fetch('/api/me',{headers:{Authorization:'Bearer '+sessionStorage.getItem('token')}}).then(r=>r.status)") === 200, 'người dùng không bị đăng xuất sau khi lưu cài đặt');
  ok((await web.eval("fetch('/api/meta',{headers:{Authorization:'Bearer '+sessionStorage.getItem('token')}}).then(r=>r.json())")).aiMode === 'demo', 'máy chủ báo đúng chế độ AI vừa lưu');

  const config = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  ok(config.ai && config.ai.mode === 'demo' && typeof config.jwtSecret === 'string' && config.jwtSecret.length >= 64, 'config.json lưu chế độ AI và khóa ký phiên riêng của máy');

  settings.close();
  web.close();
  await main.eval("require('electron').BrowserWindow.getAllWindows().forEach(w=>w.close()); true").catch(() => {});
  main.close();
  const code = await Promise.race([exited, sleep(30000).then(() => 'timeout')]);
  ok(code !== 'timeout', `đóng cửa sổ thì ứng dụng thoát hẳn (mã ${code})`);
  const serverLog = fs.readFileSync(path.join(userData, 'logs', 'server.log'), 'utf8');
  ok((serverLog.match(/^===== /gm) || []).length === 1, 'lưu cài đặt AI không phải khởi động lại máy chủ');
  ok(/máy chủ nội bộ dừng, mã 0/.test(serverLog), 'máy chủ nội bộ dừng an toàn khi thoát');
  const backupDir = path.join(userData, 'backups');
  const backups = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter((f) => f.startsWith('tu-dong-')) : [];
  ok(backups.length === 1 && fs.readFileSync(path.join(backupDir, backups[0])).subarray(0, 15).toString() === 'SQLite format 3', `tự động sao lưu khi thoát (${backups.join(', ')})`);

  console.log(`\nĐẠT toàn bộ ${passed} kiểm tra. Ảnh chụp màn hình: ${work}`);
} catch (err) {
  console.error(`\n${err.message}\n--- đầu ra của Electron ---\n${output.slice(-3000)}`);
  const serverLog = path.join(userData, 'logs', 'server.log');
  if (fs.existsSync(serverLog)) console.error(`--- nhật ký máy chủ ---\n${fs.readFileSync(serverLog, 'utf8').slice(-2000)}`);
  console.error(`Thư mục kiểm thử giữ lại để xem: ${work}`);
  process.exitCode = 1;
  child.kill();
  await Promise.race([exited, sleep(5000)]);
} finally {
  // Trả máy về nguyên trạng: thư mục cấu hình do kiểm thử tạo ra được chép lại rồi xóa đi.
  if (fs.existsSync(userData)) {
    fs.cpSync(userData, path.join(work, 'userData'), {recursive: true});
    fs.rmSync(userData, {recursive: true, force: true});
  }
}
