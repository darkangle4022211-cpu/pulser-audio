const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, globalShortcut, nativeImage, dialog, shell, session, protocol, net } = require('electron');
const { execFile, spawn } = require('child_process');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { pathToFileURL, fileURLToPath } = require('url');

// Enforce single instance to prevent duplicate processes and LevelDB database lock contention
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // A primary instance is already active; exit immediately so we never contend for LevelDB locks
  app.exit(0);
}

// Register custom pulsar-audio scheme before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'pulsar-audio', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true } }
]);

// Windows AppUserModelId for native Windows 10/11 notifications & taskbar grouping
if (process.platform === 'win32') {
  app.setAppUserModelId('com.pulsar.musicplayer');
}

// Power-efficient, whisper-quiet graphics configuration (hardware VSync enabled, <0.5% CPU & GPU idle)
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

function getAppIconPath() {
  if (process.platform === 'win32') {
    const icoPath = path.join(__dirname, '../build/icons/icon.ico');
    if (fs.existsSync(icoPath)) return icoPath;
    const pngPath = path.join(__dirname, '../build/icons/icon.png');
    if (fs.existsSync(pngPath)) return pngPath;
  }
  const debIcon = '/usr/share/icons/hicolor/512x512/apps/pulsar-music-player.png';
  if (fs.existsSync(debIcon)) return debIcon;
  const localIcon = path.join(__dirname, '../build/icons/icon.png');
  if (fs.existsSync(localIcon)) return localIcon;
  return path.join(__dirname, 'icon.png');
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let normalBounds = { width: 1180, height: 760 };

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 700,
    minHeight: 520,
    frame: false,
    backgroundColor: '#0a0c10',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
      backgroundThrottling: true
    }
  });

  if (process.env.ELECTRON_DEV) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Window bounds tracking
  mainWindow.on('resize', () => {
    if (!mainWindow.isAlwaysOnTop()) {
      normalBounds = mainWindow.getBounds();
    }
  });

  // Quit application completely when window is closed (no lingering in background)
  mainWindow.on('closed', () => {
    mainWindow = null;
    isQuitting = true;
    if (tray && !tray.isDestroyed()) {
      try { tray.destroy(); } catch (e) {}
      tray = null;
    }
    app.quit();
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function createTray() {
  const iconPath = getAppIconPath();
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(trayIcon);
  tray.setToolTip('Pulsar Music Player');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Play / Pause',
      click: () => mainWindow.webContents.send('media-key-command', 'play-pause')
    },
    {
      label: 'Next Track',
      click: () => mainWindow.webContents.send('media-key-command', 'next')
    },
    {
      label: 'Previous Track',
      click: () => mainWindow.webContents.send('media-key-command', 'previous')
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function registerMediaKeys() {
  try {
    globalShortcut.register('MediaPlayPause', () => {
      if (mainWindow) mainWindow.webContents.send('media-key-command', 'play-pause');
    });
    globalShortcut.register('MediaNextTrack', () => {
      if (mainWindow) mainWindow.webContents.send('media-key-command', 'next');
    });
    globalShortcut.register('MediaPreviousTrack', () => {
      if (mainWindow) mainWindow.webContents.send('media-key-command', 'previous');
    });
    globalShortcut.register('MediaStop', () => {
      if (mainWindow) mainWindow.webContents.send('media-key-command', 'stop');
    });
  } catch (err) {
    console.warn('Global media key registration notice:', err);
  }
}

// IPC Handlers from Renderer
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  if (tray && !tray.isDestroyed()) {
    try { tray.destroy(); } catch (e) {}
    tray = null;
  }
  app.quit();
});

ipcMain.on('open-external', (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

ipcMain.on('notify-track-change', (event, info) => {
  if (Notification.isSupported()) {
    new Notification({
      title: info.title || 'Now Playing',
      body: `${info.artist || 'Unknown Artist'}${info.album ? ' — ' + info.album : ''}`,
      icon: getAppIconPath(),
      silent: true
    }).show();
  }
});

// Helper to read only the first 512KB of an audio file for metadata parsing
async function readFileHeader(filePath, size) {
  const bytesToRead = Math.min(size, 512 * 1024);
  const buffer = Buffer.alloc(bytesToRead);
  const handle = await fs.promises.open(filePath, 'r');
  try {
    await handle.read(buffer, 0, bytesToRead, 0);
  } finally {
    await handle.close();
  }
  return buffer;
}

// Native Audio File & Folder Selectors
ipcMain.handle('select-audio-files', async () => {
  if (!mainWindow) return { canceled: true, files: [] };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Audio Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'wma'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true, files: [] };
  }

  const files = [];
  for (const filePath of result.filePaths) {
    try {
      const stat = await fs.promises.stat(filePath);
      const headerBuffer = await readFileHeader(filePath, stat.size);
      files.push({
        name: path.basename(filePath),
        path: filePath,
        size: stat.size,
        headerBuffer: headerBuffer
      });
    } catch (err) {
      console.warn('Failed to read file header:', filePath, err);
    }
  }

  return { canceled: false, files };
});

ipcMain.handle('select-audio-folder', async () => {
  if (!mainWindow) return { canceled: true, files: [] };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Folder with Audio Files',
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true, files: [] };
  }

  const folderPath = result.filePaths[0];
  const audioExtensions = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma']);
  const files = [];

  async function scanDir(dir) {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          try { await scanDir(fullPath); } catch (e) {}
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (audioExtensions.has(ext)) {
            try {
              const stat = await fs.promises.stat(fullPath);
              const headerBuffer = await readFileHeader(fullPath, stat.size);
              files.push({
                name: entry.name,
                path: fullPath,
                size: stat.size,
                headerBuffer: headerBuffer
              });
            } catch (e) {}
          }
        }
      }
    } catch (err) {
      console.warn('Failed scanning directory:', dir, err);
    }
  }

  await scanDir(folderPath);
  return { canceled: false, files };
});

// ID3v2.3 Tag Injector for Downloaded MP3 Files
function createID3v23Buffer(mp3Buffer, tags = {}) {
  const frames = [];

  function textFrame(id, str) {
    if (!str) return null;
    const buf = Buffer.from(String(str), 'utf8');
    const dataSize = 1 + buf.length;
    const header = Buffer.alloc(10);
    header.write(id, 0, 4, 'ascii');
    header.writeUInt32BE(dataSize, 4);
    header.writeUInt16BE(0, 8);
    const enc = Buffer.from([0x03]); // UTF-8
    return Buffer.concat([header, enc, buf]);
  }

  function picFrame(imgBuf, mime = 'image/jpeg') {
    if (!imgBuf || imgBuf.length === 0) return null;
    const mimeBuf = Buffer.from(mime, 'ascii');
    const dataSize = 1 + mimeBuf.length + 1 + 1 + 1 + imgBuf.length;
    const header = Buffer.alloc(10);
    header.write('APIC', 0, 4, 'ascii');
    header.writeUInt32BE(dataSize, 4);
    header.writeUInt16BE(0, 8);
    const prefix = Buffer.from([0x00]);
    const term = Buffer.from([0x00]);
    const picType = Buffer.from([0x03]); // Front Cover
    return Buffer.concat([header, prefix, mimeBuf, term, picType, term, imgBuf]);
  }

  if (tags.title) frames.push(textFrame('TIT2', tags.title));
  if (tags.artist) frames.push(textFrame('TPE1', tags.artist));
  if (tags.album) frames.push(textFrame('TALB', tags.album));
  if (tags.year) frames.push(textFrame('TYER', tags.year));
  if (tags.genre) frames.push(textFrame('TCON', tags.genre));
  if (tags.coverBuffer) frames.push(picFrame(tags.coverBuffer, tags.coverMime || 'image/jpeg'));

  const valid = frames.filter(Boolean);
  const size = valid.reduce((acc, f) => acc + f.length, 0);
  if (size === 0) return mp3Buffer;

  const header = Buffer.alloc(10);
  header.write('ID3', 0, 3, 'ascii');
  header.writeUInt8(3, 3); // ID3v2.3
  header.writeUInt8(0, 4);
  header.writeUInt8(0, 5);
  // Syncsafe size
  header.writeUInt8((size >> 21) & 0x7f, 6);
  header.writeUInt8((size >> 14) & 0x7f, 7);
  header.writeUInt8((size >> 7) & 0x7f, 8);
  header.writeUInt8(size & 0x7f, 9);

  return Buffer.concat([header, ...valid, mp3Buffer]);
}

