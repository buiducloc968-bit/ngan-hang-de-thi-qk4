'use strict';
const {Menu} = require('electron');

function buildMenu(a, {packaged}) {
  return Menu.buildFromTemplate([
    {label: '&Tệp', submenu: [
      {label: 'Sao lưu dữ liệu…', accelerator: 'CmdOrCtrl+Shift+S', click: a.backup},
      {label: 'Khôi phục dữ liệu từ bản sao lưu…', click: a.restore},
      {type: 'separator'},
      {label: 'Mở thư mục dữ liệu', click: a.openDataFolder},
      {label: 'Mở thư mục nhật ký', click: a.openLogs},
      {type: 'separator'},
      {label: 'Cài đặt…', accelerator: 'CmdOrCtrl+,', click: a.settings},
      {type: 'separator'},
      {label: 'Thoát', role: 'quit'},
    ]},
    {label: 'Chỉnh &sửa', submenu: [
      {label: 'Hoàn tác', role: 'undo'},
      {label: 'Làm lại', role: 'redo'},
      {type: 'separator'},
      {label: 'Cắt', role: 'cut'},
      {label: 'Sao chép', role: 'copy'},
      {label: 'Dán', role: 'paste'},
      {label: 'Chọn tất cả', role: 'selectAll'},
    ]},
    {label: '&Xem', submenu: [
      {label: 'Tải lại trang', accelerator: 'F5', click: a.reload},
      {type: 'separator'},
      {label: 'Phóng to', role: 'zoomIn', accelerator: 'CmdOrCtrl+='},
      {label: 'Thu nhỏ', role: 'zoomOut'},
      {label: 'Cỡ hiển thị mặc định', role: 'resetZoom'},
      {type: 'separator'},
      {label: 'Toàn màn hình', role: 'togglefullscreen'},
      ...(packaged ? [] : [{type: 'separator'}, {label: 'Công cụ nhà phát triển', role: 'toggleDevTools'}]),
    ]},
    {label: '&Công cụ', submenu: [
      {label: 'In / Lưu PDF nội dung đang xem…', accelerator: 'CmdOrCtrl+P', click: a.print},
      {label: 'Mở giao diện trong trình duyệt', click: a.openInBrowser},
    ]},
    {label: 'Trợ &giúp', submenu: [
      {label: 'Giới thiệu phần mềm', click: a.about},
    ]},
  ]);
}

module.exports = {buildMenu};
