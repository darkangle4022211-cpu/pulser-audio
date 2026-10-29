const { contextBridge, ipcRenderer, webUtils } = require('electron');

const api = {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  notifyTrackChange: (info) => ipcRenderer.send('notify-track-change', info),
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
  selectAudioFolder: () => ipcRenderer.invoke('select-audio-folder'),
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === 'function') {
        return webUtils.getPathForFile(file);
      }
    } catch (e) {}
    return (file && file.path) ? file.path : '';
  },
  onMediaKey: (callback) => ipcRenderer.on('media-key-command', (event, cmd) => callback(cmd)),
  downloadOnlineTrack: (trackData) => ipcRenderer.invoke('download-online-track', trackData),
  getDownloadFolder: () => ipcRenderer.invoke('get-download-folder'),
  openDownloadFolder: () => ipcRenderer.invoke('open-download-folder'),
  scanDownloadFolder: () => ipcRenderer.invoke('scan-download-folder'),
  checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
  deletePhysicalFile: (filePath) => ipcRenderer.invoke('delete-physical-file', filePath),
  searchOnlineMusic: (query, limit, filter) => ipcRenderer.invoke('search-online-music', { query, limit, filter }),
  getSearchSuggestions: (query) => ipcRenderer.invoke('get-search-suggestions', query),
  getSimilarSongs: (data) => ipcRenderer.invoke('get-similar-songs', data),
  getStreamUrl: (urlOrId) => ipcRenderer.invoke('get-stream-url', urlOrId),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  openGoogleLogin: (url) => ipcRenderer.send('open-google-login', url),
  clearYtmusicSession: () => ipcRenderer.invoke('clear-ytmusic-session'),
  cancelDownload: () => ipcRenderer.invoke('cancel-download'),
  getYtmusicInjectCode: () => ipcRenderer.invoke('get-ytmusic-inject-code'),
  onYtmusicLoginSuccess: (callback) => ipcRenderer.on('ytmusic-login-success', () => callback()),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: (downloadUrl) => ipcRenderer.invoke('download-update', downloadUrl),
  installUpdate: (debPath) => ipcRenderer.invoke('install-update', debPath),
  extractCoverArt: (filePath) => ipcRenderer.invoke('extract-cover-art', filePath),
  cacheCoverImage: (url, fileName) => ipcRenderer.invoke('cache-cover-image', { url, fileName }),
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (event, data) => callback(data));
  },
  onUpdateAvailableDetected: (callback) => {
    ipcRenderer.on('update-available-detected', (event, data) => callback(data));
  }
};

contextBridge.exposeInMainWorld('electronAPI', api);
contextBridge.exposeInMainWorld('pulsarNative', api);
