'use strict';
// Tiến trình chính của bản desktop.
// Máy chủ nội bộ chính là backend Express của web app (chạy trong tiến trình con);
// cửa sổ ứng dụng hiển thị giao diện React đã build, nên đầy đủ chức năng như bản web.
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow, Menu, Notification, dialog, ipcMain, session, shell} = require('electron');

app.setPath('userData', path.join(app.getPath('appData'), app.isPackaged ? 'NganHangDeThi' : 'NganHangDeThi-dev'));
app.setAppUserModelId('vn.qk4.nganhangdethi');

const {resolvePaths} = require('./src/paths');
const {Config, canEncrypt} = require('./src/config');
const {ServerManager} = require('./src/server');
const data = require('./src/data');
const {buildMenu} = require('./src/menu');

const APP_NAME = 'Ngân hàng đề thi và đáp án';
const paths = resolvePaths();
const loadingPage = path.join(__dirname, 'pages', 'loading.html');
const logFile = path.join(paths.logDir, 'server.log');

let config;
let server;
let mainWin = null;
let settingsWin = null;
let quitting = false;
let busy = false; // đang dừng/khởi động lại máy chủ để đổi cài đặt hoặc dữ liệu

// ---------- Tiện ích ----------
const alive = (win) => Boolean(win) && !win.isDestroyed();
const parentWin = () => (alive(settingsWin) && settingsWin.isFocused() ? settingsWin : mainWin);
const messageBox = (options, win = parentWin()) => (alive(win) ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options));
const saveDialog = (options, win = parentWin()) => (alive(win) ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options));
const openDialog = (options, win = parentWin()) => (alive(win) ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options));

function isAppUrl(url) {
  if (!server || !server.port) return false;
  try { return new URL(url).origin === new URL(server.url).origin; } catch { return false; }
}

function openExternal(url) {
  try {
    if (['http:', 'https:', 'mailto:'].includes(new URL(url).protocol)) shell.openExternal(url);
  } catch { /* bỏ qua liên kết lỗi */ }
}

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({title, body});
  if (onClick) n.on('click', onClick);
  n.show();
}

async function showApp() {
  if (alive(mainWin) && server.ready) await mainWin.loadURL(server.url).catch(() => {});
}

// ---------- Khởi động ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!alive(mainWin)) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  });
  app.on('web-contents-created', (_e, contents) => contents.on('will-attach-webview', (event) => event.preventDefault()));
  app.on('before-quit', (event) => {
    if (quitting) return;
    quitting = true;
    if (server && server.child) {
      event.preventDefault();
      autoBackup().finally(() => server.stop().finally(() => app.quit()));
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(boot);
}

function boot() {
  config = new Config(paths);
  server = new ServerManager(paths, config);
  server.on('crash', onServerCrash);
  hardenSession();
  registerIpc();
  Menu.setApplicationMenu(buildMenu(menuActions(), {packaged: app.isPackaged}));
  createMainWindow();
  startAndShow();
}

function hardenSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
  // Nút Excel / Word của web app tải tệp: hỏi nơi lưu bằng hộp thoại của Windows.
  ses.on('will-download', (_event, item) => {
    const name = item.getFilename();
    const ext = path.extname(name).slice(1).toLowerCase();
    const kinds = {docx: 'Tài liệu Word', xlsx: 'Bảng tính Excel', csv: 'Tệp CSV', pdf: 'Tài liệu PDF'};
    item.setSaveDialogOptions({
      title: 'Lưu tệp',
      defaultPath: path.join(app.getPath('downloads'), name),
      filters: [...(kinds[ext] ? [{name: kinds[ext], extensions: [ext]}] : []), {name: 'Tất cả tệp', extensions: ['*']}],
    });
    item.once('done', (_e, state) => {
      if (state === 'completed') notify('Đã lưu tệp', item.getSavePath(), () => shell.showItemInFolder(item.getSavePath()));
      else if (state === 'interrupted') dialog.showErrorBox('Không lưu được tệp', `Quá trình lưu "${name}" bị gián đoạn.`);
    });
  });
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    show: false,
    title: APP_NAME,
    backgroundColor: '#6d141b',
    icon: fs.existsSync(paths.appIcon) ? paths.appIcon : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWin.once('ready-to-show', () => {
    mainWin.maximize();
    mainWin.show();
  });
  const wc = mainWin.webContents;
  wc.setWindowOpenHandler(({url}) => {
    openExternal(url);
    return {action: 'deny'};
  });
  wc.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openExternal(url);
  });
  // window.print() của web app được chuyển sang hộp thoại In / Lưu PDF của bản desktop.
  wc.on('dom-ready', () => {
    if (isAppUrl(wc.getURL())) {
      wc.executeJavaScript('window.desktopApp&&(window.print=function(){window.desktopApp.print()});true').catch(() => {});
    }
  });
  wc.on('render-process-gone', async (_e, details) => {
    if (quitting || details.reason === 'clean-exit') return;
    const {response} = await messageBox({
      type: 'error', title: APP_NAME, noLink: true, defaultId: 0,
      message: 'Giao diện bị dừng đột ngột.',
      detail: `Lý do: ${details.reason}. Các câu trả lời đã tự lưu trước đó không bị mất.`,
      buttons: ['Tải lại', 'Thoát'],
    }, mainWin);
    if (response === 0) wc.reload();
    else app.quit();
  });
  mainWin.on('closed', () => {
    mainWin = null;
    if (alive(settingsWin)) settingsWin.close();
  });
  mainWin.loadFile(loadingPage);
}

