'use strict';
// Cấu hình của bản desktop, lưu ở %APPDATA%\NganHangDeThi\config.json.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {safeStorage} = require('electron');

const DEFAULT_PORT = 4317;
const DEFAULT_MODEL = 'gpt-4.1-mini';

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

// Khi chạy từ mã nguồn, cấu hình AI sẵn có trong web/server/.env được dùng làm giá trị mặc định.
function readEnvFile(file) {
  const out = {};
  if (!file || !fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

const canEncrypt = () => {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
};

class Config {
  constructor(paths) {
    this.paths = paths;
    this.data = readJson(paths.configFile);
    this.env = readEnvFile(paths.envFile);
    if (typeof this.data.jwtSecret !== 'string' || this.data.jwtSecret.length < 32) this.rotateSecret();
  }

  save() {
    fs.mkdirSync(path.dirname(this.paths.configFile), {recursive: true});
    const tmp = `${this.paths.configFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.paths.configFile);
  }

  get jwtSecret() { return this.data.jwtSecret; }

  // Đổi khóa ký phiên đăng nhập: mọi phiên cũ hết hiệu lực (dùng khi thay tệp dữ liệu).
  rotateSecret() {
    this.data.jwtSecret = crypto.randomBytes(48).toString('hex');
    this.save();
  }

  get port() {
    const p = Number(this.data.port);
    return Number.isInteger(p) && p > 1024 && p < 65536 ? p : DEFAULT_PORT;
  }

  get databasePath() { return this.data.databasePath || this.paths.defaultDb; }

  set databasePath(file) {
    if (file) this.data.databasePath = file;
    else delete this.data.databasePath;
    this.save();
  }

  // Tự động sao lưu khi thoát: bật sẵn, giữ lại 7 bản gần nhất.
  get backup() {
    const b = this.data.backup || {};
    const keep = Number(b.keep);
    return {onQuit: b.onQuit !== false, keep: Number.isInteger(keep) && keep >= 1 && keep <= 50 ? keep : 7};
  }

  setBackup({onQuit, keep}) {
    this.data.backup = {onQuit: Boolean(onQuit), keep: Math.min(50, Math.max(1, Math.round(Number(keep)) || 7))};
    this.save();
  }

  storedKey() {
    const ai = this.data.ai || {};
    if (ai.apiKeyEncrypted) {
      try { return canEncrypt() ? safeStorage.decryptString(Buffer.from(ai.apiKeyEncrypted, 'base64')) : ''; } catch { return ''; }
    }
    return ai.apiKey || '';
  }

  get ai() {
    const ai = this.data.ai || {};
    return {
      mode: (ai.mode || this.env.AI_MODE) === 'openai' ? 'openai' : 'demo',
      model: ai.model || this.env.OPENAI_MODEL || DEFAULT_MODEL,
      apiKey: this.storedKey() || (ai.keyCleared ? '' : this.env.OPENAI_API_KEY || ''),
    };
  }

  aiInfo() {
    const ai = this.ai;
    const stored = Boolean(this.storedKey());
    return {mode: ai.mode, model: ai.model, hasKey: Boolean(ai.apiKey), keySource: stored ? 'config' : ai.apiKey ? 'env' : 'none'};
  }

  // Khóa API được mã hóa bằng tài khoản Windows (DPAPI) khi hệ điều hành hỗ trợ.
  setAi({mode, model, apiKey, clearKey}) {
    const prev = this.data.ai || {};
    const next = {mode, model: model || DEFAULT_MODEL};
    if (apiKey) {
      if (canEncrypt()) next.apiKeyEncrypted = safeStorage.encryptString(apiKey).toString('base64');
      else next.apiKey = apiKey;
    } else if (clearKey) {
      next.keyCleared = true;
    } else {
      for (const k of ['apiKeyEncrypted', 'apiKey', 'keyCleared']) if (prev[k]) next[k] = prev[k];
    }
    this.data.ai = next;
    this.save();
  }
}

module.exports = {Config, canEncrypt};
