'use strict';
const $ = (id) => document.getElementById(id);
const api = window.settingsApi;
let state = null;
let statusTimer = null;

function showStatus(text, error = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', error);
  el.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.hidden = true; }, 7000);
}

function render(s) {
  state = s;
  $('version').textContent = `Phiên bản ${s.version}`;
  document.querySelector(`input[name="mode"][value="${s.ai.mode}"]`).checked = true;
  $('model').value = s.ai.model;
  $('apiKey').value = '';
  $('apiKey').placeholder = s.ai.hasKey ? 'Đã có khóa. Để trống để giữ nguyên' : 'sk-...';
  $('clearKey').checked = false;
  $('clear-key-row').hidden = s.ai.keySource === 'none';
  $('key-note').textContent = s.ai.keySource === 'env'
    ? 'Đang dùng khóa API trong server/.env của web app.'
    : s.ai.keySource === 'config'
      ? (s.encryption ? 'Khóa API được mã hóa bằng tài khoản Windows đang đăng nhập.' : 'Khóa API được lưu trong tệp cấu hình trên máy này.')
      : '';
  $('backup-on-quit').checked = s.backup.onQuit;
  $('backup-keep').value = s.backup.keep;
  $('backup-keep').disabled = !s.backup.onQuit;
  $('db-path').value = s.database.path;
  $('db-note').textContent = s.database.isDefault ? 'Đang dùng vị trí mặc định.' : `Vị trí mặc định: ${s.database.defaultPath}`;
  $('server-note').textContent = s.server.running
    ? `Đang chạy tại ${s.server.url}, chỉ truy cập được từ máy này.`
    : 'Máy chủ nội bộ chưa chạy.';
  document.querySelectorAll('button').forEach((b) => { b.disabled = false; });
  $('use-default').disabled = s.database.isDefault;
  $('backup').disabled = !s.server.running;
}

// Khóa các nút trong lúc máy chủ khởi động lại để tránh thao tác chồng nhau.
async function run(task) {
  document.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    await task();
  } catch (err) {
    showStatus(err.message || String(err), true);
  } finally {
    try { render(await api.load()); } catch { if (state) render(state); }
  }
}

$('ai-form').addEventListener('submit', (event) => {
  event.preventDefault();
  run(async () => {
    showStatus('Đang lưu cài đặt AI…');
    const result = await api.saveAi({
      mode: document.querySelector('input[name="mode"]:checked').value,
      model: $('model').value,
      apiKey: $('apiKey').value,
      clearKey: $('clearKey').checked,
    });
    if (!result.ok) throw new Error(result.error);
    showStatus('Đã lưu cài đặt AI.');
  });
});
const saveBackupSettings = () => run(async () => {
  await api.saveBackup({onQuit: $('backup-on-quit').checked, keep: $('backup-keep').value});
  showStatus('Đã lưu cài đặt sao lưu tự động.');
});
$('backup-on-quit').addEventListener('change', saveBackupSettings);
$('backup-keep').addEventListener('change', saveBackupSettings);
$('backup').addEventListener('click', () => run(() => api.backup()));
$('restore').addEventListener('click', () => run(() => api.restore()));
$('use-other').addEventListener('click', () => run(() => api.useOtherDb()));
$('use-default').addEventListener('click', () => run(() => api.useDefaultDb()));
$('open-data').addEventListener('click', () => api.openDataFolder());
$('open-logs').addEventListener('click', () => api.openLogs());

api.load().then(render).catch((err) => showStatus(err.message, true));