async function startAndShow() {
  for (;;) {
    try {
      await server.start();
      await showApp();
      return;
    } catch (err) {
      await server.stop();
      if (quitting) return;
      const choice = await askStartupFailure(err);
      if (choice === 'retry') continue;
      if (choice === 'settings') openSettings();
      else app.quit();
      return;
    }
  }
}

async function askStartupFailure(err) {
  for (;;) {
    const {response} = await messageBox({
      type: 'error', title: APP_NAME, noLink: true, defaultId: 0, cancelId: 3,
      message: 'Không khởi động được máy chủ nội bộ của phần mềm.',
      detail: `${String((err && err.message) || err).slice(0, 1200)}\n\nNhật ký chi tiết: ${logFile}`,
      buttons: ['Thử lại', 'Mở nhật ký', 'Cài đặt dữ liệu…', 'Thoát'],
    }, mainWin);
    if (response === 1) {
      await shell.openPath(logFile);
      continue;
    }
    return ['retry', 'retry', 'settings', 'quit'][response];
  }
}

async function onServerCrash({code}) {
  if (quitting || busy) return;
  const {response} = await messageBox({
    type: 'error', title: APP_NAME, noLink: true, defaultId: 0,
    message: 'Máy chủ nội bộ đã dừng đột ngột.',
    detail: `Mã thoát: ${code}. Các câu trả lời đã tự lưu trước đó không bị mất.\nNhật ký: ${logFile}`,
    buttons: ['Khởi động lại', 'Thoát'],
  }, mainWin);
  if (response !== 0) {
    app.quit();
    return;
  }
  if (alive(mainWin)) await mainWin.loadFile(loadingPage);
  startAndShow();
}

// ---------- In / Lưu PDF ----------
async function printOrPdf(defaultName = 'ngan-hang-de-thi.pdf') {
  if (!alive(mainWin) || !isAppUrl(mainWin.webContents.getURL())) return;
  const {response} = await messageBox({
    type: 'question', title: 'In / Lưu PDF', noLink: true, defaultId: 0, cancelId: 2,
    message: 'Xuất nội dung đang hiển thị',
    detail: 'Dùng khổ A4, tự ẩn menu và nút thao tác. Bản xem trước đề kiểm tra không kèm đáp án.',
    buttons: ['Lưu thành PDF…', 'In ra máy in…', 'Hủy'],
  }, mainWin);
  if (response === 0) {
    const {canceled, filePath} = await saveDialog({
      title: 'Lưu PDF',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{name: 'Tài liệu PDF', extensions: ['pdf']}],
    }, mainWin);
    if (canceled || !filePath) return;
    try {
      const pdf = await mainWin.webContents.printToPDF({pageSize: 'A4', printBackground: true, preferCSSPageSize: true});
      fs.writeFileSync(filePath, pdf);
      shell.openPath(filePath);
    } catch (err) {
      dialog.showErrorBox('Không lưu được PDF', err.message);
    }
  } else if (response === 1) {
    mainWin.webContents.print({silent: false, printBackground: true}, (ok, reason) => {
      if (!ok && reason && !/cancel/i.test(reason)) dialog.showErrorBox('Không in được', String(reason));
    });
  }
}