// Extract embedded ID3 APIC cover art directly from audio file buffer (100% offline)
function extractID3Cover(buffer) {
  if (!buffer || buffer.length < 10) return null;
  if (buffer[0] !== 0x49 || buffer[1] !== 0x44 || buffer[2] !== 0x33) return null;
  const version = buffer[3];
  const tagSize = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
  const maxOffset = Math.min(tagSize + 10, buffer.length);
  let offset = 10;
  while (offset < maxOffset - 10) {
    const frameId = buffer.toString('ascii', offset, offset + 4);
    if (frameId.charCodeAt(0) === 0) break;
    const frameSize = version === 4 
      ? (((buffer[offset+4] & 0x7f) << 21) | ((buffer[offset+5] & 0x7f) << 14) | ((buffer[offset+6] & 0x7f) << 7) | (buffer[offset+7] & 0x7f))
      : buffer.readUInt32BE(offset + 4);
    if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) break;
    if (frameId === 'APIC') {
      const dataOffset = offset + 10;
      let cur = dataOffset + 1; // skip encoding byte
      let mimeEnd = cur;
      while (mimeEnd < dataOffset + frameSize && buffer[mimeEnd] !== 0) mimeEnd++;
      const mime = buffer.toString('ascii', cur, mimeEnd) || 'image/jpeg';
      cur = mimeEnd + 1; // skip null
      cur++; // skip pic type
      // skip desc null-terminated
      while (cur < dataOffset + frameSize && buffer[cur] !== 0) cur++;
      cur++; // skip null
      if (cur < dataOffset + frameSize) {
        const imgBuf = buffer.subarray(cur, dataOffset + frameSize);
        return `data:${mime};base64,${imgBuf.toString('base64')}`;
      }
    }
    offset += 10 + frameSize;
  }
  return null;
}

// Cross-platform music download directory resolver
function getDownloadDirectory() {
  try {
    return path.join(app.getPath('music'), 'Pulsar Downloads');
  } catch (e) {
    return path.join(os.homedir(), 'Music', 'Pulsar Downloads');
  }
}

// Helper to resolve yt-dlp binary across environments
function getYtDlpPath() {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.resourcesPath || '', 'bin', 'win', 'yt-dlp.exe'),
      path.join(path.dirname(process.execPath || ''), 'resources', 'bin', 'win', 'yt-dlp.exe'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'bin', 'win', 'yt-dlp.exe'),
      path.join(__dirname, '../bin/win/yt-dlp.exe'),
      path.join(__dirname, 'bin/win/yt-dlp.exe'),
      path.join(process.cwd(), 'resources', 'bin', 'win', 'yt-dlp.exe'),
      path.join(process.cwd(), 'bin', 'win', 'yt-dlp.exe')
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
    return 'yt-dlp.exe';
  }
  const candidates = [
    path.join(__dirname, '../bin/yt-dlp'),
    path.join(__dirname, 'bin/yt-dlp'),
    '/opt/pulsar-music-player/bin/yt-dlp',
    path.join(process.resourcesPath || '', 'bin', 'yt-dlp'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'bin', 'yt-dlp'),
    path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp'
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return 'yt-dlp';
}

// Helper to resolve ffmpeg binary across environments
function getFfmpegPath() {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.resourcesPath || '', 'bin', 'win', 'ffmpeg.exe'),
      path.join(path.dirname(process.execPath || ''), 'resources', 'bin', 'win', 'ffmpeg.exe'),
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'bin', 'win', 'ffmpeg.exe'),
      path.join(__dirname, '../bin/win/ffmpeg.exe'),
      path.join(__dirname, 'bin/win/ffmpeg.exe'),
      path.join(process.cwd(), 'resources', 'bin', 'win', 'ffmpeg.exe'),
      path.join(process.cwd(), 'bin', 'win', 'ffmpeg.exe')
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
    return 'ffmpeg.exe';
  }
  const candidates = [
    path.join(__dirname, '../bin/ffmpeg'),
    path.join(__dirname, 'bin/ffmpeg'),
    '/opt/pulsar-music-player/bin/ffmpeg',
    path.join(process.resourcesPath || '', 'bin', 'ffmpeg'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'bin', 'ffmpeg'),
    '/home/hamza/Applications/Recordly/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg',
    path.join(os.homedir(), '.local', 'bin', 'ffmpeg'),
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg'
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

// Helper to resolve node runtime for yt-dlp
function getNodeRuntime() {
  const candidates = [
    '/home/hamza/.local/bin/node',
    '/usr/bin/node',
    '/usr/local/bin/node',
    path.join(os.homedir(), '.local', 'bin', 'node'),
    path.join(os.homedir(), '.local', 'node', 'bin', 'node')
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

// Search live music using the official YouTube Music Innertube Web Remix API
async function searchYouTubeMusic(query, limit = 20, filter = 'songs') {
  const filterParams = {
    all: undefined,
    songs: 'EgWKAQIIAWoSEAQQAxAJEAoQBRAVEBEQDhAQ',
    albums: 'EgWKAQIYAWoSEAQQAxAJEAoQBRAVEBEQDhAQ',
    artists: 'EgWKAQIgAWoSEAQQAxAJEAoQBRAVEBEQDhAQ',
    videos: 'EgWKAQIQAWoSEAQQAxAJEAoQBRAVEBEQDhAQ'
  };

  const params = filterParams[filter] || filterParams.songs;
  const searchQuery = (query && query.trim()) || 'top trending songs hits 2026';

  const body = {
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20240101.01.00',
        hl: 'en',
        gl: 'US'
      }
    },
    query: searchQuery,
    ...(params ? { params } : {})
  };

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Origin': 'https://music.youtube.com',
    'Referer': 'https://music.youtube.com/',
    'X-YouTube-Client-Name': '67',
    'X-YouTube-Client-Version': '1.20240101.01.00'
  };

  let response = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }).catch(() => null);

  if (!response || !response.ok) {
    // Retry without params token if filtered search failed or status not ok
    response = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        context: body.context,
        query: searchQuery
      })
    }).catch(() => null);
  }

  if (!response || !response.ok) {
    throw new Error(`YouTube Music API responded with status ${response ? response.status : 'network error'}`);
  }

  const data = await response.json();
  const sectionList = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
                      data.contents?.sectionListRenderer?.contents ||
                      [];

  const tracks = [];
  function parseDurationToSecs(str) {
    if (!str) return 210;
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
    if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    return 210;
  }

  for (const s of sectionList) {
    const contents = s.musicShelfRenderer?.contents || s.itemSectionRenderer?.contents || s.musicCardShelfRenderer?.contents;
    if (!contents || !Array.isArray(contents)) continue;

    for (const c of contents) {
      const item = c.musicResponsiveListItemRenderer;
      if (!item) continue;

      const flex = item.flexColumns || [];
      const titleRun = flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
      const subRuns = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

      // Cleanly extract artist and album
      const cleanRuns = subRuns.map(r => (r.text || '').trim()).filter(t => t && t !== '•');
      let artist = 'Artist';
      let album = 'YouTube Music';
      let durationStr = '3:30';

      const meaningfulRuns = cleanRuns.filter(t =>
        !['Song', 'Video', 'Playlist', 'Album', 'Profile', 'Podcast', 'Episode'].includes(t) &&
        !t.includes('views') && !t.includes('plays') && !t.includes('subscribers') && !t.includes('audience')
      );

      for (const t of cleanRuns) {
        if (/^\d+:\d+(:\d+)?$/.test(t)) {
          durationStr = t;
        }
      }

      if (meaningfulRuns.length > 0) {
        artist = meaningfulRuns[0];
        if (meaningfulRuns.length > 1 && !/^\d+:\d+(:\d+)?$/.test(meaningfulRuns[1])) {
          album = meaningfulRuns[1];
        }
      }

      const videoId = item.playlistItemData?.videoId ||
                      item.navigationEndpoint?.watchEndpoint?.videoId ||
                      item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;

      const thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      let coverUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
      if (thumbs && thumbs.length) {
        coverUrl = thumbs[thumbs.length - 1].url.replace(/=w\d+-h\d+[^"]*/, '=w544-h544-l90-rj');
      }

      if (videoId && titleRun) {
        tracks.push({
          id: `yt_${videoId}`,
          ytId: videoId,
          title: titleRun.trim(),
          artist: artist.trim(),
          album: album.trim() || 'YouTube Music',
          year: '2026',
          genre: 'YouTube Music',
          duration: parseDurationToSecs(durationStr),
          durationStr: durationStr,
          audioUrl: `https://music.youtube.com/watch?v=${videoId}`,
          coverUrl: coverUrl,
          license: 'YouTube Music Stream',
          isOnline: true,
          source: 'ytmusic'
        });
      }

      if (tracks.length >= limit) break;
    }
    if (tracks.length >= limit) break;
  }

  return tracks;
}

// Helper to extract significant keywords from a song title
function extractTitleKeywords(title) {
  if (!title || typeof title !== 'string') return [];
  const stopWords = new Set([
    'the', 'and', 'feat', 'feat.', 'ft', 'ft.', 'official', 'video', 'music', 'audio',
    'song', 'songs', 'remix', 'mix', 'version', 'lyric', 'lyrics', 'original', 'hd', '4k',
    'mp3', 'track', 'full', 'bass', 'boosted', 'slowed', 'reverb', 'edit'
  ]);
  return title
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));
}

