const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));

  // Wait 1.5 seconds for initial app.init to run
  await new Promise(r => setTimeout(r, 1500));

  const results = await win.webContents.executeJavaScript(`
    (() => {
      const tests = [];

      // Test 1: Single Quick Picks section
      const qpSection = document.getElementById('flowQuickPicksSection');
      tests.push({
        name: 'Single Quick Picks Section exists',
        pass: !!qpSection && document.querySelectorAll('#flowQuickPicksSection').length === 1
      });

      // Test 2: Arrow buttons removed
      const prevBtn = document.getElementById('flowScrollPrevBtn');
      const nextBtn = document.getElementById('flowScrollNextBtn');
      tests.push({
        name: 'Arrow buttons removed',
        pass: !prevBtn && !nextBtn
      });

      // Test 3: Play all and Refresh buttons
      const playAllBtn = document.getElementById('flowPlayAllBtn');
      const refreshBtn = document.getElementById('flowRefreshBtn');
      tests.push({
        name: 'Play all and Refresh buttons present',
        pass: !!playAllBtn && !!refreshBtn
      });

      // Test 4: Quick Picks Grid
      const qpGrid = document.getElementById('flowQuickPicksGrid');
      tests.push({
        name: 'flowQuickPicksGrid present',
        pass: !!qpGrid
      });

      // Test 5: Search Results Container
      const searchResSec = document.getElementById('flowSearchResultsSection');
      tests.push({
        name: 'flowSearchResultsSection present',
        pass: !!searchResSec
      });

      // Test 6: Up Next Queue Header
      const queueHeaderSub = document.querySelector('.np-queue-header-sub');
      const dlQueueBtn = document.getElementById('npDownloadQueueBtn');
      const saveQueueBtn = document.getElementById('npSaveQueueBtn');
      tests.push({
        name: 'Queue Header Sub & Action buttons present',
        pass: !!queueHeaderSub && !!dlQueueBtn && !!saveQueueBtn
      });

      // Test 7: Verify app instance exists on window
      const appInst = window.pulsarApp;
      tests.push({
        name: 'window.pulsarApp instance initialized',
        pass: !!appInst
      });

      // Test 8: Verify Quick Picks rendering function
      if (appInst && typeof appInst._renderQuickPicks === 'function') {
        const dummyTracks = [
          { id: 'test_1', title: 'Dilbar Test Song', artist: 'Test Artist', coverUrl: '', duration: 200 },
          { id: 'test_2', title: 'Another Vibe Song', artist: 'Another Artist', coverUrl: '', duration: 180 }
        ];
        appInst._renderQuickPicks(dummyTracks);
        const renderedCards = qpGrid.querySelectorAll('.quick-pick-card');
        const badgeExists = qpGrid.querySelector('.quick-pick-badge');
        const dlBtnExists = qpGrid.querySelector('.quick-pick-dl-btn');

        tests.push({
          name: '_renderQuickPicks creates clean cards',
          pass: renderedCards.length === 2 && !badgeExists && !!dlBtnExists
        });
      }

      // Test 9: Verify Search Results rendering function
      if (appInst && typeof appInst._renderSearchResults === 'function') {
        const dummyOnline = [
          { id: 'yt_1', title: 'Online Search Track', artist: 'Online Artist', coverUrl: '', durationStr: '3:45' }
        ];
        appInst._renderSearchResults('test query', [], dummyOnline);
        const searchGrid = searchResSec.querySelector('.online-search-results-grid');
        const searchCards = searchResSec.querySelectorAll('.quick-pick-card');

        tests.push({
          name: '_renderSearchResults renders into flowSearchResultsSection',
          pass: !!searchGrid && searchCards.length === 1
        });
      }

      return tests;
    })()
  `);

  console.log('=== RUNTIME VERIFICATION RESULTS ===');
  let allPassed = true;
  for (const t of results) {
    if (t.pass) {
      console.log('✅ PASS:', t.name);
    } else {
      console.error('❌ FAIL:', t.name);
      allPassed = false;
    }
  }

  app.exit(allPassed ? 0 : 1);
});