// ---------- Dữ liệu ----------
function openDataFolder() {
  if (fs.existsSync(config.databasePath)) shell.showItemInFolder(config.databasePath);
  else shell.openPath(path.dirname(config.databasePath));
}

async function backupDatabase(win = parentWin()) {
  if (!server.ready) {
    await messageBox({type: 'warning', title: 'Sao lưu dữ liệu', message: 'Máy chủ nội bộ chưa chạy nên chưa sao lưu được.'}, win);
    return false;
  }
  const {canceled, filePath} = await saveDialog({
    title: 'Sao lưu dữ liệu',
    defaultPath: path.join(app.getPath('documents'), `ngan-hang-de-thi-${data.stamp()}.db`),
    filters: [{name: 'Tệp dữ liệu SQLite', extensions: ['db']}],
  }, win);
  if (canceled || !filePath) return false;
  if (data.samePath(filePath, config.databasePath)) {
    dialog.showErrorBox('Không sao lưu được', 'Không thể ghi đè lên tệp dữ liệu đang dùng.');
    return false;
  }
  try {
    fs.rmSync(filePath, {force: true});
    await server.request('backup', {target: filePath});
  } catch (err) {
    dialog.showErrorBox('Không sao lưu được', err.message);
    return false;
  }
  const {response} = await messageBox({
    type: 'info', title: 'Sao lưu dữ liệu', noLink: true,
    message: 'Đã sao lưu toàn bộ dữ liệu (câu hỏi, đề, bài làm, tài khoản).',
    detail: filePath,
    buttons: ['Đóng', 'Mở thư mục'],
  }, win);
  if (response === 1) shell.showItemInFolder(filePath);
  return true;
}

// Tự động sao lưu khi thoát phần mềm, chỉ giữ lại số bản gần nhất theo cài đặt.
async function autoBackup() {
  const {onQuit, keep} = config.backup;
  if (!onQuit || !server.ready) return;
  const dir = paths.backupDir;
  try {
    fs.mkdirSync(dir, {recursive: true});
    const target = path.join(dir, `tu-dong-${data.stamp()}.db`);
    await server.request('backup', {target}, 60000);
    server.log(`[tự động sao lưu: ${target}]\n`);
    const older = fs.readdirSync(dir).filter((f) => /^tu-dong-.+\.db$/.test(f)).sort();
    for (const file of older.slice(0, Math.max(0, older.length - keep))) fs.rmSync(path.join(dir, file), {force: true});
  } catch (err) {
    server.log(`[không tự động sao lưu được: ${err.message}]\n`);
  }
}

// Đổi tệp dữ liệu: dừng máy chủ, áp dụng thay đổi, khởi động lại; lỗi thì hoàn tác.
async function changeDatabase(apply, undo) {
  if (busy) return false;
  busy = true;
  try {
    await server.stop();
    try {
      apply();
      config.rotateSecret(); // mọi phiên đăng nhập cũ hết hiệu lực
      await server.start();
      if (server.dbInfo && server.dbInfo.users === 0) {
        throw new Error('Tệp dữ liệu không có tài khoản người dùng nào nên không thể đăng nhập.');
      }
    } catch (err) {
      await server.stop();
      undo();
      await server.start().catch(() => {});
      await showApp();
      dialog.showErrorBox('Không đổi được dữ liệu', `${err.message}\n\nPhần mềm đã quay lại dữ liệu trước đó.`);
      return false;
    }
    await showApp();
    return true;
  } finally {
    busy = false;
  }
}

async function pickDatabaseFile(title, win) {
  const {canceled, filePaths} = await openDialog({
    title,
    properties: ['openFile'],
    filters: [{name: 'Tệp dữ liệu SQLite', extensions: ['db', 'sqlite', 'sqlite3']}, {name: 'Tất cả tệp', extensions: ['*']}],
  }, win);
  if (canceled || !filePaths.length) return null;
  const file = filePaths[0];
  if (data.samePath(file, config.databasePath)) {
    dialog.showErrorBox(title, 'Tệp đã chọn chính là tệp dữ liệu đang dùng.');
    return null;
  }
  if (!data.isSqlite(file)) {
    dialog.showErrorBox(title, 'Tệp đã chọn không phải tệp dữ liệu SQLite hợp lệ.');
    return null;
  }
  return file;
}

