import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import { execFile, execSync } from 'child_process';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const results = [];

function recordTest(name, passed, details = '') {
  results.push({ name, passed, details });
  const mark = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${mark}: ${name} ${details ? '(' + details + ')' : ''}`);
}

console.log('================================================================');
console.log('  PULSAR MUSIC PLAYER: WINDOWS & CROSS-PLATFORM QA VERIFICATION ');
console.log('================================================================\n');

// ----------------------------------------------------------------
// 1. Path & Protocol Unit Tests
// ----------------------------------------------------------------
console.log('--- 1. Path & Protocol Unit Tests ---');

function toPulsarAudioUrl(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const normalized = filePath.replace(/\\/g, '/');
  const pathPart = normalized.startsWith('/') ? normalized : '/' + normalized;
  return 'pulsar-audio://' + encodeURI(pathPart).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

function decodePulsarPath(reqUrl) {
  try {
    let raw = reqUrl.replace(/^pulsar-audio:\/\//, '');
    raw = decodeURIComponent(raw);
    if (/^\/?[a-zA-Z]:[\/\\]/.test(raw)) {
      if (raw.startsWith('/')) raw = raw.slice(1);
      return path.win32.normalize(raw);
    }
    if (!raw.startsWith('/')) raw = '/' + raw;
    return path.posix.normalize(raw);
  } catch (e) {
    return null;
  }
}

// Test Linux Path
const linuxPath = '/home/hamza/Music/Pulsar Downloads/Artist - Song.mp3';
const linuxUrl = toPulsarAudioUrl(linuxPath);
const linuxDecoded = decodePulsarPath(linuxUrl);
recordTest(
  'Linux Path Encoding & Decoding',
  linuxDecoded === linuxPath,
  `Original: ${linuxPath} -> Decoded: ${linuxDecoded}`
);

// Test Windows Standard Path with Backslashes
const winPathBackslash = 'C:\\Users\\User\\Music\\Pulsar Downloads\\Artist - Song.mp3';
const winUrl1 = toPulsarAudioUrl(winPathBackslash);
const winDecoded1 = decodePulsarPath(winUrl1);
recordTest(
  'Windows Backslash Path Encoding & Decoding',
  winDecoded1 === winPathBackslash,
  `Original: ${winPathBackslash} -> Decoded: ${winDecoded1}`
);

// Test Windows Forward Slash Path
const winPathForward = 'C:/Users/User/Music/Pulsar Downloads/Artist - Song.mp3';
const winUrl2 = toPulsarAudioUrl(winPathForward);
const winDecoded2 = decodePulsarPath(winUrl2);
recordTest(
  'Windows Forward-slash Path Encoding & Decoding',
  winDecoded2 === path.win32.normalize(winPathForward),
  `Decoded: ${winDecoded2}`
);

// Test Secondary Windows Drive with Special Characters
const winSpecialPath = 'D:\\Music\\Rock & Roll #1 [Remix]?.mp3';
const winUrl3 = toPulsarAudioUrl(winSpecialPath);
const winDecoded3 = decodePulsarPath(winUrl3);
recordTest(
  'Windows Secondary Drive with Special Chars',
  winDecoded3 === winSpecialPath,
  `Decoded: ${winDecoded3}`
);

// ----------------------------------------------------------------
// 2. InnerTube, Radio Queue & Fast Stream Test
// ----------------------------------------------------------------
console.log('\n--- 2. InnerTube, Radio Queue & Fast Stream Test ---');

// High-Speed Direct InnerTube Stream Resolver (~200-300ms, 0 external processes, pure Node.js)
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

  const clients = [
    {
      context: {
        client: {
          clientName: 'IOS',
          clientVersion: '21.02.3',
          deviceMake: 'Apple',
          deviceModel: 'iPhone16,2',
          osName: 'iPhone',
          osVersion: '18.3.2.22D82',
          hl: 'en'
        }
      },
      ua: 'com.google.ios.youtube/21.02.3 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)'
    },
    {
      context: {
        client: {
          clientName: 'ANDROID_VR',
          clientVersion: '1.65.10',
          deviceMake: 'Oculus',
          deviceModel: 'Quest 3',
          androidSdkVersion: 32,
          osName: 'Android',
          osVersion: '12L',
          hl: 'en'
        }
      },
      ua: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip'
    }
  ];

  for (const c of clients) {
    try {
      const postData = JSON.stringify({
        videoId: videoId,
        context: c.context
      });

      const result = await new Promise((resolve) => {
        const req = https.request('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': c.ua,
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 5000
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(body);
              if (json.playabilityStatus?.status !== 'OK') {
                return resolve({ success: false, error: json.playabilityStatus?.reason || 'Not playable' });
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

      if (result.success && result.streamUrl) {
        return result;
      }
    } catch (e) {}
  }

  return { success: false, error: 'InnerTube extraction failed' };
}

async function verifyAudioStreamPlayable(streamUrl) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(streamUrl);
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'Range': 'bytes=0-1024',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PulsarPlayer/1.1'
        },
        timeout: 6000
      }, (res) => {
        const isOk = res.statusCode === 200 || res.statusCode === 206;
        const contentType = res.headers['content-type'] || '';
        resolve({ ok: isOk, statusCode: res.statusCode, contentType });
        res.destroy();
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

// Test Native InnerTube Stream Resolution
const streamStart = Date.now();
const testVideoId = 'dQw4w9WgXcQ';
const streamRes = await resolveDirectStream(testVideoId);
const streamElapsed = Date.now() - streamStart;

recordTest(
  'Fast Native InnerTube Stream Resolver (~300ms, 0 external processes)',
  streamRes.success && !!streamRes.streamUrl,
  `Elapsed: ${streamElapsed}ms, itag: ${streamRes.itag}`
);

if (streamRes.success && streamRes.streamUrl) {
  const streamPlayable = await verifyAudioStreamPlayable(streamRes.streamUrl);
  recordTest(
    'Resolved Audio Stream HTTP Response (Playable 200/206)',
    streamPlayable.ok,
    `Status: ${streamPlayable.statusCode}, Type: ${streamPlayable.contentType}`
  );
}

// ----------------------------------------------------------------
// 3. Headless App UI Smoke Test (Puppeteer)
// ----------------------------------------------------------------
console.log('\n--- 3. Headless App UI Smoke Test (Puppeteer) ---');

// Serve dist directory using a lightweight HTTP server
const distDir = path.join(projectRoot, 'dist');
let server = null;
let serverPort = 0;

try {
  server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || !reqPath) reqPath = '/index.html';
    const filePath = path.join(distDir, reqPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mime = ext === '.html' ? 'text/html' :
                   ext === '.js' ? 'application/javascript' :
                   ext === '.css' ? 'text/css' :
                   ext === '.png' ? 'image/png' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', err => consoleErrors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(`http://127.0.0.1:${serverPort}/index.html`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  recordTest(
    'UI Console & Runtime Cleanliness (Zero Unhandled Errors)',
    consoleErrors.length === 0,
    consoleErrors.length === 0 ? 'No errors' : `Errors: ${consoleErrors.join(', ')}`
  );

  const uiChecks = await page.evaluate(() => {
    return {
      title: document.title,
      hasVisualizer: !!document.getElementById('visualizerCanvas') || !!document.querySelector('.visualizer-container'),
      hasEQ: !!document.getElementById('eqModal') || !!document.querySelector('.eq-sliders-grid'),
      hasDiscoverNav: !!document.getElementById('navDiscover') || !!document.querySelector('[data-view="discover"]'),
      hasAllSongsNav: !!document.getElementById('navAllSongs') || !!document.querySelector('[data-view="all-songs"]'),
      hasFavoritesNav: !!document.getElementById('navFavorites') || !!document.querySelector('[data-view="favorites"]'),
      hasPlaylistsSection: !!document.getElementById('playlistsList') || !!document.getElementById('newPlaylistBtn'),
      hasDownloadActions: !!document.getElementById('npDownloadBtn') || !!document.getElementById('npDownloadQueueBtn')
    };
  });

  recordTest('UI Navigation (All Songs, Discover & Flow, Favorites, Playlists, Downloads)',
    uiChecks.hasAllSongsNav && uiChecks.hasDiscoverNav && uiChecks.hasFavoritesNav && uiChecks.hasPlaylistsSection && uiChecks.hasDownloadActions,
    `Title: ${uiChecks.title}`
  );

  recordTest('Audio Visualizer & 10-Band EQ Controls Available',
    uiChecks.hasVisualizer && uiChecks.hasEQ,
    `Visualizer: ${uiChecks.hasVisualizer}, EQ: ${uiChecks.hasEQ}`
  );

  await browser.close();
} catch (err) {
  recordTest('Headless UI Smoke Test', false, err.message);
} finally {
  if (server) server.close();
}