// Fetch Similar Songs & Smart Radio Queue using YouTube Music's RDAMVM Radio Graph
async function getSimilarTracksYouTubeMusic(videoId, limit = 35, seedTitle = '', seedArtist = '') {
  if (!videoId) return [];
  const cleanVideoId = String(videoId).replace(/^yt_/, '').trim();
  if (!cleanVideoId) return [];

  function parseDurationToSecs(str) {
    if (!str) return 210;
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
    if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    return 210;
  }

  // InnerTube /next requires playlistId WITHOUT videoId to return the full playlistPanelRenderer radio queue
  const playlistVariations = [
    'RDAMVM' + cleanVideoId,
    'RD' + cleanVideoId
  ];

  let rawQueue = [];
  for (const plId of playlistVariations) {
    try {
      const response = await fetch('https://music.youtube.com/youtubei/v1/next', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Origin': 'https://music.youtube.com',
          'Referer': 'https://music.youtube.com/'
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20240101.01.00',
              hl: 'en',
              gl: 'US'
            }
          },
          playlistId: plId
        })
      });

      if (!response.ok) continue;
      const data = await response.json();
      const tabs = data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs || [];
      for (const t of tabs) {
        const contents = t?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents || [];
        if (contents.length > 0) {
          rawQueue = contents;
          break;
        }
      }
      if (rawQueue.length > 0) break;
    } catch (e) {
      console.warn('RDAMVM radio fetch error:', e.message);
    }
  }

  if (rawQueue.length === 0) return [];

  // Seed keywords filter: Ensure at most ONE song in the queue can share the seed song's title keywords
  const seedKeywords = extractTitleKeywords(seedTitle);
  let seedKeywordMatchCount = 0;
  const seenIds = new Set([cleanVideoId]);
  const seenTitles = new Set();
  const tracks = [];

  for (const item of rawQueue) {
    const r = item.playlistPanelVideoRenderer;
    if (!r || !r.videoId) continue;
    if (seenIds.has(r.videoId)) continue;

    const rawTitle = r.title?.runs?.[0]?.text || 'Track';
    const title = rawTitle
      .replace(/\[(?:Official|Music|Video|Audio|HD|4K|Visualizer|Lyric).*?\]/gi, '')
      .replace(/\((?:Official|Music|Video|Audio|HD|4K|Visualizer|Lyric).*?\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const bylineRuns = r.longBylineText?.runs || [];
    const artist = (bylineRuns[0]?.text || 'Artist').trim();
    const titleLower = title.toLowerCase();

    // Check if candidate shares seed title keywords
    if (seedKeywords.length > 0) {
      const sharesKeyword = seedKeywords.some(kw => titleLower.includes(kw));
      if (sharesKeyword) {
        if (seedKeywordMatchCount >= 1) {
          // Strictly reject multiple remixes/covers/same-word songs
          continue;
        }
        seedKeywordMatchCount++;
      }
    }

    const normKey = `${title.toLowerCase()}_${artist.toLowerCase()}`;
    if (seenTitles.has(normKey)) continue;
    seenTitles.add(normKey);
    seenIds.add(r.videoId);

    let album = 'Similar Songs Radio';
    for (let i = 1; i < bylineRuns.length; i++) {
      const text = (bylineRuns[i]?.text || '').trim();
      if (text && text !== '•' && !text.includes('views') && !text.includes('plays')) {
        album = text;
        break;
      }
    }
    const durationStr = r.lengthText?.runs?.[0]?.text || '3:30';
    const thumbs = r.thumbnail?.thumbnails || [];
    let coverUrl = `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`;
    if (thumbs.length) {
      coverUrl = thumbs[thumbs.length - 1].url.replace(/=w\d+-h\d+[^"]*/, '=w544-h544-l90-rj');
    }

    tracks.push({
      id: `yt_${r.videoId}`,
      ytId: r.videoId,
      title: title || rawTitle,
      artist: artist,
      album: album || 'Similar Songs Radio',
      year: '2026',
      genre: 'Radio',
      duration: parseDurationToSecs(durationStr),
      durationStr: durationStr,
      audioUrl: `https://www.youtube.com/watch?v=${r.videoId}`,
      coverUrl: coverUrl,
      license: 'YouTube Music Stream',
      isOnline: true,
      source: 'ytmusic'
    });

    if (tracks.length >= limit) break;
  }

  return tracks;
}

// Search live online music using YouTube Music API (with yt-dlp fallback)
ipcMain.handle('search-online-music', async (event, { query, limit = 20, filter = 'songs' }) => {
  const numResults = Math.min(Math.max(Number(limit) || 20, 5), 40);

  // 1. First attempt: Direct YouTube Music Innertube API
  try {
    const ytMusicTracks = await searchYouTubeMusic(query, numResults, filter);
    if (ytMusicTracks && ytMusicTracks.length > 0) {
      return { success: true, tracks: ytMusicTracks, source: 'ytmusic' };
    }
  } catch (ytMusicErr) {
    console.warn('YouTube Music API notice (falling back to yt-dlp):', ytMusicErr.message);
  }

  // 2. Resilient Fallback: yt-dlp CLI
  try {
    const ytdlp = getYtDlpPath();
    const nodeRuntime = getNodeRuntime();
    const searchQuery = (query && query.trim()) || 'trending songs hits 2026';

    const searchArgs = [
      `ytsearch${numResults * 2}:${searchQuery}`,
      '--dump-json',
      '--flat-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '--extractor-args', 'youtube:player_client=android,web'
    ];
    if (nodeRuntime) {
      searchArgs.push('--js-runtimes', `node:${nodeRuntime}`);
    }

    return new Promise((resolve) => {
      execFile(
        ytdlp,
        searchArgs,
        { timeout: 16000, maxBuffer: 15 * 1024 * 1024 },
        (err, stdout) => {
          if (err && (!stdout || stdout.trim().length === 0)) {
            console.warn('yt-dlp search error:', err.message);
            return resolve({ success: false, error: err.message, tracks: [] });
          }

          const lines = (stdout || '').trim().split('\n').filter(Boolean);
          const tracks = [];

          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              const dur = Number(data.duration) || 0;
              if (dur > 0 && (dur < 45 || dur > 660)) continue;

              let title = (data.title || 'Unknown Title')
                .replace(/\[(?:Official|Music|Video|Audio|HD|4K|Visualizer|Lyric).*?\]/gi, '')
                .replace(/\((?:Official|Music|Video|Audio|HD|4K|Visualizer|Lyric).*?\)/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

              const artist = data.uploader || data.channel || 'Artist';
              const coverUrl = (data.thumbnails && data.thumbnails.length)
                ? data.thumbnails[data.thumbnails.length - 1].url
                : `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`;

              const durationStr = data.duration_string || (dur > 0 ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : '3:30');

              tracks.push({
                id: `yt_${data.id}`,
                ytId: data.id,
                title: title || data.title,
                artist: artist,
                album: 'Trending Online',
                year: '2026',
                genre: 'YouTube Music',
                duration: dur || 210,
                durationStr: durationStr,
                audioUrl: `https://www.youtube.com/watch?v=${data.id}`,
                coverUrl: coverUrl,
                license: 'Online Audio',
                isOnline: true,
                source: 'youtube'
              });

              if (tracks.length >= numResults) break;
            } catch (e) {}
          }

          resolve({ success: true, tracks, source: 'yt-dlp' });
        }
      );
    });
  } catch (err) {
    console.error('search-online-music failed:', err);
    return { success: false, error: err.message, tracks: [] };
  }
});

// Instant live search autocomplete suggestions from YouTube / Google Music
ipcMain.handle('get-search-suggestions', async (event, query) => {
  if (!query || typeof query !== 'string') return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  return new Promise((resolve) => {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(trimmed)}`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 3500
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (Array.isArray(data) && Array.isArray(data[1])) {
            return resolve(data[1].slice(0, 8));
          }
        } catch (e) {}
        resolve([]);
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
});

// Get Similar Songs / Smart Radio playlist for any song
ipcMain.handle('get-similar-songs', async (event, { videoId, title, artist, limit = 35 }) => {
  const numLimit = Math.min(Math.max(Number(limit) || 25, 5), 50);

  // 1. If videoId is provided, fetch direct radio queue
  if (videoId) {
    try {
      const tracks = await getSimilarTracksYouTubeMusic(videoId, numLimit, title, artist);
      if (tracks && tracks.length > 0) {
        return { success: true, tracks, source: 'ytmusic-radio' };
      }
    } catch (err) {
      console.warn('Direct radio queue lookup notice:', err.message);
    }
  }

  // 2. If no videoId or if direct radio was empty, search for track first
  let resolvedVideoId = null;
  if (title || artist) {
    try {
      const searchQuery = `${artist || ''} ${title || ''}`.trim();
      const searchRes = await searchYouTubeMusic(searchQuery, 1, 'songs');
      if (searchRes && searchRes.length > 0 && searchRes[0].ytId) {
        resolvedVideoId = searchRes[0].ytId;
        const tracks = await getSimilarTracksYouTubeMusic(resolvedVideoId, numLimit, title, artist);
        if (tracks && tracks.length > 0) {
          return { success: true, tracks, source: 'ytmusic-radio' };
        }
      }
    } catch (err) {
      console.warn('Resolved videoId radio lookup notice:', err.message);
    }
  }

  // 3. Fallback: Search for Artist's other hit songs & related genre mix, strictly excluding seed title
  try {
    const seedKeywords = extractTitleKeywords(title);
    const fallbackQuery = (artist && artist !== 'Unknown Artist')
      ? `${artist} hit songs mix`
      : (title ? `${title} style radio mix` : 'trending songs 2026');

    const searchRes = await searchYouTubeMusic(fallbackQuery, numLimit * 2, 'songs');
    if (searchRes && searchRes.length > 0) {
      // Filter out multiple occurrences of seed song title keywords
      let seedMatchCount = 0;
      const filtered = searchRes.filter(t => {
        if (!t || !t.title) return false;
        const tLower = t.title.toLowerCase();
        if (seedKeywords.length > 0 && seedKeywords.some(kw => tLower.includes(kw))) {
          if (seedMatchCount >= 1) return false;
          seedMatchCount++;
        }
        return true;
      });

      if (filtered.length > 0) {
        return { success: true, tracks: filtered.slice(0, numLimit), source: 'ytmusic-search' };
      }
    }
  } catch (err) {
    console.warn('Fallback similar songs search warning:', err);
  }

  return { success: false, tracks: [] };
});

const streamUrlCache = new Map();

// --- High-Speed Persistent Stream Resolver Daemon ---
let streamResolverProc = null;
let streamResolverReady = false;
let streamRequestId = 0;
const pendingStreamRequests = new Map();

function getStreamResolverScriptPath() {
  const candidates = [
    path.join(__dirname, 'stream_resolver.py').replace('app.asar', 'app.asar.unpacked'),
    path.join(__dirname, 'stream_resolver.py'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked/electron/stream_resolver.py')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function initStreamResolver() {
  if (process.platform !== 'linux') return;
  if (streamResolverProc) return;
  const scriptPath = getStreamResolverScriptPath();
  if (!scriptPath) {
    console.warn('[StreamResolver] stream_resolver.py not found, will use CLI fallback.');
    return;
  }

  try {
    streamResolverProc = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';
    streamResolverProc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const res = JSON.parse(line.trim());
          if (res.status === 'ready') {
            streamResolverReady = true;
            console.log('[StreamResolver] Persistent Python resolver ready.');
            continue;
          }
          if (res.id !== undefined && pendingStreamRequests.has(res.id)) {
            const { resolve, timer } = pendingStreamRequests.get(res.id);
            clearTimeout(timer);
            pendingStreamRequests.delete(res.id);
            resolve(res);
          }
        } catch (e) {
          console.warn('[StreamResolver] Parse error:', e.message);
        }
      }
    });

    streamResolverProc.stderr.on('data', () => {});

    streamResolverProc.on('error', (err) => {
      console.warn('[StreamResolver] Process error:', err.message);
      streamResolverProc = null;
      streamResolverReady = false;
    });

    streamResolverProc.on('exit', () => {
      streamResolverProc = null;
      streamResolverReady = false;
      for (const [id, req] of pendingStreamRequests.entries()) {
        clearTimeout(req.timer);
        req.resolve({ success: false, error: 'Resolver daemon exited' });
      }
      pendingStreamRequests.clear();
    });
  } catch (err) {
    console.warn('[StreamResolver] Failed to spawn:', err.message);
    streamResolverProc = null;
  }
}

function resolveWithDaemon(url) {
  return new Promise((resolve) => {
    if (!streamResolverProc || !streamResolverReady) {
      return resolve({ success: false, error: 'Daemon not ready' });
    }
    const id = ++streamRequestId;
    const timer = setTimeout(() => {
      if (pendingStreamRequests.has(id)) {
        pendingStreamRequests.delete(id);
        resolve({ success: false, error: 'Daemon timeout' });
      }
    }, 7000);

    pendingStreamRequests.set(id, { resolve, timer });
    try {
      streamResolverProc.stdin.write(JSON.stringify({ id, url }) + '\n');
    } catch (e) {
      clearTimeout(timer);
      pendingStreamRequests.delete(id);
      resolve({ success: false, error: e.message });
    }
  });
}

function resolveWithCliFallback(url) {
  const ytdlp = getYtDlpPath();
  const streamArgs = [
    '-g',
    '-f', '140/251/ba/18/b',
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificates',
    '--extractor-args', 'youtube:player_client=android',
    '--socket-timeout', '10',
    url
  ];

  return new Promise((resolve) => {
    execFile(
      ytdlp,
      streamArgs,
      {
        timeout: 30000,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      },
      (err, stdout, stderr) => {
        if (err || !stdout || !stdout.trim()) {
          console.warn('[resolveWithCliFallback] yt-dlp error:', err ? err.message : stderr);
          return resolve({ success: false, error: err ? err.message : 'No stream URL found' });
        }
        const lines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
        if (lines.length > 0) {
          resolve({ success: true, streamUrl: lines[0] });
        } else {
          resolve({ success: false, error: 'No valid streaming HTTP URL in stdout' });
        }
      }
    );
  });
}

// Quick direct InnerTube probe (~300ms, fast path for public unenciphered tracks)
async function resolveDirectStream(videoIdOrUrl) {
  let videoId = videoIdOrUrl;
  if (!videoId) return { success: false, error: 'Empty video identifier' };
  if (videoId.includes('v=')) {
    const match = videoId.match(/v=([a-zA-Z0-9_-]{11})/);
    if (match) videoId = match[1];
  } else if (videoId.includes('youtu.be/')) {
    const match = videoId.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (match) videoId = match[1];
  }
  if (!videoId || videoId.length !== 11) {
    return { success: false, error: 'Invalid video ID format' };
  }

  const client = {
    clientName: 'ANDROID_VR',
    clientVersion: '1.65.10',
    deviceMake: 'Oculus',
    deviceModel: 'Quest 3',
    androidSdkVersion: 32,
    osName: 'Android',
    osVersion: '12L',
    hl: 'en'
  };
  const ua = 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';

  try {
    const postData = JSON.stringify({ videoId, context: { client } });
    return await new Promise((resolve) => {
      const req = https.request('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': ua,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 2500
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.playabilityStatus?.status !== 'OK') {
              return resolve({ success: false, error: json.playabilityStatus?.reason || 'Not playable directly' });
            }
            const formats = [...(json.streamingData?.formats || []), ...(json.streamingData?.adaptiveFormats || [])];
            const audioFormats = formats.filter(f => f.url && f.mimeType && f.mimeType.startsWith('audio/'));
            const target = audioFormats.find(f => f.itag === 140) ||
                           audioFormats.find(f => f.itag === 251) ||
                           audioFormats[0];
            if (target && target.url) {
              return resolve({ success: true, streamUrl: target.url, itag: target.itag });
            }
            resolve({ success: false, error: 'No direct audio format found' });
          } catch (e) {
            resolve({ success: false, error: e.message });
          }
        });
      });
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.write(postData);
      req.end();
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Extract direct high-speed audio stream URL for playback with instant memory cache
ipcMain.handle('get-stream-url', async (event, urlOrId) => {
  try {
    if (!urlOrId) return { success: false, error: 'Empty URL' };

    // Instant cache lookup: 0ms response, 0% CPU for already fetched streams
    if (streamUrlCache.has(urlOrId)) {
      return { success: true, streamUrl: streamUrlCache.get(urlOrId) };
    }

    const rawUrl = (urlOrId && urlOrId.startsWith('http')) ? urlOrId : `https://www.youtube.com/watch?v=${urlOrId}`;
    const url = rawUrl.replace('music.youtube.com', 'www.youtube.com');

    if (streamUrlCache.has(url)) {
      return { success: true, streamUrl: streamUrlCache.get(url) };
    }

    // 1. Fast Native InnerTube Probe (~300ms, instantaneous for open tracks)
    let res = await resolveDirectStream(url);

    // 2. Linux: Fast warm Python daemon (~1.5s)
    if ((!res || !res.success || !res.streamUrl) && process.platform === 'linux') {
      res = await resolveWithDaemon(url);
    }

    // 3. Windows or Linux daemon fallback: bundled standalone yt-dlp
    if (!res || !res.success || !res.streamUrl) {
      res = await resolveWithCliFallback(url);
    }

    if (res && res.success && res.streamUrl) {
      streamUrlCache.set(urlOrId, res.streamUrl);
      streamUrlCache.set(url, res.streamUrl);
      return { success: true, streamUrl: res.streamUrl };
    }

    return { success: false, error: res ? res.error : 'Stream resolution failed' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

let currentDownloadChild = null;

// Cancel in-progress download immediately to free CPU/RAM
ipcMain.handle('cancel-download', async () => {
  if (currentDownloadChild) {
    try {
      currentDownloadChild.kill('SIGTERM');
      const proc = currentDownloadChild;
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch (e) {}
      }, 1500);
    } catch (e) {}
    currentDownloadChild = null;
  }
  return { success: true };
});

// Download Online Song to ~/Music/Pulsar Downloads and inject ID3 tags
ipcMain.handle('download-online-track', async (event, trackData) => {
  try {
    const downloadDir = getDownloadDirectory();
    await fs.promises.mkdir(downloadDir, { recursive: true });

    const safeTitle = (trackData.title || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').trim();
    const safeArtist = (trackData.artist || 'Unknown').replace(/[\\/:*?"<>|]/g, '_').trim();
    const fileName = `${safeArtist} - ${safeTitle}.mp3`;
    const filePath = path.join(downloadDir, fileName);

    const isYoutube = trackData.source === 'youtube' || 
                      trackData.source === 'ytmusic' ||
                      (trackData.audioUrl && (trackData.audioUrl.includes('youtube.com') || trackData.audioUrl.includes('youtu.be')));

    if (isYoutube) {
      // Use yt-dlp to download and convert directly to MP3 with ID3 metadata
      const ytdlp = getYtDlpPath();
      const ffmpegBin = getFfmpegPath();
      const nodeRuntime = getNodeRuntime();
      const outputTemplate = path.join(downloadDir, `${safeArtist} - ${safeTitle}.%(ext)s`);
      const targetAudioUrl = (trackData.audioUrl || '').replace('music.youtube.com', 'www.youtube.com');

      // Use audio-quality 2 (high-quality VBR ~190kbps), which processes much faster
      // and consumes far less CPU than quality 0, preventing thermal throttling and laptop freezes
      const ytdlpArgs = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '2',
        '--add-metadata',
        '--no-warnings',
        '--no-check-certificates',
        '--prefer-free-formats',
        '--extractor-args', 'youtube:player_client=android,web'
      ];
      if (ffmpegBin) {
        ytdlpArgs.push('--ffmpeg-location', ffmpegBin);
      }
      if (nodeRuntime) {
        ytdlpArgs.push('--js-runtimes', `node:${nodeRuntime}`);
      }
      ytdlpArgs.push('-o', outputTemplate, targetAudioUrl);

      // Lower CPU priority with nice on Linux so background encoding never starves UI or system
      let execCmd = ytdlp;
      let execArgs = ytdlpArgs;
      if (process.platform === 'linux' && fs.existsSync('/usr/bin/nice')) {
        execCmd = '/usr/bin/nice';
        execArgs = ['-n', '10', ytdlp, ...ytdlpArgs];
      }

      let coverDataUrl = null;
      let localCoverPath = null;
      if (trackData.coverUrl && trackData.coverUrl.startsWith('http')) {
        try {
          const coverRes = await fetch(trackData.coverUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) PulsarPlayer/1.0' }
          });
          if (coverRes.ok) {
            const contentType = coverRes.headers.get('content-type') || 'image/jpeg';
            const coverMime = contentType.split(';')[0];
            const coverBuf = Buffer.from(await coverRes.arrayBuffer());
            coverDataUrl = `data:${coverMime};base64,${coverBuf.toString('base64')}`;

            const coversDir = path.join(downloadDir, '.covers');
            await fs.promises.mkdir(coversDir, { recursive: true });
            localCoverPath = path.join(coversDir, `${safeArtist} - ${safeTitle}.jpg`);
            await fs.promises.writeFile(localCoverPath, coverBuf);
          }
        } catch (e) {
          console.warn('Cover art download failed:', e.message);
        }
      }

      const executeDownload = (cmd, args) => new Promise((resolve, reject) => {
        const child = execFile(
          cmd,
          args,
          { timeout: 90000 },
          (err, stdout, stderr) => {
            currentDownloadChild = null;
            if (err) {
              if (err.killed || err.signal === 'SIGTERM' || err.signal === 'SIGKILL') {
                return reject(new Error('Download cancelled'));
              }
              return reject(err);
            }
            resolve();
          }
        );
        currentDownloadChild = child;
        if (process.platform === 'win32' && child && child.pid && os.setPriority) {
          try {
            os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
          } catch (e) {}
        }
      });

      try {
        await executeDownload(execCmd, execArgs);
      } catch (err) {
        if (err.message && err.message.toLowerCase().includes('bot')) {
          console.warn('Retrying download with android player_client...');
          const retryArgs = execArgs.map(arg =>
            arg === 'youtube:player_client=android,web' ? 'youtube:player_client=android' : arg
          );
          await executeDownload(execCmd, retryArgs);
        } else {
          console.error('yt-dlp download failed:', err.message);
          throw err;
        }
      }

      if (!fs.existsSync(filePath)) {
        // Look for any mp3 file created
        const entries = await fs.promises.readdir(downloadDir);
        const match = entries.find(f => f.toLowerCase().includes(safeTitle.toLowerCase()) && f.endsWith('.mp3'));
        if (match) {
          const actualPath = path.join(downloadDir, match);
          const stat = await fs.promises.stat(actualPath);
          const buffer = await fs.promises.readFile(actualPath);
          return {
            success: true,
            filePath: actualPath,
            fileName: match,
            size: stat.size,
            buffer: buffer,
            coverDataUrl: coverDataUrl,
            localCoverPath: localCoverPath
          };
        }
      }

      const stat = await fs.promises.stat(filePath);
      const buffer = await fs.promises.readFile(filePath);

      return {
        success: true,
        filePath,
        fileName,
        size: stat.size,
        buffer: buffer,
        coverDataUrl: coverDataUrl,
        localCoverPath: localCoverPath
      };
    }

    // Direct HTTP MP3 download (Archive.org, Jamendo, or direct links)
    const audioRes = await fetch(trackData.audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) PulsarPlayer/1.0'
      }
    });

    if (!audioRes.ok) {
      throw new Error(`Failed to download audio: HTTP ${audioRes.status}`);
    }

    const audioArrayBuffer = await audioRes.arrayBuffer();
    const rawAudioBuffer = Buffer.from(audioArrayBuffer);

    let coverBuffer = null;
    let coverMime = 'image/jpeg';
    let coverDataUrl = null;
    let localCoverPath = null;
    if (trackData.coverUrl) {
      try {
        const coverRes = await fetch(trackData.coverUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) PulsarPlayer/1.0' }
        });
        if (coverRes.ok) {
          const contentType = coverRes.headers.get('content-type') || 'image/jpeg';
          coverMime = contentType.split(';')[0];
          coverBuffer = Buffer.from(await coverRes.arrayBuffer());
          coverDataUrl = `data:${coverMime};base64,${coverBuffer.toString('base64')}`;

          const coversDir = path.join(downloadDir, '.covers');
          await fs.promises.mkdir(coversDir, { recursive: true });
          localCoverPath = path.join(coversDir, `${safeArtist} - ${safeTitle}.jpg`);
          await fs.promises.writeFile(localCoverPath, coverBuffer);
        }
      } catch (err) {
        console.warn('Cover art download failed, proceeding without artwork:', err.message);
      }
    }

    const finalMp3Buffer = createID3v23Buffer(rawAudioBuffer, {
      title: trackData.title,
      artist: trackData.artist,
      album: trackData.album,
      year: trackData.year,
      genre: trackData.genre,
      coverBuffer: coverBuffer,
      coverMime: coverMime
    });

    await fs.promises.writeFile(filePath, finalMp3Buffer);

    return {
      success: true,
      filePath,
      fileName,
      size: finalMp3Buffer.length,
      buffer: finalMp3Buffer,
      coverDataUrl: coverDataUrl,
      localCoverPath: localCoverPath
    };
  } catch (err) {
    console.error('Download error:', err);
    return {
      success: false,
      error: err.message
    };
  }
});