async function restoreDatabase(win = parentWin()) {
  const src = await pickDatabaseFile('Chọn bản sao lưu để khôi phục', win);
  if (!src) return false;
  const {response} = await messageBox({
    type: 'warning', title: 'Khôi phục dữ liệu', noLink: true, defaultId: 1, cancelId: 1,
    message: 'Thay toàn bộ dữ liệu hiện tại bằng bản sao lưu?',
    detail: `Tệp khôi phục: ${src}\n\nDữ liệu hiện tại được tự động sao lưu vào thư mục:\n${paths.backupDir}\n\nMọi người dùng sẽ phải đăng nhập lại.`,
    buttons: ['Khôi phục', 'Hủy'],
  }, win);
  if (response !== 0) return false;
  const dbPath = config.databasePath;
  const safety = path.join(paths.backupDir, `truoc-khoi-phuc-${data.stamp()}.db`);
  let saved = false;
  const ok = await changeDatabase(
    () => {
      if (fs.existsSync(dbPath)) {
        data.copyDatabase(dbPath, safety);
        saved = true;
      }
      data.copyDatabase(src, dbPath);
    },
    () => { if (saved) data.copyDatabase(safety, dbPath); },
  );
  if (ok) {
    await messageBox({
      type: 'info', title: 'Khôi phục dữ liệu',
      message: 'Đã khôi phục dữ liệu. Vui lòng đăng nhập lại.',
      detail: saved ? `Dữ liệu trước khi khôi phục được giữ tại: ${safety}` : '',
    }, win);
  }
  return ok;
}

async function useOtherDatabase(win = parentWin()) {
  const file = await pickDatabaseFile('Chọn tệp dữ liệu để sử dụng', win);
  if (!file) return false;
  const {response} = await messageBox({
    type: 'question', title: 'Dùng tệp dữ liệu khác', noLink: true, defaultId: 0, cancelId: 1,
    message: 'Làm việc trực tiếp trên tệp dữ liệu này?',
    detail: `${file}\n\nPhần mềm dùng trực tiếp tệp, không sao chép. Nếu tệp thuộc phiên bản cũ, cấu trúc được bổ sung tự động sau khi sao lưu. Không nên mở đồng thời bản web trên cùng tệp. Mọi người dùng sẽ phải đăng nhập lại.`,
    buttons: ['Sử dụng', 'Hủy'],
  }, win);
  if (response !== 0) return false;
  const prev = config.data.databasePath;
  return changeDatabase(() => { config.databasePath = file; }, () => { config.databasePath = prev; });
}

async function useDefaultDatabase(win = parentWin()) {
  if (!config.data.databasePath) return true;
  const {response} = await messageBox({
    type: 'question', title: 'Về tệp dữ liệu mặc định', noLink: true, defaultId: 0, cancelId: 1,
    message: 'Quay về tệp dữ liệu mặc định?',
    detail: `${paths.defaultDb}\n\nTệp đang dùng không bị xóa. Nếu tệp mặc định chưa có, phần mềm tạo mới kèm tài khoản trình diễn.`,
    buttons: ['Đồng ý', 'Hủy'],
  }, win);
  if (response !== 0) return false;
  const prev = config.data.databasePath;
  return changeDatabase(() => { config.databasePath = null; }, () => { config.databasePath = prev; });
}

// ---------- Cài đặt ----------
function settingsState() {
  return {
    version: app.getVersion(),
    ai: config.aiInfo(),
    encryption: canEncrypt(),
    database: {path: config.databasePath, isDefault: !config.data.databasePath, defaultPath: paths.defaultDb},
    backup: config.backup,
    server: {running: Boolean(server.ready), url: server.ready ? server.url : ''},
  };
}

