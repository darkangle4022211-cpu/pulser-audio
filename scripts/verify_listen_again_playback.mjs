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
  console.log('=== VERIFYING LISTEN AGAIN PLAYBACK (ONLINE & DOWNLOADED) ===\n');

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

  try {
    const page = await browser.newPage();

    // Intercept electron APIs
    await page.evaluateOnNewDocument(() => {
      window.streamUrlRequests = [];
      window.electronAPI = {
        isElectron: true,
        platform: 'linux',
        getSystemInfo: async () => ({ platform: 'linux', arch: 'x64', osRelease: '6.6' }),
        getAppVersion: async () => '1.1.10',
        checkForUpdates: async () => ({ updateAvailable: false }),
        getStreamUrl: async (url) => {
          window.streamUrlRequests.push(url);
          return { success: true, streamUrl: 'https://example.com/fake-stream.mp3' };
        },
        searchOnlineMusic: async (q) => ({ success: true, tracks: [] }),
        notifyTrackChange: () => {},
        log: () => {},
        showItemInFolder: () => {},
        onUpdateAvailable: () => {},
        onUpdateProgress: () => {},
        onUpdateDownloaded: () => {},
        onUpdateError: () => {},
        onUpdateNotAvailable: () => {}
      };
    });

    const errorToasts = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('Audio source unavailable') || text.includes('Audio for')) {
        errorToasts.push(text);
      }
    });

    await page.goto(`http://127.0.0.1:${serverPort}/index.html`, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1200));

    // Mock audio playback engine
    await page.evaluate(() => {
      const app = window.pulsarApp;
      window.playedSources = [];
      let playing = false;
      app.audioEngine.loadAndPlay = async (src, start, dur) => {
        window.playedSources.push(src);
        playing = true;
        return true;
      };
      app.audioEngine.play = () => { playing = true; };
      app.audioEngine.pause = () => { playing = false; };
      app.audioEngine.isPlaying = () => playing;
    });

    // Test 1: Inject historical online track (missing audioUrl & isOnline, like user's LevelDB) and downloaded track
    const testResult = await page.evaluate(async () => {
      const app = window.pulsarApp;
      if (!app) return { error: 'No pulsarApp instance on window' };

      // Set up local library with one downloaded song
      app.tracks = [
        {
          id: 'local_track_1',
          title: 'Downloaded Song',
          artist: 'Local Artist',
          album: 'Offline Hits',
          duration: 180,
          filePath: '/home/user/Music/downloaded.mp3',
          downloadedOffline: true
        }
      ];

      // Reset tasteEngine history to simulate user's state:
      // Track 1: Online song without audioUrl or isOnline (simulating user's "Clockwork")
      // Track 2: Downloaded song from library
      const tasteEngine = app.tasteEngine;
      if (!tasteEngine) return { error: 'No tasteEngine on app' };
      tasteEngine.profile.recentHistory = [
        {
          id: 'yt_8nwhh0LKPao',
          title: 'Clockwork',
          artist: 'Diggy Graves',
          coverUrl: 'https://i.ytimg.com/vi/8nwhh0LKPao/hqdefault.jpg',
          timestamp: Date.now()
        },
        {
          id: 'local_track_1',
          title: 'Downloaded Song',
          artist: 'Local Artist',
          coverUrl: '',
          timestamp: Date.now() - 1000
        }
      ];
      tasteEngine.profile.trackDwellStats = {
        'yt_8nwhh0LKPao': 45,
        'local_track_1': 50
      };

      // Navigate to discover view and render Listen Again
      app._switchView('discover');
      await app._renderListenAgain();

      const cards = document.querySelectorAll('#flowListenAgainList .listen-card');
      if (cards.length < 2) {
        return { error: 'Expected at least 2 cards in flowListenAgainList, found: ' + cards.length };
      }

      // Check card 0 (Clockwork) click
      const clockworkCard = cards[0];
      const clockworkTitle = clockworkCard.querySelector('.listen-card-title')?.textContent;

      // Click Clockwork
      clockworkCard.click();
      await new Promise(r => setTimeout(r, 600));

      const activeAfterClockwork = app.activeTrack;
      const contextAfterClockwork = app.playbackContext;
      const streamReqsAfterClockwork = [...window.streamUrlRequests];
      const playedSrcAfterClockwork = [...window.playedSources];

      // Check card 1 (Downloaded Song) click
      const downloadedCard = cards[1];
      const downloadedTitle = downloadedCard.querySelector('.listen-card-title')?.textContent;

      downloadedCard.click();
      await new Promise(r => setTimeout(r, 600));

      const activeAfterDownloaded = app.activeTrack;
      const contextAfterDownloaded = app.playbackContext;
      const streamReqsAfterDownloaded = [...window.streamUrlRequests];
      const playedSrcAfterDownloaded = [...window.playedSources];

      return {
        cardsCount: cards.length,
        clockworkTitle,
        activeClockworkId: activeAfterClockwork?.id,
        activeClockworkTitle: activeAfterClockwork?.title,
        contextAfterClockwork,
        streamReqsAfterClockwork,
        playedSrcAfterClockwork,
        downloadedTitle,
        activeDownloadedId: activeAfterDownloaded?.id,
        contextAfterDownloaded,
        streamReqsAfterDownloaded,
        playedSrcAfterDownloaded
      };
    });

    console.log('Test evaluation result:', JSON.stringify(testResult, null, 2));

    check('Listen Again rendered 2 cards', testResult.cardsCount >= 2, `count=${testResult.cardsCount}`);
    check('Online track title matches', testResult.clockworkTitle === 'Clockwork', `title=${testResult.clockworkTitle}`);
    check('Online track requested getStreamUrl with YouTube URL', 
      testResult.streamReqsAfterClockwork.some(u => u.includes('8nwhh0LKPao')), 
      `urls=${JSON.stringify(testResult.streamReqsAfterClockwork)}`
    );
    check('Online track played via resolved stream URL',
      testResult.playedSrcAfterClockwork.includes('https://example.com/fake-stream.mp3'),
      `sources=${JSON.stringify(testResult.playedSrcAfterClockwork)}`
    );
    check('Online track set playbackContext to online', testResult.contextAfterClockwork === 'online');
    check('Downloaded track played locally offline', testResult.contextAfterDownloaded === 'offline');
    check('Downloaded track played via pulsar-audio:// protocol',
      testResult.playedSrcAfterDownloaded.some(s => s.startsWith('pulsar-audio://')),
      `sources=${JSON.stringify(testResult.playedSrcAfterDownloaded)}`
    );
    check('No "Audio unavailable" error toast was triggered', errorToasts.length === 0, `errors=${errorToasts.join(', ')}`);

  } finally {
    await browser.close();
    server.close();
  }

  const allPassed = results.every(r => r.pass);
  console.log(`\nOVERALL: ${allPassed ? 'ALL TESTS PASSED ✅' : 'SOME TESTS FAILED ❌'}`);
  process.exit(allPassed ? 0 : 1);
}

runTest().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
