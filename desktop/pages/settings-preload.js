'use strict';
const {contextBridge, ipcRenderer} = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('settingsApi', Object.freeze({
  load: call('settings:load'),
  saveAi: call('settings:save-ai'),
  backup: call('settings:backup'),
  saveBackup: call('settings:save-backup'),
  restore: call('settings:restore'),
  useOtherDb: call('settings:use-other-db'),
  useDefaultDb: call('settings:use-default-db'),
  openDataFolder: call('settings:open-data-folder'),
  openLogs: call('settings:open-logs'),
}));