async function saveAi(input = {}) {
  const mode = input.mode === 'openai' ? 'openai' : 'demo';
  const model = String(input.model || '').trim();
  const apiKey = String(input.apiKey || '').trim();
  const clearKey = Boolean(input.clearKey);
  if (apiKey && !/^[\x21-\x7e]{10,300}$/.test(apiKey)) return {ok: false, error: 'Khóa API không hợp lệ.'};
  if (model && !/^[\w.:-]{1,100}$/.test(model)) return {ok: false, error: 'Tên model không hợp lệ.'};
  const hasKeyAfter = Boolean(apiKey) || (!clearKey && config.aiInfo().hasKey);
  if (mode === 'openai' && !hasKeyAfter) return {ok: false, error: 'Chế độ OpenAI cần khóa API.'};
  if (busy) return {ok: false, error: 'Đang có thao tác khác, vui lòng thử lại sau.'};
  busy = true;
  try {
    config.setAi({mode, model, apiKey, clearKey});
    if (server.ready) {
      await server.applyAi(config.ai);
    } else {
      await server.start();
      await showApp();
    }
    return {ok: true};
  } catch (err) {
    return {ok: false, error: err.message};
  } finally {
    busy = false;
  }
}

function openSettings() {
  if (alive(settingsWin)) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    parent: alive(mainWin) ? mainWin : undefined,
    width: 760,
    height: 800,
    minWidth: 600,
    minHeight: 520,
    title: 'Cài đặt',
    show: false,
    minimizable: false,
    backgroundColor: '#faf8f3',
    icon: fs.existsSync(paths.appIcon) ? paths.appIcon : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'pages', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWin.setMenu(null);
  settingsWin.webContents.on('will-navigate', (event) => event.preventDefault());
  settingsWin.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => {
    settingsWin = null;
    // Nếu mở cài đặt vì máy chủ không khởi động được, thử lại khi đóng cửa sổ cài đặt.
    if (!quitting && !busy && server && !server.child && alive(mainWin)) startAndShow();
  });
  settingsWin.loadFile(path.join(__dirname, 'pages', 'settings.html'));
}

function about() {
  messageBox({
    type: 'info', title: 'Giới thiệu', noLink: true,
    message: 'PHẦN MỀM AI ỨNG DỤNG\nNGÂN HÀNG ĐỀ THI VÀ ĐÁP ÁN',
    detail: [
      `Bản desktop ${app.getVersion()} · Electron ${process.versions.electron} · Node.js ${process.versions.node}`,
      '',
      `Tệp dữ liệu: ${config.databasePath}`,
      `Chế độ AI: ${config.ai.mode === 'openai' ? 'OpenAI' : 'DEMO'}`,
      `Máy chủ nội bộ: ${server.ready ? server.url : 'chưa chạy'}`,
      `Thư mục cấu hình: ${paths.userData}`,
    ].join('\n'),
  }, mainWin);
}

function menuActions() {
  return {
    backup: () => backupDatabase(mainWin),
    restore: () => restoreDatabase(mainWin),
    openDataFolder,
    openLogs: () => {
      fs.mkdirSync(paths.logDir, {recursive: true});
      shell.openPath(paths.logDir);
    },
    settings: openSettings,
    reload: () => {
      if (!alive(mainWin)) return;
      if (server.ready && !isAppUrl(mainWin.webContents.getURL())) showApp();
      else mainWin.webContents.reload();
    },
    print: () => printOrPdf(),
    openInBrowser: () => { if (server.ready) shell.openExternal(server.url); },
    about,
  };
}

function registerIpc() {
  ipcMain.handle('app:print', (event) => {
    if (alive(mainWin) && event.sender === mainWin.webContents && isAppUrl(event.senderFrame.url)) return printOrPdf('de-kiem-tra.pdf');
    return undefined;
  });
  // Chỉ cửa sổ Cài đặt (trang cục bộ) được gọi các thao tác quản lý.
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (!alive(settingsWin) || event.sender !== settingsWin.webContents) throw new Error('Không có quyền.');
    return fn(...args);
  });
  handle('settings:load', () => settingsState());
  handle('settings:save-ai', (input) => saveAi(input));
  handle('settings:backup', () => backupDatabase(settingsWin));
  handle('settings:save-backup', (input = {}) => {
    config.setBackup({onQuit: input.onQuit, keep: input.keep});
    return settingsState();
  });
  handle('settings:restore', () => restoreDatabase(settingsWin));
  handle('settings:use-other-db', () => useOtherDatabase(settingsWin));
  handle('settings:use-default-db', () => useDefaultDatabase(settingsWin));
  handle('settings:open-data-folder', () => openDataFolder());
  handle('settings:open-logs', () => {
    fs.mkdirSync(paths.logDir, {recursive: true});
    return shell.openPath(paths.logDir);
  });
}