// IPC Handler to extract embedded ID3 APIC cover art from local file
ipcMain.handle('extract-cover-art', async (event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const stat = await fs.promises.stat(filePath);
    const readSize = Math.min(stat.size, 1024 * 1024);
    const buf = Buffer.alloc(readSize);
    const handle = await fs.promises.open(filePath, 'r');
    try {
      await handle.read(buf, 0, readSize, 0);
    } finally {
      await handle.close();
    }
    return extractID3Cover(buf);
  } catch (err) {
    return null;
  }
});

// IPC Handler to cache remote cover images permanently to disk and return offline Data URL
ipcMain.handle('cache-cover-image', async (event, { url, fileName }) => {
  if (!url || !url.startsWith('http')) return { success: false };
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) PulsarPlayer/1.0' }
    });
    if (!res.ok) return { success: false, error: 'HTTP ' + res.status };
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const mime = contentType.split(';')[0];
    const buf = Buffer.from(await res.arrayBuffer());
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

    const coversDir = path.join(app.getPath('userData'), 'covers');
    await fs.promises.mkdir(coversDir, { recursive: true });
    const cleanName = (fileName || 'cover').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    const coverPath = path.join(coversDir, `${cleanName}.jpg`);
    await fs.promises.writeFile(coverPath, buf);

    return { success: true, dataUrl, localPath: coverPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-download-folder', async () => {
  const downloadDir = getDownloadDirectory();
  await fs.promises.mkdir(downloadDir, { recursive: true });
  return downloadDir;
});

