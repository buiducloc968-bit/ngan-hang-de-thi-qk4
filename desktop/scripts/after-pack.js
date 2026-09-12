'use strict';
// electron-builder: chép máy chủ chạy kèm, database mẫu và schema.json vào thư mục resources của bản đóng gói.
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  const build = path.join(context.packager.projectDir, 'build');
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  for (const name of ['app-server', 'template.db', 'schema.json']) {
    const src = path.join(build, name);
    if (!fs.existsSync(src)) throw new Error(`Thiếu ${src}. Chạy "npm run prepare:app" trong thư mục desktop trước.`);
    fs.cpSync(src, path.join(resources, name), {recursive: true});
  }
};
