// Bảo đảm đã có tệp chạy Electron trước khi mở hoặc đóng gói phần mềm.
// npm mới có thể bỏ qua script cài đặt của gói electron, và Windows có thể chặn trình giải nén native của gói
// (electron/electron#52481). Khi đó tải bằng @electron/get (có kiểm tra checksum) rồi giải nén bằng tar của Windows.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(desktop, 'package.json'));
const electronDir = path.dirname(require.resolve('electron/package.json'));
const {version} = require('electron/package.json');
const platformPath = {win32: 'electron.exe', darwin: 'Electron.app/Contents/MacOS/Electron'}[process.platform] || 'electron';
const dist = path.join(electronDir, 'dist');

function installed() {
  try {
    return fs.readFileSync(path.join(dist, 'version'), 'utf8').trim().replace(/^v/, '') === version
      && fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf8') === platformPath
      && fs.existsSync(path.join(dist, platformPath));
  } catch {
    return false;
  }
}

if (installed()) process.exit(0);

console.log(`> Cài Electron ${version} (cần Internet ở lần đầu)`);
try {
  execFileSync(process.execPath, [path.join(electronDir, 'install.js')], {stdio: 'inherit'});
} catch {
  console.log('  Trình cài của gói electron lỗi, chuyển sang giải nén bằng tar của hệ điều hành.');
}

if (!installed()) {
  const {downloadArtifact} = require('@electron/get');
  const zip = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
    checksums: require('electron/checksums.json'),
  });
  // Trên Windows dùng bsdtar có sẵn (đọc được .zip), không dùng tar của Git Bash.
  const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const tar = process.platform === 'win32' && fs.existsSync(systemTar) ? systemTar : 'tar';
  fs.rmSync(dist, {recursive: true, force: true});
  fs.mkdirSync(dist, {recursive: true});
  execFileSync(tar, ['-xf', zip, '-C', dist], {stdio: 'inherit'});
  fs.writeFileSync(path.join(electronDir, 'path.txt'), platformPath);
}

if (!installed()) {
  console.error('LỖI: Không cài được Electron. Kiểm tra kết nối Internet rồi chạy lại.');
  process.exit(1);
}
console.log('  Đã cài Electron.');
