'use strict';
// Đường dẫn dùng chung. Bản đóng gói lấy máy chủ trong resources/app-server;
// khi chạy từ mã nguồn thì dùng trực tiếp server/, client/ và node_modules của ứng dụng web trong thư mục web/.
const path = require('node:path');
const {app} = require('electron');

function resolvePaths() {
  const packaged = app.isPackaged;
  const desktopDir = path.resolve(__dirname, '..');
  const webRoot = path.join(path.dirname(desktopDir), 'web'); // ứng dụng web nằm cạnh thư mục desktop
  const resources = packaged ? process.resourcesPath : path.join(desktopDir, 'build');
  const appServer = packaged ? path.join(process.resourcesPath, 'app-server') : webRoot;
  const userData = app.getPath('userData');
  // server-host.js được giải nén khỏi app.asar để tiến trình con nạp trực tiếp.
  const unpackedDir = desktopDir.replace(/app\.asar$/, 'app.asar.unpacked');
  return {
    packaged,
    userData,
    serverEntry: path.join(appServer, 'server', 'dist', 'index.js'),
    clientIndex: path.join(appServer, 'client', 'dist', 'index.html'),
    appIcon: path.join(appServer, 'client', 'dist', 'logo-truong.png'),
    hostScript: path.join(unpackedDir, 'server-host.js'),
    templateDb: path.join(resources, 'template.db'),
    schemaJson: path.join(resources, 'schema.json'),
    envFile: packaged ? null : path.join(webRoot, 'server', '.env'),
    defaultDb: packaged
      ? path.join(userData, 'data', 'ngan-hang-de-thi.db')
      : path.join(webRoot, 'server', 'prisma', 'dev.db'),
    configFile: path.join(userData, 'config.json'),
    logDir: path.join(userData, 'logs'),
    backupDir: path.join(userData, 'backups'),
  };
}

module.exports = {resolvePaths};
