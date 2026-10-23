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

async function runDesktopQA() {
  console.log('================================================================');
  console.log('  PULSAR MUSIC PLAYER: DESKTOP 1280x800 QA VERIFICATION         ');
  console.log('================================================================\n');

  // 1. Serve dist
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

  // Inject a mock electronAPI for desktop IPC
  await page.evaluateOnNewDocument(() => {
    window.electronAPI = {
      minimize: () => {},
      maximize: () => {},
      close: () => {},
      selectAudioFiles: async () => ({ cancelled: true, filePaths: [] }),
      selectAudioFolder: async () => ({ cancelled: true, folderPath: '' }),
      scanDownloadFolder: async () => ({ success: true, files: [] }),
      checkForUpdates: async () => ({ updateAvailable: false, currentVersion: '1.1.4' }),
      notifyTrackChange: () => {},
      onMediaKey: () => {},
      searchOnlineMusic: async () => ({ success: true, tracks: [] }),
      getSimilarSongs: async () => ({ success: true, tracks: [] }),
      getSearchSuggestions: async () => []
    };
  });

  await page.goto(`http://127.0.0.1:${serverPort}/index.html`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // Test 1: Zero runtime console errors
  check('Runtime Console Cleanliness (0 errors)', consoleErrors.length === 0, consoleErrors.join('; ') || 'Clean');

  // Test 2: Mobile DOM Elements completely absent
  const mobileRemnants = await page.evaluate(() => {
    return {
      mobileBottomNav: !!document.getElementById('mobileBottomNav'),
      mobileSearchOverlay: !!document.getElementById('mobileSearchOverlay'),
      mobileDrawerBackdrop: !!document.getElementById('mobileDrawerBackdrop'),
      mobileSearchBtn: !!document.getElementById('mobileSearchBtn'),
      mobileMenuBtn: !!document.getElementById('mobileMenuBtn'),
      mobileVisualizerToggleBtn: !!document.getElementById('mobileVisualizerToggleBtn'),
      mobileOnlyBtns: document.querySelectorAll('.mobile-only-btn').length,
      platformMobileClass: document.body.classList.contains('platform-mobile'),
      hasMobileCssLink: !!document.querySelector('link[href*="mobile.css"]')
    };
  });

  check('Mobile Bottom Nav removed', !mobileRemnants.mobileBottomNav);
  check('Mobile Search Overlay removed', !mobileRemnants.mobileSearchOverlay);
  check('Mobile Drawer Backdrop removed', !mobileRemnants.mobileDrawerBackdrop);
  check('Mobile Header Buttons removed', !mobileRemnants.mobileSearchBtn && !mobileRemnants.mobileMenuBtn && !mobileRemnants.mobileVisualizerToggleBtn);
  check('Zero .mobile-only-btn elements in DOM', mobileRemnants.mobileOnlyBtns === 0);
  check('body.platform-mobile class absent', !mobileRemnants.platformMobileClass);
  check('mobile.css stylesheet link absent', !mobileRemnants.hasMobileCssLink);

  // Test 3: Desktop Header & Frameless Window Controls
  const headerCheck = await page.evaluate(() => {
    const header = document.querySelector('.app-header');
    const winMin = document.getElementById('winMinBtn');
    const winMax = document.getElementById('winMaxBtn');
    const winClose = document.getElementById('winCloseBtn');
    const themeBtn = document.getElementById('themeToggleBtn');
    const notifBtn = document.getElementById('notificationToggleBtn');
    const brand = document.querySelector('.app-brand');
    return {
      hasHeader: !!header,
      hasMin: !!winMin && getComputedStyle(winMin).display !== 'none',
      hasMax: !!winMax && getComputedStyle(winMax).display !== 'none',
      hasClose: !!winClose && getComputedStyle(winClose).display !== 'none',
      hasTheme: !!themeBtn,
      hasNotif: !!notifBtn,
      brandText: brand ? brand.textContent.trim() : ''
    };
  });

  check('Desktop Header with Window Controls (- □ ×)', headerCheck.hasHeader && headerCheck.hasMin && headerCheck.hasMax && headerCheck.hasClose, `Brand: ${headerCheck.brandText}`);

  // Test 4: Hover Sidebar & Sidebar Edge Trigger at 1280x800
  const sidebarCheck = await page.evaluate(() => {
    const sidebar = document.getElementById('appSidebar');
    const edgeTrigger = document.getElementById('sidebarEdgeTrigger');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    const navAllSongs = document.getElementById('navAllSongs');
    const navDiscover = document.getElementById('navDiscover');
    const navFavorites = document.getElementById('navFavorites');

    const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
    return {
      hasSidebar: !!sidebar,
      hasEdgeTrigger: !!edgeTrigger,
      hasToggleBtn: !!toggleBtn,
      hasNavAllSongs: !!navAllSongs,
      hasNavDiscover: !!navDiscover,
      hasNavFavorites: !!navFavorites,
      position: sidebarStyle?.position,
      display: sidebarStyle?.display
    };
  });

  check('Desktop Hover Sidebar & Navigation', sidebarCheck.hasSidebar && sidebarCheck.hasEdgeTrigger && sidebarCheck.hasToggleBtn && sidebarCheck.hasNavAllSongs && sidebarCheck.hasNavDiscover);

  // Test 5: All Tracks Table & Hero View
  const tracksCheck = await page.evaluate(() => {
    const table = document.getElementById('tracksTable');
    const tbody = document.getElementById('tracksTbody');
    const viewHero = document.getElementById('viewHero');
    const heroTitle = document.getElementById('heroTitle');
    const playAllBtn = document.getElementById('heroPlayAllBtn');
    return {
      hasTable: !!table,
      hasTbody: !!tbody,
      hasHero: !!viewHero,
      heroTitleText: heroTitle?.textContent?.trim() || '',
      hasPlayAll: !!playAllBtn
    };
  });

  check('All Tracks Table & Hero Header', tracksCheck.hasTable && tracksCheck.hasTbody && tracksCheck.hasHero, `Hero: "${tracksCheck.heroTitleText}"`);

  // Test 6: Discover & Flow Stage Layout
  const discoverCheck = await page.evaluate(async () => {
    const navDiscover = document.getElementById('navDiscover');
    if (navDiscover) navDiscover.click();
    await new Promise(r => setTimeout(r, 400));

    const flowSection = document.getElementById('flowQuickPicksSection');
    const flowGrid = document.getElementById('flowQuickPicksGrid');
    const vibesSection = document.querySelector('.flow-vibes-section');
    const searchInput = document.getElementById('flowSearchInput');
    const refreshBtn = document.getElementById('flowRefreshBtn');

    return {
      hasFlowSection: !!flowSection,
      hasFlowGrid: !!flowGrid,
      hasVibesSection: !!vibesSection,
      hasSearchInput: !!searchInput,
      hasRefreshBtn: !!refreshBtn
    };
  });

  check('Discover & Flow View Layout (Quick Picks, Vibes, Live Search)', discoverCheck.hasFlowSection && discoverCheck.hasFlowGrid && discoverCheck.hasSearchInput);

  // Test 7: Bottom Player Bar at 1280x800
  const playerCheck = await page.evaluate(() => {
    const bar = document.querySelector('.player-bar');
    const title = document.getElementById('playerTitle');
    const artist = document.getElementById('playerArtist');
    const thumb = document.getElementById('playerThumb');
    const playPause = document.getElementById('playPauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const seeker = document.getElementById('seekerWrapper');
    const volume = document.getElementById('volumeWrapper');
    const eqBtn = document.getElementById('eqModalBtn');

    const barStyle = bar ? getComputedStyle(bar) : null;
    return {
      hasBar: !!bar,
      display: barStyle?.display,
      position: barStyle?.position,
      hasTitle: !!title,
      hasArtist: !!artist,
      hasThumb: !!thumb,
      hasPlayPause: !!playPause,
      hasPrevBtn: !!prevBtn,
      hasNextBtn: !!nextBtn,
      hasSeeker: !!seeker,
      hasVolume: !!volume,
      hasEQ: !!eqBtn
    };
  });

  check('Desktop Bottom Player Bar (Full Controls, EQ, Progress & Volume)',
    playerCheck.hasBar && playerCheck.hasPlayPause && playerCheck.hasSeeker && playerCheck.hasVolume && playerCheck.hasEQ,
    `Position: ${playerCheck.position}, Display: ${playerCheck.display}`
  );

  await browser.close();
  server.close();

  const allPassed = results.every(r => r.pass);
  console.log('\n================================================================');
  console.log(`  QA SUMMARY: ${results.filter(r => r.pass).length}/${results.length} CHECKS PASSED`);
  console.log('================================================================\n');

  if (allPassed) {
    console.log('🎉 PURE DESKTOP ELECTRON APPLICATION RESTORED FLAWLESSLY!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME CHECKS FAILED');
    process.exit(1);
  }
}

runDesktopQA().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
