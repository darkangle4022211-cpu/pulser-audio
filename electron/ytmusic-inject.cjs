/**
 * Pulsar Music Player - YouTube Music Embedded Injector
 * Injects per-song download buttons and batch playlist download options
 * directly into the YouTube Music DOM.
 */

(function () {
  if (window.__pulsarInjected) return;
  window.__pulsarInjected = true;

  // Track download states
  window.pulsarDownloadedIds = window.pulsarDownloadedIds || new Set();
  window.pulsarDownloadingIds = window.pulsarDownloadingIds || new Set();

  function pulsarSendMessage(data) {
    try {
      console.log('__PULSAR_IPC__:' + JSON.stringify(data));
    } catch (e) {}

    try {
      if (typeof require !== 'undefined') {
        const { ipcRenderer } = require('electron');
        if (ipcRenderer && typeof ipcRenderer.sendToHost === 'function') {
          ipcRenderer.sendToHost(data.action, data);
        }
      }
    } catch (e) {}
  }

  // Inject CSS Styles
  function injectStyles() {
    if (document.getElementById('pulsar-ytmusic-styles')) return;
    const style = document.createElement('style');
    style.id = 'pulsar-ytmusic-styles';
    style.textContent = `
      .pulsar-track-download-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 5px !important;
        background: rgba(255, 255, 255, 0.09) !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        border-radius: 14px !important;
        color: #f1f5f9 !important;
        padding: 3px 9px !important;
        font-family: inherit !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        cursor: pointer !important;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        user-select: none !important;
        margin: 0 6px !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
        height: 26px !important;
        line-height: 1 !important;
        vertical-align: middle !important;
      }
      .pulsar-track-download-btn:hover {
        background: #8b5cf6 !important;
        border-color: #a78bfa !important;
        color: #ffffff !important;
        transform: translateY(-1px) scale(1.03) !important;
        box-shadow: 0 3px 10px rgba(139, 92, 246, 0.45) !important;
      }
      .pulsar-track-download-btn.downloading {
        background: rgba(139, 92, 246, 0.22) !important;
        border-color: #8b5cf6 !important;
        color: #c4b5fd !important;
        cursor: wait !important;
      }
      .pulsar-track-download-btn.downloaded {
        background: rgba(16, 185, 129, 0.2) !important;
        border-color: #10b981 !important;
        color: #34d399 !important;
        cursor: default !important;
      }
      .pulsar-track-download-btn.downloaded:hover {
        background: rgba(16, 185, 129, 0.3) !important;
        border-color: #34d399 !important;
        transform: none !important;
        box-shadow: none !important;
      }
      ytmusic-player-queue-item {
        overflow: visible !important;
      }
      ytmusic-player-queue-item .song-info {
        min-width: 0 !important;
        flex: 1 1 auto !important;
        margin-right: 6px !important;
      }
      ytmusic-player-queue-item .duration {
        flex-shrink: 0 !important;
        margin-left: 6px !important;
      }
      ytmusic-queue-header-renderer #buttons {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
      }
      .pulsar-queue-dl-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 5px !important;
        background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%) !important;
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        border-radius: 16px !important;
        color: #ffffff !important;
        padding: 5px 12px !important;
        font-family: inherit !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        user-select: none !important;
        margin-right: 6px !important;
        flex-shrink: 0 !important;
        height: 32px !important;
        line-height: 1 !important;
        box-shadow: 0 3px 10px rgba(124, 58, 237, 0.4) !important;
      }
      .pulsar-queue-dl-btn:hover {
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%) !important;
        transform: translateY(-1px) scale(1.02) !important;
        box-shadow: 0 5px 14px rgba(124, 58, 237, 0.55) !important;
      }
      .pulsar-spin {
        display: inline-block;
        width: 11px;
        height: 11px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: currentColor;
        animation: pulsar-rotate 0.8s linear infinite;
      }
      @keyframes pulsar-rotate {
        to { transform: rotate(360deg); }
      }
      .pulsar-playlist-download-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%) !important;
        border: 1px solid rgba(255, 255, 255, 0.25) !important;
        border-radius: 18px !important;
        color: #ffffff !important;
        padding: 6px 14px !important;
        font-family: inherit !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        user-select: none !important;
        margin: 0 8px !important;
        flex-shrink: 0 !important;
        box-shadow: 0 3px 12px rgba(124, 58, 237, 0.4) !important;
        height: 34px !important;
        line-height: 1 !important;
      }
      .pulsar-playlist-download-btn:hover {
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%) !important;
        transform: translateY(-1px) scale(1.02) !important;
        box-shadow: 0 5px 16px rgba(124, 58, 237, 0.55) !important;
      }
      .pulsar-playlist-download-btn:active {
        transform: translateY(0) scale(0.98) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function parseDurationToSecs(str) {
    if (typeof str === 'number' && !isNaN(str)) return Math.max(0, Math.round(str));
    if (!str || typeof str !== 'string') return 210;
    const parts = str.trim().split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }
    const num = parseFloat(str);
    return isNaN(num) ? 210 : Math.round(num);
  }

  // Extract metadata from a Queue item (<ytmusic-player-queue-item>)
  function extractQueueItem(item) {
    let videoId = '';
    let title = '';
    let artist = '';
    let album = '';
    let duration = '';
    let thumbnail = '';

    try {
      const data = item.data || item.__data || {};
      const renderer = data.playlistPanelVideoRenderer || data;
      if (renderer) {
        if (renderer.videoId) videoId = renderer.videoId;
        if (renderer.title?.runs?.[0]?.text) title = renderer.title.runs[0].text;
        if (renderer.shortBylineText?.runs?.[0]?.text) artist = renderer.shortBylineText.runs[0].text;
        if (renderer.lengthText?.runs?.[0]?.text) duration = renderer.lengthText.runs[0].text;
        if (renderer.longBylineText?.runs) {
          const runs = renderer.longBylineText.runs;
          for (let i = 1; i < runs.length; i++) {
            const txt = (runs[i].text || '').trim();
            if (txt && txt !== '•' && !/^\d+:\d+$/.test(txt) && !txt.includes('views') && !txt.includes('plays')) {
              album = txt;
              break;
            }
          }
        }
        if (renderer.thumbnail?.thumbnails?.length) {
          thumbnail = renderer.thumbnail.thumbnails[renderer.thumbnail.thumbnails.length - 1].url;
        }
      }
    } catch (e) {}

    if (!title) {
      const titleEl = item.querySelector('.song-title') || item.querySelector('.title') || item.querySelector('yt-formatted-string');
      if (titleEl) title = titleEl.textContent.trim();
    }
    if (!artist) {
      const bylineEl = item.querySelector('.byline') || item.querySelector('.byline-column');
      if (bylineEl) {
        const parts = bylineEl.textContent.trim().split('•').map(p => p.trim());
        artist = parts[0] || '';
        if (parts.length > 1 && !album && !/^\d+:\d+$/.test(parts[1])) {
          album = parts[1];
        }
      }
    }
    if (!duration) {
      const durEl = item.querySelector('.duration') || item.querySelector('.length');
      if (durEl) duration = durEl.textContent.trim();
    }
    if (!videoId) {
      const link = item.querySelector('a[href*="v="]');
      if (link) {
        const m = link.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (m) videoId = m[1];
      }
    }
    if (!videoId) {
      const img = item.querySelector('img[src*="vi/"]');
      if (img) {
        const m = img.src.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
        if (m) videoId = m[1];
      }
    }
    if (!thumbnail && videoId) {
      thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }

    return {
      videoId,
      title: title || 'Track',
      artist: artist || 'Artist',
      album: album || '',
      duration: duration || '3:30',
      thumbnail,
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''
    };
  }

  // Extract metadata from a Responsive List Item (<ytmusic-responsive-list-item-renderer>)
  function extractListItem(item) {
    let videoId = '';
    let title = '';
    let artist = '';
    let album = '';
    let duration = '';
    let thumbnail = '';

    try {
      const data = item.data || item.__data || {};
      const renderer = data.musicResponsiveListItemRenderer || data;
      if (renderer) {
        if (renderer.playlistItemData?.videoId) videoId = renderer.playlistItemData.videoId;
        if (renderer.navigationEndpoint?.watchEndpoint?.videoId) videoId = renderer.navigationEndpoint.watchEndpoint.videoId;
        if (renderer.flexColumns) {
          try {
            const titleRuns = renderer.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
            if (titleRuns && titleRuns[0]) title = titleRuns[0].text;
            const artistRuns = renderer.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
            if (artistRuns) {
              artist = artistRuns
                .map(r => r.text)
                .filter(t => t && !['Song', 'Video', '•', ' ', ''].includes(t.trim()))
                .join(', ');
            }
            if (renderer.flexColumns[2]) {
              const albumRuns = renderer.flexColumns[2]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs;
              if (albumRuns && albumRuns[0]?.text) {
                const txt = albumRuns[0].text.trim();
                if (txt && !txt.includes('views') && !txt.includes('plays') && !txt.includes('subscribers')) {
                  album = txt;
                }
              }
            }
          } catch (e) {}
        }
        if (renderer.fixedColumns) {
          try {
            const durRun = renderer.fixedColumns[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text ||
                           renderer.fixedColumns[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.simpleText;
            if (durRun && /^\d+:\d+(:\d+)?$/.test(durRun.trim())) {
              duration = durRun.trim();
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    const flexCols = Array.from(item.querySelectorAll('ytmusic-responsive-list-item-flex-column-renderer'));
    if (flexCols.length > 0) {
      if (!title && flexCols[0]) {
        title = flexCols[0].querySelector('yt-formatted-string')?.textContent?.trim() || '';
      }
      if (!artist && flexCols[1]) {
        const col1Text = flexCols[1].querySelector('yt-formatted-string')?.textContent?.trim() || '';
        if (col1Text) {
          const parts = col1Text.split('•').map(p => p.trim());
          artist = parts[0] || 'Artist';
          if (parts.length > 1 && !album) {
            const maybeAlbum = parts[1];
            if (!/^\d+:\d+(:\d+)?$/.test(maybeAlbum) && !maybeAlbum.includes('plays') && !maybeAlbum.includes('views')) {
              album = maybeAlbum;
            }
          }
        }
      }
      if (!album && flexCols[2]) {
        const col2Text = flexCols[2].querySelector('yt-formatted-string')?.textContent?.trim() || '';
        if (col2Text && !/^\d+:\d+(:\d+)?$/.test(col2Text) && !col2Text.includes('plays') && !col2Text.includes('views')) {
          album = col2Text;
        }
      }
    }

    if (!title) {
      const tEl = item.querySelector('.title-column yt-formatted-string') || item.querySelector('.title') || item.querySelector('a');
      if (tEl) title = tEl.textContent.trim();
    }
    if (!artist) {
      const aEl = item.querySelector('.byline-column yt-formatted-string') || item.querySelector('.byline') || item.querySelector('.secondary-flex-columns yt-formatted-string');
      if (aEl) {
        const parts = aEl.textContent.trim().split('•').map(s => s.trim());
        artist = parts[0] || 'Artist';
        if (parts.length > 1 && !album && !/^\d+:\d+$/.test(parts[1])) {
          album = parts[1];
        }
      }
    }
    if (!duration) {
      const durEl = item.querySelector('ytmusic-responsive-list-item-fixed-column-renderer yt-formatted-string') ||
                    item.querySelector('.fixed-columns yt-formatted-string') ||
                    item.querySelector('.duration') ||
                    item.querySelector('.lengthText');
      if (durEl) {
        const txt = durEl.textContent.trim();
        if (/^\d+:\d+(:\d+)?$/.test(txt)) duration = txt;
      }
    }
    if (!duration) {
      const allText = Array.from(item.querySelectorAll('yt-formatted-string, span'));
      for (const el of allText) {
        const t = el.textContent.trim();
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
          duration = t;
          break;
        }
      }
    }
    if (!videoId) {
      const link = item.querySelector('a[href*="v="]') || item.querySelector('a[href*="watch"]');
      if (link) {
        const m = link.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (m) videoId = m[1];
      }
    }
    if (!videoId) {
      const img = item.querySelector('img[src*="vi/"]');
      if (img) {
        const m = img.src.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
        if (m) videoId = m[1];
      }
    }
    if (!thumbnail && videoId) {
      thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }

    return {
      videoId,
      title: title || 'Track',
      artist: artist || 'Artist',
      album: album || '',
      duration: duration || '3:30',
      thumbnail,
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''
    };
  }

  // Determine if a track is already downloaded
  function isTrackDownloaded(track) {
    if (!track) return false;
    if (track.videoId && window.pulsarDownloadedIds.has(track.videoId)) return true;
    if (track.videoId && window.pulsarDownloadedIds.has('yt_' + track.videoId)) return true;
    if (track.title && window.pulsarDownloadedIds.has(track.title.toLowerCase().trim())) return true;
    return false;
  }

  function isTrackDownloading(track) {
    if (!track) return false;
    if (track.videoId && window.pulsarDownloadingIds.has(track.videoId)) return true;
    if (track.title && window.pulsarDownloadingIds.has(track.title.toLowerCase().trim())) return true;
    return false;
  }

  // Update button visual state with cache guard to prevent DOM churn and CPU spikes
  function updateButtonState(btn, state) {
    if (!btn) return;
    if (btn.dataset.pulsarState === state) return;
    btn.dataset.pulsarState = state;

    if (state === 'downloaded') {
      btn.className = 'pulsar-track-download-btn downloaded';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span>Saved</span>
      `;
      btn.title = 'Downloaded & In Pulsar Library';
    } else if (state === 'downloading') {
      btn.className = 'pulsar-track-download-btn downloading';
      btn.innerHTML = `
        <span class="pulsar-spin"></span>
        <span>Saving...</span>
      `;
      btn.title = 'Downloading MP3 to Pulsar Library...';
    } else {
      btn.className = 'pulsar-track-download-btn';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
        </svg>
        <span>MP3</span>
      `;
      btn.title = 'Download Song as MP3 (Offline)';
    }
  }

  // Create single song download button
  function createDownloadButton(trackGetter) {
    const btn = document.createElement('button');
    btn.className = 'pulsar-track-download-btn';
    updateButtonState(btn, 'idle');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const track = trackGetter();
      if (!track || !track.videoId) {
        pulsarSendMessage({ action: 'show-toast', message: 'Could not detect track video ID', type: 'warning' });
        return;
      }

      if (isTrackDownloaded(track)) {
        pulsarSendMessage({ action: 'show-toast', message: `"${track.title}" is already in your library!`, type: 'info' });
        return;
      }

      window.pulsarDownloadingIds.add(track.videoId);
      updateButtonState(btn, 'downloading');

      pulsarSendMessage({
        action: 'download-track',
        track: {
          id: `yt_${track.videoId}`,
          ytId: track.videoId,
          title: track.title,
          artist: track.artist,
          album: track.album || 'YouTube Music',
          duration: parseDurationToSecs(track.duration),
          durationStr: track.duration || '3:30',
          thumbnail: track.thumbnail,
          audioUrl: track.url || `https://www.youtube.com/watch?v=${track.videoId}`,
          coverUrl: track.thumbnail,
          source: 'ytmusic'
        }
      });
    });

    return btn;
  }

  // Inject into Queue Items
  function processQueueItems() {
    const items = document.querySelectorAll('ytmusic-player-queue-item');
    items.forEach((item) => {
      if (item.dataset.pulsarInjected) {
        // Refresh downloaded state
        const btn = item.querySelector('.pulsar-track-download-btn');
        if (btn && !btn.classList.contains('downloading')) {
          const track = extractQueueItem(item);
          if (isTrackDownloaded(track)) {
            updateButtonState(btn, 'downloaded');
          }
        }
        return;
      }

      const track = extractQueueItem(item);
      const btn = createDownloadButton(() => extractQueueItem(item));

      if (isTrackDownloaded(track)) {
        updateButtonState(btn, 'downloaded');
      } else if (isTrackDownloading(track)) {
        updateButtonState(btn, 'downloading');
      }

      // Insertion target: right before duration so it stays inside row flexbox
      const dur = item.querySelector('.duration') || item.querySelector('.menu') || item.querySelector('ytmusic-menu-renderer');
      if (dur) {
        item.insertBefore(btn, dur);
      } else {
        item.appendChild(btn);
      }

      item.dataset.pulsarInjected = 'true';
    });
  }

  // Inject into Responsive List Items
  function processListItems() {
    const items = document.querySelectorAll('ytmusic-responsive-list-item-renderer');
    items.forEach((item) => {
      if (item.dataset.pulsarInjected) {
        const btn = item.querySelector('.pulsar-track-download-btn');
        if (btn && !btn.classList.contains('downloading')) {
          const track = extractListItem(item);
          if (isTrackDownloaded(track)) {
            updateButtonState(btn, 'downloaded');
          }
        }
        return;
      }

      const track = extractListItem(item);
      // Skip non-song items (e.g. artist cards without videoId)
      if (!track.videoId) return;

      const btn = createDownloadButton(() => extractListItem(item));

      if (isTrackDownloaded(track)) {
        updateButtonState(btn, 'downloaded');
      } else if (isTrackDownloading(track)) {
        updateButtonState(btn, 'downloading');
      }

      // Insertion target: right before menu renderer or in menu container
      const menu = item.querySelector('ytmusic-menu-renderer') || item.querySelector('.menu');
      if (menu && menu.parentNode) {
        menu.parentNode.insertBefore(btn, menu);
      } else {
        item.appendChild(btn);
      }

      item.dataset.pulsarInjected = 'true';
    });
  }

  // Inject Batch Playlist Download Buttons
  function processPlaylistHeaders() {
    // 1. Queue Header (Up Next tab)
    const queueHeader = document.querySelector('ytmusic-queue-header-renderer') || document.querySelector('#queue-header');
    if (queueHeader && !queueHeader.dataset.pulsarInjected) {
      const qBtn = document.createElement('button');
      qBtn.className = 'pulsar-queue-dl-btn';
      qBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
        <span>Download Queue</span>
      `;
      qBtn.title = 'Download all songs in this Up Next queue as MP3s';

      qBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const sub = queueHeader.querySelector('.subtitle')?.textContent.trim() ||
                    queueHeader.querySelector('yt-formatted-string')?.textContent.trim() || 'Queue';
        triggerPlaylistDownload(sub, 'queue');
      });

      const buttonsContainer = queueHeader.querySelector('#buttons') || queueHeader.querySelector('.buttons') || queueHeader;
      if (buttonsContainer.firstChild) {
        buttonsContainer.insertBefore(qBtn, buttonsContainer.firstChild);
      } else {
        buttonsContainer.appendChild(qBtn);
      }
      queueHeader.dataset.pulsarInjected = 'true';
    }

    // 2. Playlist / Album Header
    const pageHeader = document.querySelector('ytmusic-responsive-header-renderer') || document.querySelector('.immersive-header');
    if (pageHeader && !pageHeader.dataset.pulsarInjected) {
      const pBtn = document.createElement('button');
      pBtn.className = 'pulsar-playlist-download-btn';
      pBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
        </svg>
        <span>Download Full Playlist</span>
      `;
      pBtn.title = 'Download all songs in this playlist as MP3s';

      pBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const headerTitle = pageHeader.querySelector('.title')?.textContent.trim() || 'Playlist';
        triggerPlaylistDownload(headerTitle, 'playlist');
      });

      const actionButtons = pageHeader.querySelector('.action-buttons') || pageHeader.querySelector('#top-level-buttons') || pageHeader;
      actionButtons.appendChild(pBtn);
      pageHeader.dataset.pulsarInjected = 'true';
    }
  }

  // Extract all tracks in view and notify host
  function triggerPlaylistDownload(defaultTitle, preferredContext) {
    const tracks = extractAllVisibleTracks(preferredContext, defaultTitle);
    if (!tracks || tracks.length === 0) {
      pulsarSendMessage({
        action: 'show-toast',
        message: 'No downloadable songs detected in current playlist or queue',
        type: 'warning'
      });
      return;
    }

    pulsarSendMessage({
      action: 'download-playlist',
      playlistTitle: defaultTitle || 'YouTube Music Playlist',
      tracks: tracks
    });
  }

  // Global extraction function accessible by parent app
  window.pulsarExtractAllTracks = function (preferredContext, playlistTitle) {
    return extractAllVisibleTracks(preferredContext, playlistTitle);
  };

  function extractAllVisibleTracks(preferredContext, playlistTitle) {
    const list = [];
    const seen = new Set();

    // Check if Up Next queue is active / open
    const allQueueItems = Array.from(document.querySelectorAll('ytmusic-player-queue-item'));
    const isQueueActive = preferredContext === 'queue' || (
      allQueueItems.length > 0 && allQueueItems.some(i => i.offsetParent !== null)
    );

    if (!playlistTitle) {
      if (isQueueActive) {
        const queueHeader = document.querySelector('ytmusic-queue-header-renderer') || document.querySelector('#queue-header');
        if (queueHeader) {
          playlistTitle = queueHeader.querySelector('.subtitle')?.textContent?.trim() ||
                          queueHeader.querySelector('yt-formatted-string')?.textContent?.trim();
        }
      } else {
        const header = document.querySelector('ytmusic-responsive-header-renderer') || document.querySelector('.immersive-header');
        if (header) {
          playlistTitle = header.querySelector('.title')?.textContent?.trim();
        }
      }
      if (!playlistTitle) {
        playlistTitle = (document.title || '').replace(' - YouTube Music', '').trim();
      }
    }

    // If user is viewing the Queue on the right side, extract ONLY the playlist/queue songs!
    if (isQueueActive && allQueueItems.length > 0) {
      const queueEl = document.querySelector('ytmusic-player-queue');
      const contentsContainer = queueEl ? (queueEl.querySelector('#contents') || queueEl.querySelector('.contents')) : null;
      const mainItems = contentsContainer 
        ? Array.from(contentsContainer.querySelectorAll('ytmusic-player-queue-item'))
        : [];

      let targetItems = [];

      if (mainItems.length > 1) {
        // Multi-track playlist or queue loaded!
        // ONLY extract the actual playlist items in #contents.
        // Explicitly exclude #automix-contents (Autoplay recommendations appended by YouTube Music).
        targetItems = mainItems;
      } else {
        // Single track or radio mix:
        // Include mainItems and #automix-contents, but cap total at 20 songs
        // so it never downloads 49/50 endless radio tracks and freezes the machine!
        const autoContainer = queueEl ? (queueEl.querySelector('#automix-contents') || queueEl.querySelector('.automix-contents')) : null;
        const autoItems = autoContainer 
          ? Array.from(autoContainer.querySelectorAll('ytmusic-player-queue-item'))
          : [];

        if (mainItems.length > 0 || autoItems.length > 0) {
          targetItems = mainItems.concat(autoItems).slice(0, 20);
        } else {
          // Fallback to all visible queue items, capped at 20
          targetItems = allQueueItems.slice(0, 20);
        }
      }

      targetItems.forEach(item => {
        const t = extractQueueItem(item);
        if (t.videoId && !seen.has(t.videoId)) {
          seen.add(t.videoId);
          const durSecs = parseDurationToSecs(t.duration);
          list.push({
            id: `yt_${t.videoId}`,
            ytId: t.videoId,
            title: t.title,
            artist: t.artist,
            album: t.album || playlistTitle || 'YouTube Music',
            duration: durSecs,
            durationStr: t.duration || '3:30',
            thumbnail: t.thumbnail,
            audioUrl: t.url || `https://www.youtube.com/watch?v=${t.videoId}`,
            coverUrl: t.thumbnail,
            source: 'ytmusic'
          });
        }
      });
      return list;
    }

    // Otherwise, user is on a playlist or album page - extract from the playlist table
    const listItems = Array.from(document.querySelectorAll('ytmusic-responsive-list-item-renderer'));
    listItems.forEach(item => {
      const t = extractListItem(item);
      if (t.videoId && !seen.has(t.videoId)) {
        seen.add(t.videoId);
        const durSecs = parseDurationToSecs(t.duration);
        list.push({
          id: `yt_${t.videoId}`,
          ytId: t.videoId,
          title: t.title,
          artist: t.artist,
          album: t.album || playlistTitle || 'YouTube Music',
          duration: durSecs,
          durationStr: t.duration || '3:30',
          thumbnail: t.thumbnail,
          audioUrl: t.url || `https://www.youtube.com/watch?v=${t.videoId}`,
          coverUrl: t.thumbnail,
          source: 'ytmusic'
        });
      }
    });

    return list;
  };

  // Called from parent to sync downloaded state
  window.pulsarSetDownloadedIds = function (idsArray) {
    window.pulsarDownloadedIds = new Set(idsArray || []);
    // Re-check all buttons
    document.querySelectorAll('.pulsar-track-download-btn').forEach(btn => {
      const row = btn.closest('ytmusic-player-queue-item, ytmusic-responsive-list-item-renderer');
      if (row) {
        const t = row.tagName.toLowerCase().includes('queue') ? extractQueueItem(row) : extractListItem(row);
        if (isTrackDownloaded(t)) {
          updateButtonState(btn, 'downloaded');
        }
      }
    });
  };

  // Called from parent when a single track finishes
  window.pulsarMarkTrackDownloaded = function (videoId) {
    if (!videoId) return;
    const cleanId = videoId.replace('yt_', '');
    window.pulsarDownloadedIds.add(cleanId);
    window.pulsarDownloadedIds.add(videoId);
    window.pulsarDownloadingIds.delete(cleanId);
    window.pulsarDownloadingIds.delete(videoId);

    document.querySelectorAll('.pulsar-track-download-btn').forEach(btn => {
      const row = btn.closest('ytmusic-player-queue-item, ytmusic-responsive-list-item-renderer');
      if (row) {
        const t = row.tagName.toLowerCase().includes('queue') ? extractQueueItem(row) : extractListItem(row);
        if (t.videoId === cleanId || t.videoId === videoId) {
          updateButtonState(btn, 'downloaded');
        }
      }
    });
  };

  // Main scan routine
  function scanAndInject() {
    injectStyles();
    processQueueItems();
    processListItems();
    processPlaylistHeaders();
  }

  // Throttle scanner for smooth performance and low CPU
  let scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      if (!document.hidden) {
        scanAndInject();
      }
    }, 2000);
  }

  // MutationObserver for SPA changes: ignore mutations from our own injected buttons
  const observer = new MutationObserver((mutations) => {
    if (document.hidden) return;
    const hasExternalChanges = mutations.some(m => {
      const t = m.target;
      if (!t) return false;
      if (t.classList && (
        t.classList.contains('pulsar-track-download-btn') ||
        t.classList.contains('pulsar-queue-dl-btn') ||
        t.classList.contains('pulsar-playlist-download-btn') ||
        t.classList.contains('pulsar-spin')
      )) return false;
      return true;
    });
    if (hasExternalChanges) {
      scheduleScan();
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    scanAndInject();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      scanAndInject();
    });
  }

  // Fallback scan for lazily rendered elements
  setInterval(scanAndInject, 10000);

  pulsarSendMessage({ action: 'injector-ready' });
})();
