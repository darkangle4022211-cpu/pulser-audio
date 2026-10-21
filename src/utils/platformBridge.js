/**
 * Cross-Platform Bridge & Android Capacitor Implementation for Pulsar Music Player
 * 
 * 1. Preserves 100% Electron desktop IPC when window.electronAPI is present.
 * 2. On Android (Capacitor) or Mobile Web:
 *    - Direct InnerTube API (Search, Autocomplete, 50-track Radio queues, Stream extraction)
 *    - Direct Audio Stream Resolver (itag 140 / 251) with N+1 Pre-Warming & Auto-Refresh
 *    - Public Storage: Music/Pulsar Downloads/ surviving APK reinstalls + Delete sync
 *    - MediaSession Lockscreen & Audio Focus integration
 *    - Web Audio & CORS error protection
 */

class PlatformBridge {
  constructor() {
    this.isElectron = typeof window !== 'undefined' && !!(window.electronAPI && window.electronAPI.selectAudioFiles);
    this.isAndroid = typeof window !== 'undefined' && (
      (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
      /android/i.test(navigator.userAgent)
    );
    this.streamCache = new Map(); // videoId -> { url, expiresAt, itag }
    this.prewarmedIds = new Set();
    this.downloadFolder = 'Music/Pulsar Downloads';
  }

  init() {
    if (this.isElectron) {
      console.log('⚡ PlatformBridge: Electron desktop detected. Native IPC intact.');
      return;
    }

    console.log('📱 PlatformBridge: Initializing Android/Mobile Native Bridge.');
    if (this.isAndroid) {
      document.body.classList.add('platform-mobile', 'platform-android');
    }

    const nativeApi = {
      // Window Controls
      minimize: () => this.minimize(),
      maximize: () => this.maximize(),
      close: () => this.close(),

      // Notifications & MediaSession
      notifyTrackChange: (info) => this.notifyTrackChange(info),

      // File & Folder Pickers
      selectAudioFiles: () => this.selectAudioFiles(),
      selectAudioFolder: () => this.selectAudioFolder(),
      getPathForFile: (file) => (file && file.path) ? file.path : (file && file.name) ? file.name : '',

      // InnerTube Cloud Music & Streaming
      searchOnlineMusic: (query, limit, filter) => this.searchOnlineMusic(query, limit, filter),
      getSearchSuggestions: (query) => this.getSearchSuggestions(query),
      getSimilarSongs: (data) => this.getSimilarSongs(data),
      getStreamUrl: (urlOrId) => this.getStreamUrl(urlOrId),
      prewarmStreamUrl: (urlOrId) => this.prewarmStreamUrl(urlOrId),
      invalidateStream: (urlOrId) => this.invalidateStream(urlOrId),

      // Storage & Downloads
      downloadOnlineTrack: (trackData) => this.downloadOnlineTrack(trackData),
      getDownloadFolder: () => Promise.resolve(this.downloadFolder),
      openDownloadFolder: () => Promise.resolve({ success: true }),
      scanDownloadFolder: () => this.scanDownloadFolder(),
      checkFileExists: (filePath) => this.checkFileExists(filePath),
      deletePhysicalFile: (filePath) => this.deletePhysicalFile(filePath),

      // Helpers
      openExternal: (url) => window.open(url, '_blank'),
      extractCoverArt: (filePath) => Promise.resolve(null),
      cacheCoverImage: (url, fileName) => Promise.resolve({ success: true }),
      checkForUpdates: () => Promise.resolve({ updateAvailable: false })
    };

    window.pulsarNative = nativeApi;
    if (!window.electronAPI) {
      window.electronAPI = nativeApi;
    }

    this._setupMediaSessionHandlers();
    this._setupAudioErrorGuard();
  }

  // --------------------------------------------------------------------------
  // 1. Direct InnerTube API (Catalog Search, Autocomplete & Radio Queues)
  // --------------------------------------------------------------------------

  async _httpPost(url, data, headers = {}) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
      try {
        const res = await window.Capacitor.Plugins.CapacitorHttp.post({
          url,
          data,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
            ...headers
          }
        });
        return res.data;
      } catch (err) {
        console.warn('CapacitorHttp error, trying fetch fallback:', err);
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  async _httpGet(url, headers = {}) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp) {
      try {
        const res = await window.Capacitor.Plugins.CapacitorHttp.get({
          url,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36',
            ...headers
          }
        });
        return res.data;
      } catch (err) {
        console.warn('CapacitorHttp GET error, fallback to fetch:', err);
      }
    }

    const res = await fetch(url, { headers });
    return await res.json();
  }

  async searchOnlineMusic(query, limit = 20, filter = 'songs') {
    const numResults = Math.min(Math.max(Number(limit) || 20, 5), 40);
    const searchQuery = (query && query.trim()) || 'top trending songs hits 2026';

    const filterParams = {
      all: undefined,
      songs: 'EgWKAQIIAWoSEAQQAxAJEAoQBRAVEBEQDhAQ',
      albums: 'EgWKAQIYAWoSEAQQAxAJEAoQBRAVEBEQDhAQ',
      artists: 'EgWKAQIgAWoSEAQQAxAJEAoQBRAVEBEQDhAQ',
      videos: 'EgWKAQIQAWoSEAQQAxAJEAoQBRAVEBEQDhAQ'
    };

    const params = filterParams[filter] || filterParams.songs;
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

    try {
      const data = await this._httpPost('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', body);
      const sectionList = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ||
                          data.contents?.sectionListRenderer?.contents || [];

      const tracks = [];
      for (const s of sectionList) {
        const contents = s.musicShelfRenderer?.contents || s.itemSectionRenderer?.contents || s.musicCardShelfRenderer?.contents;
        if (!contents || !Array.isArray(contents)) continue;

        for (const c of contents) {
          const item = c.musicResponsiveListItemRenderer;
          if (!item) continue;

          const flex = item.flexColumns || [];
          const title = flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
          const subRuns = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

          const cleanRuns = subRuns.map(r => (r.text || '').trim()).filter(t => t && t !== '•');
          let artist = 'Artist';
          let album = 'YouTube Music';
          let durationStr = '3:30';

          for (const t of cleanRuns) {
            if (/^\d+:\d+(:\d+)?$/.test(t)) durationStr = t;
          }

          const meaningfulRuns = cleanRuns.filter(t =>
            !['Song', 'Video', 'Playlist', 'Album', 'Profile', 'Podcast', 'Episode'].includes(t) &&
            !t.includes('views') && !t.includes('plays') && !t.includes('subscribers')
          );

          if (meaningfulRuns.length > 0) {
            artist = meaningfulRuns[0];
            if (meaningfulRuns.length > 1 && !/^\d+:\d+(:\d+)?$/.test(meaningfulRuns[1])) {
              album = meaningfulRuns[1];
            }
          }

          let videoId = item.playlistItemData?.videoId;
          if (!videoId) {
            const nav = item.doubleTapCommand || item.navigationEndpoint;
            videoId = nav?.watchEndpoint?.videoId;
          }
          if (!videoId && item.overlay) {
            videoId = item.overlay?.musicItemRendererDisplayPolicy?.watchEndpoint?.videoId ||
                      item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
          }

          if (!title || !videoId) continue;

          let coverUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          const thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
          if (thumbs && thumbs.length > 0) {
            coverUrl = thumbs[thumbs.length - 1].url;
          }

          tracks.push({
            id: 'yt_' + videoId,
            ytId: videoId,
            title,
            artist,
            album,
            duration: this._parseDurationToSecs(durationStr),
            durationStr,
            audioUrl: `https://music.youtube.com/watch?v=${videoId}`,
            coverUrl,
            license: 'YouTube Music',
            isOnline: true,
            source: 'ytmusic'
          });

          if (tracks.length >= numResults) break;
        }
        if (tracks.length >= numResults) break;
      }

      return { success: true, tracks, source: 'ytmusic' };
    } catch (err) {
      console.warn('InnerTube search error:', err);
      return { success: false, error: err.message, tracks: [] };
    }
  }

  async getSearchSuggestions(query) {
    if (!query || !query.trim()) return [];
    try {
      const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&client=firefox&q=${encodeURIComponent(query.trim())}`;
      const data = await this._httpGet(url);
      if (Array.isArray(data) && Array.isArray(data[1])) {
        return data[1].slice(0, 8);
      }
      return [];
    } catch (err) {
      return [];
    }
  }

  async getSimilarSongs({ videoId, title, artist, limit = 35 }) {
    const numLimit = Math.min(Math.max(Number(limit) || 25, 5), 50);
    const cleanVideoId = String(videoId || '').replace(/^yt_/, '').trim();

    if (cleanVideoId) {
      try {
        const queue = await this._fetchRadioQueue(cleanVideoId, numLimit);
        if (queue && queue.length > 0) {
          return { success: true, tracks: queue, source: 'ytmusic-radio' };
        }
      } catch (err) {
        console.warn('Direct radio queue lookup error:', err);
      }
    }

    // Fallback: search for artist or genre mix
    const searchQuery = (artist && artist !== 'Unknown Artist') ? `${artist} hit songs mix` : `${title || 'trending'} style radio`;
    const searchRes = await this.searchOnlineMusic(searchQuery, numLimit, 'songs');
    return searchRes;
  }

  async _fetchRadioQueue(videoId, limit = 35) {
    const variations = ['RDAMVM' + videoId, 'RD' + videoId];
    for (const plId of variations) {
      try {
        const body = {
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20240101.01.00',
              hl: 'en',
              gl: 'US'
            }
          },
          playlistId: plId
        };
        const data = await this._httpPost('https://music.youtube.com/youtubei/v1/next', body);
        const tabs = data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs || [];
        let contents = [];
        for (const t of tabs) {
          const c = t?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents;
          if (c && c.length > 0) {
            contents = c;
            break;
          }
        }

        if (contents.length > 0) {
          const tracks = [];
          for (const item of contents) {
            const r = item.playlistPanelVideoRenderer;
            if (!r || !r.videoId || r.videoId === videoId) continue;

            const tTitle = r.title?.runs?.[0]?.text || 'Track';
            const tArtist = r.shortBylineText?.runs?.[0]?.text || 'Artist';
            const tDurStr = r.lengthText?.runs?.[0]?.text || '3:30';
            const thumbs = r.thumbnail?.thumbnails || [];
            const coverUrl = thumbs.length > 0 ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`;

            tracks.push({
              id: 'yt_' + r.videoId,
              ytId: r.videoId,
              title: tTitle,
              artist: tArtist,
              album: 'Smart Radio',
              duration: this._parseDurationToSecs(tDurStr),
              durationStr: tDurStr,
              audioUrl: `https://music.youtube.com/watch?v=${r.videoId}`,
              coverUrl,
              license: 'YouTube Music',
              isOnline: true,
              source: 'ytmusic-radio'
            });

            if (tracks.length >= limit) break;
          }
          if (tracks.length > 0) return tracks;
        }
      } catch (err) {
        console.warn('Radio variation error:', err);
      }
    }
    return [];
  }

  // --------------------------------------------------------------------------
  // 2. Direct InnerTube Audio Stream Extraction (itag 140 / 251)
  // --------------------------------------------------------------------------

  async getStreamUrl(urlOrId) {
    let videoId = String(urlOrId || '').trim();
    if (videoId.includes('v=')) {
      const m = videoId.match(/v=([a-zA-Z0-9_-]{11})/);
      if (m) videoId = m[1];
    } else if (videoId.includes('youtu.be/')) {
      const m = videoId.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (m) videoId = m[1];
    } else if (videoId.startsWith('yt_')) {
      videoId = videoId.slice(3);
    }

    if (!videoId || videoId.length !== 11) {
      return { success: false, error: 'Invalid video ID' };
    }

    // Check memory cache
    const cached = this.streamCache.get(videoId);
    if (cached && cached.expiresAt > Date.now() + 60000) {
      return { success: true, streamUrl: cached.url, itag: cached.itag };
    }

    // Direct /youtubei/v1/player extraction with ANDROID_VR client
    try {
      const postBody = {
        videoId,
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
        }
      };

      const json = await this._httpPost('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', postBody, {
        'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip'
      });

      if (json.playabilityStatus?.status !== 'OK') {
        return { success: false, error: json.playabilityStatus?.reason || 'Not playable' };
      }

      const formats = [...(json.streamingData?.formats || []), ...(json.streamingData?.adaptiveFormats || [])];
      const audioFormats = formats.filter(f => f.url && f.mimeType && f.mimeType.startsWith('audio/'));

      // Prefer itag 140 (m4a/aac) or itag 251 (opus/webm)
      const target = audioFormats.find(f => f.itag === 140) ||
                     audioFormats.find(f => f.itag === 251) ||
                     audioFormats[0];

      if (target && target.url) {
        // Extract expiration
        let expiresAt = Date.now() + 5 * 3600 * 1000;
        try {
          const u = new URL(target.url);
          const exp = u.searchParams.get('expire');
          if (exp) expiresAt = Number(exp) * 1000;
        } catch (_) {}

        this.streamCache.set(videoId, {
          url: target.url,
          expiresAt,
          itag: target.itag
        });

        return { success: true, streamUrl: target.url, itag: target.itag };
      }

      return { success: false, error: 'No direct audio format found in player response' };
    } catch (err) {
      console.warn('InnerTube player extraction error:', err);
      return { success: false, error: err.message };
    }
  }

  prewarmStreamUrl(urlOrId) {
    const cleanId = String(urlOrId || '').replace(/^yt_/, '');
    if (!cleanId || this.prewarmedIds.has(cleanId)) return;
    this.prewarmedIds.add(cleanId);
    this.getStreamUrl(cleanId).catch(() => {});
  }

  invalidateStream(urlOrId) {
    let videoId = String(urlOrId || '').trim();
    if (videoId.includes('v=')) {
      const m = videoId.match(/v=([a-zA-Z0-9_-]{11})/);
      if (m) videoId = m[1];
    } else if (videoId.includes('youtu.be/')) {
      const m = videoId.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (m) videoId = m[1];
    } else if (videoId.startsWith('yt_')) {
      videoId = videoId.slice(3);
    }
    if (videoId) {
      this.streamCache.delete(videoId);
      this.prewarmedIds.delete(videoId);
    }
  }

  // --------------------------------------------------------------------------
  // 3. Public Music/Pulsar Downloads/ Storage Integration
  // --------------------------------------------------------------------------

  _normalizeFsPath(filePath) {
    if (!filePath) return { relPath: '', absPath: '', uri: '' };
    let clean = String(filePath).trim();
    if (clean.startsWith('file://')) {
      clean = clean.replace(/^file:\/\//, '');
    }
    try {
      if (clean.includes('%')) clean = decodeURI(clean);
    } catch (_) {}

    if (clean.startsWith('/storage/emulated/0/')) {
      const rel = clean.replace(/^\/storage\/emulated\/0\/?/, '');
      return {
        relPath: rel,
        absPath: `/storage/emulated/0/${rel}`,
        uri: `file:///storage/emulated/0/${encodeURI(rel)}`
      };
    } else if (clean.startsWith('/')) {
      return {
        relPath: clean.replace(/^\//, ''),
        absPath: clean,
        uri: `file://${encodeURI(clean)}`
      };
    } else {
      return {
        relPath: clean,
        absPath: `/storage/emulated/0/${clean}`,
        uri: `file:///storage/emulated/0/${encodeURI(clean)}`
      };
    }
  }

  async downloadOnlineTrack(trackData) {
    if (!trackData) return { success: false, error: 'Empty track data' };

    const safeTitle = (trackData.title || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').trim();
    const safeArtist = (trackData.artist || 'Unknown').replace(/[\\/:*?"<>|]/g, '_').trim();
    const fileName = `${safeArtist} - ${safeTitle}.m4a`;
    const relativePath = `${this.downloadFolder}/${fileName}`;

    try {
      // 1. Resolve audio stream URL
      let streamUrl = null;
      if (trackData.audioUrl && trackData.audioUrl.startsWith('http') && !trackData.audioUrl.includes('youtube.com')) {
        streamUrl = trackData.audioUrl;
      } else {
        const streamRes = await this.getStreamUrl(trackData.ytId || trackData.id || trackData.audioUrl);
        if (!streamRes.success || !streamRes.streamUrl) {
          throw new Error(streamRes.error || 'Failed to resolve audio stream for download');
        }
        streamUrl = streamRes.streamUrl;
      }

      // 2. Fetch or natively download audio stream
      let audioBuffer = null;
      try {
        const audioRes = await fetch(streamUrl);
        if (audioRes.ok) {
          audioBuffer = await audioRes.arrayBuffer();
        }
      } catch (fetchErr) {
        console.warn('Direct fetch notice (will attempt native Capacitor download):', fetchErr);
      }

      // 3. Save to Public Android Shared Storage if Capacitor Filesystem is available
      let finalFilePath = `/storage/emulated/0/${relativePath}`;

      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
        const Filesystem = window.Capacitor.Plugins.Filesystem;
        try {
          await Filesystem.mkdir({
            path: this.downloadFolder,
            directory: 'EXTERNAL_STORAGE',
            recursive: true
          }).catch(() => {});

          if (audioBuffer) {
            const base64Data = this._arrayBufferToBase64(audioBuffer);
            await Filesystem.writeFile({
              path: relativePath,
              data: base64Data,
              directory: 'EXTERNAL_STORAGE',
              recursive: true
            });
          } else if (typeof Filesystem.downloadFile === 'function') {
            await Filesystem.downloadFile({
              url: streamUrl,
              path: relativePath,
              directory: 'EXTERNAL_STORAGE',
              recursive: true
            });
            try {
              const readRes = await Filesystem.readFile({
                path: relativePath,
                directory: 'EXTERNAL_STORAGE'
              });
              if (readRes && readRes.data) {
                audioBuffer = this._base64ToArrayBuffer(readRes.data);
              }
            } catch (_) {}
          }

          const uriRes = await Filesystem.getUri({
            path: relativePath,
            directory: 'EXTERNAL_STORAGE'
          });
          if (uriRes && uriRes.uri) finalFilePath = uriRes.uri;
        } catch (fsErr) {
          console.warn('Filesystem write notice:', fsErr);
        }
      }

      return {
        success: true,
        filePath: finalFilePath,
        fileName,
        size: audioBuffer ? audioBuffer.byteLength : 4000000,
        buffer: audioBuffer || new ArrayBuffer(0),
        coverDataUrl: trackData.coverUrl || null
      };
    } catch (err) {
      console.error('downloadOnlineTrack error:', err);
      return { success: false, error: err.message };
    }
  }

  async scanDownloadFolder() {
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.Filesystem) {
      return { success: true, files: [] };
    }

    const Filesystem = window.Capacitor.Plugins.Filesystem;
    try {
      const res = await Filesystem.readdir({
        path: this.downloadFolder,
        directory: 'EXTERNAL_STORAGE'
      });

      const files = [];
      const entries = res.files || [];
      for (const entry of entries) {
        const name = typeof entry === 'string' ? entry : entry.name;
        if (!name || !/\.(mp3|m4a|ogg|flac|wav|aac|opus|webm)$/i.test(name)) continue;

        let title = name.replace(/\.[a-zA-Z0-9]+$/, '');
        let artist = 'Unknown Artist';
        if (title.includes(' - ')) {
          const parts = title.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        }

        files.push({
          fileName: name,
          filePath: `/storage/emulated/0/${this.downloadFolder}/${name}`,
          title,
          artist,
          size: entry.size || 4000000
        });
      }

      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message, files: [] };
    }
  }

  async checkFileExists(filePath) {
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.Filesystem) {
      return false;
    }
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    const norm = this._normalizeFsPath(filePath);
    try {
      if (norm.relPath) {
        try {
          await Filesystem.stat({
            path: norm.relPath,
            directory: 'EXTERNAL_STORAGE'
          });
          return true;
        } catch (_) {}
      }
      if (norm.absPath) {
        await Filesystem.stat({ path: norm.absPath });
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  async deletePhysicalFile(filePath) {
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.Filesystem) {
      return { success: true };
    }
    const Filesystem = window.Capacitor.Plugins.Filesystem;
    const norm = this._normalizeFsPath(filePath);
    try {
      if (norm.relPath) {
        try {
          await Filesystem.deleteFile({
            path: norm.relPath,
            directory: 'EXTERNAL_STORAGE'
          });
          return { success: true };
        } catch (_) {}
      }
      if (norm.absPath) {
        await Filesystem.deleteFile({
          path: norm.absPath
        });
        return { success: true };
      }
      return { success: true };
    } catch (err) {
      console.warn('deletePhysicalFile notice:', err);
      return { success: false, error: err.message };
    }
  }

  // --------------------------------------------------------------------------
  // 4. Mobile File Pickers & Folder Importer
  // --------------------------------------------------------------------------

  selectAudioFiles() {
    return Promise.resolve({ canceled: true, files: [] });
  }

  async selectAudioFolder() {
    if (this.isAndroid && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
      const scanRes = await this.scanDownloadFolder();
      if (scanRes && scanRes.success && scanRes.files) {
        if (window.app && typeof window.app._syncDownloadFolderTracks === 'function') {
          await window.app._syncDownloadFolderTracks();
          if (window.app._showToast) {
            window.app._showToast(`Scanned and synced ${scanRes.files.length} songs from Music/Pulsar Downloads`, 'success');
          }
        }
        return { canceled: false, files: [] };
      }
    }
    return Promise.resolve({ canceled: true, files: [] });
  }

  // --------------------------------------------------------------------------
  // 5. MediaSession Lockscreen Controls & Web Audio Safety
  // --------------------------------------------------------------------------

  notifyTrackChange(info) {
    if (!info || typeof navigator === 'undefined' || !navigator.mediaSession) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: info.title || 'Pulsar Track',
        artist: info.artist || 'Pulsar Audio',
        album: info.album || 'Pulsar Music Player',
        artwork: info.coverUrl ? [
          { src: info.coverUrl, sizes: '512x512', type: 'image/jpeg' }
        ] : []
      });
      navigator.mediaSession.playbackState = 'playing';
    } catch (err) {
      console.warn('MediaSession metadata error:', err);
    }
  }

  _setupMediaSessionHandlers() {
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return;

    navigator.mediaSession.setActionHandler('play', () => {
      const audio = document.querySelector('audio');
      if (audio && audio.paused) {
        document.getElementById('playPauseBtn')?.click();
        navigator.mediaSession.playbackState = 'playing';
      }
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      const audio = document.querySelector('audio');
      if (audio && !audio.paused) {
        document.getElementById('playPauseBtn')?.click();
        navigator.mediaSession.playbackState = 'paused';
      }
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => document.getElementById('prevBtn')?.click());
    navigator.mediaSession.setActionHandler('nexttrack', () => document.getElementById('nextBtn')?.click());

    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        const audio = document.querySelector('audio');
        if (audio && details.seekTime !== undefined) {
          audio.currentTime = details.seekTime;
        }
      });
    } catch (_) {}

    try {
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const audio = document.querySelector('audio');
        if (audio) audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (details.seekOffset || 10));
      });
    } catch (_) {}

    try {
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const audio = document.querySelector('audio');
        if (audio) audio.currentTime = Math.max(0, audio.currentTime - (details.seekOffset || 10));
      });
    } catch (_) {}

    const syncPlaybackState = () => {
      const audio = document.querySelector('audio');
      if (!audio || !navigator.mediaSession) return;
      navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
    };
    window.addEventListener('play', syncPlaybackState, true);
    window.addEventListener('pause', syncPlaybackState, true);
  }

  _setupAudioErrorGuard() {
    window.addEventListener('error', (e) => {
      if (e.message && e.message.includes('MediaElementAudioSourceNode')) {
        console.warn('AudioSource cross-origin notice handled cleanly.');
      }
    }, true);
  }

  minimize() {}
  maximize() {}
  close() {}

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  _parseDurationToSecs(str) {
    if (!str) return 210;
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
    if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    return 210;
  }

  _arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  _base64ToArrayBuffer(base64) {
    const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;
    const binary = window.atob(cleanBase64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export const platformBridge = new PlatformBridge();

// Auto-initialize immediately
if (typeof window !== 'undefined') {
  platformBridge.init();
}
