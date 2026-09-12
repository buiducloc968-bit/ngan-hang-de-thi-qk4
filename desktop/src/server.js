'use strict';
// Quản lý máy chủ nội bộ: chọn cổng, khởi động tiến trình con, chờ sẵn sàng, dừng an toàn.
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {utilityProcess} = require('electron');
const {ensureDatabase, toDatabaseUrl} = require('./data');

const START_TIMEOUT = 90 * 1000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

function randomPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const {port} = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

class ServerManager extends EventEmitter {
  constructor(paths, config) {
    super();
    this.paths = paths;
    this.config = config;
    this.child = null;
    this.port = null;
    this.ready = false;
    this.stopping = false;
    this.starting = null;
    this.fatal = '';
    this.dbInfo = null;
    this.pending = new Map();
    this.seq = 0;
  }

  get url() { return `http://localhost:${this.port}`; }

  get logFile() { return path.join(this.paths.logDir, 'server.log'); }

  log(text) {
    try {
      fs.mkdirSync(this.paths.logDir, {recursive: true});
      fs.appendFileSync(this.logFile, text);
    } catch { /* không ghi được nhật ký thì bỏ qua */ }
  }

  start() {
    if (this.child && this.ready) return Promise.resolve(this.url);
    if (!this.starting) this.starting = this.spawn().finally(() => { this.starting = null; });
    return this.starting;
  }

  async spawn() {
    const {paths, config} = this;
    for (const file of [paths.serverEntry, paths.clientIndex, paths.hostScript]) {
      if (!fs.existsSync(file)) {
        throw new Error(`Thiếu tệp ${file}. ${paths.packaged ? 'Hãy cài đặt lại phần mềm.' : 'Chạy "npm start" trong thư mục desktop để build lại.'}`);
      }
    }
    const dbPath = config.databasePath;
    if (ensureDatabase(dbPath, paths)) this.log(`[đã tạo tệp dữ liệu mới từ bản mẫu: ${dbPath}]\n`);
    this.port = await this.choosePort();
    try { if (fs.statSync(this.logFile).size > 2 * 1024 * 1024) fs.renameSync(this.logFile, `${this.logFile}.1`); } catch { /* chưa có nhật ký */ }
    this.log(`\n===== ${new Date().toLocaleString('vi-VN')} · cổng ${this.port} · dữ liệu ${dbPath} =====\n`);

    const ai = config.ai;
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(this.port),
      DATABASE_URL: toDatabaseUrl(dbPath),
      JWT_SECRET: config.jwtSecret,
      AI_MODE: ai.mode,
      OPENAI_API_KEY: ai.apiKey,
      OPENAI_MODEL: ai.model,
      CHECKPOINT_DISABLE: '1',
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
      NHCH_SERVER_ENTRY: paths.serverEntry,
      NHCH_SCHEMA_JSON: paths.schemaJson,
      NHCH_BACKUP_DIR: paths.backupDir,
    };
    delete env.ELECTRON_RUN_AS_NODE;

    const child = utilityProcess.fork(paths.hostScript, [], {serviceName: 'NganHangDeThi Server', stdio: 'pipe', cwd: paths.userData, env});
    this.child = child;
    this.ready = false;
    this.stopping = false;
    this.fatal = '';
    this.dbInfo = null;
    let stderrTail = '';
    if (child.stdout) child.stdout.on('data', (d) => this.log(String(d)));
    if (child.stderr) child.stderr.on('data', (d) => { stderrTail = (stderrTail + d).slice(-2000); this.log(String(d)); });

    let failStartup = () => {};
    const failed = new Promise((_, reject) => { failStartup = reject; });
    failed.catch(() => {});
    child.on('message', (msg) => this.onMessage(msg, failStartup));
    child.once('exit', (code) => {
      this.log(`[máy chủ nội bộ dừng, mã ${code}]\n`);
      if (this.child === child) this.child = null;
      const wasReady = this.ready;
      this.ready = false;
      for (const p of this.pending.values()) p.reject(new Error('Máy chủ nội bộ đã dừng.'));
      this.pending.clear();
      failStartup(new Error(this.fatal || stderrTail.trim() || `Máy chủ nội bộ dừng với mã ${code}.`));
      if (wasReady && !this.stopping) this.emit('crash', {code});
    });

    try {
      await Promise.race([this.waitHealthy(child), failed]);
    } catch (err) {
      await this.stop();
      throw err;
    }
    this.ready = true;
    return this.url;
  }

  // Khởi động lại thì giữ nguyên cổng cũ: phiên đăng nhập lưu trong sessionStorage gắn với địa chỉ trang.
  // Windows có thể giữ cổng vừa đóng thêm chốc lát nên chờ tối đa khoảng 5 giây trước khi đổi cổng.
  async choosePort() {
    if (this.port) {
      for (let i = 0; i < 20; i++) {
        if (await isPortFree(this.port)) return this.port;
        await delay(250);
      }
    }
    if (await isPortFree(this.config.port)) return this.config.port;
    return randomPort();
  }

  // Cài đặt AI áp dụng ngay trong máy chủ đang chạy, không cần khởi động lại.
  applyAi(ai) {
    return this.request('env', {values: {AI_MODE: ai.mode, OPENAI_API_KEY: ai.apiKey, OPENAI_MODEL: ai.model}}, 10000);
  }

  onMessage(msg, failStartup) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'synced') {
      this.dbInfo = {users: msg.users, changes: msg.changes, backup: msg.backup};
    } else if (msg.type === 'fatal') {
      this.fatal = msg.message;
      failStartup(new Error(msg.message));
    } else if (msg.type === 'reply') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error || 'Có lỗi xử lý.'));
    }
  }

  async waitHealthy(child) {
    const deadline = Date.now() + START_TIMEOUT;
    while (Date.now() < deadline) {
      if (this.child !== child) throw new Error(this.fatal || 'Máy chủ nội bộ đã dừng khi đang khởi động.');
      try {
        const r = await fetch(`http://127.0.0.1:${this.port}/api/health`, {signal: AbortSignal.timeout(2000)});
        if (r.ok) return;
      } catch { /* chưa sẵn sàng */ }
      await delay(250);
    }
    throw new Error('Quá thời gian chờ máy chủ nội bộ khởi động.');
  }

  request(type, payload = {}, timeout = 10 * 60 * 1000) {
    if (!this.child || !this.ready) return Promise.reject(new Error('Máy chủ nội bộ chưa chạy.'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Quá thời gian chờ phản hồi.')); }, timeout);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.child.postMessage({type, id, ...payload});
    });
  }

  async stop() {
    const child = this.child;
    if (!child) return;
    this.stopping = true;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    try { child.postMessage({type: 'shutdown'}); } catch { /* đã dừng */ }
    const killer = setTimeout(() => { try { child.kill(); } catch { /* đã dừng */ } }, 5000);
    await exited;
    clearTimeout(killer);
  }
}

module.exports = {ServerManager};
