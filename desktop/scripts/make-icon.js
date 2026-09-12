'use strict';
// Tạo build/icon.png (256 px) và build/icon.ico từ logo của ứng dụng web.
// Tự ghép tệp .ico (mỗi cỡ là một ảnh PNG, Windows Vista trở lên đọc được) để electron-builder
// không phải chuyển đổi bằng công cụ WebAssembly, vốn có thể lỗi thiếu bộ nhớ trên một số máy.
const fs = require('node:fs');
const path = require('node:path');
const {app, nativeImage} = require('electron');

const SIZES = [256, 64, 48, 32, 24, 16];

function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // dành riêng
  header.writeUInt16LE(1, 2); // loại: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const {size, data} of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 nghĩa là 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // số màu bảng màu
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit mỗi điểm ảnh
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(() => {
  const src = path.resolve(__dirname, '..', '..', 'web', 'client', 'public', 'logo-truong.png');
  const outDir = path.resolve(__dirname, '..', 'build');
  const image = nativeImage.createFromPath(src);
  if (image.isEmpty()) {
    console.error(`Không đọc được logo: ${src}`);
    app.exit(1);
    return;
  }
  fs.mkdirSync(outDir, {recursive: true});
  const pngs = SIZES.map((size) => ({size, data: image.resize({width: size, height: size, quality: 'best'}).toPNG()}));
  fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[0].data);
  fs.writeFileSync(path.join(outDir, 'icon.ico'), buildIco(pngs));
  console.log(`Đã tạo ${path.join(outDir, 'icon.png')} và icon.ico (${SIZES.join(', ')} px)`);
  app.exit(0);
});