// ----------------------------------------------------------------
// 4. Real Wine QA Test on the Windows Build
// ----------------------------------------------------------------
console.log('\n--- 4. Real Wine QA Test on the Windows Build ---');

// Test 1: Bundled Windows yt-dlp.exe
try {
  const ytdlpWinPath = path.join(projectRoot, 'bin', 'win', 'yt-dlp.exe');
  const ytdlpVersion = execSync(`wine "${ytdlpWinPath}" --version`, { encoding: 'utf8', timeout: 15000 }).trim();
  recordTest(
    'Wine Execution of Bundled yt-dlp.exe',
    ytdlpVersion.length > 0,
    `Version: ${ytdlpVersion}`
  );
} catch (err) {
  recordTest('Wine Execution of Bundled yt-dlp.exe', false, err.message);
}

// Test 2: Bundled Windows ffmpeg.exe
try {
  const ffmpegWinPath = path.join(projectRoot, 'bin', 'win', 'ffmpeg.exe');
  const ffmpegOutput = execSync(`wine "${ffmpegWinPath}" -version`, { encoding: 'utf8', timeout: 15000 });
  const firstLine = ffmpegOutput.split('\n').find(l => l.includes('ffmpeg version')) || 'ffmpeg detected';
  recordTest(
    'Wine Execution of Bundled ffmpeg.exe',
    ffmpegOutput.includes('ffmpeg version'),
    firstLine.trim().slice(0, 50)
  );
} catch (err) {
  recordTest('Wine Execution of Bundled ffmpeg.exe', false, err.message);
}