ipcMain.handle('open-download-folder', async () => {
  const downloadDir = getDownloadDirectory();
  await fs.promises.mkdir(downloadDir, { recursive: true });
  await shell.openPath(downloadDir);
  return true;
});

// Scan user's physical download directory for all offline MP3 tracks and covers
ipcMain.handle('scan-download-folder', async () => {
  try {
    const downloadDir = getDownloadDirectory();
    if (!fs.existsSync(downloadDir)) return { success: true, files: [] };

    const entries = await fs.promises.readdir(downloadDir);
    const mp3Files = [];

    for (const file of entries) {
      if (!file.toLowerCase().endsWith('.mp3')) continue;
      const fullPath = path.join(downloadDir, file);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (!stat.isFile() || stat.size < 1000) continue;

        // Check if there is an offline cover in .covers
        const nameWithoutExt = file.slice(0, -4);
        const coverPath = path.join(downloadDir, '.covers', `${nameWithoutExt}.jpg`);
        let coverDataUrl = null;
        if (fs.existsSync(coverPath)) {
          const coverBuf = await fs.promises.readFile(coverPath);
          coverDataUrl = `data:image/jpeg;base64,${coverBuf.toString('base64')}`;
        }

        // Parse artist and title from filename "Artist - Title.mp3"
        let artist = 'Unknown Artist';
        let title = nameWithoutExt;
        if (nameWithoutExt.includes(' - ')) {
          const parts = nameWithoutExt.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        }

        mp3Files.push({
          fileName: file,
          filePath: fullPath,
          size: stat.size,
          title: title,
          artist: artist,
          coverDataUrl: coverDataUrl
        });
      } catch (_) {}
    }

    return { success: true, files: mp3Files };
  } catch (err) {
    return { success: false, error: err.message, files: [] };
  }
});

