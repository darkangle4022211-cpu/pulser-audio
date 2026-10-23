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

async function runOfflineShuffleQA() {
  console.log('================================================================');
  console.log('  PULSAR MUSIC PLAYER: OFFLINE SHUFFLE ISOLATION & DISCOVERY QA ');
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

  // Track all external network requests to YouTube / Google / online APIs
  const offlinePhaseNetworkRequests = [];
  let isOfflinePhase = true;

  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (isOfflinePhase && (url.includes('youtube.com') || url.includes('googlevideo.com') || url.includes('ytimg.com') || url.includes('music.youtube.com'))) {
      offlinePhaseNetworkRequests.push(url);
    }
    req.continue();
  });

  // Setup mock electronAPI with call counters
  await page.evaluateOnNewDocument(() => {
    window.apiCounters = {
      getStreamUrl: 0,
      getSimilarSongs: 0,
      searchOnlineMusic: 0
    };

    window.electronAPI = {
      minimize: () => {},
      maximize: () => {},
      close: () => {},
      selectAudioFiles: async () => ({ cancelled: true, filePaths: [] }),
      selectAudioFolder: async () => ({ cancelled: true, folderPath: '' }),
      scanDownloadFolder: async () => ({ success: true, files: [] }),
      checkForUpdates: async () => ({ updateAvailable: false, currentVersion: '1.1.5' }),
      notifyTrackChange: () => {},
      onMediaKey: () => {},
      searchOnlineMusic: async () => {
        window.apiCounters.searchOnlineMusic++;
        return { success: true, tracks: [] };
      },
      getSimilarSongs: async () => {
        window.apiCounters.getSimilarSongs++;
        return { success: true, tracks: [] };
      },
      getStreamUrl: async () => {
        window.apiCounters.getStreamUrl++;
        return { success: true, streamUrl: 'mock://stream-url' };
      },
      getSearchSuggestions: async () => []
    };
  });

  await page.goto(`http://127.0.0.1:${serverPort}/index.html`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));

  // Mock audio engine playback so headless Chrome completes playback cycles cleanly
  await page.evaluate(() => {
    const app = window.pulsarApp;
    let playing = false;
    app.audioEngine.loadAndPlay = async () => {
      playing = true;
      return true;
    };
    app.audioEngine.play = () => { playing = true; };
    app.audioEngine.pause = () => { playing = false; };
    app.audioEngine.isPlaying = () => playing;
  });

  // Populate local library with 25 distinct local tracks
  const initResult = await page.evaluate(async () => {
    const app = window.pulsarApp;
    if (!app) return { success: false, error: 'App not found on window' };

    const mockLocalTracks = [];
    for (let i = 1; i <= 25; i++) {
      mockLocalTracks.push({
        id: `local_track_${i}`,
        title: `Offline Song ${i}`,
        artist: `Local Artist ${i}`,
        album: `Offline Album ${Math.ceil(i / 5)}`,
        duration: 180 + i,
        filePath: `/music/song_${i}.mp3`,
        isOnline: false,
        dateAdded: Date.now() - (25 - i) * 1000
      });
    }

    // Save to DB and assign to app
    for (const t of mockLocalTracks) {
      await app.db.saveTrack(t);
    }
    app.tracks = mockLocalTracks;
    app._renderTracks();
    app._updateBadgeCounts();

    return { success: true, trackCount: app.tracks.length };
  });

  check('Local Library Pre-seeded with 25 tracks', initResult.success && initResult.trackCount === 25, `${initResult.trackCount} tracks loaded`);

  // =========================================================================
  // TEST SUITE 1: Offline Shuffle in "All Tracks" (20 consecutive advances)
  // =========================================================================
  console.log('\n--- Test 1: Offline Shuffle in "All Tracks" (20 advances) ---');

  const test1Result = await page.evaluate(async () => {
    const app = window.pulsarApp;
    window.apiCounters.getStreamUrl = 0;
    window.apiCounters.getSimilarSongs = 0;
    window.apiCounters.searchOnlineMusic = 0;

    // Switch to all-songs view and start playback
    app._switchView('all-songs');
    await app._playTrackFromList(app.tracks, 0);

    // Verify context is offline
    const initialContext = app.playbackContext;

    // Enable Shuffle
    if (!app.isShuffle) {
      app._toggleShuffle();
    }
    // Set loopMode to all for continuous library shuffling
    app.loopMode = 'all';

    const playedTracks = [];
    playedTracks.push({
      id: app.activeTrack?.id,
      title: app.activeTrack?.title,
      isOnline: !!app.activeTrack?.isOnline
    });

    // Advance 20 times in a row
    for (let step = 1; step <= 20; step++) {
      app._playNext();
      playedTracks.push({
        id: app.activeTrack?.id,
        title: app.activeTrack?.title,
        isOnline: !!app.activeTrack?.isOnline
      });
    }

    return {
      success: true,
      initialContext,
      finalContext: app.playbackContext,
      playedCount: playedTracks.length,
      playedTracks,
      apiCounters: { ...window.apiCounters }
    };
  });

  const allPlayedLocal1 = test1Result.playedTracks.every(t => !t.isOnline && !t.id.startsWith('yt_'));
  const zeroOnlineApi1 = test1Result.apiCounters.getSimilarSongs === 0 && test1Result.apiCounters.getStreamUrl === 0;

  check('Playback context locked to "offline" on All Tracks playback', test1Result.initialContext === 'offline' && test1Result.finalContext === 'offline');
  check('20 consecutive shuffle advances produced 100% local offline tracks', allPlayedLocal1, `${test1Result.playedCount} tracks checked`);
  check('Zero online radio/similar API calls during 20 offline shuffle advances', zeroOnlineApi1, `similarSongs calls: ${test1Result.apiCounters.getSimilarSongs}, streamUrl calls: ${test1Result.apiCounters.getStreamUrl}`);

  // =========================================================================
  // TEST SUITE 2: Offline Shuffle in a Custom Local Playlist
  // =========================================================================
  console.log('\n--- Test 2: Offline Shuffle in Custom Local Playlist (20 advances) ---');

  const test2Result = await page.evaluate(async () => {
    const app = window.pulsarApp;
    window.apiCounters.getStreamUrl = 0;
    window.apiCounters.getSimilarSongs = 0;

    // Create a custom playlist with 6 local tracks
    const playlistTracks = app.tracks.slice(0, 6);
    const pl = await app.playlistManager.createPlaylist('QA Isolated Rock', 'Test playlist');
    for (const t of playlistTracks) {
      await app.playlistManager.addTrackToPlaylist(pl.id, t.id);
    }

    // Switch to playlist view and start playback
    app._switchView(pl.id);
    app._renderTracks();
    await app._playTrackFromList(playlistTracks, 0);

    // Ensure shuffle and repeat all are active
    if (!app.isShuffle) app._toggleShuffle();
    app.loopMode = 'all';

    const playedInPlaylist = [];
    playedInPlaylist.push({
      id: app.activeTrack?.id,
      title: app.activeTrack?.title,
      isOnline: !!app.activeTrack?.isOnline
    });

    const allowedIds = new Set(playlistTracks.map(t => t.id));

    // Advance 20 times in a row
    for (let step = 1; step <= 20; step++) {
      app._playNext();
      playedInPlaylist.push({
        id: app.activeTrack?.id,
        title: app.activeTrack?.title,
        isOnline: !!app.activeTrack?.isOnline,
        inPlaylist: allowedIds.has(app.activeTrack?.id)
      });
    }

    return {
      success: true,
      context: app.playbackContext,
      playedInPlaylist,
      apiCounters: { ...window.apiCounters }
    };
  });

  const allStrictlyFromPlaylist = test2Result.playedInPlaylist.every(t => (t.inPlaylist !== undefined ? t.inPlaylist : true) && !t.isOnline);
  const zeroOnlineApi2 = test2Result.apiCounters.getSimilarSongs === 0 && test2Result.apiCounters.getStreamUrl === 0;

  check('Playlist shuffle strictly confined to the 6 local playlist tracks', allStrictlyFromPlaylist, `All 20 advances stayed inside local playlist`);
  check('Zero online stream/radio calls during playlist shuffle', zeroOnlineApi2);

  // =========================================================================
  // TEST SUITE 3: Offline Clean Stop when Repeat is OFF
  // =========================================================================
  console.log('\n--- Test 3: Offline Clean Stop (Repeat OFF at End of Shuffled Playlist) ---');

  const test3Result = await page.evaluate(async () => {
    const app = window.pulsarApp;
    window.apiCounters.getSimilarSongs = 0;
    window.apiCounters.getStreamUrl = 0;

    // Create a mini 3-song playlist
    const miniTracks = app.tracks.slice(0, 3);
    const miniPl = await app.playlistManager.createPlaylist('Mini 3 Songs', 'Repeat off test');
    for (const t of miniTracks) {
      await app.playlistManager.addTrackToPlaylist(miniPl.id, t.id);
    }

    app._switchView(miniPl.id);
    app._renderTracks();
    await app._playTrackFromList(miniTracks, 0);

    // Turn Shuffle ON, Loop OFF
    if (!app.isShuffle) app._toggleShuffle();
    app.loopMode = 'none';

    // Advance until queue exhausts (3 tracks max)
    app._playNext(); // 2nd song
    app._playNext(); // 3rd song
    app._playNext(); // End of queue -> should stop cleanly!

    return {
      success: true,
      isPlaying: app.audioEngine.isPlaying(),
      context: app.playbackContext,
      apiCounters: { ...window.apiCounters }
    };
  });

  check('Queue stops cleanly when last shuffled song finishes with Repeat OFF (isPlaying = false)', !test3Result.isPlaying);
  check('Zero fallback online radio fetched when shuffled playlist finished', test3Result.apiCounters.getSimilarSongs === 0 && test3Result.apiCounters.getStreamUrl === 0);

  // Check no forbidden network requests were leaked during offline tests
  check('Zero raw YouTube / googlevideo network requests leaked during offline shuffle tests', offlinePhaseNetworkRequests.length === 0, `Count: ${offlinePhaseNetworkRequests.length}`);

  // Transition to online test phase
  await page.evaluate(() => { window.__isOfflinePhase = false; });
  isOfflinePhase = false;

  // =========================================================================
  // TEST SUITE 4: Online Discover & Flow Playback Context & Radio Queue
  // =========================================================================
  console.log('\n--- Test 4: Online Playback Context & Features in Discover & Flow ---');

  const test4Result = await page.evaluate(async () => {
    const app = window.pulsarApp;
    window.apiCounters.getStreamUrl = 0;
    window.apiCounters.getSimilarSongs = 0;

    // Navigate to Discover
    app._switchView('discover');

    // Mock an online YouTube track
    const mockOnlineTrack = {
      id: 'yt_test_123',
      ytId: 'test_123',
      title: 'Online Discover Hit',
      artist: 'Online Artist',
      audioUrl: 'https://youtube.com/watch?v=test_123',
      source: 'youtube',
      isOnline: true,
      duration: 210
    };

    // Play online track from Discover
    await app._playOnlineTrack(mockOnlineTrack, true);

    const onlineContext = app.playbackContext;
    const streamCalls = window.apiCounters.getStreamUrl;

    return {
      success: true,
      onlineContext,
      streamCalls,
      isNowPlayingOpen: app.isNowPlayingOpen,
      activeTrackOnline: !!app.activeTrack?.isOnline
    };
  });

  check('Discover playback switches playbackContext to "online"', test4Result.onlineContext === 'online');
  check('Online stream resolution invoked for Discover track', test4Result.streamCalls > 0, `streamUrl calls: ${test4Result.streamCalls}`);
  check('Discover track active in Now Playing stage', test4Result.activeTrackOnline && test4Result.isNowPlayingOpen);

  console.log('\n================================================================');
  const allPassed = results.every(r => r.pass);
  console.log(`  QA SUMMARY: ${results.filter(r => r.pass).length}/${results.length} CHECKS PASSED`);
  console.log('================================================================\n');

  await browser.close();
  server.close();

  if (!allPassed) {
    console.error('❌ Some QA checks failed!');
    process.exit(1);
  } else {
    console.log('🎉 100% OFFLINE SHUFFLE ISOLATION & ONLINE DISCOVERY QA PASSED!');
  }
}

runOfflineShuffleQA().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
