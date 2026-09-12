'use strict';
// Cầu nối tối thiểu cho giao diện web: chỉ mở hộp thoại In / Lưu PDF của bản desktop.
const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('desktopApp', Object.freeze({
  isDesktop: true,
  print: () => ipcRenderer.invoke('app:print'),
}));
