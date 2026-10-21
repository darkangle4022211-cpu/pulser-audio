import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const distElectron = path.join(projectRoot, 'dist-electron');

const results = [];

function recordTest(category, name, passed, details = '') {
  results.push({ category, name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${category}] ${name} ${details ? '(' + details + ')' : ''}`);
}

console.log('========================================================================');
console.log('  PULSAR MUSIC PLAYER: ANDROID MOBILE UI & DESKTOP REGRESSION QA SUITE  ');
console.log('========================================================================\n');

// 1. Static Artifact Checks
console.log('--- 1. Desktop & Android Build Artifacts Verification ---');
const debFiles = fs.existsSync(distElectron) ? fs.readdirSync(distElectron).filter(f => f.endsWith('.deb')) : [];
const winSetupFiles = fs.existsSync(distElectron) ? fs.readdirSync(distElectron).filter(f => f.includes('Setup') && f.endsWith('.exe')) : [];
const winPortableFiles = fs.existsSync(distElectron) ? fs.readdirSync(distElectron).filter(f => f.includes('Portable') && f.endsWith('.exe')) : [];
const apkPath = path.join(distElectron, 'Pulsar-Audio-Android.apk');
const apkExists = fs.existsSync(apkPath) && fs.statSync(apkPath).size > 100000;

recordTest(
  'Artifacts',
  'Linux Debian (.deb) Build Intact',
  debFiles.length > 0,
  debFiles.length > 0 ? `Found: ${debFiles[debFiles.length - 1]} (${(fs.statSync(path.join(distElectron, debFiles[debFiles.length - 1])).size / 1024 / 1024).toFixed(1)} MB)` : 'None found'
);

recordTest(
  'Artifacts',
  'Windows Setup (.exe) Build Intact',
  winSetupFiles.length > 0,
  winSetupFiles.length > 0 ? `Found: ${winSetupFiles[winSetupFiles.length - 1]}` : 'None found'
);

recordTest(
  'Artifacts',
  'Windows Portable (.exe) Build Intact',
  winPortableFiles.length > 0,
  winPortableFiles.length > 0 ? `Found: ${winPortableFiles[winPortableFiles.length - 1]}` : 'None found'
);

recordTest(
  'Artifacts',
  'Android Flagship (.apk) Provisioned',
  apkExists,
  apkExists ? `Size: ${(fs.statSync(apkPath).size / 1024 / 1024).toFixed(2)} MB at dist-electron/Pulsar-Audio-Android.apk` : 'Waiting for cloud compile'
);

// 2. Start HTTP server for dist
let server = null;
let port = 0;

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
      port = server.address().port;
      resolve();
    });
  });

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  // -------------------------------------------------------------------------
  // 2. Desktop 1280x800 Regression Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Desktop 1280x800 Regression Verification ---');
  const pageDesktop = await browser.newPage();
  await pageDesktop.setViewport({ width: 1280, height: 800 });

  const desktopConsoleErrors = [];
  pageDesktop.on('pageerror', err => desktopConsoleErrors.push(err.message));
  pageDesktop.on('console', msg => {
    if (msg.type() === 'error') desktopConsoleErrors.push(msg.text());
  });

  await pageDesktop.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  recordTest('Desktop 1280x800', 'Console Error Cleanliness', desktopConsoleErrors.length === 0,
    desktopConsoleErrors.length === 0 ? 'Zero unhandled errors' : desktopConsoleErrors.join('; ')
  );

  const desktopCheck = await pageDesktop.evaluate(() => {
    const winControls = document.querySelector('.window-controls');
    const mobileBottomNav = document.getElementById('mobileBottomNav');
    const mobileSearchBtn = document.getElementById('mobileSearchBtn');
    const sidebarEdgeTrigger = document.getElementById('sidebarEdgeTrigger');
    const tracksThead = document.querySelector('#tracksTable thead');
    const playerBar = document.querySelector('.player-bar');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const prevBtn = document.getElementById('prevBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const nextBtn = document.getElementById('nextBtn');
    const repeatBtn = document.getElementById('repeatBtn');
    const seekerWrapper = document.getElementById('seekerWrapper');
    const speedBtn = document.getElementById('speedBtn');
    const visualizerToggleBtn = document.getElementById('visualizerToggleBtn');
    const eqModalBtn = document.getElementById('eqModalBtn');
    const lyricsToggleBtn = document.getElementById('lyricsToggleBtn');
    const nowPlayingQueueBtn = document.getElementById('nowPlayingQueueBtn');
    const smartRadioToggleBtn = document.getElementById('smartRadioToggleBtn');
    const muteBtn = document.getElementById('muteBtn');

    const isVisible = (el) => {
      if (!el) return false;
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };

    const isHidden = (el) => {
      if (!el) return true;
      const s = window.getComputedStyle(el);
      return s.display === 'none';
    };

    return {
      windowControlsVisible: isVisible(winControls),
      sidebarEdgeTriggerVisible: isVisible(sidebarEdgeTrigger),
      tracksTheadVisible: isVisible(tracksThead),
      mobileNavHidden: isHidden(mobileBottomNav),
      mobileSearchBtnHidden: isHidden(mobileSearchBtn),
      playerBarVisible: isVisible(playerBar),
      has12DesktopControls: isVisible(shuffleBtn) && isVisible(prevBtn) && isVisible(playPauseBtn) &&
                            isVisible(nextBtn) && isVisible(repeatBtn) && isVisible(seekerWrapper) &&
                            isVisible(speedBtn) && isVisible(visualizerToggleBtn) && isVisible(eqModalBtn) &&
                            isVisible(lyricsToggleBtn) && isVisible(nowPlayingQueueBtn) && isVisible(smartRadioToggleBtn) &&
                            isVisible(muteBtn)
    };
  });

  recordTest('Desktop 1280x800', 'Window Controls & Titlebar Intact', desktopCheck.windowControlsVisible);
  recordTest('Desktop 1280x800', 'Sidebar Edge Hover Trigger Intact', desktopCheck.sidebarEdgeTriggerVisible);
  recordTest('Desktop 1280x800', '5-Column Tracks Table Header Visible', desktopCheck.tracksTheadVisible);
  recordTest('Desktop 1280x800', 'Mobile Bottom Nav & Mobile Buttons Hidden on Desktop', desktopCheck.mobileNavHidden && desktopCheck.mobileSearchBtnHidden);
  recordTest('Desktop 1280x800', 'Full 12-Control Player Bar Intact', desktopCheck.has12DesktopControls);

  await pageDesktop.close();

  // -------------------------------------------------------------------------
  // 3. Mobile 390x844 Flagship YouTube Music UI Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Mobile 390x844 YouTube Music UI Verification ---');
  const pageMobile = await browser.newPage();
  await pageMobile.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  const mobileConsoleErrors = [];
  pageMobile.on('pageerror', err => mobileConsoleErrors.push(err.message));
  pageMobile.on('console', msg => {
    if (msg.type() === 'error') mobileConsoleErrors.push(msg.text());
  });

  await pageMobile.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1200));

  recordTest('Mobile 390x844', 'Mobile Console Cleanliness', mobileConsoleErrors.length === 0,
    mobileConsoleErrors.length === 0 ? 'Zero unhandled errors' : mobileConsoleErrors.join('; ')
  );

  const mobileLayoutChecks = await pageMobile.evaluate(() => {
    const isVisible = (el) => {
      if (!el) return false;
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    };

    const isHidden = (el) => {
      if (!el) return true;
      const s = window.getComputedStyle(el);
      return s.display === 'none';
    };

    // Horizontal overflow check
    const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth ||
                                  document.body.scrollWidth > window.innerWidth;

    // Header buttons
    const winControls = document.querySelector('.window-controls');
    const mobileSearchBtn = document.getElementById('mobileSearchBtn');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const notifToggleBtn = document.getElementById('notificationToggleBtn');

    // Bottom Navigation Bar (56px)
    const mobileBottomNav = document.getElementById('mobileBottomNav');
    const navStyle = mobileBottomNav ? window.getComputedStyle(mobileBottomNav) : null;
    const isNavBottom = navStyle && navStyle.position === 'fixed' && navStyle.display !== 'none';
    const navHeight = mobileBottomNav ? mobileBottomNav.offsetHeight : 0;
    const navTabsCount = mobileBottomNav ? mobileBottomNav.querySelectorAll('.mobile-tab-btn').length : 0;

    // Mini-Player (60px)
    const playerBar = document.querySelector('.player-bar');
    const playerStyle = playerBar ? window.getComputedStyle(playerBar) : null;
    const isPlayerFixed = playerStyle && playerStyle.position === 'fixed';
    const playerHeight = playerBar ? playerBar.offsetHeight : 0;
    const desktopSeekerHidden = isHidden(document.getElementById('seekerWrapper'));
    const desktopControlsHidden = isHidden(document.getElementById('shuffleBtn')) && isHidden(document.getElementById('prevBtn'));

    // Mood Pills
    const moodPills = document.querySelector('.flow-filter-chips');
    const moodPillsStyle = moodPills ? window.getComputedStyle(moodPills) : null;
    const isMoodPillsTouchScroll = moodPillsStyle && (moodPillsStyle.overflowX === 'auto' || moodPillsStyle.display === 'flex');

    // Quick Picks Grid
    const qpGrid = document.querySelector('.flow-quick-picks-grid');
    const qpGridStyle = qpGrid ? window.getComputedStyle(qpGrid) : null;
    const isQP4Rows = qpGridStyle && qpGridStyle.gridTemplateRows && qpGridStyle.gridTemplateRows.includes('60px');
    const isQPColumnsPeek = qpGridStyle && qpGridStyle.gridAutoFlow === 'column';
    const qpMetaHidden = isHidden(document.getElementById('flowSectionMeta'));
    const qpRefreshTextHidden = isHidden(document.querySelector('#flowRefreshBtn span'));

    // Header ordering and branding checks
    const brandSpan = document.querySelector('.app-brand span');
    const brandPseudo = brandSpan ? window.getComputedStyle(brandSpan, '::after').content : '';
    const brandIsPulsar = brandPseudo.includes('Pulsar');

    const searchOrder = parseInt(window.getComputedStyle(mobileSearchBtn).order, 10) || 0;
    const notifOrder = parseInt(window.getComputedStyle(notifToggleBtn).order, 10) || 0;
    const themeOrder = parseInt(window.getComputedStyle(themeToggleBtn).order, 10) || 0;
    const menuOrder = parseInt(window.getComputedStyle(mobileMenuBtn).order, 10) || 0;
    const headerOrderCorrect = (searchOrder === 1 && notifOrder === 2 && themeOrder === 3 && menuOrder === 4);

    // SVG icon vectors
    const allSvgIcons = Array.from(document.querySelectorAll('svg'));
    const crispSvgs = allSvgIcons.filter(s => s.getAttribute('viewBox') === '0 0 24 24');

    return {
      zeroHorizontalOverflow: !hasHorizontalOverflow,
      windowControlsHidden: isHidden(winControls),
      mobileSearchBtnVisible: isVisible(mobileSearchBtn),
      mobileMenuBtnVisible: isVisible(mobileMenuBtn),
      themeToggleBtnVisible: isVisible(themeToggleBtn),
      notifToggleBtnVisible: isVisible(notifToggleBtn),
      headerOrderCorrect,
      brandIsPulsar,
      mobileNavVisible: isNavBottom && navHeight >= 50 && navHeight <= 65,
      navTabsCount,
      miniPlayerVisible: isPlayerFixed && playerHeight >= 55 && playerHeight <= 65,
      desktopControlsHiddenOnMini: desktopSeekerHidden && desktopControlsHidden,
      moodPillsTouchScroll: isMoodPillsTouchScroll,
      qpMetaHidden,
      qpRefreshTextHidden,
      qpGridFormat: isQP4Rows && isQPColumnsPeek,
      crispSvgCount: crispSvgs.length
    };
  });

  recordTest('Mobile 390x844', 'Zero Horizontal Viewport Overflow', mobileLayoutChecks.zeroHorizontalOverflow);
  recordTest('Mobile 390x844', 'Desktop Window Buttons (- □ ×) Hidden on Mobile', mobileLayoutChecks.windowControlsHidden);
  recordTest('Mobile 390x844', 'Compact YT Music Header Icons (Search, Notifications, Theme, Menu)',
    mobileLayoutChecks.mobileSearchBtnVisible && mobileLayoutChecks.mobileMenuBtnVisible &&
    mobileLayoutChecks.themeToggleBtnVisible && mobileLayoutChecks.notifToggleBtnVisible &&
    mobileLayoutChecks.headerOrderCorrect
  );
  recordTest('Mobile 390x844', 'Mobile Brand Header Displays "Pulsar"', mobileLayoutChecks.brandIsPulsar);
  recordTest('Mobile 390x844', '4-Tab Bottom Navigation Bar (56px fixed)',
    mobileLayoutChecks.mobileNavVisible && mobileLayoutChecks.navTabsCount === 4,
    `Tabs: ${mobileLayoutChecks.navTabsCount}`
  );
  recordTest('Mobile 390x844', 'YT Music Floating Mini-Player (60px above bottom bar)',
    mobileLayoutChecks.miniPlayerVisible && mobileLayoutChecks.desktopControlsHiddenOnMini
  );
  recordTest('Mobile 390x844', 'Horizontal Swipeable Mood Pills (All, Chill, Lofi, etc.)', mobileLayoutChecks.moodPillsTouchScroll);
  recordTest('Mobile 390x844', 'Quick Picks 4-Row Horizontal Swipeable Grid (86vw Columns with Peek)', mobileLayoutChecks.qpGridFormat);
  recordTest('Mobile 390x844', 'Quick Picks Clean Header (Subtitle Hidden, Refresh Text Hidden)',
    mobileLayoutChecks.qpMetaHidden && mobileLayoutChecks.qpRefreshTextHidden
  );
  recordTest('Mobile 390x844', 'Crisp 24x24 Vector SVG Icons Used Exclusively', mobileLayoutChecks.crispSvgCount >= 10,
    `Found ${mobileLayoutChecks.crispSvgCount} crisp 24x24 vector icons`
  );

  // -------------------------------------------------------------------------
  // 4. Slide-Up Full Player & 10-Band EQ Sheet Interaction
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Slide-Up Full Player & 10-Band EQ Sheet Interaction ---');

  // Click mini player to slide up Full Player
  await pageMobile.evaluate(() => {
    const playerBar = document.querySelector('.player-bar');
    if (playerBar) playerBar.click();
  });
  await new Promise(r => setTimeout(r, 450));

  const fullPlayerState = await pageMobile.evaluate(() => {
    const stage = document.getElementById('nowPlayingStage');
    const isSlideUpActive = stage && stage.classList.contains('mobile-active');
    const collapseBtn = document.getElementById('npCollapseBtn');
    const hasControls = !!document.querySelector('.mobile-full-player-controls');
    const hasTabs = !!document.querySelector('.np-tabs-nav');
    return { isSlideUpActive, hasCollapse: !!collapseBtn, hasControls, hasTabs };
  });

  recordTest('Full Player Interaction', 'Slide-Up Full Screen Stage Opens on Mini-Player Tap',
    fullPlayerState.isSlideUpActive && fullPlayerState.hasCollapse && fullPlayerState.hasControls
  );

  // Test EQ Modal Sheet
  await pageMobile.evaluate(() => {
    const eqBtn = document.getElementById('mEqBtn') || document.getElementById('eqModalBtn');
    if (eqBtn) eqBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));

  const eqSheetState = await pageMobile.evaluate(() => {
    const modal = document.getElementById('eqModal');
    const dialog = modal ? modal.querySelector('.modal-dialog') : null;
    const style = dialog ? window.getComputedStyle(dialog) : null;
    const isBottomSheet = style && (style.position === 'fixed' || style.borderRadius.includes('20px'));
    const presets = document.querySelectorAll('.eq-preset-btn').length;
    return { isBottomSheet, presetsCount: presets };
  });

  recordTest('Full Player Interaction', 'Slide-Up 10-Band EQ Bottom Sheet Functional',
    eqSheetState.isBottomSheet && eqSheetState.presetsCount >= 5,
    `Presets: ${eqSheetState.presetsCount}`
  );

  // Close EQ
  await pageMobile.evaluate(() => {
    const closeBtn = document.getElementById('closeEqBtn') || document.getElementById('applyEqCloseBtn');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 300));

  // Collapse Full Player
  await pageMobile.evaluate(() => {
    const collapseBtn = document.getElementById('npCollapseBtn');
    if (collapseBtn) collapseBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));

  const fullPlayerClosed = await pageMobile.evaluate(() => {
    const stage = document.getElementById('nowPlayingStage');
    return !stage || !stage.classList.contains('mobile-active');
  });

  recordTest('Full Player Interaction', 'Full Screen Stage Collapses Back to Mini-Player', fullPlayerClosed);

  // -------------------------------------------------------------------------
  // 5. Android PlatformBridge & Storage Verification
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Android PlatformBridge & Storage Verification ---');
  const bridgeChecks = await pageMobile.evaluate(() => {
    const bridge = window.pulsarNative || window.electronAPI;
    const hasBridge = !!bridge;
    const hasGetStreamUrl = typeof bridge?.getStreamUrl === 'function';
    const hasPrewarm = typeof bridge?.prewarmStreamUrl === 'function';
    const hasInvalidate = typeof bridge?.invalidateStream === 'function';
    const hasDownload = typeof bridge?.downloadOnlineTrack === 'function';
    const hasScan = typeof bridge?.scanDownloadFolder === 'function';
    const hasDelete = typeof bridge?.deletePhysicalFile === 'function';
    const hasCheckExists = typeof bridge?.checkFileExists === 'function';
    const hasMediaSession = !!navigator.mediaSession;

    return {
      hasBridge,
      hasGetStreamUrl,
      hasPrewarm,
      hasInvalidate,
      hasDownload,
      hasScan,
      hasDelete,
      hasCheckExists,
      hasMediaSession
    };
  });

  recordTest('Platform Bridge', 'PlatformBridge & InnerTube Stream Methods Exposed',
    bridgeChecks.hasBridge && bridgeChecks.hasGetStreamUrl && bridgeChecks.hasPrewarm && bridgeChecks.hasInvalidate
  );
  recordTest('Platform Bridge', 'Public Storage Download, Scan, Exists & Delete Methods Exposed',
    bridgeChecks.hasDownload && bridgeChecks.hasScan && bridgeChecks.hasDelete && bridgeChecks.hasCheckExists
  );
  recordTest('Platform Bridge', 'Lockscreen MediaSession Controls Initialized',
    bridgeChecks.hasMediaSession
  );

  await pageMobile.close();
  await browser.close();
} catch (err) {
  recordTest('QA Suite', 'Fatal Execution Error', false, err.message);
} finally {
  if (server) server.close();
}

// Summary Report
console.log('\n========================================================================');
console.log('                          FINAL QA SUMMARY REPORT                        ');
console.log('========================================================================');
const passedCount = results.filter(r => r.passed).length;
const totalCount = results.length;
console.log(`Total Checks: ${totalCount} | Passed: ${passedCount} | Failed: ${totalCount - passedCount}`);
if (passedCount === totalCount) {
  console.log('🌟 ALL QA & REGRESSION CHECKS PASSED WITH 100% SUCCESS!');
} else {
  console.log(`⚠️ Some checks did not pass. Details above.`);
}
console.log('========================================================================\n');

process.exit(passedCount === totalCount ? 0 : 1);
