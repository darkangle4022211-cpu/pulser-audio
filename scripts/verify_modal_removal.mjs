import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const results = [];
function check(name, pass, details = '') {
  results.push({ name, pass, details });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'}: ${name} ${details ? '(' + details + ')' : ''}`);
}

async function runTest() {
  console.log('=== VERIFYING UPDATE MODAL REMOVAL & SILENT AUTO-UPDATE ===\n');

  // Serve dist folder
  const server = http.createServer((req, res) => {
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

  const serverPort = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const consoleErrors = [];
  page.on('pageerror', err => consoleErrors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  let installUpdateCalled = false;
  let downloadUpdateCalled = false;

  await page.evaluateOnNewDocument(() => {
    window.__updateCallbacks = {};
    window.electronAPI = {
      minimize: () => {},
      maximize: () => {},
      close: () => {},
      selectAudioFiles: async () => ({ cancelled: true, filePaths: [] }),
      selectAudioFolder: async () => ({ cancelled: true, folderPath: '' }),
      scanDownloadFolder: async () => ({ success: true, files: [] }),
      checkForUpdates: async () => ({
        updateAvailable: true,
        currentVersion: '1.1.8',
        latestVersion: '1.1.9',
        releaseNotes: 'Performance improvements'
      }),
      downloadUpdate: async () => {
        window.__downloadUpdateCalled = true;
        return { success: true };
      },
      installUpdate: async () => {
        window.__installUpdateCalled = true;
        return { success: true };
      },
      onUpdateDownloadProgress: (cb) => { window.__updateCallbacks.progress = cb; },
      onUpdateAvailableDetected: (cb) => { window.__updateCallbacks.detected = cb; },
      onUpdateDownloaded: (cb) => { window.__updateCallbacks.downloaded = cb; },
      getLibraryStats: async () => ({ totalTracks: 0, totalArtists: 0, totalAlbums: 0, totalPlaylists: 0, totalPlaytimeSec: 0 })
    };
  });

  await page.goto(`http://127.0.0.1:${serverPort}`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 600));

  // 1. Verify updateModal is completely gone
  const hasUpdateModal = await page.evaluate(() => {
    return document.getElementById('updateModal') !== null;
  });
  check('Update Modal Element (#updateModal) Removed from DOM', !hasUpdateModal, hasUpdateModal ? 'Still found' : 'Completely removed');

  // 2. Verify btnUpdateAvailable exists
  const hasBtn = await page.evaluate(() => {
    return document.getElementById('btnUpdateAvailable') !== null;
  });
  check('Top-Right Update Button (#btnUpdateAvailable) Present', hasBtn);

  // 3. Simulate update-available-detected
  await page.evaluate(() => {
    if (window.__updateCallbacks.detected) {
      window.__updateCallbacks.detected({
        updateAvailable: true,
        currentVersion: '1.1.8',
        latestVersion: '1.1.9',
        releaseNotes: 'Test Release'
      });
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const btnVisible = await page.evaluate(() => {
    const el = document.getElementById('btnUpdateAvailable');
    return el && (el.style.display !== 'none' || el.classList.contains('is-visible'));
  });
  check('Update Indicator Button Becomes Visible on Update Detected', btnVisible);

  // 4. Simulate download progress
  await page.evaluate(() => {
    if (window.__updateCallbacks.progress) {
      window.__updateCallbacks.progress({ percent: 45, transferred: 4500000, total: 10000000 });
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const btnTextProgress = await page.evaluate(() => {
    const el = document.getElementById('updateBtnText');
    return el ? el.textContent : '';
  });
  check('Update Indicator Shows Live Progress Percent (45%)', btnTextProgress.includes('45%'), `Text: "${btnTextProgress}"`);

  // 5. Click the update indicator while downloading - verify NO MODAL OPENS
  await page.evaluate(() => {
    const el = document.getElementById('btnUpdateAvailable');
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 300));

  const modalStillGone = await page.evaluate(() => {
    return document.getElementById('updateModal') === null && document.querySelector('.update-modal-backdrop') === null;
  });
  check('Clicking Update Button During Download Opens ZERO Windows', modalStillGone);

  // 6. Simulate update-downloaded
  await page.evaluate(() => {
    if (window.__updateCallbacks.downloaded) {
      window.__updateCallbacks.downloaded({ version: '1.1.9' });
    }
  });
  await new Promise(r => setTimeout(r, 200));

  const readyState = await page.evaluate(() => {
    const el = document.getElementById('btnUpdateAvailable');
    const txt = document.getElementById('updateBtnText');
    return {
      hasReadyClass: el && el.classList.contains('ready-to-install'),
      text: txt ? txt.textContent : ''
    };
  });
  check('Update Button Transitions to "Restart Now" with Green Accent', readyState.hasReadyClass && readyState.text.includes('Restart'), `Text: "${readyState.text}", readyClass: ${readyState.hasReadyClass}`);

  // 7. Click Restart Now - verify nativeApi.installUpdate() is invoked
  await page.evaluate(() => {
    const el = document.getElementById('btnUpdateAvailable');
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 300));

  const installTriggered = await page.evaluate(() => {
    return window.__installUpdateCalled === true;
  });
  check('Clicking "Restart Now" Calls nativeApi.installUpdate()', installTriggered);

  check('Zero Console / Page Errors', consoleErrors.length === 0, consoleErrors.join('; '));

  await browser.close();
  server.close();

  const allPassed = results.every(r => r.pass);
  console.log('\n================================================================');
  console.log(`  SUMMARY: ${results.filter(r => r.pass).length}/${results.length} CHECKS PASSED`);
  console.log('================================================================');

  process.exit(allPassed ? 0 : 1);
}

runTest().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