ipcMain.handle('check-file-exists', async (event, filePath) => {
  if (!filePath) return false;
  return fs.existsSync(filePath);
});

ipcMain.handle('delete-physical-file', async (event, filePath) => {
  if (!filePath || typeof filePath !== 'string') return { success: false, error: 'Invalid path' };
  try {
    const downloadDir = getDownloadDirectory();
    const candidates = [
      filePath,
      path.resolve(filePath),
      path.resolve(app.getAppPath(), filePath),
      path.resolve(__dirname, '..', filePath),
      path.join(downloadDir, path.basename(filePath)),
      path.join(os.homedir(), 'Music', 'Pulsar Downloads', path.basename(filePath)),
      path.join(os.homedir(), 'Music', path.basename(filePath)),
      path.join(os.homedir(), 'Downloads', path.basename(filePath))
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) {
        const stat = await fs.promises.stat(p);
        if (stat.isFile()) {
          await fs.promises.unlink(p);
          console.log('Successfully deleted physical audio file from disk:', p);

          // If there is a companion .lrc file right alongside it, clean it up too
          const lrcPath = p.replace(/\.[^.]+$/, '.lrc');
          if (lrcPath !== p && fs.existsSync(lrcPath)) {
            try {
              await fs.promises.unlink(lrcPath);
              console.log('Deleted companion LRC file:', lrcPath);
            } catch (e) {}
          }

          return { success: true, deletedPath: p };
        }
      }
    }
    return { success: false, error: 'File not found on disk' };
  } catch (err) {
    console.warn('Failed to delete physical file:', filePath, err.message);
    return { success: false, error: err.message };
  }
});