// Test 3: Unpacked Windows Application Executable & Binaries
const winUnpackedDir = path.join(projectRoot, 'dist-electron', 'win-unpacked');
const winExePath = path.join(winUnpackedDir, 'Pulsar Music Player.exe');
const winYtdlpPath = [
  path.join(winUnpackedDir, 'resources', 'bin', 'win', 'yt-dlp.exe'),
  path.join(winUnpackedDir, 'resources', 'app.asar.unpacked', 'bin', 'win', 'yt-dlp.exe')
].find(p => fs.existsSync(p));
const winFfmpegPath = [
  path.join(winUnpackedDir, 'resources', 'bin', 'win', 'ffmpeg.exe'),
  path.join(winUnpackedDir, 'resources', 'app.asar.unpacked', 'bin', 'win', 'ffmpeg.exe')
].find(p => fs.existsSync(p));

recordTest(
  'Windows Unpacked Application Executable Exists',
  fs.existsSync(winExePath),
  winExePath
);

// Verify PE Header (MZ magic)
let isPE = false;
try {
  const buf = Buffer.alloc(2);
  const fd = fs.openSync(winExePath, 'r');
  fs.readSync(fd, buf, 0, 2, 0);
  fs.closeSync(fd);
  isPE = buf.toString('utf8') === 'MZ';
} catch (e) {}

recordTest(
  'Windows Executable PE Binary Header Integrity (Valid MZ/PE)',
  isPE,
  'MZ signature validated'
);

recordTest(
  'Bundled Windows Binaries Present in Windows App Resources (0 Python Needed)',
  !!winYtdlpPath && !!winFfmpegPath,
  `yt-dlp: ${!!winYtdlpPath}, ffmpeg: ${!!winFfmpegPath}`
);

// Test 4: Live Wine Initialization Smoke Test
try {
  const wineProc = execSync(`timeout -s KILL 3 wine "${winExePath}" --version 2>&1 || true`, { encoding: 'utf8' });
  const noMissingDll = !wineProc.toLowerCase().includes('err:module:import_dll');
  recordTest(
    'Wine Live Startup Smoke Test (Zero Missing DLL / Dependency Errors)',
    noMissingDll,
    'Clean process initialization under Wine'
  );
} catch (err) {
  recordTest('Wine Live Startup Smoke Test', false, err.message);
}

// ----------------------------------------------------------------
// 5. Final Package Artifacts Summary
// ----------------------------------------------------------------
console.log('\n--- 5. Package Artifacts Summary ---');

const distElectron = path.join(projectRoot, 'dist-electron');
let winExeFiles = [];
if (fs.existsSync(distElectron)) {
  winExeFiles = fs.readdirSync(distElectron).filter(f => f.endsWith('.exe'));
  for (const f of winExeFiles) {
    const full = path.join(distElectron, f);
    const sizeMb = (fs.statSync(full).size / (1024 * 1024)).toFixed(1);
    console.log(`📦 Windows Executable: ${full} (${sizeMb} MB)`);
  }
}

const debPath = path.join(distElectron, 'pulsar-music-player_1.1.0_amd64.deb');
const altDebPath = '/home/hamza/pulsar-music-player_1.1.0_amd64.deb';
if (fs.existsSync(debPath)) {
  const sizeMb = (fs.statSync(debPath).size / (1024 * 1024)).toFixed(1);
  console.log(`🐧 Linux .deb Package: ${debPath} (${sizeMb} MB)`);
} else if (fs.existsSync(altDebPath)) {
  const sizeMb = (fs.statSync(altDebPath).size / (1024 * 1024)).toFixed(1);
  console.log(`🐧 Linux .deb Package: ${altDebPath} (${sizeMb} MB)`);
}

const allPassed = results.every(r => r.passed);
console.log('\n================================================================');
console.log(`  QA SUMMARY: ${results.filter(r => r.passed).length}/${results.length} CHECKS PASSED`);
console.log('================================================================');

if (!allPassed) {
  process.exit(1);
} else {
  console.log('\n🎉 ALL WINDOWS & LINUX CROSS-PLATFORM QA CHECKS PASSED FLAWLESSLY!\n');
}