// Optimized User-Agents:
// - GOOGLE_AUTH_UA: Firefox desktop UA for accounts.google.com (bypasses Google Botguard "This browser or app may not be secure" block)
// - YTMUSIC_DESKTOP_UA: Chrome desktop UA for music.youtube.com (serves full modern YouTube Music player interface)
const GOOGLE_AUTH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0';
const YTMUSIC_DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.234 Safari/537.36';

let googleLoginWindow = null;

function openGoogleLoginWindow(targetUrl) {
  if (googleLoginWindow && !googleLoginWindow.isDestroyed()) {
    googleLoginWindow.focus();
    return;
  }

  const loginUrl = targetUrl || 'https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F';
  const ytSession = session.fromPartition('persist:ytmusic');

  googleLoginWindow = new BrowserWindow({
    width: 520,
    height: 700,
    parent: (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : undefined,
    modal: !!(mainWindow && !mainWindow.isDestroyed()),
    backgroundColor: '#181a20',
    title: 'Sign in to Google — YouTube Music',
    icon: getAppIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      session: ytSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  googleLoginWindow.webContents.setUserAgent(GOOGLE_AUTH_UA);

  // Monitor navigation: when user completes login, Google redirects back to music.youtube.com
  googleLoginWindow.webContents.on('did-navigate', (event, url) => {
    const lower = (url || '').toLowerCase();
    if (lower.startsWith('https://music.youtube.com') || lower.startsWith('https://www.youtube.com')) {
      setTimeout(() => {
        if (googleLoginWindow && !googleLoginWindow.isDestroyed()) {
          googleLoginWindow.close();
          googleLoginWindow = null;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ytmusic-login-success');
        }
      }, 800);
    }
  });

  googleLoginWindow.on('closed', () => {
    googleLoginWindow = null;
  });

  googleLoginWindow.loadURL(loginUrl);
}

ipcMain.on('open-google-login', (event, customUrl) => {
  openGoogleLoginWindow(customUrl);
});

ipcMain.handle('clear-ytmusic-session', async () => {
  try {
    const ytSession = session.fromPartition('persist:ytmusic');
    if (ytSession) {
      await ytSession.clearStorageData();
      return { success: true };
    }
    return { success: false, error: 'Session not found' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(() => {
  protocol.handle('pulsar-audio', async (request) => {
    try {
      let raw = request.url.replace(/^pulsar-audio:\/\//, '');
      try {
        raw = decodeURIComponent(raw);
      } catch (_) {}

      let fullPath;
      const winMatch = raw.match(/^\/?([a-zA-Z]):[\/\\](.*)/);
      if (winMatch) {
        fullPath = winMatch[1].toUpperCase() + ':\\' + winMatch[2].replace(/\//g, '\\');
      } else {
        if (!raw.startsWith('/')) raw = '/' + raw;
        fullPath = path.posix.normalize(raw);
      }

      if (!fs.existsSync(fullPath)) {
        console.warn('[pulsar-audio] File not found on disk:', fullPath);
        return new Response('File not found', { status: 404 });
      }

      let fileUrl;
      if (process.platform === 'win32' || winMatch) {
        const normWin = fullPath.replace(/\\/g, '/');
        const cleanDrive = normWin.startsWith('/') ? normWin.slice(1) : normWin;
        fileUrl = 'file:///' + encodeURI(cleanDrive).replace(/#/g, '%23').replace(/\?/g, '%3F');
      } else {
        fileUrl = pathToFileURL(fullPath).toString();
      }

      return await net.fetch(fileUrl);
    } catch (err) {
      console.error('[pulsar-audio] protocol error:', err.message);
      return new Response('Error loading file: ' + err.message, { status: 500 });
    }
  });

  // CORS bypass header interceptor for Web Audio API visualizers & audio streams
  if (session && session.defaultSession) {
    session.defaultSession.setUserAgent(YTMUSIC_DESKTOP_UA);
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = Object.assign({}, details.responseHeaders);
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS'];
      callback({ responseHeaders });
    });
  }

  // Persistent YouTube Music session configuration (keeps Google login & cookies saved across launches)
  try {
    const ytSession = session.fromPartition('persist:ytmusic');
    if (ytSession) {
      ytSession.setUserAgent(YTMUSIC_DESKTOP_UA);

      // Permission handlers for WebAuthn, Security Keys, Media, and Notifications
      ytSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = [
          'media',
          'notifications',
          'fullscreen',
          'pointerLock',
          'clipboard-read',
          'clipboard-sanitized-write',
          'speaker-selection'
        ];
        callback(allowedPermissions.includes(permission));
      });

      ytSession.setPermissionCheckHandler((webContents, permission) => {
        const allowedChecks = [
          'media',
          'notifications',
          'fullscreen',
          'pointerLock',
          'clipboard-read',
          'clipboard-sanitized-write',
          'hid',
          'serial',
          'usb',
          'speaker-selection'
        ];
        return allowedChecks.includes(permission);
      });

      // Intercept request headers to accounts.google.com to strip Client Hints and enforce Firefox UA
      ytSession.webRequest.onBeforeSendHeaders((details, callback) => {
        const requestHeaders = Object.assign({}, details.requestHeaders);
        const url = (details.url || '').toLowerCase();

        if (
          url.includes('accounts.google.com') ||
          url.includes('accounts.youtube.com') ||
          url.includes('oauth2.googleapis.com') ||
          url.includes('myaccount.google.com') ||
          url.includes('google.com/signin') ||
          url.includes('google.com/servicelogin')
        ) {
          requestHeaders['User-Agent'] = GOOGLE_AUTH_UA;
          // Strip Chromium Client Hints that reveal embedded/mismatched browser environment
          delete requestHeaders['Sec-CH-UA'];
          delete requestHeaders['Sec-CH-UA-Mobile'];
          delete requestHeaders['Sec-CH-UA-Platform'];
          delete requestHeaders['Sec-CH-UA-Model'];
          delete requestHeaders['sec-ch-ua'];
          delete requestHeaders['sec-ch-ua-mobile'];
          delete requestHeaders['sec-ch-ua-platform'];
          delete requestHeaders['sec-ch-ua-model'];
          delete requestHeaders['sec-ch-ua-platform-version'];
        } else if (url.includes('music.youtube.com') || url.includes('youtube.com')) {
          requestHeaders['User-Agent'] = YTMUSIC_DESKTOP_UA;
        }

        callback({ requestHeaders });
      });
    }
  } catch (err) {
    console.warn('Could not initialize ytmusic session:', err);
  }

  // Provide injected script content to renderer
  ipcMain.handle('get-ytmusic-inject-code', async () => {
    try {
      const injectFile = path.join(__dirname, 'ytmusic-inject.cjs');
      if (fs.existsSync(injectFile)) {
        return await fs.promises.readFile(injectFile, 'utf8');
      }
    } catch (e) {
      console.warn('Could not read ytmusic-inject.cjs:', e.message);
    }
    return '';
  });

  // Set dynamic User-Agent, popup handling, and auto-injection on YouTube Music webview
  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
      contents.setUserAgent(YTMUSIC_DESKTOP_UA);

      // Auto-inject download buttons into YouTube Music guest pages
      contents.on('dom-ready', async () => {
        try {
          const url = contents.getURL() || '';
          if (url.includes('music.youtube.com')) {
            const injectFile = path.join(__dirname, 'ytmusic-inject.cjs');
            if (fs.existsSync(injectFile)) {
              const code = await fs.promises.readFile(injectFile, 'utf8');
              await contents.executeJavaScript(code);
            }
          }
        } catch (e) {
          console.warn('Auto-inject into web-contents failed:', e.message);
        }
      });

      // Switch UA dynamically when navigating to Google login vs YouTube Music
      contents.on('did-start-navigation', (event, url) => {
        const lower = (url || '').toLowerCase();
        if (
          lower.includes('accounts.google.com') ||
          lower.includes('accounts.youtube.com') ||
          lower.includes('oauth2.googleapis.com') ||
          lower.includes('google.com/signin') ||
          lower.includes('google.com/servicelogin')
        ) {
          contents.setUserAgent(GOOGLE_AUTH_UA);
        } else if (lower.includes('music.youtube.com') || lower.includes('youtube.com')) {
          contents.setUserAgent(YTMUSIC_DESKTOP_UA);
        }
      });
    }

    contents.setWindowOpenHandler(({ url }) => {
      if (url.includes('google.com') || url.includes('youtube.com') || url.includes('gstatic.com')) {
        openGoogleLoginWindow(url);
        return { action: 'deny' };
      }
      shell.openExternal(url);
      return { action: 'deny' };
    });
  });

  createMainWindow();
  createTray();
  registerMediaKeys();
  initStreamResolver();

  // Quiet background update check 3.5 seconds after launch
  setTimeout(async () => {
    try {
      if (app.isPackaged) {
        autoUpdater.checkForUpdates().catch(err => log.warn('Initial background update check:', err.message));
      }
    } catch (_) {}
  }, 3500);

  // Periodic background update check every 2 hours
  setInterval(() => {
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch(err => log.warn('Periodic background update check:', err.message));
    }
  }, 2 * 60 * 60 * 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (streamResolverProc) {
    try { streamResolverProc.kill('SIGTERM'); } catch (e) {}
    streamResolverProc = null;
  }
  if (tray && !tray.isDestroyed()) {
    try { tray.destroy(); } catch (e) {}
    tray = null;
  }
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  isQuitting = true;
  if (tray && !tray.isDestroyed()) {
    try { tray.destroy(); } catch (e) {}
    tray = null;
  }
  app.quit();
});

// ============================================================================
// Professional Background Auto-Update Engine (Universal electron-updater)
// ============================================================================
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logger
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Universal silent background download & auto-install on app quit
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;
autoUpdater.allowDowngrade = false;

// Track downloaded update state
let downloadedUpdateInfo = null;

// Standard event listeners
autoUpdater.on('checking-for-update', () => {
  log.info('Auto-updater: Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  log.info('Auto-updater: Update available:', info.version);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available-detected', {
      updateAvailable: true,
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      releaseNotes: info.releaseNotes || 'A new update is available.',
      info
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Auto-updater: App is up to date:', app.getVersion());
});

autoUpdater.on('download-progress', (progressObj) => {
  const percent = Math.round(progressObj.percent || 0);
  log.info(`Auto-updater download progress: ${percent}%`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-download-progress', {
      percent: percent,
      transferred: progressObj.transferred || 0,
      total: progressObj.total || 0,
      bytesPerSecond: progressObj.bytesPerSecond || 0
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Auto-updater: Update downloaded and ready to install:', info.version);
  downloadedUpdateInfo = info;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-downloaded', {
      readyToInstall: true,
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      releaseNotes: info.releaseNotes || 'A new version of Pulsar is ready. Restart to update.',
      message: 'A new version of Pulsar is ready. Restart to update.'
    });
  }
});

autoUpdater.on('error', (err) => {
  log.warn('Auto-updater error:', err ? err.message : 'Unknown updater error');
});

// IPC Handlers
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    log.info('Auto-updater: App running in unpackaged/dev mode. Skipping check.');
    return {
      success: true,
      updateAvailable: false,
      currentVersion: app.getVersion(),
      latestVersion: app.getVersion(),
      releaseNotes: 'Running in development mode.'
    };
  }
  try {
    log.info('Manual update check initiated by user...');
    const result = await autoUpdater.checkForUpdates();
    const updateInfo = result?.updateInfo;
    const isAvailable = updateInfo && updateInfo.version && updateInfo.version !== app.getVersion();
    return {
      success: true,
      updateAvailable: isAvailable,
      currentVersion: app.getVersion(),
      latestVersion: updateInfo?.version || app.getVersion(),
      releaseNotes: updateInfo?.releaseNotes || 'A new update is ready.',
      isReadyToInstall: !!downloadedUpdateInfo
    };
  } catch (err) {
    log.warn('Manual check-for-updates error:', err.message);
    return {
      success: false,
      updateAvailable: false,
      currentVersion: app.getVersion(),
      error: err.message
    };
  }
});

ipcMain.handle('download-update', async () => {
  if (!app.isPackaged) return { success: true };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-update', async () => {
  log.info('User triggered Restart & Apply Update via autoUpdater.quitAndInstall(false, true)...');
  if (tray && !tray.isDestroyed()) {
    try { tray.destroy(); } catch (_) {}
    tray = null;
  }
  setImmediate(() => {
    // isSilent: false, isForceRunAfter: true (applies silently in background and relaunches app)
    autoUpdater.quitAndInstall(false, true);
  });
  return { success: true };
});
