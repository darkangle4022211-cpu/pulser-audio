/**
 * Pulsar Music Player - Main Application Coordinator
 * 100% Offline, High-Performance, Feature-Rich
 */

import { audioEngine, EQ_FREQUENCIES } from '../audio/engine.js';
import { AudioVisualizer } from '../audio/visualizer.js';
import { playlistManager } from '../playlists/manager.js';
import { db } from '../storage/db.js';
import { parseAudioMetadata } from '../utils/id3Parser.js';
import { parseLRC } from '../utils/lrcParser.js';
import { setupHotkeys } from './hotkeys.js';
import { onlineMusic } from '../services/onlineMusic.js';
import { BluetoothMediaManager } from '../utils/bluetoothMedia.js';
import { tasteEngine } from '../services/tasteEngine.js';

// Cross-platform URL converter for pulsar-audio:// scheme (supports Linux & Windows drive letters)
function toPulsarAudioUrl(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const normalized = filePath.replace(/\\/g, '/');
  const pathPart = normalized.startsWith('/') ? normalized : '/' + normalized;
  return 'pulsar-audio://' + encodeURI(pathPart).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

function isLocalAbsolutePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return filePath.startsWith('/') || /^[a-zA-Z]:[\\\/]/.test(filePath);
}

class App {
  constructor() {
    this.db = db;
    this.audioEngine = audioEngine;
    this.playlistManager = playlistManager;
    this.onlineMusic = onlineMusic;

    this.currentView = 'all-songs'; // 'all-songs' | 'favorites' | 'recent' | 'discover' | playlistId
    this.tracks = [];
    this.activeTrack = null;
    this.audioFilesMap = new Map(); // id -> File object (for offline playback)
    this.lyricsList = [];
    this.lyricsActiveIndex = -1;

    this.isShuffle = false;
    this.loopMode = 'all'; // 'all' | 'one' | 'none'
    this.sortColumn = 'dateAdded';
    this.sortAscending = false;
    this.searchQuery = '';

    // Online YouTube Music State
    this.onlineTracks = [];
    this.onlineFilter = 'songs'; // 'songs' | 'albums' | 'artists' | 'videos' | 'all'
    this.onlineSort = 'popularity';
    this.onlineOffset = 0;
    this.onlineSearchQuery = '';
    this.onlineSearchDebounceTimer = null;
    this.downloadingTrackIds = new Set();
    this.downloadedTrackIds = new Set();
    this.currentOnlineInfoTrack = null;
    this._onlineRequestSeq = 0;

    this.visualizer = null;
    this.speedRates = [0.8, 1.0, 1.25, 1.5, 2.0];
    this.currentSpeedIdx = 1;

    this.notificationsEnabled = true;
    this.contextTargetTrack = null;

    this.updaterState = {
      availableUpdate: null,
      isDownloading: false,
      isReadyToInstall: false,
      downloadedInstallerPath: null
    };

    window.app = this;
  }

  async init() {
    this._cacheDOMElements();
    try { this._initVisualizer(); } catch (e) { console.warn('Visualizer init warning:', e); }
    try { this._initBluetoothMedia(); } catch (e) { console.warn('Bluetooth init warning:', e); }
    try { this._bindEvents(); } catch (e) { console.warn('Event binding warning:', e); }
    try { this._setupEqualizerSliders(); } catch (e) { console.warn('EQ init warning:', e); }
    try { this._initHotkeys(); } catch (e) { console.warn('Hotkeys init warning:', e); }
    try { this._initUpdater(); } catch (e) { console.warn('Updater init warning:', e); }
    try { await tasteEngine.init(); } catch (e) { console.warn('TasteEngine init warning:', e); }
    try { this._initFlowStage(); } catch (e) { console.warn('FlowStage init warning:', e); }
    try {
      tasteEngine.onChange(() => {
        this._updateTasteBannerUI();
      });
    } catch (e) {}
    try { await this._restoreSessionState(); } catch (e) { console.warn('Session restore warning:', e); }
    await this._loadLibraryAndPlaylists();
  }

  _cacheDOMElements() {
    // Header & Navigation
    this.themeToggleBtn = document.getElementById('themeToggleBtn');
    this.themeIconDark = document.getElementById('themeIconDark');
    this.themeIconLight = document.getElementById('themeIconLight');
    this.notificationToggleBtn = document.getElementById('notificationToggleBtn');
    this.notifIconOn = document.getElementById('notifIconOn');
    this.notifIconOff = document.getElementById('notifIconOff');
    this.searchInput = document.getElementById('searchInput');
    this.searchClearBtn = document.getElementById('searchClearBtn');

    // Window controls
    this.winMinBtn = document.getElementById('winMinBtn');
    this.winMaxBtn = document.getElementById('winMaxBtn');
    this.winCloseBtn = document.getElementById('winCloseBtn');

    // Sidebar
    this.navAllSongs = document.getElementById('navAllSongs');
    this.navFavorites = document.getElementById('navFavorites');
    this.navRecent = document.getElementById('navRecent');
    this.playlistsList = document.getElementById('playlistsList');
    this.newPlaylistBtn = document.getElementById('newPlaylistBtn');
    this.allTracksCount = document.getElementById('allTracksCount');
    this.favTracksCount = document.getElementById('favTracksCount');
    this.addFilesBtn = document.getElementById('addFilesBtn');
    this.addFolderBtn = document.getElementById('addFolderBtn');
    this.backupBtn = document.getElementById('backupBtn');
    this.fileInput = document.getElementById('fileInput');
    this.folderInput = document.getElementById('folderInput');

    // Main Stage
    this.mainContent = document.getElementById('mainContent');
    this.heroCoverImg = document.getElementById('heroCoverImg');
    this.heroTag = document.getElementById('heroTag');
    this.heroTitle = document.getElementById('heroTitle');
    this.heroDesc = document.getElementById('heroDesc');
    this.heroTrackCount = document.getElementById('heroTrackCount');
    this.heroDuration = document.getElementById('heroDuration');
    this.heroPlayAllBtn = document.getElementById('heroPlayAllBtn');
    this.heroAddSongsBtn = document.getElementById('heroAddSongsBtn');
    this.heroExportBtn = document.getElementById('heroExportBtn');
    this.heroDeletePlBtn = document.getElementById('heroDeletePlBtn');
    this.tracksTable = document.getElementById('tracksTable');
    this.tracksTbody = document.getElementById('tracksTbody');
    this.emptyLibraryState = document.getElementById('emptyLibraryState');
    this.emptyStateIcon = document.getElementById('emptyStateIcon');
    this.emptyStateTitle = document.getElementById('emptyStateTitle');
    this.emptyStateDesc = document.getElementById('emptyStateDesc');
    this.emptyAddBtn = document.getElementById('emptyAddBtn');
    this.plEmptyAddSongsBtn = document.getElementById('plEmptyAddSongsBtn');
    this.emptyDemoBtn = document.getElementById('emptyDemoBtn');
    this.playlistsEmptyHint = document.getElementById('playlistsEmptyHint');

    // Player Bar
    this.playerThumb = document.getElementById('playerThumb');
    this.playerTitle = document.getElementById('playerTitle');
    this.playerArtist = document.getElementById('playerArtist');
    this.playerHeartBtn = document.getElementById('playerHeartBtn');
    this.playPauseBtn = document.getElementById('playPauseBtn');
    this.playIcon = document.getElementById('playIcon');
    this.pauseIcon = document.getElementById('pauseIcon');
    this.prevBtn = document.getElementById('prevBtn');
    this.nextBtn = document.getElementById('nextBtn');
    this.shuffleBtn = document.getElementById('shuffleBtn');
    this.repeatBtn = document.getElementById('repeatBtn');
    this.repeatIconAll = document.getElementById('repeatIconAll');
    this.repeatIconOne = document.getElementById('repeatIconOne');

    // Seeker & Timestamps
    this.currentTimeLabel = document.getElementById('currentTimeLabel');
    this.durationLabel = document.getElementById('durationLabel');
    this.seekerWrapper = document.getElementById('seekerWrapper');
    this.seekerFill = document.getElementById('seekerFill');
    this.seekerThumb = document.getElementById('seekerThumb');
    this.seekerTooltip = document.getElementById('seekerTooltip');

    // Right Controls
    this.speedBtn = document.getElementById('speedBtn');
    this.visualizerToggleBtn = document.getElementById('visualizerToggleBtn');
    this.eqModalBtn = document.getElementById('eqModalBtn');
    this.lyricsToggleBtn = document.getElementById('lyricsToggleBtn');
    this.muteBtn = document.getElementById('muteBtn');
    this.volIconHigh = document.getElementById('volIconHigh');
    this.volIconMuted = document.getElementById('volIconMuted');
    this.volumeWrapper = document.getElementById('volumeWrapper');
    this.volumeFill = document.getElementById('volumeFill');
    this.volumeThumb = document.getElementById('volumeThumb');

    // Canvas & Lyrics
    this.visualizerCanvas = document.getElementById('visualizerCanvas');
    this.lyricsDrawer = document.getElementById('lyricsDrawer');
    this.closeLyricsBtn = document.getElementById('closeLyricsBtn');
    this.lyricsContainer = document.getElementById('lyricsContainer');

    // Modals
    this.eqModal = document.getElementById('eqModal');
    this.closeEqBtn = document.getElementById('closeEqBtn');
    this.applyEqCloseBtn = document.getElementById('applyEqCloseBtn');
    this.resetEqBtn = document.getElementById('resetEqBtn');
    this.widenerToggleBtn = document.getElementById('widenerToggleBtn');
    this.eqSlidersRack = document.getElementById('eqSlidersRack');

    this.playlistModal = document.getElementById('playlistModal');
    this.closePlaylistModalBtn = document.getElementById('closePlaylistModalBtn');
    this.cancelPlaylistBtn = document.getElementById('cancelPlaylistBtn');
    this.savePlaylistBtn = document.getElementById('savePlaylistBtn');
    this.plNameInput = document.getElementById('plNameInput');
    this.plDescInput = document.getElementById('plDescInput');

    this.duplicateModal = document.getElementById('duplicateModal');
    this.closeDupModalBtn = document.getElementById('closeDupModalBtn');
    this.dupSkipBtn = document.getElementById('dupSkipBtn');
    this.dupAddAnywayBtn = document.getElementById('dupAddAnywayBtn');
    this.dupPromptText = document.getElementById('dupPromptText');

    this.trackInfoModal = document.getElementById('trackInfoModal');
    this.closeTrackInfoBtn = document.getElementById('closeTrackInfoBtn');
    this.cancelTrackInfoBtn = document.getElementById('cancelTrackInfoBtn');
    this.saveTrackInfoBtn = document.getElementById('saveTrackInfoBtn');
    this.editTitleInput = document.getElementById('editTitleInput');
    this.editArtistInput = document.getElementById('editArtistInput');
    this.editAlbumInput = document.getElementById('editAlbumInput');
    this.editYearInput = document.getElementById('editYearInput');
    this.editGenreInput = document.getElementById('editGenreInput');
    this.metaFileName = document.getElementById('metaFileName');
    this.metaFileSize = document.getElementById('metaFileSize');
    this.metaFormat = document.getElementById('metaFormat');

    // Add To Playlist & Song Picker Modals
    this.selectPlaylistModal = document.getElementById('selectPlaylistModal');
    this.closeSelectPlaylistModalBtn = document.getElementById('closeSelectPlaylistModalBtn');
    this.cancelSelectPlaylistBtn = document.getElementById('cancelSelectPlaylistBtn');
    this.selectPlaylistTrackInfo = document.getElementById('selectPlaylistTrackInfo');
    this.selectPlaylistCreateNewBtn = document.getElementById('selectPlaylistCreateNewBtn');
    this.selectPlaylistList = document.getElementById('selectPlaylistList');

    this.playlistSongPickerModal = document.getElementById('playlistSongPickerModal');
    this.playlistSongPickerTitle = document.getElementById('playlistSongPickerTitle');
    this.closeSongPickerModalBtn = document.getElementById('closeSongPickerModalBtn');
    this.closeSongPickerDoneBtn = document.getElementById('closeSongPickerDoneBtn');
    this.songPickerSearchInput = document.getElementById('songPickerSearchInput');
    this.songPickerList = document.getElementById('songPickerList');

    // Smart Radio
    this.smartRadioToggleBtn = document.getElementById('smartRadioToggleBtn');

    // Pulsar Flow & Discover Native Stage
    this.navDiscover = document.getElementById('navDiscover');
    this.onlineStatusBadge = document.getElementById('onlineStatusBadge');
    this.discoverView = document.getElementById('discoverView');
    this.tracksContainer = document.querySelector('.tracks-container');
    this.viewHero = document.getElementById('viewHero');
    this.playerBar = document.querySelector('.player-bar');
    this.visualizerDeck = document.getElementById('visualizerDeck');

    this.flowSearchInput = document.getElementById('flowSearchInput');
    this.flowSearchClearBtn = document.getElementById('flowSearchClearBtn');
    this.flowSearchSuggestions = document.getElementById('flowSearchSuggestions');
    this.selectedSuggestionIndex = -1;
    this.flowPlayAllBtn = document.getElementById('flowPlayAllBtn');
    this.flowLoadingSpinner = document.getElementById('flowLoadingSpinner');
    this.flowLoadingText = document.getElementById('flowLoadingText');
    this.flowRadioQueuePanel = document.getElementById('flowRadioQueuePanel');
    this.radioQueueScroller = document.getElementById('radioQueueScroller');
    this.radioQueueTitle = document.getElementById('radioQueueTitle');
    this.radioQueueDesc = document.getElementById('radioQueueDesc');
    this.radioSavePlaylistBtn = document.getElementById('radioSavePlaylistBtn');
    this.flowQuickPicksSection = document.getElementById('flowQuickPicksSection');
    this.flowQuickPicksGrid = document.getElementById('flowQuickPicksGrid');
    this.flowPlaylistsSection = document.getElementById('flowPlaylistsSection');
    this.flowPlaylistsGrid = document.getElementById('flowPlaylistsGrid');
    this.flowSearchResultsSection = document.getElementById('flowSearchResultsSection');
    this.tasteLevelText = document.getElementById('tasteLevelText');
    this.tasteSummaryText = document.getElementById('tasteSummaryText');
    this.tasteAddictionBadge = document.getElementById('tasteAddictionBadge');
    this.statListensCount = document.getElementById('statListensCount');
    this.statTrainedArtists = document.getElementById('statTrainedArtists');
    this.statAddictionScore = document.getElementById('statAddictionScore');
    this.flowOfflineState = document.getElementById('flowOfflineState');
    this.flowRetryBtn = document.getElementById('flowRetryBtn');
    this.flowGoLocalBtn = document.getElementById('flowGoLocalBtn');
    this.flowRefreshBtn = document.getElementById('flowRefreshBtn');
    this.flowSectionTitle = document.getElementById('flowSectionTitle');
    this.flowSectionMeta = document.getElementById('flowSectionMeta');

    this.activeFlowTab = 'for-you';
    this.flowTracks = [];
    this.radioQueue = [];
    this.isRadioModeActive = true;
    this.radioSeedTrack = null;
    this.flowSearchDebounceTimer = null;

    // Online Info Modal
    this.onlineTrackInfoModal = document.getElementById('onlineTrackInfoModal');
    this.closeOnlineInfoBtn = document.getElementById('closeOnlineInfoBtn');
    this.onlineInfoCloseBtn = document.getElementById('onlineInfoCloseBtn');
    this.onlineInfoDownloadBtn = document.getElementById('onlineInfoDownloadBtn');
    this.onlineInfoCover = document.getElementById('onlineInfoCover');
    this.onlineInfoTrackTitle = document.getElementById('onlineInfoTrackTitle');
    this.onlineInfoTrackArtist = document.getElementById('onlineInfoTrackArtist');
    this.onlineInfoTrackMeta = document.getElementById('onlineInfoTrackMeta');
    this.onlineInfoTrackLicense = document.getElementById('onlineInfoTrackLicense');

    // Context Menu & Drop Overlay
    this.contextMenu = document.getElementById('contextMenu');
    this.ctxPlayNext = document.getElementById('ctxPlayNext');
    this.ctxPlayLast = document.getElementById('ctxPlayLast');
    this.ctxAddToPlaylist = document.getElementById('ctxAddToPlaylist');
    this.ctxEditInfo = document.getElementById('ctxEditInfo');
    this.ctxRemove = document.getElementById('ctxRemove');
    this.dropOverlay = document.getElementById('dropOverlay');

    // Playlist Context Menu in Sidebar
    this.playlistContextMenu = document.getElementById('playlistContextMenu');
    this.plCtxPlay = document.getElementById('plCtxPlay');
    this.plCtxExport = document.getElementById('plCtxExport');
    this.plCtxDelete = document.getElementById('plCtxDelete');

    // Online Song Context Menu
    this.onlineContextMenu = document.getElementById('onlineContextMenu');
    this.onlineCtxPlay = document.getElementById('onlineCtxPlay');
    this.onlineCtxDownload = document.getElementById('onlineCtxDownload');
    this.onlineCtxDownloadText = document.getElementById('onlineCtxDownloadText');
    this.onlineCtxAddToPlaylist = document.getElementById('onlineCtxAddToPlaylist');
    this.onlineCtxInfo = document.getElementById('onlineCtxInfo');
    this.onlineCtxCopy = document.getElementById('onlineCtxCopy');

    // Online Auto-Updater Elements
    this.btnUpdateAvailable = document.getElementById('btnUpdateAvailable');
    this.updateBtnText = document.getElementById('updateBtnText');
    this.btnCheckUpdatesManual = document.getElementById('btnCheckUpdatesManual');
    this.updateModal = document.getElementById('updateModal');
    this.btnCloseUpdateModal = document.getElementById('btnCloseUpdateModal');
    this.btnUpdateDismiss = document.getElementById('btnUpdateDismiss');
    this.btnUpdateExecute = document.getElementById('btnUpdateExecute');
    this.btnUpdateExecuteText = document.getElementById('btnUpdateExecuteText');
    this.updateBadgeCurrent = document.getElementById('updateBadgeCurrent');
    this.updateBadgeLatest = document.getElementById('updateBadgeLatest');
    this.updateModalVersionSub = document.getElementById('updateModalVersionSub');
    this.updateChangelogContent = document.getElementById('updateChangelogContent');
    this.updateProgressBlock = document.getElementById('updateProgressBlock');
    this.updateBgBanner = document.getElementById('updateBgBanner');
    this.updateProgressBarFill = document.getElementById('updateProgressBarFill');

    // YouTube Music Now Playing Stage (Screenshot 5 Reference)
    this.nowPlayingStage = document.getElementById('nowPlayingStage');
    this.npCollapseBtn = document.getElementById('npCollapseBtn');
    this.npRadioModeBtn = document.getElementById('npRadioModeBtn');
    this.npLargeCover = document.getElementById('npLargeCover');
    this.npTrackTitle = document.getElementById('npTrackTitle');
    this.npTrackArtist = document.getElementById('npTrackArtist');
    this.npTrackMeta = document.getElementById('npTrackMeta');
    this.npHeartBtn = document.getElementById('npHeartBtn');
    this.npTabUpNext = document.getElementById('npTabUpNext');
    this.npTabLyrics = document.getElementById('npTabLyrics');
    this.npTabRelated = document.getElementById('npTabRelated');
    this.npContentUpNext = document.getElementById('npContentUpNext');
    this.npContentLyrics = document.getElementById('npContentLyrics');
    this.npContentRelated = document.getElementById('npContentRelated');
    this.npQueueList = document.getElementById('npQueueList');
    this.npQueueSubText = document.getElementById('npQueueSubText');
    this.npSaveQueueBtn = document.getElementById('npSaveQueueBtn');
    this.npDownloadBtn = document.getElementById('npDownloadBtn');
    this.npDownloadQueueBtn = document.getElementById('npDownloadQueueBtn');
    this.nowPlayingQueueBtn = document.getElementById('nowPlayingQueueBtn');
    this.playerLeftDetails = document.getElementById('playerLeftDetails');
    this.npLyricsContainer = document.getElementById('npLyricsContainer');
    this.npRelatedContainer = document.getElementById('npRelatedContainer');
    this.playerLeft = document.querySelector('.player-left');
    this.isNowPlayingOpen = false;
    this.nowPlayingActiveTab = 'up-next';

    // Discover "Listen again" Carousel and Quick Picks Play All
    this.flowListenAgainSection = document.getElementById('flowListenAgainSection');
    this.flowListenAgainList = document.getElementById('flowListenAgainList');
    this.quickPicksPlayAllBtn = document.getElementById('quickPicksPlayAllBtn');
    this.currentQuickPicks = [];
    this._playRequestId = 0;
    this._lastPreviousTapTime = 0;
  }

  _initVisualizer() {
    if (this.visualizerCanvas) {
      this.visualizer = new AudioVisualizer(this.visualizerCanvas);
    }
  }

  _initBluetoothMedia() {
    this.bluetoothMedia = new BluetoothMediaManager({
      onPlayPause: () => this._togglePlayPause(),
      onNext: () => this._playNext(),
      onPrevious: () => this._playPrevious(),
      onSeekRel: (delta) => audioEngine.seek(audioEngine.getCurrentTime() + delta),
      onSeekTo: (time) => audioEngine.seek(time),
      onStop: () => {
        if (audioEngine.isPlaying()) audioEngine.pause();
      },
      showFeedback: (text) => this._showToast(text, 'info')
    });
  }

  _initHotkeys() {
    setupHotkeys({
      onPlayPause: () => this._togglePlayPause(),
      onMediaPlayPauseTap: () => {
        if (this.bluetoothMedia) {
          this.bluetoothMedia.handlePlayPauseTap();
        } else {
          this._togglePlayPause();
        }
      },
      onSeekRel: (delta) => audioEngine.seek(audioEngine.getCurrentTime() + delta),
      onNext: () => this._playNext(),
      onPrevious: () => this._playPrevious(),
      onStop: () => {
        if (audioEngine.isPlaying()) audioEngine.pause();
      },
      onVolumeRel: (delta) => {
        const newVol = Math.max(0, Math.min(1, audioEngine.previousVolume + delta));
        this._setVolume(newVol);
      },
      onMute: () => this._toggleMute(),
      onShuffle: () => this._toggleShuffle(),
      onLoop: () => this._toggleLoop(),
      onSearchFocus: () => {
        if (this.flowSearchInput && this.currentView === 'discover') {
          this.flowSearchInput.focus();
        } else if (this.flowSearchInput) {
          this.flowSearchInput.focus();
        } else if (this.searchInput) {
          this.searchInput.focus();
        }
      },
      onEscape: () => {
        if (this.isNowPlayingOpen) {
          this._closeNowPlayingStage();
          return;
        }
        this._closeAllModals();
      },
      onToggleQueue: () => this._toggleNowPlayingStage(),
      onToggleSidebar: () => this._toggleSidebar()
    });
  }

  _bindEvents() {
    // Setup smooth auto-hide sidebar drawer with edge hover trigger
    this._setupSidebarDrawer();

    // Theme Switcher (Manual Light / Dark)
    this.themeToggleBtn.addEventListener('click', () => this._toggleTheme());

    // Desktop Notifications Toggle
    if (this.notificationToggleBtn) {
      this.notificationToggleBtn.addEventListener('click', () => this._toggleNotifications());
    }

    // Window Controls
    this.winMinBtn.addEventListener('click', () => {
      if (window.electronAPI) window.electronAPI.minimize();
    });
    this.winMaxBtn.addEventListener('click', () => {
      if (window.electronAPI) window.electronAPI.maximize();
    });
    this.winCloseBtn.addEventListener('click', () => {
      if (window.electronAPI) window.electronAPI.close();
    });

    // Search Input (Guarded for top header search bar removal)
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        if (this.searchClearBtn) this.searchClearBtn.classList.toggle('visible', !!this.searchQuery);
        if (this.currentView === 'discover') {
          this._debouncedOnlineSearch(this.searchQuery);
        } else {
          this._renderTracks();
        }
      });
    }
    if (this.searchClearBtn) {
      this.searchClearBtn.addEventListener('click', () => {
        if (this.searchInput) this.searchInput.value = '';
        this.searchQuery = '';
        this.searchClearBtn.classList.remove('visible');
        if (this.currentView === 'discover') {
          this.onlineSearchQuery = '';
          this._loadDiscoverView(false);
        } else {
          this._renderTracks();
        }
      });
    }

    // YouTube Music Now Playing Stage Events (Screenshot 5 Reference)
    if (this.npCollapseBtn) {
      this.npCollapseBtn.addEventListener('click', () => this._closeNowPlayingStage());
    }
    if (this.npRadioModeBtn) {
      this.npRadioModeBtn.addEventListener('click', () => {
        this.isRadioModeActive = !this.isRadioModeActive;
        this.npRadioModeBtn.classList.toggle('active', this.isRadioModeActive);
        if (this.smartRadioToggleBtn) this.smartRadioToggleBtn.classList.toggle('active', this.isRadioModeActive);
        this._showToast(
          this.isRadioModeActive
            ? 'Smart Radio: Auto-plays similar songs endlessly'
            : 'Smart Radio paused',
          'info'
        );
      });
    }
    if (this.npHeartBtn) {
      this.npHeartBtn.addEventListener('click', () => {
        if (this.activeTrack) {
          this._toggleFavorite(this.activeTrack.id);
          this.npHeartBtn.classList.toggle('active', !!this.activeTrack.isFavorite);
        }
      });
    }
    if (this.npSaveQueueBtn) {
      this.npSaveQueueBtn.addEventListener('click', () => this._saveRadioAsPlaylist());
    }
    if (this.npDownloadBtn) {
      this.npDownloadBtn.addEventListener('click', () => {
        if (this.activeTrack) this._downloadOnlineTrack(this.activeTrack);
      });
    }
    if (this.npDownloadQueueBtn) {
      this.npDownloadQueueBtn.addEventListener('click', () => this._downloadEntireQueue());
    }
    if (this.npTabUpNext) {
      this.npTabUpNext.addEventListener('click', () => this._switchNowPlayingTab('up-next'));
    }
    if (this.npTabLyrics) {
      this.npTabLyrics.addEventListener('click', () => this._switchNowPlayingTab('lyrics'));
    }
    if (this.npTabRelated) {
      this.npTabRelated.addEventListener('click', () => this._switchNowPlayingTab('related'));
    }

    // Now Playing Reopen Controls
    if (this.nowPlayingQueueBtn) {
      this.nowPlayingQueueBtn.addEventListener('click', () => {
        if (this.currentView === 'discover') {
          this._toggleNowPlayingStage();
        }
      });
    }
    if (this.playerLeftDetails) {
      this.playerLeftDetails.addEventListener('click', (e) => {
        if (e.target.closest('#playerHeartBtn')) return;
        if (this.currentView === 'discover') {
          this._toggleNowPlayingStage();
        }
      });
    } else if (this.playerLeft) {
      this.playerLeft.addEventListener('click', (e) => {
        if (e.target.closest('#playerHeartBtn')) return;
        if (this.currentView === 'discover') {
          this._toggleNowPlayingStage();
        }
      });
    }

    // Quick Picks "Play all" button
    if (this.flowPlayAllBtn) {
      this.flowPlayAllBtn.addEventListener('click', () => this._playAllQuickPicks());
    }

    // Navigation Items
    this.navAllSongs.addEventListener('click', () => this._switchView('all-songs'));
    this.navFavorites.addEventListener('click', () => this._switchView('favorites'));
    this.navRecent.addEventListener('click', () => this._switchView('recent'));
    if (this.navDiscover) {
      this.navDiscover.addEventListener('click', () => this._switchView('discover'));
    }

    // Online Track Info Modal Close Handlers
    if (this.closeOnlineInfoBtn) {
      this.closeOnlineInfoBtn.addEventListener('click', () => this._closeModal(this.onlineTrackInfoModal));
    }
    if (this.onlineInfoCloseBtn) {
      this.onlineInfoCloseBtn.addEventListener('click', () => this._closeModal(this.onlineTrackInfoModal));
    }
    if (this.onlineInfoDownloadBtn) {
      this.onlineInfoDownloadBtn.addEventListener('click', () => {
        if (this.currentOnlineInfoTrack) {
          this._downloadOnlineTrack(this.currentOnlineInfoTrack);
          this._closeModal(this.onlineTrackInfoModal);
        }
      });
    }

    // Online / Offline window connectivity listeners
    window.addEventListener('online', () => this._updateOnlineConnectivity(true));
    window.addEventListener('offline', () => this._updateOnlineConnectivity(false));

    // Playlist Creation
    this.newPlaylistBtn.addEventListener('click', () => this._openNewPlaylistModal());
    if (this.playlistsEmptyHint) {
      this.playlistsEmptyHint.addEventListener('click', () => this._openNewPlaylistModal());
    }
    this.closePlaylistModalBtn.addEventListener('click', () => this._closeModal(this.playlistModal));
    this.cancelPlaylistBtn.addEventListener('click', () => this._closeModal(this.playlistModal));
    this.savePlaylistBtn.addEventListener('click', () => this._handleSavePlaylist());

    // Add Songs to Current Playlist
    if (this.heroAddSongsBtn) {
      this.heroAddSongsBtn.addEventListener('click', () => this._openPlaylistSongPicker(this.currentView));
    }
    if (this.plEmptyAddSongsBtn) {
      this.plEmptyAddSongsBtn.addEventListener('click', () => this._openPlaylistSongPicker(this.currentView));
    }

    // Select Playlist Modal Buttons
    if (this.closeSelectPlaylistModalBtn) {
      this.closeSelectPlaylistModalBtn.addEventListener('click', () => this._closeModal(this.selectPlaylistModal));
    }
    if (this.cancelSelectPlaylistBtn) {
      this.cancelSelectPlaylistBtn.addEventListener('click', () => this._closeModal(this.selectPlaylistModal));
    }
    if (this.selectPlaylistCreateNewBtn) {
      this.selectPlaylistCreateNewBtn.addEventListener('click', () => {
        this._closeModal(this.selectPlaylistModal);
        this._openNewPlaylistModal(this._selectedTrackForPlaylist);
      });
    }

    // Song Picker Modal Buttons
    if (this.closeSongPickerModalBtn) {
      this.closeSongPickerModalBtn.addEventListener('click', () => {
        this._closeModal(this.playlistSongPickerModal);
        this._renderTracks();
        this._renderPlaylistsNav();
      });
    }
    if (this.closeSongPickerDoneBtn) {
      this.closeSongPickerDoneBtn.addEventListener('click', () => {
        this._closeModal(this.playlistSongPickerModal);
        this._renderTracks();
        this._renderPlaylistsNav();
      });
    }
    if (this.songPickerSearchInput) {
      this.songPickerSearchInput.addEventListener('input', () => this._renderSongPickerList());
    }

    // Backdrop click closes any active modal
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this._closeModal(modal);
          if (modal === this.playlistSongPickerModal) {
            this._renderTracks();
            this._renderPlaylistsNav();
          }
        }
      });
    });

    this.plNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._handleSavePlaylist();
      }
    });

    this.plDescInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this._handleSavePlaylist();
      }
    });

    // File Importing
    this.addFilesBtn.addEventListener('click', () => this._handleOpenFiles());
    this.emptyAddBtn.addEventListener('click', () => this._handleOpenFiles());
    if (this.emptyDemoBtn) {
      this.emptyDemoBtn.addEventListener('click', async () => {
        await this._seedSampleTracks();
        this._updateBadgeCounts();
        this._renderPlaylistsNav();
        this._renderTracks();
      });
    }
    this.addFolderBtn.addEventListener('click', () => this._handleOpenFolder());
    this.backupBtn.addEventListener('click', () => playlistManager.exportFullBackup());

    this.fileInput.addEventListener('change', (e) => this._handleFileImport(e.target.files));
    this.folderInput.addEventListener('change', (e) => this._handleFileImport(e.target.files));

    // Drag and Drop Files
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropOverlay.classList.add('active');
    });
    window.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null) {
        this.dropOverlay.classList.remove('active');
      }
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropOverlay.classList.remove('active');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        this._handleFileImport(e.dataTransfer.files);
      }
    });

    // Playback Controls
    this.playPauseBtn.addEventListener('click', () => this._togglePlayPause());
    this.prevBtn.addEventListener('click', () => this._playPrevious());
    this.nextBtn.addEventListener('click', () => this._playNext());
    this.shuffleBtn.addEventListener('click', () => this._toggleShuffle());
    this.repeatBtn.addEventListener('click', () => this._toggleLoop());
    this.heroPlayAllBtn.addEventListener('click', () => this._playAllCurrentView());
    this.heroExportBtn.addEventListener('click', () => this._exportCurrentPlaylist());
    this.heroDeletePlBtn.addEventListener('click', () => this._deleteCurrentPlaylist());

    // Seeker Drag & Hover
    this._bindSeekerEvents();

    // Volume Drag & Mute
    this._bindVolumeEvents();

    // Speed Rate Toggle
    this.speedBtn.addEventListener('click', () => this._cycleSpeedRate());

    // Visualizer Toggle
    this.visualizerToggleBtn.addEventListener('click', () => {
      const mode = this.visualizer.toggleMode();
      this.visualizerToggleBtn.classList.toggle('active', mode !== 'off');
      this.visualizerToggleBtn.title = `Visualizer Mode: ${mode.toUpperCase()}`;
      this._showToast(`Visualizer: ${mode.toUpperCase()}`, 'info');
    });

    // 10-Band EQ Modal
    this.eqModalBtn.addEventListener('click', () => this._openModal(this.eqModal));
    this.closeEqBtn.addEventListener('click', () => this._closeModal(this.eqModal));
    this.applyEqCloseBtn.addEventListener('click', () => this._closeModal(this.eqModal));
    this.resetEqBtn.addEventListener('click', () => this._resetEQ());
    this.widenerToggleBtn.addEventListener('click', () => this._toggleWidener());

    document.querySelectorAll('.eq-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.dataset.preset;
        const gains = audioEngine.applyEQPreset(preset);
        this._updateEQSlidersUI(gains);
      });
    });

    // Lyrics Drawer Toggle
    this.lyricsToggleBtn.addEventListener('click', () => {
      this.lyricsDrawer.classList.toggle('open');
      this.lyricsToggleBtn.classList.toggle('active', this.lyricsDrawer.classList.contains('open'));
    });
    this.closeLyricsBtn.addEventListener('click', () => {
      this.lyricsDrawer.classList.remove('open');
      this.lyricsToggleBtn.classList.remove('active');
    });

    // Column Sorting Headers
    this.tracksTable.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (this.sortColumn === col) {
          this.sortAscending = !this.sortAscending;
        } else {
          this.sortColumn = col;
          this.sortAscending = true;
        }
        this._renderTracks();
      });
    });

    // Heart Button on Player Bar
    this.playerHeartBtn.addEventListener('click', () => {
      if (this.activeTrack) this._toggleFavorite(this.activeTrack.id);
    });

    // Audio Engine Callbacks
    audioEngine.onPlayStateChange = (playing) => {
      this.playIcon.style.display = playing ? 'none' : 'block';
      this.pauseIcon.style.display = playing ? 'block' : 'none';
      if (playing) {
        if (this.visualizer && this.visualizer.mode !== 'off') this.visualizer.start();
      } else {
        if (this.visualizer && !audioEngine.isChangingTrack) this.visualizer.stop();
      }
      this._updateActiveRowHighlight();
      if (this.bluetoothMedia) {
        this.bluetoothMedia.updatePlaybackState(playing);
      }
    };

    let lastPositionSaveTime = 0;
    let lastMprisSyncTime = 0;
    audioEngine.onTimeUpdate = (currentTime, duration) => {
      if (!this.isUserSeeking) {
        this._updateSeeker(currentTime, duration);
      }
      this._syncLyrics(currentTime);

      // Self-learning dwell time tracking (Instagram-style attention model)
      if (this.activeTrack && currentTime > 0) {
        tasteEngine.recordDwellTick(this.activeTrack, currentTime, duration);
      }

      const now = Date.now();
      // Throttle disk I/O writes to once every 3 seconds to save CPU & reduce fan activity
      if (now - lastPositionSaveTime > 3000) {
        lastPositionSaveTime = now;
        db.setSetting('activePosition', currentTime);
      }
      const effectiveDuration = (duration && isFinite(duration) && duration > 0)
        ? duration
        : (this.activeTrack && isFinite(this.activeTrack.duration) && this.activeTrack.duration > 0 ? this.activeTrack.duration : 0);

      // Throttle D-Bus MPRIS position state updates to every 1.5 seconds to prevent D-Bus IPC thrashing
      if (this.bluetoothMedia && effectiveDuration > 0 && (now - lastMprisSyncTime > 1500)) {
        lastMprisSyncTime = now;
        this.bluetoothMedia.updatePositionState(effectiveDuration, currentTime, audioEngine.audio ? audioEngine.audio.playbackRate : 1.0);
      }
      if (duration && isFinite(duration) && duration > 0 && this.activeTrack && (!this.activeTrack.duration || this.activeTrack.duration <= 0)) {
        this.activeTrack.duration = duration;
        db.saveTrack(this.activeTrack).catch(() => {});
        this._renderTracks();
      }
    };

    audioEngine.onEnded = () => {
      if (this.activeTrack) {
        db.recordPlay(this.activeTrack.id);
        tasteEngine.recordTrackCompleted(this.activeTrack, audioEngine.getDuration());
      }
      this._playNext();
    };

    // Close Context Menu on Global Click
    document.addEventListener('click', (e) => {
      if (!this.contextMenu.contains(e.target)) {
        this.contextMenu.style.display = 'none';
      }
      if (this.playlistContextMenu && !this.playlistContextMenu.contains(e.target)) {
        this.playlistContextMenu.style.display = 'none';
      }
      if (this.onlineContextMenu && !this.onlineContextMenu.contains(e.target)) {
        this.onlineContextMenu.style.display = 'none';
      }
    });

    // Duplicate Modal Buttons
    this.closeDupModalBtn.addEventListener('click', () => this._resolveDuplicatePrompt(false));
    this.dupSkipBtn.addEventListener('click', () => this._resolveDuplicatePrompt(false));
    this.dupAddAnywayBtn.addEventListener('click', () => this._resolveDuplicatePrompt(true));

    // Track Info Edit Modal
    this.closeTrackInfoBtn.addEventListener('click', () => this._closeModal(this.trackInfoModal));
    this.cancelTrackInfoBtn.addEventListener('click', () => this._closeModal(this.trackInfoModal));
    this.saveTrackInfoBtn.addEventListener('click', () => this._saveTrackInfo());
  }

  // --- Session & Theme Restoration ---
  async _restoreSessionState() {
    // Theme
    const savedTheme = await db.getSetting('theme', 'dark');
    document.documentElement.setAttribute('data-theme', savedTheme);
    this._updateThemeIcons(savedTheme);

    // Volume
    const savedVol = await db.getSetting('volume', 0.8);
    this._setVolume(savedVol);

    // Shuffle & Loop
    this.isShuffle = await db.getSetting('isShuffle', false);
    this.shuffleBtn.classList.toggle('active', this.isShuffle);

    this.loopMode = await db.getSetting('loopMode', 'all');
    this._updateLoopUI();

    // Desktop Notifications
    this.notificationsEnabled = await db.getSetting('notificationsEnabled', true);
    this._updateNotificationsUI();

    // Sidebar Pinned State (default false = completely auto-hidden until edge hover)
    this.isSidebarPinned = await db.getSetting('sidebarPinned', false);
    if (this.appSidebar) {
      this.appSidebar.classList.toggle('pinned', this.isSidebarPinned);
      this.appSidebar.classList.toggle('drawer-open', this.isSidebarPinned);
      if (this.sidebarToggleBtn) {
        this.sidebarToggleBtn.title = this.isSidebarPinned ? 'Unpin Sidebar (Auto-Hide on Hover, Ctrl+B)' : 'Pin Sidebar Open (Ctrl+B)';
      }
    }
  }

  _toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    this._updateThemeIcons(next);
    db.setSetting('theme', next);
  }

  _updateThemeIcons(theme) {
    if (theme === 'light') {
      this.themeIconDark.style.display = 'none';
      this.themeIconLight.style.display = 'block';
    } else {
      this.themeIconDark.style.display = 'block';
      this.themeIconLight.style.display = 'none';
    }
  }

  _toggleNotifications() {
    this.notificationsEnabled = !this.notificationsEnabled;
    this._updateNotificationsUI();
    db.setSetting('notificationsEnabled', this.notificationsEnabled);
    this._showToast(
      this.notificationsEnabled ? 'Desktop notifications turned ON' : 'Desktop notifications turned OFF',
      'info'
    );
  }

  _updateNotificationsUI() {
    if (!this.notificationToggleBtn) return;
    this.notificationToggleBtn.classList.toggle('active', !!this.notificationsEnabled);
    this.notificationToggleBtn.title = this.notificationsEnabled
      ? 'Desktop Notifications: Enabled'
      : 'Desktop Notifications: Disabled';
    if (this.notifIconOn) this.notifIconOn.style.display = this.notificationsEnabled ? 'block' : 'none';
    if (this.notifIconOff) this.notifIconOff.style.display = this.notificationsEnabled ? 'none' : 'block';
  }

  _setupSidebarDrawer() {
    this.appSidebar = document.getElementById('appSidebar');
    this.sidebarEdgeTrigger = document.getElementById('sidebarEdgeTrigger');
    this.sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    this.sidebarDrawerCloseBtn = document.getElementById('sidebarDrawerCloseBtn');
    this.mainContent = document.getElementById('mainContent');

    if (!this.appSidebar) return;

    let hideTimer = null;

    const showDrawer = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      this.appSidebar.classList.add('drawer-open');
    };

    const scheduleHide = (delay = 250) => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (!this.isSidebarPinned) {
          this.appSidebar.classList.remove('drawer-open');
        }
      }, delay);
    };

    // 3-bar hamburger button: Clicking opens and locks the sidebar, clicking again closes
    if (this.sidebarToggleBtn) {
      this.sidebarToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleSidebar();
      });
    }

    // Edge hover trigger: smoothly slide in drawer when cursor reaches the left border
    if (this.sidebarEdgeTrigger) {
      this.sidebarEdgeTrigger.addEventListener('mouseenter', showDrawer);
      this.sidebarEdgeTrigger.addEventListener('click', showDrawer);
    }

    // Keep drawer open while cursor is anywhere inside the sidebar
    this.appSidebar.addEventListener('mouseenter', showDrawer);
    this.appSidebar.addEventListener('mouseleave', () => scheduleHide(250));

    // Close button in sidebar drawer header
    if (this.sidebarDrawerCloseBtn) {
      this.sidebarDrawerCloseBtn.addEventListener('click', () => {
        this._closeSidebarInstantly();
      });
    }

    // Retract drawer when clicking anywhere in main content (if not pinned)
    if (this.mainContent) {
      this.mainContent.addEventListener('click', () => {
        if (!this.isSidebarPinned && this.appSidebar.classList.contains('drawer-open')) {
          this.appSidebar.classList.remove('drawer-open');
        }
      });
    }
  }

  _toggleSidebar() {
    if (!this.appSidebar) return;
    this.isSidebarPinned = !this.isSidebarPinned;
    this.appSidebar.classList.toggle('pinned', this.isSidebarPinned);
    if (this.isSidebarPinned) {
      this.appSidebar.classList.add('drawer-open');
      this._showToast('Sidebar opened & locked', 'info');
    } else {
      this.appSidebar.classList.remove('drawer-open');
      this._showToast('Sidebar auto-hide enabled', 'info');
    }
    if (this.sidebarToggleBtn) {
      this.sidebarToggleBtn.title = this.isSidebarPinned ? 'Unlock Sidebar (Auto-Hide on Hover, Ctrl+B)' : 'Lock Sidebar Open (Ctrl+B)';
    }
    db.setSetting('sidebarPinned', this.isSidebarPinned);
  }

  _closeSidebarInstantly() {
    if (!this.appSidebar) return;
    this.isSidebarPinned = false;
    this.appSidebar.classList.remove('pinned', 'drawer-open');
    db.setSetting('sidebarPinned', false);
    if (this.sidebarToggleBtn) {
      this.sidebarToggleBtn.title = 'Lock Sidebar Open (Ctrl+B)';
    }
  }

  // --- Library & Playlist Loading ---
  async _loadLibraryAndPlaylists() {
    this.tracks = await db.getAllTracks();
    // Sanitize any stale revoked blob: URLs from previous sessions
    this.tracks.forEach(t => {
      if (t.coverUrl && t.coverUrl.startsWith('blob:')) {
        t.coverUrl = null;
      }
      if (t.blobUrl && t.blobUrl.startsWith('blob:')) {
        t.blobUrl = null;
      }
      if (!t.filePath && t.src && t.src.startsWith('/')) {
        t.filePath = t.src;
      }
    });

    // Clean up any pre-existing duplicate tracks from earlier runs
    const uniqueTracks = [];
    const duplicateIdsToRemove = [];
    for (const t of this.tracks) {
      const isDup = uniqueTracks.some(u => {
        if (t.filePath && u.filePath && t.filePath.toLowerCase().replace(/\\/g, '/') === u.filePath.toLowerCase().replace(/\\/g, '/')) return true;
        if (t.fileName && u.fileName && t.fileName.toLowerCase() === u.fileName.toLowerCase() && t.fileSize && u.fileSize && t.fileSize === u.fileSize) return true;
        if (t.title && u.title && t.title.trim().toLowerCase() === u.title.trim().toLowerCase() && (t.artist || '').trim().toLowerCase() === (u.artist || '').trim().toLowerCase() && (t.fileSize === u.fileSize || Math.abs((t.duration || 0) - (u.duration || 0)) < 1.5)) return true;
        return false;
      });
      if (isDup) {
        duplicateIdsToRemove.push(t.id);
      } else {
        uniqueTracks.push(t);
      }
    }
    if (duplicateIdsToRemove.length > 0) {
      for (const dupId of duplicateIdsToRemove) {
        await db.deleteTrack(dupId).catch(() => {});
      }
      this.tracks = uniqueTracks;
    }

    // Auto-sync physical download directory (~/Music/Pulsar Downloads) into library
    await this._syncDownloadFolderTracks();

    if (this.tracks.length === 0) {
      await this._seedSampleTracks();
    }
    await playlistManager.loadPlaylists();
    await playlistManager.pruneMissingTracks(this.tracks.map(t => t.id));
    tasteEngine.seedFromLibrary(this.tracks);
    this._updateBadgeCounts();
    this._renderPlaylistsNav();
    this._switchView(this.currentView);
    this._repairIncompleteTracks();
  }

  async _syncDownloadFolderTracks() {
    try {
      const nativeApi = window.electronAPI || window.pulsarNative;
      if (!nativeApi || typeof nativeApi.scanDownloadFolder !== 'function') return;

      const res = await nativeApi.scanDownloadFolder();
      if (!res || !res.success || !Array.isArray(res.files) || res.files.length === 0) return;

      let anyNew = false;
      const norm = (s) => (s || '').toLowerCase().trim();

      for (const f of res.files) {
        const existing = this.tracks.find(t =>
          (t.filePath && t.filePath === f.filePath) ||
          (t.fileName && norm(t.fileName) === norm(f.fileName)) ||
          (t.title && norm(t.title) === norm(f.title) && norm(t.artist) === norm(f.artist))
        );

        if (!existing) {
          const newTrack = {
            id: 'trk_offline_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
            title: f.title,
            artist: f.artist,
            album: 'Downloaded Offline',
            year: '2026',
            genre: 'Offline',
            duration: 210,
            fileName: f.fileName,
            filePath: f.filePath,
            fileSize: f.size,
            dateAdded: Date.now(),
            isFavorite: false,
            playCount: 0,
            lastPlayed: null,
            isOnline: false,
            downloadedOffline: true,
            coverUrl: f.coverDataUrl || ''
          };
          await db.saveTrack(newTrack).catch(() => {});
          this.tracks.push(newTrack);
          anyNew = true;
        } else {
          let updated = false;
          if (!existing.downloadedOffline) {
            existing.downloadedOffline = true;
            updated = true;
          }
          if (!existing.filePath && f.filePath) {
            existing.filePath = f.filePath;
            updated = true;
          }
          if ((!existing.coverUrl || existing.coverUrl.startsWith('http')) && f.coverDataUrl) {
            existing.coverUrl = f.coverDataUrl;
            updated = true;
          }
          if (updated) {
            await db.saveTrack(existing).catch(() => {});
          }
        }
      }

      if (anyNew) {
        this._updateBadgeCounts();
      }
    } catch (err) {
      console.warn('Physical download folder sync notice:', err);
    }
  }

  async _repairIncompleteTracks() {
    try {
      const candidates = this.tracks.filter(t => 
        !t.duration || 
        t.duration <= 0 || 
        typeof t.duration === 'string' || 
        isNaN(Number(t.duration)) ||
        !t.album || 
        t.album === 'Unknown Album'
      );
      if (candidates.length === 0) return;

      let anyUpdated = false;
      for (const track of candidates) {
        let changed = false;

        // If duration is a string like "3:30", convert it to numeric seconds
        if (typeof track.duration === 'string') {
          const parsed = this._parseDurationToSeconds(track.duration);
          if (parsed > 0) {
            track.duration = parsed;
            changed = true;
          }
        }

        const needsDuration = !track.duration || track.duration <= 0 || isNaN(Number(track.duration));
        const needsAlbum = !track.album || track.album === 'Unknown Album';

        if (needsDuration || needsAlbum) {
          try {
            const blob = await db.getAudioFile(track.id);
            if (blob) {
              if (needsDuration) {
                await this._getTrackDuration(blob, track);
                if (track.duration > 0) changed = true;
              }
              if (needsAlbum) {
                const meta = await parseAudioMetadata(blob).catch(() => null);
                if (meta && meta.album && meta.album !== 'Unknown Album') {
                  track.album = meta.album;
                  changed = true;
                } else if (track.isOnline || (track.id && String(track.id).startsWith('yt_')) || track.downloadedOffline) {
                  track.album = 'YouTube Music';
                  changed = true;
                }
              }
            } else if (needsAlbum && (track.isOnline || (track.id && String(track.id).startsWith('yt_')) || track.downloadedOffline)) {
              track.album = 'YouTube Music';
              changed = true;
            }
          } catch (e) {
            // Ignore individual track repair failure
          }
        }

        if (changed) {
          anyUpdated = true;
          await db.saveTrack(track).catch(() => {});
        }
      }

      if (anyUpdated) {
        this._renderTracks();
      }

      // Background offline cover caching & ID3 APIC repair
      setTimeout(async () => {
        try {
          const nativeApi = window.electronAPI || window.pulsarNative;
          if (!nativeApi) return;

          let coverUpdated = false;
          for (const track of this.tracks) {
            if (!track.coverUrl || track.coverUrl.startsWith('http')) {
              // 1. Try local embedded ID3 extraction if physical file exists
              if (track.filePath && typeof nativeApi.extractCoverArt === 'function') {
                const embedded = await nativeApi.extractCoverArt(track.filePath).catch(() => null);
                if (embedded) {
                  track.coverUrl = embedded;
                  await db.saveTrack(track).catch(() => {});
                  coverUpdated = true;
                  continue;
                }
              }
              // 2. If online and has remote URL, cache to local base64/disk
              if (navigator.onLine && track.coverUrl && track.coverUrl.startsWith('http') && typeof nativeApi.cacheCoverImage === 'function') {
                const cleanName = `${track.artist || 'Unknown'}_${track.title || 'Track'}`;
                const cached = await nativeApi.cacheCoverImage(track.coverUrl, cleanName).catch(() => null);
                if (cached && cached.success && cached.dataUrl) {
                  track.coverUrl = cached.dataUrl;
                  await db.saveTrack(track).catch(() => {});
                  coverUpdated = true;
                }
              }
            }
          }
          if (coverUpdated) {
            this._renderTracks();
          }
        } catch (err) {
          console.warn('Offline cover caching notice:', err);
        }
      }, 1500);
    } catch (err) {
      console.warn('Track auto-repair error:', err);
    }
  }

  async _seedSampleTracks() {
    try {
      const samples = [
        {
          id: 'trk_sample_cosmic_horizon',
          title: 'Cosmic Horizon',
          artist: 'Pulsar Audio',
          album: 'Offline Odyssey',
          year: '2026',
          duration: 6.27,
          fileName: '01_Cosmic_Horizon.mp3',
          fileSize: 250669,
          dateAdded: Date.now() - 100000,
          playCount: 1,
          isFavorite: true,
          blobUrl: './test-tracks/01_Cosmic_Horizon.mp3',
          src: './test-tracks/01_Cosmic_Horizon.mp3',
          lrcUrl: './test-tracks/01_Cosmic_Horizon.lrc',
          coverUrl: ''
        },
        {
          id: 'trk_sample_cybernetic_pulse',
          title: 'Cybernetic Pulse',
          artist: 'Pulsar Audio',
          album: 'Offline Odyssey',
          year: '2026',
          duration: 6.27,
          fileName: '02_Cybernetic_Pulse.mp3',
          fileSize: 250661,
          dateAdded: Date.now() - 50000,
          playCount: 0,
          isFavorite: false,
          blobUrl: './test-tracks/02_Cybernetic_Pulse.mp3',
          src: './test-tracks/02_Cybernetic_Pulse.mp3',
          coverUrl: ''
        }
      ];

      for (const track of samples) {
        await db.saveTrack(track);
      }
      this.tracks = await db.getAllTracks();

      await playlistManager.loadPlaylists();
      if (playlistManager.playlists.length === 0) {
        const pl = await playlistManager.createPlaylist('Synthwave Favorites', 'Sample demo playlist featuring offline tracks');
        if (pl) {
          await playlistManager.addTrackToPlaylist(pl.id, 'trk_sample_cosmic_horizon');
          await playlistManager.addTrackToPlaylist(pl.id, 'trk_sample_cybernetic_pulse');
        }
      }
    } catch (e) {
      console.warn('Failed to seed sample tracks:', e);
    }
  }

  _updateBadgeCounts() {
    this.allTracksCount.textContent = this.tracks.length;
    const favCount = this.tracks.filter(t => t.isFavorite).length;
    this.favTracksCount.textContent = favCount;
  }

  _renderPlaylistsNav() {
    this.playlistsList.innerHTML = '';
    playlistManager.playlists.forEach(pl => {
      const validCount = (pl.trackIds || []).filter(id => this.tracks.some(t => t.id === id)).length;
      if (pl.trackIds && pl.trackIds.length !== validCount) {
        pl.trackIds = pl.trackIds.filter(id => this.tracks.some(t => t.id === id));
        db.savePlaylist(pl);
      }
      const item = document.createElement('div');
      item.className = `nav-item ${this.currentView === pl.id ? 'active' : ''}`;
      item.dataset.view = pl.id;
      item.title = `${pl.name} (${validCount} songs)`;
      item.innerHTML = `
        <span class="nav-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
        </span>
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${this._escapeHtml(pl.name)}</span>
        <span class="nav-badge">${validCount}</span>
        <button class="nav-delete-pl-btn" title="Delete playlist" data-id="${pl.id}">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      `;

      // Allow dragging tracks onto this playlist
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        item.classList.add('active');
      });
      item.addEventListener('dragleave', () => {
        if (this.currentView !== pl.id) item.classList.remove('active');
      });
      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        if (this.currentView !== pl.id) item.classList.remove('active');

        // Check if external audio files from desktop were dropped onto playlist item
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          await this._handleFileImport(e.dataTransfer.files, pl);
        } else {
          const trackId = e.dataTransfer.getData('text/plain');
          if (trackId) {
            await this._addTrackToPlaylistWithPrompt(pl.id, trackId);
          }
        }
      });

      // Delete button click
      const delBtn = item.querySelector('.nav-delete-pl-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._confirmDeletePlaylist(pl.id, pl.name);
      });

      // Right-click context menu on playlist item
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showPlaylistContextMenu(e.clientX, e.clientY, pl);
      });

      item.addEventListener('click', (e) => {
        if (e.target.closest('.nav-delete-pl-btn')) return;
        this._switchView(pl.id);
      });
      this.playlistsList.appendChild(item);
    });

    if (this.playlistsEmptyHint) {
      this.playlistsEmptyHint.style.display = playlistManager.playlists.length === 0 ? 'block' : 'none';
    }
  }

  _switchView(viewId) {
    // Instantly close and unlock sidebar drawer when user selects ANY option
    this._closeSidebarInstantly();

    this.searchQuery = '';
    this.currentView = viewId;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewId);
    });

    if (viewId === 'discover') {
      if (this.viewHero) this.viewHero.style.display = 'none';
      if (this.tracksContainer) this.tracksContainer.style.display = 'none';
      if (this.discoverView) this.discoverView.style.display = 'flex';
      if (this.playerBar) this.playerBar.style.display = 'flex';
      if (this.visualizerDeck) this.visualizerDeck.style.display = 'block';
      if (this.visualizer && audioEngine.isPlaying()) {
        this.visualizer.start();
      }
      this._loadFlowView();
      return;
    }

    if (this.visualizerDeck) this.visualizerDeck.style.display = 'block';
    if (this.visualizer && audioEngine.isPlaying()) {
      this.visualizer.start();
    }

    if (this.discoverView) this.discoverView.style.display = 'none';
    this._closeNowPlayingStage();
    if (this.playerBar) this.playerBar.style.display = 'flex';
    if (this.viewHero) this.viewHero.style.display = 'flex';
    if (this.tracksContainer) this.tracksContainer.style.display = 'block';

    this.heroExportBtn.style.display = 'none';
    this.heroDeletePlBtn.style.display = 'none';
    if (this.heroAddSongsBtn) this.heroAddSongsBtn.style.display = 'none';

    if (viewId === 'all-songs') {
      this.heroTag.textContent = 'Library';
      this.heroTitle.textContent = 'All Tracks';
      this.heroDesc.textContent = 'Your offline music collection.';
    } else if (viewId === 'favorites') {
      this.heroTag.textContent = 'Smart Playlist';
      this.heroTitle.textContent = 'Favorite Tracks';
      this.heroDesc.textContent = 'Your pinned and loved tracks.';
    } else if (viewId === 'recent') {
      this.heroTag.textContent = 'Smart Playlist';
      this.heroTitle.textContent = 'Recently Played';
      this.heroDesc.textContent = 'Tracks played recently on this device.';
    } else {
      const pl = playlistManager.playlists.find(p => p.id === viewId);
      if (pl) {
        this.heroTag.textContent = 'Custom Playlist';
        this.heroTitle.textContent = pl.name;
        this.heroDesc.textContent = pl.description || 'Custom playlist created by you.';
        if (this.heroAddSongsBtn) this.heroAddSongsBtn.style.display = 'inline-flex';
        this.heroExportBtn.style.display = 'inline-flex';
        this.heroDeletePlBtn.style.display = 'inline-flex';
      }
    }

    this._renderTracks();
  }

  _getCurrentViewTracks() {
    let list = [];
    if (this.currentView === 'all-songs') {
      list = [...this.tracks];
    } else if (this.currentView === 'favorites') {
      list = this.tracks.filter(t => t.isFavorite);
    } else if (this.currentView === 'recent') {
      list = [...this.tracks].filter(t => t.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 50);
    } else {
      const pl = playlistManager.playlists.find(p => p.id === this.currentView);
      if (pl && pl.trackIds) {
        list = pl.trackIds.map(id => this.tracks.find(t => t.id === id)).filter(Boolean);
      }
    }

    // Filter search query
    list = playlistManager.filterTracks(list, this.searchQuery);

    // Sort column (only if not custom playlist or if user explicitly sorted)
    list = playlistManager.sortTracks(list, this.sortColumn, this.sortAscending);
    return list;
  }

  _renderTracks() {
    const list = this._getCurrentViewTracks();
    this.tracksTbody.innerHTML = '';

    const isEmpty = list.length === 0;
    this.tracksTable.style.display = isEmpty ? 'none' : 'table';
    this.emptyLibraryState.style.display = isEmpty ? 'flex' : 'none';

    if (isEmpty) {
      if (this.currentView.startsWith('pl_')) {
        if (this.emptyStateTitle) this.emptyStateTitle.textContent = 'This Playlist is Empty';
        if (this.emptyStateDesc) this.emptyStateDesc.textContent = 'Add songs from your music library or import audio files to this playlist.';
        if (this.plEmptyAddSongsBtn) this.plEmptyAddSongsBtn.style.display = 'inline-flex';
        if (this.emptyDemoBtn) this.emptyDemoBtn.style.display = 'none';
      } else {
        if (this.emptyStateTitle) this.emptyStateTitle.textContent = 'Your Music Library is Empty';
        if (this.emptyStateDesc) this.emptyStateDesc.textContent = 'Add your downloaded MP3 audio files or drag and drop songs directly into this window to start listening completely offline.';
        if (this.plEmptyAddSongsBtn) this.plEmptyAddSongsBtn.style.display = 'none';
        if (this.emptyDemoBtn) this.emptyDemoBtn.style.display = 'inline-flex';
      }
    }

    // Meta hero stats
    this.heroTrackCount.textContent = `${list.length} song${list.length === 1 ? '' : 's'}`;
    const totalSecs = list.reduce((acc, t) => acc + (this._parseDurationToSeconds(t.duration) || 0), 0);
    const mins = Math.floor(totalSecs / 60);
    this.heroDuration.textContent = `${mins} min${mins === 1 ? '' : 's'}`;

    list.forEach((track, index) => {
      const isPlayingThis = this.activeTrack && this.activeTrack.id === track.id;
      const tr = document.createElement('tr');
      tr.className = `track-row ${isPlayingThis ? 'playing' : ''}`;
      tr.draggable = true;
      tr.dataset.trackId = track.id;
      tr.dataset.index = index;

      tr.innerHTML = `
        <td class="td-num">
          <span class="num-text">${index + 1}</span>
          <span class="row-play-icon">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </span>
        </td>
        <td class="td-title-cell">
          <img class="track-thumb" src="${track.coverUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'38\' height=\'38\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E'}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'38\' height=\'38\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E'; this.onerror=null;" alt="Cover">
          <div class="track-title-block">
            <span class="track-title">${this._escapeHtml(track.title)}</span>
            <span class="track-artist">${this._escapeHtml(track.artist)}</span>
          </div>
        </td>
        <td class="td-album">${this._escapeHtml(track.album || 'Unknown Album')}</td>
        <td class="td-duration">${this._formatTime(track.duration)}</td>
        <td class="td-actions">
          <div class="td-actions-inner">
            <button class="heart-btn ${track.isFavorite ? 'active' : ''}" title="Favorite" data-id="${track.id}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </button>
            ${this.currentView.startsWith('pl_') ? `
              <button class="row-action-btn remove-from-pl-btn" title="Remove from this playlist" data-id="${track.id}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            ` : `
              <button class="row-action-btn row-add-pl-btn" title="Add to playlist" data-id="${track.id}">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>
              </button>
              <button class="row-action-btn row-more-btn" title="Track options">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <circle cx="12" cy="5" r="1.3"></circle>
                  <circle cx="12" cy="12" r="1.3"></circle>
                  <circle cx="12" cy="19" r="1.3"></circle>
                </svg>
              </button>
            `}
          </div>
        </td>
      `;

      // Play on click
      tr.addEventListener('click', (e) => {
        if (e.target.closest('.heart-btn') || e.target.closest('.row-action-btn')) return;
        this._playTrackFromList(list, index);
      });

      // Heart favorite toggle
      const heart = tr.querySelector('.heart-btn');
      heart.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleFavorite(track.id);
      });

      // Remove from playlist button (if in custom playlist)
      const removeBtn = tr.querySelector('.remove-from-pl-btn');
      if (removeBtn) {
        removeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const pl = playlistManager.playlists.find(p => p.id === this.currentView);
          if (pl) {
            await playlistManager.removeTrackFromPlaylist(pl.id, track.id);
            this._renderPlaylistsNav();
            this._renderTracks();
            this._showToast(`Removed "${track.title}" from "${pl.name}"`, 'info');
          }
        });
      }

      // Add to playlist button (in library view)
      const addPlBtn = tr.querySelector('.row-add-pl-btn');
      if (addPlBtn) {
        addPlBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._openSelectPlaylistModal(track);
        });
      }

      // More options button (opens context menu)
      const moreBtn = tr.querySelector('.row-more-btn');
      if (moreBtn) {
        moreBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rect = moreBtn.getBoundingClientRect();
          this._showContextMenu(rect.left - 130, rect.bottom + 4, track);
        });
      }

      // Context menu on right click
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._showContextMenu(e.clientX, e.clientY, track);
      });

      // Drag and drop within playlist
      tr.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', track.id);
        e.dataTransfer.setData('application/json', JSON.stringify({ index, trackId: track.id }));
      });

      this.tracksTbody.appendChild(tr);
    });
  }

  // --- Audio Playback Operations ---
  async _playTrackFromList(list, index) {
    playlistManager.setQueue(list, index);
    const track = list[index];
    await this._playTrack(track);
  }

  _findLocalDownloadedMatch(track) {
    if (!track) return null;
    const cleanYtId = track.ytId || (track.id && String(track.id).startsWith('yt_') ? track.id.replace('yt_', '') : null);
    return this.tracks.find(t => {
      if (!t.downloadedOffline && !t.filePath) return false;
      if (cleanYtId && (t.ytId === cleanYtId || t.id === `yt_${cleanYtId}` || t.id === cleanYtId)) return true;
      if (t.id === track.id) return true;
      if (t.title && track.title &&
          t.title.trim().toLowerCase() === track.title.trim().toLowerCase() &&
          (t.artist || '').trim().toLowerCase() === (track.artist || '').trim().toLowerCase()) {
        return true;
      }
      return false;
    }) || null;
  }

  _isTrackDownloaded(track) {
    if (!track) return false;
    if (this.downloadedTrackIds.has(track.id)) return true;
    return !!this._findLocalDownloadedMatch(track);
  }

  _prewarmUpcomingTracks() {
    if (!playlistManager.queue || playlistManager.queue.length === 0) return;
    const curIdx = playlistManager.queueIndex;
    const upcoming = [
      playlistManager.queue[curIdx + 1],
      playlistManager.queue[curIdx + 2]
    ].filter(Boolean);

    const nativeApi = window.pulsarNative || window.electronAPI;
    if (!nativeApi || typeof nativeApi.getStreamUrl !== 'function') return;

    (async () => {
      for (const nextTrack of upcoming) {
        if (nextTrack && nextTrack.isOnline && nextTrack.audioUrl) {
          const nextLocal = this._findLocalDownloadedMatch(nextTrack);
          if (!nextLocal) {
            try {
              await nativeApi.getStreamUrl(nextTrack.audioUrl);
            } catch (e) {}
          }
        }
      }
    })();
  }

  _setBufferingState(buffering) {
    if (!this.playPauseBtn) return;
    if (buffering) {
      this.playPauseBtn.classList.add('buffering');
      if (this.playIcon) this.playIcon.style.display = 'none';
      if (this.pauseIcon) this.pauseIcon.style.display = 'none';
      if (!this._bufferingSpinner) {
        this._bufferingSpinner = document.createElement('div');
        this._bufferingSpinner.className = 'play-buffering-spinner';
        this._bufferingSpinner.style.cssText = 'width:18px;height:18px;border:2.5px solid rgba(255,255,255,0.25);border-top-color:#8b5cf6;border-radius:50%;animation:spin 0.75s linear infinite;display:inline-block;';
      }
      if (!this.playPauseBtn.contains(this._bufferingSpinner)) {
        this.playPauseBtn.appendChild(this._bufferingSpinner);
      }
      this._bufferingSpinner.style.display = 'inline-block';
    } else {
      this.playPauseBtn.classList.remove('buffering');
      if (this._bufferingSpinner) this._bufferingSpinner.style.display = 'none';
      const isPlaying = audioEngine.isPlaying();
      if (this.playIcon) this.playIcon.style.display = isPlaying ? 'none' : 'block';
      if (this.pauseIcon) this.pauseIcon.style.display = isPlaying ? 'block' : 'none';
    }
  }

  async _playTrack(track, restartRadio = true) {
    if (!track) return;

    // Prevent duplicate triggers if already resolving this exact track
    if (this._isResolvingStream && this._resolvingTrackId === track.id) {
      this._showToast(`Still loading "${track.title}", please wait a moment...`, 'info');
      return;
    }

    this.activeTrack = track;
    const requestId = ++this._playRequestId;

    // Immediate bottom player UI update (0ms instant response)
    this.playerTitle.textContent = track.title;
    this.playerArtist.textContent = track.artist;
    this.playerThumb.src = track.coverUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'52\' height=\'52\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E';
    this.playerThumb.onerror = () => {
      this.playerThumb.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'52\' height=\'52\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E';
      this.playerThumb.onerror = null;
    };
    this.playerHeartBtn.classList.toggle('active', !!track.isFavorite);
    this.durationLabel.textContent = this._formatTime(track.duration);
    this._updateActiveRowHighlight();

    // Immediately update Linux MPRIS & Bluetooth MediaSession so earbuds stay in sync
    if (this.bluetoothMedia) {
      this.bluetoothMedia.updateMetadata(track);
      this.bluetoothMedia.updatePlaybackState(true);
      if (track.duration && isFinite(track.duration) && track.duration > 0) {
        this.bluetoothMedia.updatePositionState(track.duration, 0, 1.0);
      }
    }

    if (track.duration && isFinite(track.duration) && track.duration > 0) {
      audioEngine.setTrackDuration(track.duration);
    }

    // Save session
    db.setSetting('activeTrackId', track.id);
    db.setSetting('activePlaylistId', this.currentView);

    // Check local offline cache first before invoking stream extraction
    const localMatch = this._findLocalDownloadedMatch(track);
    let src = track.src;

    if (localMatch && localMatch.filePath && isLocalAbsolutePath(localMatch.filePath)) {
      src = toPulsarAudioUrl(localMatch.filePath);
      track.filePath = localMatch.filePath;
      track.downloadedOffline = true;
    } else if (localMatch && this.audioFilesMap.has(localMatch.id)) {
      const file = this.audioFilesMap.get(localMatch.id);
      src = URL.createObjectURL(file);
      track.blobUrl = src;
      track.downloadedOffline = true;
    } else if (track.filePath && isLocalAbsolutePath(track.filePath)) {
      src = toPulsarAudioUrl(track.filePath);
    } else if (track.isOnline && track.audioUrl) {
      if (track.source === 'youtube' || track.source === 'ytmusic' || track.audioUrl.includes('youtube.com') || track.audioUrl.includes('youtu.be')) {
        const nativeApi = window.pulsarNative || window.electronAPI;
        if (nativeApi && typeof nativeApi.getStreamUrl === 'function') {
          this._isResolvingStream = true;
          this._resolvingTrackId = track.id;
          this._setBufferingState(true);
          this._showToast(`Connecting audio stream for "${track.title}"...`, 'info');
          try {
            const res = await nativeApi.getStreamUrl(track.audioUrl);
            if (res && res.success && res.streamUrl) {
              src = res.streamUrl;
            } else {
              console.warn('Stream URL resolution failed:', res?.error);
              src = null;
            }
          } catch (e) {
            console.warn('Stream resolution exception:', e);
            src = null;
          } finally {
            this._isResolvingStream = false;
            this._resolvingTrackId = null;
            this._setBufferingState(false);
          }
        } else {
          src = null;
        }
      } else {
        src = track.audioUrl;
      }
    } else if (this.audioFilesMap.has(track.id)) {
      const file = this.audioFilesMap.get(track.id);
      src = URL.createObjectURL(file);
      track.blobUrl = src;
    } else {
      // Retrieve audio binary Blob from persistent local storage
      try {
        const storedBlob = await db.getAudioFile(track.id);
        if (storedBlob) {
          this.audioFilesMap.set(track.id, storedBlob);
          src = URL.createObjectURL(storedBlob);
          track.blobUrl = src;
        }
      } catch (err) {
        console.warn('Error loading audio blob from DB:', err);
      }
    }

    // Abort if a newer track request arrived while resolving the stream
    if (this._playRequestId !== requestId) return;

    if (!src && track.blobUrl && !track.blobUrl.startsWith('blob:')) {
      src = track.blobUrl;
    }

    if (src) {
      await audioEngine.loadAndPlay(src, 0, track.duration);
      if (this._playRequestId !== requestId) return;

      if (track.isOnline) {
        this._showToast(`Streaming "${track.title}" by ${track.artist}`, 'success');
      }

      this._updateActiveRowHighlight();
      this._loadLyricsForTrack(track);

      // Open YouTube Music Now Playing Stage ONLY if browsing Discovery AND playing an online track
      if (this.currentView === 'discover' && track.isOnline) {
        this._openNowPlayingStage(track);
      } else {
        this._closeNowPlayingStage();
      }

      // Self-Learning Taste Engine: Record listen and compute preferences
      tasteEngine.recordTrackStart(track);

      // Auto-prime 50 Similar Songs Radio Queue - only for online tracks in discover view
      if (track.isOnline && this.currentView === 'discover' && restartRadio && this.isRadioModeActive && (!this.radioSeedTrack || this.radioSeedTrack.id !== track.id)) {
        this._startSongRadio(track);
      } else {
        this._updateNowPlayingUI(track);
        this._renderNowPlayingQueue();
        this._updateReopenControlsVisibility();
      }

      if (this.bluetoothMedia) {
        this.bluetoothMedia.updateMetadata(track);
        this.bluetoothMedia.updatePlaybackState(true);
      }

      // Desktop notification on Linux (only if enabled by user)
      if (this.notificationsEnabled && window.electronAPI) {
        window.electronAPI.notifyTrackChange({
          title: track.title,
          artist: track.artist,
          album: track.album
        });
      }

      // Pre-warm the next queue tracks immediately for instantaneous skipping
      this._prewarmUpcomingTracks();
    } else {
      console.warn('Audio source unavailable for track:', track.title);
      this._showToast(`Audio for "${track.title}" is currently unavailable. Please try another track.`, 'error');
    }
  }

  _togglePlayPause() {
    if (this._isResolvingStream) {
      this._showToast('Audio stream is loading, please wait a moment...', 'info');
      return;
    }
    if (!this.activeTrack) {
      const list = this._getCurrentViewTracks();
      if (list.length > 0) this._playTrackFromList(list, 0);
      return;
    }

    if (audioEngine.isPlaying()) {
      audioEngine.pause();
    } else {
      audioEngine.play();
    }
  }

  _playNext() {
    if (this.activeTrack && audioEngine.getCurrentTime() < 30) {
      tasteEngine.recordEarlySkip(this.activeTrack, audioEngine.getCurrentTime());
    }

    // 1. Repeat One: replay current track
    if (this.loopMode === 'one' && this.activeTrack) {
      audioEngine.seek(0);
      audioEngine.play();
      return;
    }

    // 2. Advance queue sequentially using playlistManager
    if (playlistManager.queue && playlistManager.queue.length > 0) {
      const next = playlistManager.getNextTrack(this.isShuffle, this.loopMode === 'all', false);
      if (next) {
        this.radioQueue = playlistManager.queue;
        this._playTrack(next, false);
        this._renderRadioScroller();
        this._renderNowPlayingQueue();
        this._updateNowPlayingUI(next);
        this._updateReopenControlsVisibility();
        this._prewarmUpcomingTracks();

        // Replenish with 25 more similar songs if running low in radio mode
        if ((playlistManager.queue.length - playlistManager.queueIndex) < 5 && this.isRadioModeActive && this.activeTrack) {
          onlineMusic.getSimilarSongs(this.activeTrack, 25).then(extra => {
            if (extra && extra.length > 0) {
              extra.forEach(t => {
                if (!playlistManager.queue.some(q => q.id === t.id)) {
                  playlistManager.addToQueueLast(t);
                }
              });
              this.radioQueue = playlistManager.queue;
              this._renderRadioScroller();
              this._renderNowPlayingQueue();
              this._updateReopenControlsVisibility();
              this._prewarmUpcomingTracks();
            }
          }).catch(() => {});
        }
        return;
      }
    }

    // 3. Fallback: if queue reached end and smart radio is active, fetch more similar tracks
    if (this.isRadioModeActive && this.activeTrack) {
      this._startSongRadio(this.activeTrack).then(() => {
        const next = playlistManager.getNextTrack(this.isShuffle, this.loopMode === 'all', false);
        if (next) {
          this._playTrack(next, false);
          this._renderRadioScroller();
          this._renderNowPlayingQueue();
          this._updateNowPlayingUI(next);
          this._updateReopenControlsVisibility();
          this._prewarmUpcomingTracks();
        }
      });
    }
  }

  _playPrevious() {
    const now = Date.now();
    const isDoubleTapPrevious = this._lastPreviousTapTime && (now - this._lastPreviousTapTime < 1500);
    this._lastPreviousTapTime = now;

    // If current track has played for more than 3 seconds and not a double-tap, restart current track
    if (!isDoubleTapPrevious && audioEngine.getCurrentTime() > 3) {
      audioEngine.seek(0);
      return;
    }

    if (playlistManager.queue && playlistManager.queue.length > 0) {
      const prev = playlistManager.getPreviousTrack();
      if (prev) {
        this.radioQueue = playlistManager.queue;
        this._playTrack(prev, false);
        this._renderRadioScroller();
        this._renderNowPlayingQueue();
        this._updateNowPlayingUI(prev);
        this._updateReopenControlsVisibility();
        this._prewarmUpcomingTracks();
      }
    }
  }

  _playAllCurrentView() {
    const list = this._getCurrentViewTracks();
    if (list.length > 0) {
      this._playTrackFromList(list, 0);
    }
  }

  _toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    this.shuffleBtn.classList.toggle('active', this.isShuffle);
    db.setSetting('isShuffle', this.isShuffle);
  }

  _toggleLoop() {
    if (this.loopMode === 'all') {
      this.loopMode = 'one';
    } else if (this.loopMode === 'one') {
      this.loopMode = 'none';
    } else {
      this.loopMode = 'all';
    }
    this._updateLoopUI();
    db.setSetting('loopMode', this.loopMode);
  }

  _updateLoopUI() {
    if (this.loopMode === 'all') {
      this.repeatBtn.classList.add('active');
      this.repeatIconAll.style.display = 'block';
      this.repeatIconOne.style.display = 'none';
      this.repeatBtn.title = 'Repeat All (L)';
    } else if (this.loopMode === 'one') {
      this.repeatBtn.classList.add('active');
      this.repeatIconAll.style.display = 'none';
      this.repeatIconOne.style.display = 'inline-block';
      this.repeatBtn.title = 'Repeat One (L)';
    } else {
      this.repeatBtn.classList.remove('active');
      this.repeatIconAll.style.display = 'block';
      this.repeatIconOne.style.display = 'none';
      this.repeatBtn.title = 'Repeat Off (L)';
    }
  }

  _cycleSpeedRate() {
    this.currentSpeedIdx = (this.currentSpeedIdx + 1) % this.speedRates.length;
    const rate = this.speedRates[this.currentSpeedIdx];
    audioEngine.setPlaybackRate(rate);
    this.speedBtn.textContent = `${rate === 1 ? '1.0' : rate}x`;
  }

  _updateActiveRowHighlight() {
    document.querySelectorAll('.track-row').forEach(row => {
      const isCurrent = this.activeTrack && row.dataset.trackId === this.activeTrack.id;
      row.classList.toggle('playing', isCurrent);
    });
  }

  // --- Seeker & Volume Handling ---
  _bindSeekerEvents() {
    let isDragging = false;
    let seekTargetPos = 0;

    const updateSeekUI = (e) => {
      const rect = this.seekerWrapper.getBoundingClientRect();
      seekTargetPos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const duration = audioEngine.getDuration();
      if (duration && !isNaN(duration)) {
        this._updateSeeker(seekTargetPos * duration, duration);
      }
    };

    const applySeek = () => {
      const duration = audioEngine.getDuration();
      if (duration && !isNaN(duration)) {
        const targetSeconds = seekTargetPos * duration;
        audioEngine.seek(targetSeconds);
        this._updateSeeker(targetSeconds, duration);
      }
    };

    this.seekerWrapper.addEventListener('mousedown', (e) => {
      isDragging = true;
      this.isUserSeeking = true;
      updateSeekUI(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        updateSeekUI(e);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (isDragging) {
        isDragging = false;
        updateSeekUI(e);
        applySeek();
        setTimeout(() => {
          this.isUserSeeking = false;
        }, 120);
      }
    });

    // Tooltip preview with requestAnimationFrame throttle
    let tooltipRaf = null;
    this.seekerWrapper.addEventListener('mousemove', (e) => {
      const clientX = e.clientX;
      if (!tooltipRaf) {
        tooltipRaf = requestAnimationFrame(() => {
          tooltipRaf = null;
          const rect = this.seekerWrapper.getBoundingClientRect();
          const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          const dur = audioEngine.getDuration() || 0;
          this.seekerTooltip.style.left = `${pos * 100}%`;
          this.seekerTooltip.textContent = this._formatTime(pos * dur);
          this.seekerTooltip.style.display = 'block';
        });
      }
    });

    this.seekerWrapper.addEventListener('mouseleave', () => {
      if (tooltipRaf) {
        cancelAnimationFrame(tooltipRaf);
        tooltipRaf = null;
      }
      this.seekerTooltip.style.display = 'none';
    });
  }

  _updateSeeker(currentTime, duration) {
    const sec = Math.floor(currentTime);
    if (sec !== this._lastDisplayedSecond) {
      this._lastDisplayedSecond = sec;
      this.currentTimeLabel.textContent = this._formatTime(currentTime);
      if (duration) {
        this.durationLabel.textContent = this._formatTime(duration);
      }
    }
    if (duration) {
      const percent = (currentTime / duration) * 100;
      this.seekerFill.style.width = `${percent}%`;
      this.seekerThumb.style.left = `${percent}%`;
    }
  }

  _bindVolumeEvents() {
    let isDragging = false;

    const handleVol = (e) => {
      const rect = this.volumeWrapper.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this._setVolume(pos);
    };

    this.volumeWrapper.addEventListener('mousedown', (e) => {
      isDragging = true;
      handleVol(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) handleVol(e);
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    this.muteBtn.addEventListener('click', () => this._toggleMute());
  }

  _setVolume(val) {
    audioEngine.setVolume(val);
    this.volumeFill.style.width = `${val * 100}%`;
    this.volumeThumb.style.left = `${val * 100}%`;
    this._updateMuteUI(val === 0 || audioEngine.isMuted);
    db.setSetting('volume', val);
  }

  _toggleMute() {
    const isMuted = audioEngine.toggleMute();
    this._updateMuteUI(isMuted);
  }

  _updateMuteUI(isMuted) {
    this.volIconHigh.style.display = isMuted ? 'none' : 'block';
    this.volIconMuted.style.display = isMuted ? 'block' : 'none';
  }

  // --- Equalizer & 3D Widener ---
  _setupEqualizerSliders() {
    this.eqSlidersRack.innerHTML = '';
    EQ_FREQUENCIES.forEach((freq, idx) => {
      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
      const col = document.createElement('div');
      col.className = 'eq-band-col';
      col.innerHTML = `
        <span class="eq-gain-val" id="eqVal_${idx}">0dB</span>
        <input type="range" class="eq-vertical-slider" min="-12" max="12" step="0.5" value="0" data-index="${idx}">
        <span class="eq-band-label">${label}</span>
      `;

      const slider = col.querySelector('input');
      const valLabel = col.querySelector('.eq-gain-val');
      slider.addEventListener('input', (e) => {
        const gain = parseFloat(e.target.value);
        valLabel.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
        audioEngine.setEQBand(idx, gain);
      });

      this.eqSlidersRack.appendChild(col);
    });
  }

  _updateEQSlidersUI(gains) {
    gains.forEach((gain, idx) => {
      const slider = this.eqSlidersRack.querySelector(`input[data-index="${idx}"]`);
      const valLabel = document.getElementById(`eqVal_${idx}`);
      if (slider && valLabel) {
        slider.value = gain;
        valLabel.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
      }
    });
  }

  _resetEQ() {
    document.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.eq-preset-btn[data-preset="flat"]').classList.add('active');
    const gains = audioEngine.applyEQPreset('flat');
    this._updateEQSlidersUI(gains);
  }

  _toggleWidener() {
    const active = audioEngine.toggleStereoWidener();
    this.widenerToggleBtn.textContent = active ? 'Active' : 'Disabled';
    this.widenerToggleBtn.classList.toggle('btn-primary', active);
    this.widenerToggleBtn.classList.toggle('btn-ghost', !active);
  }

  // --- File Importing ---
  _findDuplicateTrack(file, meta = null, filePath = null) {
    if (!this.tracks || this.tracks.length === 0) return null;

    const norm = (p) => (p || '').trim().toLowerCase().replace(/\\/g, '/');
    const cleanFilePath = norm(filePath);
    const fileName = (file && file.name) ? file.name.trim().toLowerCase() : '';
    const fileSize = (file && file.size) ? file.size : 0;
    const title = (meta && meta.title) ? meta.title.trim().toLowerCase() : '';
    const artist = (meta && meta.artist) ? meta.artist.trim().toLowerCase() : '';
    const duration = (meta && meta.duration) ? meta.duration : 0;

    for (const existing of this.tracks) {
      // 1. Check exact file path if available
      if (cleanFilePath && existing.filePath) {
        if (norm(existing.filePath) === cleanFilePath) {
          return existing;
        }
      }
      // 2. Check exact file name and file size
      if (fileName && existing.fileName && existing.fileName.trim().toLowerCase() === fileName) {
        if (fileSize > 0 && existing.fileSize && existing.fileSize === fileSize) {
          return existing;
        }
      }
      // 3. Check audio metadata (title & artist)
      if (title && existing.title) {
        const exTitle = existing.title.trim().toLowerCase();
        const exArtist = (existing.artist || '').trim().toLowerCase();
        if (exTitle === title && exArtist === artist) {
          if (fileSize > 0 && existing.fileSize && existing.fileSize === fileSize) {
            return existing;
          }
          if (duration > 0 && existing.duration > 0 && Math.abs(existing.duration - duration) < 2) {
            return existing;
          }
          if (fileName && existing.fileName && existing.fileName.trim().toLowerCase() === fileName) {
            return existing;
          }
        }
      }
    }
    return null;
  }

  async _handleFileImport(files, targetPlaylist = null) {
    if (!files || files.length === 0) return;

    const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma'];
    const validFiles = Array.from(files).filter(f => {
      const name = f.name.toLowerCase();
      return audioExtensions.some(ext => name.endsWith(ext));
    });

    if (validFiles.length === 0) {
      this._showToast('No supported audio files found (.mp3, .wav, .flac, etc.)', 'error');
      return;
    }

    const isAddingToPlaylist = Boolean(targetPlaylist) || (this.currentView && this.currentView.startsWith('pl_'));
    const targetPl = targetPlaylist || (isAddingToPlaylist ? playlistManager.playlists.find(p => p.id === this.currentView) : null);

    if (targetPl) {
      this._showToast(`Adding ${validFiles.length} song${validFiles.length === 1 ? '' : 's'} to "${targetPl.name}"...`, 'info');
    } else {
      this._showToast(`Importing ${validFiles.length} song${validFiles.length === 1 ? '' : 's'}...`, 'info');
    }

    const newlyAddedTrackIds = [];
    const duplicates = [];

    for (const file of validFiles) {
      try {
        let filePath = file.realPath || file.path || '';
        if (!filePath && window.electronAPI && typeof window.electronAPI.getPathForFile === 'function') {
          try {
            filePath = window.electronAPI.getPathForFile(file);
          } catch (e) {
            filePath = file.path || '';
          }
        }

        const meta = await parseAudioMetadata(file);

        // Check if track already exists in library
        const duplicateTrack = this._findDuplicateTrack(file, meta, filePath);

        if (duplicateTrack) {
          duplicates.push({ file, meta, existing: duplicateTrack });

          // If currently viewing or targeting a custom playlist
          if (targetPl) {
            if (!targetPl.trackIds || !targetPl.trackIds.includes(duplicateTrack.id)) {
              await playlistManager.addTrackToPlaylist(targetPl.id, duplicateTrack.id);
              newlyAddedTrackIds.push(duplicateTrack.id);
            }
          }
          continue;
        }

        const track = {
          id: 'trk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          year: meta.year,
          duration: meta.duration || 0,
          fileName: file.name,
          filePath: filePath || '',
          fileSize: file.realSize || file.size,
          coverUrl: meta.coverUrl,
          dateAdded: Date.now(),
          playCount: 0,
          isFavorite: false
        };

        // Measure duration via temp audio element with 2-second safety timeout
        await this._getTrackDuration(file, track);

        if (!file.realPath && !filePath) {
          this.audioFilesMap.set(track.id, file);
          track.blobUrl = URL.createObjectURL(file);
          // Save binary audio Blob to persistent IndexedDB
          await db.saveAudioFile(track.id, file);
        }

        await db.saveTrack(track);
        this.tracks.push(track);
        newlyAddedTrackIds.push(track.id);

        // If currently viewing or targeting a custom playlist, automatically attach song to this playlist!
        if (targetPl) {
          await playlistManager.addTrackToPlaylist(targetPl.id, track.id);
        }
      } catch (err) {
        console.warn('Error importing file:', file.name, err);
      }
    }

    this._updateBadgeCounts();
    this._renderPlaylistsNav();
    this._renderTracks();

    // Feedback notifications
    if (validFiles.length === 1 && duplicates.length === 1 && newlyAddedTrackIds.length === 0) {
      this._showToast("We already have that song.", 'warning');
      return;
    }

    if (duplicates.length > 0 && newlyAddedTrackIds.length === 0) {
      this._showToast("We already have that song.", 'warning');
      return;
    }

    if (newlyAddedTrackIds.length > 0) {
      if (targetPl) {
        let msg = `Added ${newlyAddedTrackIds.length} song${newlyAddedTrackIds.length === 1 ? '' : 's'} to "${targetPl.name}"`;
        if (duplicates.length > 0) {
          msg += ` (skipped ${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'})`;
        }
        this._showToast(msg, 'success');
      } else {
        let msg = `Added ${newlyAddedTrackIds.length} song${newlyAddedTrackIds.length === 1 ? '' : 's'} to library`;
        if (duplicates.length > 0) {
          msg += ` (skipped ${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'})`;
        }
        this._showToast(msg, 'success');
      }
    }
  }

  _getTrackDuration(file, track) {
    return new Promise((resolve) => {
      const tempAudio = new Audio();
      tempAudio.preload = 'metadata';
      const isCustomProto = Boolean(file && file.realPath && isLocalAbsolutePath(file.realPath));
      const url = isCustomProto ? toPulsarAudioUrl(file.realPath) : URL.createObjectURL(file);
      let settled = false;
      const cleanup = (dur) => {
        if (settled) return;
        settled = true;
        if (dur && !isNaN(dur) && dur > 0) track.duration = dur;
        if (!isCustomProto) URL.revokeObjectURL(url);
        resolve();
      };
      const safetyTimer = setTimeout(() => cleanup(0), 2000);
      tempAudio.onloadedmetadata = () => {
        clearTimeout(safetyTimer);
        cleanup(tempAudio.duration);
      };
      tempAudio.onerror = () => {
        clearTimeout(safetyTimer);
        cleanup(0);
      };
      tempAudio.src = url;
    });
  }

  // --- Playlists Management ---
  _openNewPlaylistModal(preselectedTrack = null) {
    this._pendingTrackForNewPlaylist = preselectedTrack;
    this.plNameInput.value = '';
    this.plDescInput.value = '';
    this._openModal(this.playlistModal);
    setTimeout(() => {
      this.plNameInput.focus();
      this.plNameInput.select();
    }, 60);
  }

  async _handleSavePlaylist() {
    let name = this.plNameInput.value.trim();
    if (!name) {
      const defaultNum = playlistManager.playlists.length + 1;
      name = `My Playlist #${defaultNum}`;
    }

    const desc = this.plDescInput.value.trim();
    const pl = await playlistManager.createPlaylist(name, desc);
    if (this._pendingTrackForNewPlaylist) {
      await playlistManager.addTrackToPlaylist(pl.id, this._pendingTrackForNewPlaylist.id);
      this._pendingTrackForNewPlaylist = null;
    }
    this._closeModal(this.playlistModal);
    this._renderPlaylistsNav();
    this._switchView(pl.id);
    this._showToast(`Created playlist "${name}"`, 'success');
  }

  _openSelectPlaylistModal(track) {
    if (!track) return;
    this._selectedTrackForPlaylist = track;
    if (this.selectPlaylistTrackInfo) {
      this.selectPlaylistTrackInfo.textContent = `Add "${track.title}" by ${track.artist}`;
    }
    if (this.selectPlaylistList) {
      this.selectPlaylistList.innerHTML = '';
      if (playlistManager.playlists.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.style.cssText = 'color:var(--text-muted); font-size:12px; padding:12px; text-align:center;';
        emptyDiv.textContent = 'No playlists created yet. Click "+ Create New Playlist" above!';
        this.selectPlaylistList.appendChild(emptyDiv);
      } else {
        playlistManager.playlists.forEach(pl => {
          const item = document.createElement('div');
          item.className = 'playlist-picker-item';
          const inPl = pl.trackIds && pl.trackIds.includes(track.id);
          item.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="var(--accent-primary)"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
            <span class="playlist-picker-name">${this._escapeHtml(pl.name)}</span>
            <span class="playlist-picker-count">${pl.trackIds ? pl.trackIds.length : 0} songs ${inPl ? '(in playlist)' : ''}</span>
          `;
          item.addEventListener('click', async () => {
            this._closeModal(this.selectPlaylistModal);
            await this._addTrackToPlaylistWithPrompt(pl.id, track.id);
          });
          this.selectPlaylistList.appendChild(item);
        });
      }
    }
    this._openModal(this.selectPlaylistModal);
  }

  _openPlaylistSongPicker(playlistId) {
    const pl = playlistManager.playlists.find(p => p.id === playlistId);
    if (!pl) return;
    this._pickerPlaylistId = playlistId;
    if (this.playlistSongPickerTitle) {
      this.playlistSongPickerTitle.textContent = `Add Songs to "${pl.name}"`;
    }
    if (this.songPickerSearchInput) {
      this.songPickerSearchInput.value = '';
    }
    this._renderSongPickerList();
    this._openModal(this.playlistSongPickerModal);
    setTimeout(() => {
      if (this.songPickerSearchInput) this.songPickerSearchInput.focus();
    }, 80);
  }

  _renderSongPickerList() {
    const pl = playlistManager.playlists.find(p => p.id === this._pickerPlaylistId);
    if (!pl || !this.songPickerList) return;

    const q = (this.songPickerSearchInput ? this.songPickerSearchInput.value : '').toLowerCase().trim();
    let filtered = this.tracks;
    if (q) {
      filtered = this.tracks.filter(t =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.artist && t.artist.toLowerCase().includes(q)) ||
        (t.album && t.album.toLowerCase().includes(q))
      );
    }

    this.songPickerList.innerHTML = '';
    if (filtered.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.cssText = 'color:var(--text-muted); font-size:13px; padding:24px; text-align:center;';
      emptyDiv.textContent = this.tracks.length === 0 ? 'No songs in your library yet. Add audio files first!' : 'No matching songs found.';
      this.songPickerList.appendChild(emptyDiv);
      return;
    }

    filtered.forEach(track => {
      const isAlreadyIn = pl.trackIds && pl.trackIds.includes(track.id);
      const row = document.createElement('div');
      row.className = 'song-picker-row';
      row.innerHTML = `
        <img class="song-picker-thumb" src="${track.coverUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'32\' height=\'32\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E'}" alt="Cover">
        <div class="song-picker-info">
          <span class="song-picker-title">${this._escapeHtml(track.title)}</span>
          <span class="song-picker-artist">${this._escapeHtml(track.artist)}</span>
        </div>
        <span class="song-picker-duration">${this._formatTime(track.duration)}</span>
        <button class="song-picker-btn ${isAlreadyIn ? 'added' : 'add'}">${isAlreadyIn ? '✓ Added' : '+ Add'}</button>
      `;

      const btn = row.querySelector('.song-picker-btn');
      btn.addEventListener('click', async () => {
        if (btn.classList.contains('added')) {
          this._showToast('We already have that song.', 'warning');
          return;
        }
        await playlistManager.addTrackToPlaylist(pl.id, track.id);
        btn.className = 'song-picker-btn added';
        btn.textContent = '✓ Added';
        this._renderPlaylistsNav();
        if (this.currentView === pl.id) this._renderTracks();
        this._showToast(`Added "${track.title}" to "${pl.name}"`, 'success');
      });

      this.songPickerList.appendChild(row);
    });
  }

  async _handleOpenFiles() {
    if (window.electronAPI && window.electronAPI.selectAudioFiles) {
      try {
        const res = await window.electronAPI.selectAudioFiles();
        if (!res.canceled && res.files && res.files.length > 0) {
          const fileObjects = res.files.map(f => {
            const mime = this._getMimeType(f.name);
            const blob = new Blob([f.headerBuffer || f.buffer], { type: mime });
            const file = new File([blob], f.name, { type: mime, lastModified: Date.now() });
            file.realPath = f.path;
            file.realSize = f.size;
            return file;
          });
          await this._handleFileImport(fileObjects);
          return;
        }
      } catch (err) {
        console.warn('Native open file dialog error:', err);
      }
    }
    this.fileInput.click();
  }

  async _handleOpenFolder() {
    if (window.electronAPI && window.electronAPI.selectAudioFolder) {
      try {
        const res = await window.electronAPI.selectAudioFolder();
        if (!res.canceled && res.files && res.files.length > 0) {
          const fileObjects = res.files.map(f => {
            const mime = this._getMimeType(f.name);
            const blob = new Blob([f.headerBuffer || f.buffer], { type: mime });
            const file = new File([blob], f.name, { type: mime, lastModified: Date.now() });
            file.realPath = f.path;
            file.realSize = f.size;
            return file;
          });
          await this._handleFileImport(fileObjects);
          return;
        }
      } catch (err) {
        console.warn('Native open folder dialog error:', err);
      }
    }
    this.folderInput.click();
  }

  _getMimeType(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    const map = {
      mp3: 'audio/mpeg',
      flac: 'audio/flac',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      opus: 'audio/opus'
    };
    return map[ext] || 'audio/mpeg';
  }

  async _confirmDeletePlaylist(playlistId, playlistName) {
    if (confirm(`Delete playlist "${playlistName}"? This will not delete your songs from the library.`)) {
      await playlistManager.deletePlaylist(playlistId);
      this._renderPlaylistsNav();
      if (this.currentView === playlistId) {
        this._switchView('all-songs');
      }
      this._showToast(`Deleted playlist "${playlistName}"`, 'info');
    }
  }

  _deleteCurrentPlaylist() {
    const pl = playlistManager.playlists.find(p => p.id === this.currentView);
    if (pl) {
      this._confirmDeletePlaylist(pl.id, pl.name);
    }
  }

  _exportCurrentPlaylist() {
    const pl = playlistManager.playlists.find(p => p.id === this.currentView);
    if (pl) {
      const tracks = pl.trackIds.map(id => this.tracks.find(t => t.id === id)).filter(Boolean);
      playlistManager.exportToM3U8(pl, tracks);
    }
  }

  async _addTrackToPlaylistWithPrompt(playlistId, trackId) {
    let track = this.tracks.find(t => t.id === trackId);
    if (!track) {
      track = this.onlineTracks.find(t => t.id === trackId) || await db.getTrack(trackId);
      if (track) {
        await db.saveTrack(track);
        this.tracks.push(track);
        this._updateBadgeCounts();
      }
    }
    const pl = playlistManager.playlists.find(p => p.id === playlistId);
    if (!track || !pl) return false;

    if (pl.trackIds && pl.trackIds.includes(trackId)) {
      if (this.dupPromptText) {
        this.dupPromptText.textContent = `"${track.title}" is already in "${pl.name}". We already have that song.`;
      }
      this._showToast('We already have that song.', 'warning');
      return false;
    }

    const added = await playlistManager.addTrackToPlaylist(playlistId, trackId);
    if (added) {
      tasteEngine.recordPlaylistAdd(track, pl ? pl.name : 'Playlist');
      this._renderPlaylistsNav();
      if (this.currentView === playlistId) this._renderTracks();
      this._showToast(`Added "${track.title}" to "${pl.name}"`, 'success');
      return true;
    }
    return false;
  }

  _resolveDuplicatePrompt(allow) {
    this._closeModal(this.duplicateModal);
    if (this._duplicateResolve) {
      this._duplicateResolve(allow);
      this._duplicateResolve = null;
    }
  }

  async _toggleFavorite(trackId) {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;

    track.isFavorite = !track.isFavorite;
    await db.saveTrack(track);

    // Train Taste Engine with user love / unlove preference
    tasteEngine.recordFavorite(track, track.isFavorite);

    if (this.activeTrack && this.activeTrack.id === trackId) {
      this.playerHeartBtn.classList.toggle('active', track.isFavorite);
    }

    this._updateBadgeCounts();
    this._renderTracks();
  }

  // --- Synchronized Lyrics ---
  async _loadLyricsForTrack(track) {
    this.lyricsList = [];
    this.lyricsActiveIndex = -1;
    this.lyricsContainer.innerHTML = '<div class="lyric-line" style="color:var(--text-muted);">No synchronized .lrc file loaded.</div>';
    if (this.npLyricsContainer) {
      this.npLyricsContainer.innerHTML = '<p class="np-lyrics-placeholder">No synchronized lyrics found for this track.</p>';
    }

    let lrcText = track.lrcText;
    const lrcUrl = track.lrcUrl || (track.fileName ? `./test-tracks/${track.fileName.replace(/\.[^/.]+$/, '.lrc')}` : null);
    if (!lrcText && lrcUrl) {
      try {
        const res = await fetch(lrcUrl);
        if (res.ok) lrcText = await res.text();
      } catch (e) {
        console.warn('Could not fetch LRC:', e);
      }
    }

    if (lrcText) {
      this.lyricsList = parseLRC(lrcText);
      if (this.lyricsList.length > 0) {
        const linesHtml = this.lyricsList.map((item, idx) => 
          `<div class="lyric-line" data-idx="${idx}">${this._escapeHtml(item.text)}</div>`
        ).join('');
        this.lyricsContainer.innerHTML = linesHtml;

        const attachLineClicks = (container) => {
          if (!container) return;
          container.querySelectorAll('.lyric-line').forEach((el, idx) => {
            el.addEventListener('click', () => {
              if (this.lyricsList[idx]) {
                audioEngine.seek(this.lyricsList[idx].time);
              }
            });
          });
        };

        attachLineClicks(this.lyricsContainer);

        if (this.npLyricsContainer) {
          this.npLyricsContainer.innerHTML = linesHtml;
          attachLineClicks(this.npLyricsContainer);
        }
      }
    }
  }

  _syncLyrics(currentTime) {
    if (this.lyricsList.length === 0) return;

    let activeIdx = -1;
    for (let i = 0; i < this.lyricsList.length; i++) {
      if (currentTime >= this.lyricsList[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    if (activeIdx !== this.lyricsActiveIndex && activeIdx !== -1) {
      this.lyricsActiveIndex = activeIdx;

      // 1. Drawer lyrics sync
      const lines = this.lyricsContainer.querySelectorAll('.lyric-line');
      lines.forEach((line, idx) => {
        line.classList.toggle('active', idx === activeIdx);
      });
      const activeLine = lines[activeIdx];
      if (activeLine && this.lyricsContainer) {
        const container = this.lyricsContainer;
        const lineTop = activeLine.offsetTop;
        const lineHeight = activeLine.offsetHeight;
        const containerHeight = container.clientHeight;
        container.scrollTo({
          top: lineTop - containerHeight / 2 + lineHeight / 2,
          behavior: 'smooth'
        });
      }

      // 2. Now Playing Stage lyrics sync (Screenshot 5)
      if (this.npLyricsContainer) {
        const npLines = this.npLyricsContainer.querySelectorAll('.lyric-line');
        npLines.forEach((line, idx) => {
          line.classList.toggle('active', idx === activeIdx);
        });
        const npActive = npLines[activeIdx];
        if (npActive) {
          this.npLyricsContainer.scrollTo({
            top: npActive.offsetTop - this.npLyricsContainer.clientHeight / 2 + npActive.offsetHeight / 2,
            behavior: 'smooth'
          });
        }
      }
    }
  }

  // ==========================================================================
  // YouTube Music Now Playing Stage (Screenshot 5 Reference)
  // ==========================================================================

  _openNowPlayingStage(track = null) {
    const t = track || this.activeTrack;
    if (!t) return;
    if (this.currentView !== 'discover' || !t.isOnline) {
      return;
    }
    if (this.nowPlayingStage) {
      this.nowPlayingStage.style.display = 'flex';
      this.isNowPlayingOpen = true;
      document.body.classList.add('now-playing-active');
    }
    // Stop canvas visualizer while Now Playing stage is visible to keep CPU/GPU minimal
    if (this.visualizer) {
      this.visualizer.stop(true);
    }
    this._updateNowPlayingUI(t);
    this._renderNowPlayingQueue();
    this._updateReopenControlsVisibility();
  }

  _closeNowPlayingStage() {
    if (this.nowPlayingStage) {
      this.nowPlayingStage.style.display = 'none';
      this.isNowPlayingOpen = false;
      document.body.classList.remove('now-playing-active');
    }
    // Resume visualizer only if user enabled it and audio is currently playing
    if (this.visualizer && this.visualizer.mode !== 'off' && audioEngine.isPlaying()) {
      this.visualizer.start();
    }
    this._updateReopenControlsVisibility();
  }

  _toggleNowPlayingStage() {
    if (this.isNowPlayingOpen) {
      this._closeNowPlayingStage();
    } else if (this.currentView === 'discover') {
      this._openNowPlayingStage();
    }
  }

  _updateReopenControlsVisibility() {
    // Intrusive reopen pill, header tab, and count badge removed per user request. Songs play in background.
  }

  _updateNowPlayingUI(track) {
    if (!track) return;
    if (this.npLargeCover) {
      this.npLargeCover.src = track.coverUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'400\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E';
      this.npLargeCover.onerror = () => {
        this.npLargeCover.src = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'400\' height=\'400\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E';
        this.npLargeCover.onerror = null;
      };
    }
    if (this.npTrackTitle) this.npTrackTitle.textContent = track.title || 'Unknown Title';
    if (this.npTrackArtist) this.npTrackArtist.textContent = track.artist || 'Unknown Artist';
    if (this.npTrackMeta) {
      const album = track.album && track.album !== 'Unknown Album' ? track.album : (track.genre || 'Single');
      const year = track.year ? ` • ${track.year}` : ' • 2026';
      this.npTrackMeta.textContent = `${album}${year}`;
    }
    if (this.npHeartBtn) {
      this.npHeartBtn.classList.toggle('active', !!track.isFavorite);
    }
    if (this.npQueueSubText) {
      const count = (playlistManager.queue && playlistManager.queue.length > 0)
        ? playlistManager.queue.length
        : ((this.radioQueue && this.radioQueue.length > 0) ? this.radioQueue.length : 50);
      this.npQueueSubText.textContent = `Playing from Queue (${count} tracks)`;
    }
  }

  _renderNowPlayingQueue() {
    if (!this.npQueueList) return;
    this.npQueueList.innerHTML = '';

    const list = (playlistManager.queue && playlistManager.queue.length > 0)
      ? playlistManager.queue
      : (this.radioQueue && this.radioQueue.length > 0)
        ? this.radioQueue
        : (this.currentViewTracks || this.tracks || []).slice(0, 50);

    if (list.length === 0) {
      this.npQueueList.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-muted); font-size:13px;">No upcoming tracks in queue.</div>';
      return;
    }

    list.forEach((track, idx) => {
      const isCurrent = (playlistManager.queueIndex === idx) ||
        (this.activeTrack && (this.activeTrack.id === track.id || (this.activeTrack.title === track.title && this.activeTrack.artist === track.artist)));
      const isDownloaded = this._isTrackDownloaded(track);
      const isDownloading = this.downloadingTrackIds.has(track.id);

      const row = document.createElement('div');
      row.className = `np-queue-row ${isCurrent ? 'playing' : ''}`;
      row.dataset.trackId = track.id;
      row.title = `Play "${track.title}"`;
      row.innerHTML = `
        <span class="np-queue-idx" style="width:24px; font-size:12px; font-weight:700; color:${isCurrent ? 'var(--accent-primary)' : 'var(--text-muted)'}; text-align:center; flex-shrink:0;">
          ${isCurrent ? '▶' : (idx + 1)}
        </span>
        <img class="np-queue-thumb" src="${this._escapeHtml(track.coverUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'44\' height=\'44\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E')}" alt="" loading="lazy">
        <div class="np-queue-info">
          <span class="np-queue-title">${this._escapeHtml(track.title)}</span>
          <span class="np-queue-artist">${this._escapeHtml(track.artist)}</span>
        </div>
        <span class="np-queue-duration">${this._formatTime(track.duration || 180)}</span>
        <button class="np-queue-dl-btn ${isDownloaded ? 'downloaded' : (isDownloading ? 'downloading' : '')}" title="${isDownloaded ? 'In Local Library' : 'Download Free MP3'}">
          ${isDownloading ? '<span class="online-spinner" style="width:12px;height:12px;"></span>' : (isDownloaded ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>')}
        </button>
      `;

      // Hover pre-warm stream URL for 0ms response when clicked
      row.addEventListener('mouseenter', () => {
        if (track && track.isOnline && track.audioUrl && !this._findLocalDownloadedMatch(track)) {
          const nativeApi = window.pulsarNative || window.electronAPI;
          if (nativeApi && typeof nativeApi.getStreamUrl === 'function') {
            nativeApi.getStreamUrl(track.audioUrl).catch(() => {});
          }
        }
      }, { once: true });

      // Download button on queue row
      const dlBtn = row.querySelector('.np-queue-dl-btn');
      if (dlBtn) {
        dlBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._isTrackDownloaded(track)) {
            this._showToast(`"${track.title}" is already in your local library!`, 'success');
          } else {
            this._downloadOnlineTrack(track);
          }
        });
      }

      row.addEventListener('click', (e) => {
        if (e.target.closest('.np-queue-dl-btn')) return;
        // Set queue index directly without mutating or shifting the playlist!
        playlistManager.queueIndex = idx;
        this.radioQueue = playlistManager.queue;
        this._playTrack(track, false);
        this._renderNowPlayingQueue();
        this._updateNowPlayingUI(track);
        this._updateReopenControlsVisibility();
      });
      this.npQueueList.appendChild(row);
      if (isCurrent) {
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  _switchNowPlayingTab(tab) {
    this.nowPlayingActiveTab = tab;
    const tabs = [
      { id: 'up-next', btn: this.npTabUpNext, content: this.npContentUpNext },
      { id: 'lyrics', btn: this.npTabLyrics, content: this.npContentLyrics },
      { id: 'related', btn: this.npTabRelated, content: this.npContentRelated }
    ];

    tabs.forEach(t => {
      if (!t.btn || !t.content) return;
      const isActive = t.id === tab;
      t.btn.classList.toggle('active', isActive);
      t.content.style.display = isActive ? 'flex' : 'none';
    });

    if (tab === 'lyrics') {
      if (this.lyricsList && this.lyricsList.length > 0) {
        this._syncLyrics(audioEngine.getCurrentTime());
      } else if (this.activeTrack) {
        this._loadLyricsForTrack(this.activeTrack);
      }
    } else if (tab === 'related') {
      this._renderNowPlayingRelated();
    }
  }

  _renderNowPlayingRelated() {
    if (!this.npRelatedContainer) return;
    this.npRelatedContainer.innerHTML = '';
    const artist = this.activeTrack ? this.activeTrack.artist : 'Pulsar Artist';

    const card = document.createElement('div');
    card.className = 'algo-section';
    card.style.background = 'var(--bg-glass-card)';
    card.style.padding = '16px';
    card.style.borderRadius = '12px';
    card.style.border = '1px solid var(--border-glass)';
    card.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
        <div style="width:44px; height:44px; border-radius:50%; background:var(--accent-gradient); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:18px;">
          ${artist.charAt(0).toUpperCase()}
        </div>
        <div>
          <h4 style="margin:0; font-size:15px; font-weight:700; color:var(--text-primary);">${this._escapeHtml(artist)}</h4>
          <span style="font-size:11px; color:var(--text-muted);">Similar acoustic graph & recommendations</span>
        </div>
      </div>
      <p style="font-size:12px; color:var(--text-secondary); margin:0 0 12px 0;">Listeners who enjoy this track also play:</p>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        <span class="algo-tag-pill" style="font-size:11px; cursor:pointer;" data-tag="Top Chart Mix">🔥 Top Chart Mix</span>
        <span class="algo-tag-pill" style="font-size:11px; cursor:pointer;" data-tag="Similar Radio">📻 Extended Radio</span>
        <span class="algo-tag-pill" style="font-size:11px; cursor:pointer;" data-tag="Acoustic Chill">☕ Chill Acoustic</span>
        <span class="algo-tag-pill" style="font-size:11px; cursor:pointer;" data-tag="Workout Hype">⚡ High Energy</span>
      </div>
    `;
    card.querySelectorAll('.algo-tag-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        this._showToast(`Switched radio profile to ${pill.dataset.tag}`, 'info');
      });
    });
    this.npRelatedContainer.appendChild(card);
  }

  // --- YouTube Music Listen Again & Quick Picks Play All ---
  async _renderListenAgain() {
    if (!this.flowListenAgainList) return;
    this.flowListenAgainList.innerHTML = '';

    const highDwell = tasteEngine.getHighDwellListenAgainTracks(this.tracks, 10);
    let recent = highDwell;
    if (recent.length === 0) {
      const history = tasteEngine.profile?.recentHistory || [];
      if (history.length > 0) {
        recent = history.slice(0, 10);
      } else if (this.recentTracks && this.recentTracks.length > 0) {
        recent = this.recentTracks.slice(0, 10);
      } else if (this.tracks && this.tracks.length > 0) {
        recent = this.tracks.slice(0, 10);
      }
    }

    if (recent.length === 0) {
      if (this.flowListenAgainSection) this.flowListenAgainSection.style.display = 'none';
      return;
    }

    if (this.flowListenAgainSection) this.flowListenAgainSection.style.display = 'flex';

    recent.forEach(track => {
      const card = document.createElement('div');
      card.className = 'listen-card';
      card.title = `Play "${track.title}"`;
      card.innerHTML = `
        <div class="listen-thumb-wrap">
          <img class="listen-card-img" src="${this._escapeHtml(track.coverUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E')}" alt="" loading="lazy">
          <div class="listen-play-overlay">
            <div class="listen-play-circle">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        </div>
        <div class="listen-card-title">${this._escapeHtml(track.title)}</div>
        <div class="listen-card-artist">${this._escapeHtml(track.artist)}</div>
      `;
      card.addEventListener('click', () => {
        if (track.isOnline || (track.id && String(track.id).startsWith('yt_'))) {
          this._playOnlineTrack(track);
        } else {
          this._playTrack(track);
        }
      });
      this.flowListenAgainList.appendChild(card);
    });
  }

  async _renderFeaturedPlaylists(seedTracks = []) {
    if (!this.flowPlaylistsGrid) return;
    this.flowPlaylistsGrid.innerHTML = '';

    const playlists = onlineMusic.getFeaturedPlaylists(seedTracks, 6);
    if (!playlists || playlists.length === 0) {
      if (this.flowPlaylistsSection) this.flowPlaylistsSection.style.display = 'none';
      return;
    }

    if (this.flowPlaylistsSection) this.flowPlaylistsSection.style.display = 'flex';

    playlists.forEach(pl => {
      const card = document.createElement('div');
      card.className = 'flow-playlist-card';
      card.title = `Play ${pl.title}`;
      card.innerHTML = `
        <div class="flow-playlist-cover-wrap">
          <img class="flow-playlist-img" src="${this._escapeHtml(pl.coverUrl)}" alt="${this._escapeHtml(pl.title)}" loading="lazy">
          <span class="flow-playlist-badge">${pl.trackCount || 50} Songs</span>
          <div class="flow-playlist-overlay">
            <button class="flow-playlist-play-btn" title="Stream Mix Online">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <button class="flow-playlist-dl-btn" title="Download Mix as Local Playlist">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
            </button>
          </div>
        </div>
        <div class="flow-playlist-info">
          <span class="flow-playlist-title">${this._escapeHtml(pl.title)}</span>
          <span class="flow-playlist-meta">${this._escapeHtml(pl.subtitle)}</span>
        </div>
      `;

      // Play Mix handler
      const playBtn = card.querySelector('.flow-playlist-play-btn');
      const startMix = async () => {
        this._showToast(`Loading "${pl.title}" mix...`, 'info');
        try {
          const tracks = await onlineMusic.getPlaylistTracks(pl, 50);
          if (tracks && tracks.length > 0) {
            playlistManager.setQueue(tracks, 0);
            this.radioQueue = playlistManager.queue;
            this._playTrack(tracks[0], false);
            this._renderNowPlayingQueue();
            this._updateNowPlayingUI(tracks[0]);
            this._updateReopenControlsVisibility();
          }
        } catch (err) {
          console.warn('Load mix error:', err);
        }
      };

      if (playBtn) {
        playBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          startMix();
        });
      }

      // Download Playlist button
      const dlBtn = card.querySelector('.flow-playlist-dl-btn');
      if (dlBtn) {
        dlBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          dlBtn.classList.add('downloading');
          dlBtn.innerHTML = '<span class="online-spinner" style="width:14px;height:14px;"></span>';
          try {
            const tracks = await onlineMusic.getPlaylistTracks(pl, 50);
            await this._downloadPlaylistOrQueue(pl.title, pl.coverUrl, tracks);
            dlBtn.classList.remove('downloading');
            dlBtn.classList.add('downloaded');
            dlBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
          } catch (err) {
            dlBtn.classList.remove('downloading');
            dlBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>';
            this._showToast('Failed to load playlist for download', 'error');
          }
        });
      }

      card.addEventListener('click', (e) => {
        if (e.target.closest('.flow-playlist-dl-btn')) return;
        startMix();
      });

      this.flowPlaylistsGrid.appendChild(card);
    });
  }

  _playAllQuickPicks() {
    if (!this.currentQuickPicks || this.currentQuickPicks.length === 0) {
      if (this.flowTracks && this.flowTracks.length > 0) {
        this.currentQuickPicks = this.flowTracks.slice(0, 10);
      }
    }
    if (this.currentQuickPicks && this.currentQuickPicks.length > 0) {
      const first = this.currentQuickPicks[0];
      playlistManager.setQueue(this.currentQuickPicks, 0);
      this.radioQueue = playlistManager.queue;
      this._playTrack(first, false);
      this._renderNowPlayingQueue();
      this._updateNowPlayingUI(first);
      this._updateReopenControlsVisibility();
      this._showToast('Playing all Quick Picks', 'info');
    }
  }

  // --- Context Menu & Track Info ---
  _showContextMenu(x, y, track) {
    this.contextTargetTrack = track;
    this.contextMenu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    this.contextMenu.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
    this.contextMenu.style.display = 'flex';

    const isPlaylist = this.currentView.startsWith('pl_');
    const removeLabel = this.ctxRemove.querySelector('span');
    if (removeLabel) {
      removeLabel.textContent = isPlaylist ? 'Remove from Playlist' : 'Delete from Library';
    }

    this.ctxPlayNext.onclick = () => {
      playlistManager.addToQueueNext(track);
      this.contextMenu.style.display = 'none';
      this._showToast(`Added "${track.title}" to play next`, 'info');
    };

    this.ctxPlayLast.onclick = () => {
      playlistManager.addToQueueLast(track);
      this.contextMenu.style.display = 'none';
      this._showToast(`Added "${track.title}" to queue`, 'info');
    };

    this.ctxEditInfo.onclick = () => {
      this.contextMenu.style.display = 'none';
      this._openTrackInfoModal(track);
    };

    this.ctxAddToPlaylist.onclick = () => {
      this.contextMenu.style.display = 'none';
      this._openSelectPlaylistModal(track);
    };

    this.ctxRemove.onclick = async () => {
      this.contextMenu.style.display = 'none';
      if (this.currentView.startsWith('pl_')) {
        const pl = playlistManager.playlists.find(p => p.id === this.currentView);
        if (pl) {
          await playlistManager.removeTrackFromPlaylist(pl.id, track.id);
          this._renderPlaylistsNav();
          this._renderTracks();
          this._showToast(`Removed "${track.title}" from "${pl.name}"`, 'info');
        }
      } else {
        // Delete from library & permanently delete physical file from PC
        if (confirm(`Permanently delete "${track.title}" from your library and PC? This removes the audio file from your device.`)) {
          // 1. Delete physical audio file from PC disk
          const nativeApi = window.electronAPI || window.pulsarNative;
          let physicalResult = null;
          if (nativeApi && nativeApi.deletePhysicalFile) {
            try {
              const targetPath = track.filePath || track.fileName;
              if (targetPath) {
                physicalResult = await nativeApi.deletePhysicalFile(targetPath);
              }
            } catch (err) {
              console.warn('Physical file removal notice:', err);
              physicalResult = { success: false, error: err.message };
            }
          }

          // 2. Remove track from all custom playlists
          await playlistManager.removeTrackFromAllPlaylists(track.id);

          // 3. Delete from IndexedDB
          await db.deleteTrack(track.id);

          // 4. Stop if playing
          if (this.activeTrack && this.activeTrack.id === track.id) {
            this._stop();
            this.activeTrack = null;
          }
          this.tracks = this.tracks.filter(t => t.id !== track.id);
          this.audioFilesMap.delete(track.id);

          // 5. Update UI
          this._updateBadgeCounts();
          this._renderPlaylistsNav();
          this._renderTracks();

          if (physicalResult && physicalResult.success) {
            this._showToast(`Permanently deleted "${track.title}" from PC and library`, 'info');
          } else if (physicalResult && !physicalResult.success) {
            this._showToast(`Removed "${track.title}" from library (${physicalResult.error || 'Physical file not found on PC'})`, 'warning');
          } else {
            this._showToast(`Removed "${track.title}" from library`, 'info');
          }
        }
      }
    };
  }

  _showPlaylistContextMenu(x, y, pl) {
    if (!this.playlistContextMenu) return;
    this.playlistContextMenu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    this.playlistContextMenu.style.top = `${Math.min(y, window.innerHeight - 150)}px`;
    this.playlistContextMenu.style.display = 'flex';

    this.plCtxPlay.onclick = () => {
      this.playlistContextMenu.style.display = 'none';
      this._switchView(pl.id);
      this._playAllCurrentView();
    };

    this.plCtxExport.onclick = () => {
      this.playlistContextMenu.style.display = 'none';
      const tracks = (pl.trackIds || []).map(id => this.tracks.find(t => t.id === id)).filter(Boolean);
      playlistManager.exportToM3U8(pl, tracks);
      this._showToast(`Exported "${pl.name}.m3u8"`, 'success');
    };

    this.plCtxDelete.onclick = () => {
      this.playlistContextMenu.style.display = 'none';
      this._confirmDeletePlaylist(pl.id, pl.name);
    };
  }

  _openTrackInfoModal(track) {
    this.contextTargetTrack = track;
    this.editTitleInput.value = track.title || '';
    this.editArtistInput.value = track.artist || '';
    this.editAlbumInput.value = track.album || '';
    this.editYearInput.value = track.year || '';
    if (this.editGenreInput) {
      this.editGenreInput.value = track.genre || '';
    }
    this.metaFileName.textContent = track.fileName || track.ytId || '-';
    this.metaFileSize.textContent = track.fileSize ? this._formatBytes(track.fileSize) : (track.isOnline ? 'Online Stream (~4 MB)' : '-');
    this.metaFormat.textContent = track.type || (track.isOnline ? 'audio/mp3' : 'audio/mpeg');
    this._openModal(this.trackInfoModal);
  }

  async _saveTrackInfo() {
    if (!this.contextTargetTrack) return;
    this.contextTargetTrack.title = this.editTitleInput.value.trim() || this.contextTargetTrack.title;
    this.contextTargetTrack.artist = this.editArtistInput.value.trim() || this.contextTargetTrack.artist;
    this.contextTargetTrack.album = this.editAlbumInput.value.trim() || this.contextTargetTrack.album;
    this.contextTargetTrack.year = this.editYearInput.value.trim();
    if (this.editGenreInput) {
      this.contextTargetTrack.genre = this.editGenreInput.value.trim() || this.contextTargetTrack.genre;
    }

    try {
      await db.saveTrack(this.contextTargetTrack);
    } catch (e) {
      console.warn('Could not save to DB:', e);
    }

    this._closeModal(this.trackInfoModal);
    this._renderTracks();
    if (this.currentView === 'discover') {
      this._renderOnlineList();
    }

    if (this.activeTrack && this.activeTrack.id === this.contextTargetTrack.id) {
      this.playerTitle.textContent = this.contextTargetTrack.title;
      this.playerArtist.textContent = this.contextTargetTrack.artist;
    }
    this._showToast(`Saved details for "${this.contextTargetTrack.title}"`, 'success');
  }

  _showOnlineContextMenu(x, y, track) {
    if (!this.onlineContextMenu) return;
    this.contextTargetTrack = track;
    this.onlineContextMenu.style.left = `${Math.min(x, window.innerWidth - 210)}px`;
    this.onlineContextMenu.style.top = `${Math.min(y, window.innerHeight - 220)}px`;
    this.onlineContextMenu.style.display = 'flex';

    const isDownloaded = this.downloadedTrackIds.has(track.id) || this.tracks.some(t => t.id === track.id && t.downloadedOffline);
    if (this.onlineCtxDownloadText) {
      this.onlineCtxDownloadText.textContent = isDownloaded ? 'In Library (Play Offline)' : 'Download Free MP3';
    }

    this.onlineCtxPlay.onclick = () => {
      this.onlineContextMenu.style.display = 'none';
      this._playOnlineTrack(track);
    };

    this.onlineCtxDownload.onclick = () => {
      this.onlineContextMenu.style.display = 'none';
      if (isDownloaded) {
        this._switchView('all-songs');
        this._showToast(`"${track.title}" is in your local library`, 'success');
      } else {
        this._downloadOnlineTrack(track);
      }
    };

    this.onlineCtxAddToPlaylist.onclick = () => {
      this.onlineContextMenu.style.display = 'none';
      this._openSelectPlaylistModal(track);
    };

    this.onlineCtxInfo.onclick = () => {
      this.onlineContextMenu.style.display = 'none';
      this._showOnlineTrackInfo(track);
    };

    this.onlineCtxCopy.onclick = () => {
      this.onlineContextMenu.style.display = 'none';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(`${track.title} - ${track.artist}`);
        this._showToast(`Copied "${track.title}" to clipboard`, 'info');
      }
    };
  }

  // --- Modal Helpers ---
  _openModal(el) {
    el.classList.add('active');
    setTimeout(() => {
      const input = el.querySelector('input:not([type="hidden"]), textarea');
      if (input) {
        input.focus();
      }
    }, 60);
  }

  _closeModal(el) {
    el.classList.remove('active');
  }

  _closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    this.contextMenu.style.display = 'none';
    if (this.playlistContextMenu) this.playlistContextMenu.style.display = 'none';
    if (this.onlineContextMenu) this.onlineContextMenu.style.display = 'none';
  }

  _showToast(message, type = 'info') {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `app-toast visible ${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3200);
  }

  // --- Utilities ---
  _parseDurationToSeconds(val) {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const str = String(val).trim();
    if (!str) return 0;
    if (str.includes(':')) {
      const parts = str.split(':').map(p => parseFloat(p) || 0);
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (parts.length === 2) return parts[0] * 60 + parts[1];
    }
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
  }

  _formatTime(seconds) {
    const s = this._parseDurationToSeconds(seconds);
    if (!s || isNaN(s) || s <= 0) return '0:00';
    const floorS = Math.floor(s);
    const m = Math.floor(floorS / 60);
    const rem = floorS % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const remM = m % 60;
      return `${h}:${remM < 10 ? '0' : ''}${remM}:${rem < 10 ? '0' : ''}${rem}`;
    }
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  }

  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==========================================================================
  // In-App Notification Center ("Pulsar Radar")
  // ==========================================================================

  _initInAppNotifications() {
    // In-app notification bell and flyout removed per user request. Operates silently in the background.
  }

  _formatRelativeTime(timestamp) {
    if (!timestamp) return 'Just now';
    const diffMs = Date.now() - timestamp;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // ==========================================================================
  // Pulsar Flow & Discover Native Stage (AI Recommendations & Similar Radio)
  // ==========================================================================

  _initFlowStage() {
    // Filter chips (Made For You, Trending, Similar Radio)
    document.querySelectorAll('.flow-chip[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.flow-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFlowTab = btn.dataset.tab;
        this._loadFlowView(this.activeFlowTab);
      });
    });

    // Vibe chips (Chill, Workout, Night Drive, Focus)
    document.querySelectorAll('.flow-chip[data-vibe]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.flow-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeFlowTab = 'vibe_' + btn.dataset.vibe;
        this._loadFlowVibe(btn.dataset.vibe);
      });
    });

    // Mood & Vibe Station Cards
    document.querySelectorAll('.vibe-station-card[data-vibe]').forEach(card => {
      card.addEventListener('click', () => {
        const vibe = card.dataset.vibe;
        document.querySelectorAll('.flow-chip').forEach(b => b.classList.remove('active'));
        const matchingChip = document.querySelector(`.flow-chip[data-vibe="${vibe}"]`);
        if (matchingChip) matchingChip.classList.add('active');
        this.activeFlowTab = 'vibe_' + vibe;
        this._loadFlowVibe(vibe);
      });
    });

    // Online live search in Flow stage with instant autocomplete recommendations
    if (this.flowSearchInput) {
      this.flowSearchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (this.flowSearchClearBtn) {
          this.flowSearchClearBtn.style.display = val ? 'block' : 'none';
        }

        if (!val) {
          this._hideSearchSuggestions();
          if (this.flowSearchDebounceTimer) clearTimeout(this.flowSearchDebounceTimer);
          if (this.activeFlowTab && this.activeFlowTab.startsWith('vibe_')) {
            this._loadFlowVibe(this.activeFlowTab.replace('vibe_', ''));
          } else {
            this._loadFlowView(this.activeFlowTab || 'for-you');
          }
          return;
        }

        if (this.flowSearchDebounceTimer) clearTimeout(this.flowSearchDebounceTimer);
        this.flowSearchDebounceTimer = setTimeout(async () => {
          try {
            const suggestions = await onlineMusic.getSearchSuggestions(val);
            if (this.flowSearchInput && this.flowSearchInput.value.trim() === val) {
              this._renderSearchSuggestions(val, suggestions);
            }
          } catch (err) {
            console.warn('Live search suggestions failed:', err);
          }
        }, 160);
      });

      this.flowSearchInput.addEventListener('keydown', (e) => {
        const items = this.flowSearchSuggestions ? this.flowSearchSuggestions.querySelectorAll('.flow-suggestion-item') : [];
        if (e.key === 'ArrowDown') {
          if (items.length > 0) {
            e.preventDefault();
            this.selectedSuggestionIndex = (this.selectedSuggestionIndex + 1) % items.length;
            items.forEach((it, idx) => it.classList.toggle('selected', idx === this.selectedSuggestionIndex));
            if (items[this.selectedSuggestionIndex]) {
              this.flowSearchInput.value = items[this.selectedSuggestionIndex].dataset.query;
            }
          }
        } else if (e.key === 'ArrowUp') {
          if (items.length > 0) {
            e.preventDefault();
            this.selectedSuggestionIndex = (this.selectedSuggestionIndex - 1 + items.length) % items.length;
            items.forEach((it, idx) => it.classList.toggle('selected', idx === this.selectedSuggestionIndex));
            if (items[this.selectedSuggestionIndex]) {
              this.flowSearchInput.value = items[this.selectedSuggestionIndex].dataset.query;
            }
          }
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this.flowSearchDebounceTimer) clearTimeout(this.flowSearchDebounceTimer);
          const q = this.flowSearchInput.value.trim();
          this._hideSearchSuggestions();
          this._searchFlowTracks(q);
        } else if (e.key === 'Escape') {
          this._hideSearchSuggestions();
        }
      });

      // Dismiss suggestions when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.ytm-search-box')) {
          this._hideSearchSuggestions();
        }
      });
    }

    if (this.flowSearchClearBtn) {
      this.flowSearchClearBtn.addEventListener('click', () => {
        if (this.flowSearchInput) this.flowSearchInput.value = '';
        this.flowSearchClearBtn.style.display = 'none';
        this._hideSearchSuggestions();
        if (this.activeFlowTab && this.activeFlowTab.startsWith('vibe_')) {
          this._loadFlowVibe(this.activeFlowTab.replace('vibe_', ''));
        } else {
          this._loadFlowView(this.activeFlowTab || 'for-you');
        }
      });
    }

    // Refresh recommendations button
    if (this.flowRefreshBtn) {
      this.flowRefreshBtn.addEventListener('click', () => {
        this._loadFlowView(this.activeFlowTab, true);
        this._showToast('Refreshed music recommendations', 'info');
      });
    }

    // Smart Radio toggle button in player bar
    if (this.smartRadioToggleBtn) {
      this.smartRadioToggleBtn.classList.toggle('active', this.isRadioModeActive);
      this.smartRadioToggleBtn.addEventListener('click', () => {
        this.isRadioModeActive = !this.isRadioModeActive;
        this.smartRadioToggleBtn.classList.toggle('active', this.isRadioModeActive);
        this._showToast(
          this.isRadioModeActive
            ? 'Smart Radio enabled: Auto-plays similar songs endlessly'
            : 'Smart Radio disabled',
          'info'
        );
      });
    }

    // Save Radio queue as custom playlist
    if (this.radioSavePlaylistBtn) {
      this.radioSavePlaylistBtn.addEventListener('click', () => {
        this._saveRadioAsPlaylist();
      });
    }

    // Offline state buttons in Flow
    if (this.flowRetryBtn) {
      this.flowRetryBtn.addEventListener('click', () => this._loadFlowView(this.activeFlowTab, true));
    }
    if (this.flowGoLocalBtn) {
      this.flowGoLocalBtn.addEventListener('click', () => this._switchView('all-songs'));
    }

    this._updateTasteBannerUI();
  }

  _updateTasteBannerUI() {
    const stats = tasteEngine.getAddictionStats();
    if (this.tasteLevelText) {
      this.tasteLevelText.textContent = stats.level || 'Music Explorer';
    }
    if (this.tasteSummaryText) {
      this.tasteSummaryText.textContent = stats.primaryVibe || 'Trained on your listening dwell time • Adapting in real time';
    }
    if (this.tasteAddictionBadge) {
      this.tasteAddictionBadge.textContent = `${stats.matchPercentage}% Algorithm Match`;
    }
    if (this.statListensCount) {
      this.statListensCount.textContent = stats.totalListens || 0;
    }
    if (this.statTrainedArtists) {
      this.statTrainedArtists.textContent = stats.topArtists.length || 0;
    }
    if (this.statAddictionScore) {
      this.statAddictionScore.textContent = `${stats.addictionScore}%`;
    }
  }

  _hideSearchSuggestions() {
    if (this.flowSearchSuggestions) {
      this.flowSearchSuggestions.style.display = 'none';
      this.flowSearchSuggestions.innerHTML = '';
    }
    this.selectedSuggestionIndex = -1;
  }

  _renderSearchSuggestions(query, suggestions = []) {
    if (!this.flowSearchSuggestions) return;
    if (!suggestions || suggestions.length === 0) {
      this._hideSearchSuggestions();
      return;
    }

    this.flowSearchSuggestions.innerHTML = '';
    this.selectedSuggestionIndex = -1;

    suggestions.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'flow-suggestion-item';
      div.dataset.index = idx;
      div.dataset.query = item;

      div.innerHTML = `
        <svg class="flow-suggestion-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <span class="flow-suggestion-text">${this._escapeHtml(item)}</span>
        <svg class="flow-suggestion-arrow" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.71 11l-8.86-8.85-1.42 1.42L16.86 9H5v4z"/>
        </svg>
      `;

      div.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.flowSearchInput) {
          this.flowSearchInput.value = item;
        }
        if (this.flowSearchClearBtn) {
          this.flowSearchClearBtn.style.display = 'block';
        }
        this._hideSearchSuggestions();
        this._searchFlowTracks(item);
      });

      this.flowSearchSuggestions.appendChild(div);
    });

    this.flowSearchSuggestions.style.display = 'block';
  }

  async _loadFlowView(tab = 'for-you', forceRefresh = false) {
    if (typeof tab === 'string' && tab.startsWith('vibe_')) {
      return this._loadFlowVibe(tab.replace('vibe_', ''));
    }

    if (!navigator.onLine) {
      if (this.flowOfflineState) this.flowOfflineState.style.display = 'flex';
      const scrollBody = document.getElementById('flowBodyScroll');
      if (scrollBody) scrollBody.style.display = 'none';
      return;
    }

    if (this.flowOfflineState) this.flowOfflineState.style.display = 'none';
    const scrollBody = document.getElementById('flowBodyScroll');
    if (scrollBody) scrollBody.style.display = 'flex';

    this._updateTasteBannerUI();

    if (this.flowLoadingSpinner) this.flowLoadingSpinner.style.display = 'flex';
    if (this.flowTracksTable) this.flowTracksTable.style.display = 'none';

    try {
      let tracks = [];
      const seedTracks = tasteEngine.getTopEngagedTracks(this.tracks, 5);
      const top = tasteEngine.getTopArtists(3);

      if (tab === 'for-you') {
        if (this.flowSectionTitle) this.flowSectionTitle.textContent = 'Quick Picks';
        if (this.flowSectionMeta) this.flowSectionMeta.textContent = 'Recommended songs based on your taste & vibe';
        tracks = await onlineMusic.getSongVibeRecommendations(seedTracks, top, 24);
        if (!tracks || tracks.length === 0) {
          tracks = DEFAULT_TRENDING_TRACKS;
        }
      } else if (tab === 'trending') {
        if (this.flowSectionTitle) this.flowSectionTitle.textContent = 'Trending & Billboard Hits';
        if (this.flowSectionMeta) this.flowSectionMeta.textContent = 'Real-time global streaming favorites';
        tracks = await onlineMusic.getTrendingTracks({ limit: 30 });
      } else if (tab === 'radio') {
        if (this.flowSectionTitle) this.flowSectionTitle.textContent = 'Similar Songs Radio Queue';
        if (this.flowSectionMeta) {
          this.flowSectionMeta.textContent = this.radioSeedTrack
            ? `Curated 50 tracks matching "${this.radioSeedTrack.title}"`
            : 'Select any song to generate continuous similar radio';
        }
        if (this.radioQueue.length > 0) {
          tracks = this.radioQueue;
        } else if (this.activeTrack) {
          tracks = await onlineMusic.getSimilarSongs(this.activeTrack, 50);
          this.radioQueue = tracks;
        } else {
          tracks = await onlineMusic.getTrendingTracks({ limit: 25 });
        }
      }

      if (!tracks || tracks.length === 0) {
        tracks = DEFAULT_TRENDING_TRACKS;
      }

      this.flowTracks = tracks;
      this.currentQuickPicks = tracks.slice(0, 16);
      this._renderQuickPicks(this.currentQuickPicks);
      this._renderListenAgain();
      this._renderFeaturedPlaylists(seedTracks);
    } catch (err) {
      console.warn('Load Flow View error:', err);
      const seedTracks = tasteEngine.getTopEngagedTracks(this.tracks, 5);
      this.currentQuickPicks = DEFAULT_TRENDING_TRACKS.slice(0, 16);
      this._renderQuickPicks(this.currentQuickPicks);
      this._renderListenAgain();
      this._renderFeaturedPlaylists(seedTracks);
    } finally {
      if (this.flowLoadingSpinner) this.flowLoadingSpinner.style.display = 'none';
      if (this.flowTracksTable) this.flowTracksTable.style.display = 'table';
    }
  }

  async _loadFlowVibe(vibe) {
    if (!navigator.onLine) {
      if (this.flowOfflineState) this.flowOfflineState.style.display = 'flex';
      return;
    }

    const vibeTitles = {
      chill: { title: 'Chill & Relax Vibes', meta: 'Relaxing acoustic melodies and peaceful rhythms' },
      lofi: { title: 'Lofi Study & Beats', meta: 'Mellow chill-hop beats for work, study, and unwinding' },
      workout: { title: 'Workout Hype Anthems', meta: 'High-energy beats to fuel your training sessions' },
      party: { title: 'Party & Celebration Hits', meta: 'Upbeat dance floor anthems and club bangers' },
      focus: { title: 'Deep Focus & Flow State', meta: 'Instrumental ambient soundscapes for concentration' },
      trending: { title: 'Trending Global Hits', meta: 'Real-time chart topping hits and viral favorites' },
      sad: { title: 'Heartbreak & Sad Melodies', meta: 'Emotional acoustic and soulful ballads' },
      romance: { title: 'Romance & Love Songs', meta: 'Smooth romantic melodies and heartwarming love songs' },
      night: { title: 'Night Drive Aesthetics', meta: 'Atmospheric synthwave and late-night grooves' }
    };

    const info = vibeTitles[vibe] || { title: `${vibe.charAt(0).toUpperCase() + vibe.slice(1)} Mix`, meta: 'Curated vibe station' };
    if (this.flowSectionTitle) this.flowSectionTitle.textContent = info.title;
    if (this.flowSectionMeta) this.flowSectionMeta.textContent = info.meta;

    if (this.flowLoadingSpinner) this.flowLoadingSpinner.style.display = 'flex';
    if (this.flowTracksTable) this.flowTracksTable.style.display = 'none';

    try {
      let tracks = await onlineMusic.getVibeTracks(vibe, 24);
      if (!tracks || tracks.length === 0) {
        tracks = DEFAULT_TRENDING_TRACKS;
      }
      const seedTracks = tasteEngine.getTopEngagedTracks(this.tracks, 5);
      this.flowTracks = tracks;
      this.currentQuickPicks = tracks.slice(0, 16);
      this._renderQuickPicks(this.currentQuickPicks);
      this._renderListenAgain();
      this._renderFeaturedPlaylists(seedTracks);
    } catch (e) {
      console.warn('Load vibe error:', e);
      const seedTracks = tasteEngine.getTopEngagedTracks(this.tracks, 5);
      this.currentQuickPicks = DEFAULT_TRENDING_TRACKS.slice(0, 16);
      this._renderQuickPicks(this.currentQuickPicks);
      this._renderListenAgain();
      this._renderFeaturedPlaylists(seedTracks);
    } finally {
      if (this.flowLoadingSpinner) this.flowLoadingSpinner.style.display = 'none';
      if (this.flowTracksTable) this.flowTracksTable.style.display = 'table';
    }
  }

  async _searchFlowTracks(query) {
    this._hideSearchSuggestions();
    const cleanQuery = (query || '').trim();

    const vibesSec = document.querySelector('.flow-vibes-section');
    const scrollBody = document.getElementById('flowBodyScroll');

    if (!cleanQuery) {
      if (this.flowSearchInput) this.flowSearchInput.value = '';
      if (this.flowSearchClearBtn) this.flowSearchClearBtn.style.display = 'none';
      if (this.flowSearchResultsSection) {
        this.flowSearchResultsSection.style.display = 'none';
        this.flowSearchResultsSection.innerHTML = '';
      }
      if (this.flowListenAgainSection) this.flowListenAgainSection.style.display = 'block';
      if (this.flowQuickPicksSection) this.flowQuickPicksSection.style.display = 'flex';
      if (this.flowPlaylistsSection) this.flowPlaylistsSection.style.display = 'flex';
      if (vibesSec) vibesSec.style.display = 'block';

      if (this.activeFlowTab && this.activeFlowTab.startsWith('vibe_')) {
        this._loadFlowVibe(this.activeFlowTab.replace('vibe_', ''));
      } else {
        this._loadFlowView(this.activeFlowTab || 'for-you');
      }
      return;
    }

    // 1. Search user's offline library tracks for immediate zero-latency results
    const localMatches = playlistManager.filterTracks(this.tracks, cleanQuery);

    // 2. Hide all the home browse sections so only Search Results appear cleanly
    if (this.flowListenAgainSection) this.flowListenAgainSection.style.display = 'none';
    if (this.flowQuickPicksSection) this.flowQuickPicksSection.style.display = 'none';
    if (this.flowPlaylistsSection) this.flowPlaylistsSection.style.display = 'none';
    if (vibesSec) vibesSec.style.display = 'none';
    if (this.flowSearchResultsSection) {
      this.flowSearchResultsSection.style.display = 'flex';
    }

    if (scrollBody) scrollBody.scrollTop = 0;

    if (this.flowSectionTitle) this.flowSectionTitle.textContent = `Search Results: "${cleanQuery}"`;
    if (this.flowSectionMeta) {
      this.flowSectionMeta.textContent = localMatches.length > 0
        ? `Found ${localMatches.length} offline song${localMatches.length === 1 ? '' : 's'} in library • Live streaming catalog matching below`
        : 'Live streaming catalog & YouTube Music matching';
    }

    if (this.flowLoadingSpinner) this.flowLoadingSpinner.style.display = 'flex';

    try {
      const onlineTracks = await onlineMusic.searchTracks(cleanQuery, { limit: 28 });
      this.flowTracks = onlineTracks;
      this._renderSearchResults(cleanQuery, localMatches, onlineTracks);
    } catch (err) {
      console.warn('Flow search error:', err);
      this._renderSearchResults(cleanQuery, localMatches, []);
    } finally {
      if (this.flowLoadingSpinner) this.flowLoadingSpinner.style.display = 'none';
    }
  }

  _renderSearchResults(query, localMatches = [], onlineTracks = []) {
    const container = this.flowSearchResultsSection || document.getElementById('flowSearchResultsSection');
    if (!container) return;
    container.innerHTML = '';
    container.style.display = 'flex';

    const totalResults = localMatches.length + onlineTracks.length;
    if (totalResults === 0) {
      container.innerHTML = `
        <div style="padding: 48px 24px; text-align: center; color: var(--text-secondary); width: 100%; display: flex; flex-direction: column; align-items: center;">
          <div style="font-size:36px; margin-bottom:12px;">🔍</div>
          <h3 style="font-size:18px; font-weight:700; color:var(--text-primary); margin-bottom:6px;">No songs found for "${this._escapeHtml(query)}"</h3>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">Check your spelling or try searching for another artist, song title, or vibe keyword.</p>
          <button id="searchEmptyClearBtn" class="btn btn-primary" style="padding:8px 20px; font-size:13px; border-radius:20px;">Clear Search & Browse</button>
        </div>
      `;
      const btn = container.querySelector('#searchEmptyClearBtn');
      if (btn) btn.addEventListener('click', () => this._searchFlowTracks(''));
      return;
    }

    // 1. From Your Offline Library (if matching downloaded songs exist)
    if (localMatches.length > 0) {
      const localBlock = document.createElement('div');
      localBlock.style.width = '100%';
      localBlock.style.marginBottom = '20px';
      localBlock.innerHTML = `
        <div style="margin-bottom:10px; display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px; font-weight:700; color:var(--text-primary);">From Your Offline Library (${localMatches.length})</span>
          <span style="font-size:11px; padding:2px 8px; border-radius:12px; background:rgba(34, 197, 94, 0.15); color:#22c55e; font-weight:600;">Offline Ready</span>
        </div>
        <div class="search-results-grid local-search-results-grid"></div>
      `;
      const listContainer = localBlock.querySelector('.local-search-results-grid');
      localMatches.forEach((track) => {
        const isPlaying = this.activeTrack && this.activeTrack.id === track.id;
        const row = document.createElement('div');
        row.className = `quick-pick-card ${isPlaying ? 'playing' : ''}`;
        row.dataset.trackId = track.id;
        row.title = `Play "${track.title}" - ${track.artist}`;
        row.innerHTML = `
          <div class="quick-pick-cover-wrap">
            <img class="quick-pick-img" src="${track.coverUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'48\' height=\'48\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E'}" alt="${this._escapeHtml(track.title)}" loading="lazy">
            <div class="quick-pick-play-overlay">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
          <div class="quick-pick-info">
            <span class="quick-pick-title">${this._escapeHtml(track.title)}</span>
            <span class="quick-pick-artist">${this._escapeHtml(track.artist)} • ${this._formatTime(track.duration)}</span>
          </div>
          <button class="quick-pick-dl-btn downloaded" title="Saved in Offline Library">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </button>
        `;
        row.addEventListener('click', () => {
          playlistManager.setQueue(localMatches, localMatches.indexOf(track));
          this.radioQueue = playlistManager.queue;
          this._playTrack(track, false);
          this._renderNowPlayingQueue();
          this._updateNowPlayingUI(track);
          this._updateReopenControlsVisibility();
        });
        listContainer.appendChild(row);
      });
      container.appendChild(localBlock);
    }

    // 2. YouTube Music Online Results
    if (onlineTracks.length > 0) {
      const onlineBlock = document.createElement('div');
      onlineBlock.style.width = '100%';
      onlineBlock.innerHTML = `
        <div style="margin-bottom:10px; display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px; font-weight:700; color:var(--text-primary);">Online YouTube Music Results (${onlineTracks.length})</span>
        </div>
        <div class="search-results-grid online-search-results-grid"></div>
      `;
      const grid = onlineBlock.querySelector('.online-search-results-grid');

      // Pre-warm the #1 search result stream URL immediately for instantaneous playback on click
      if (onlineTracks[0] && onlineTracks[0].audioUrl && !this._findLocalDownloadedMatch(onlineTracks[0])) {
        const nativeApi = window.pulsarNative || window.electronAPI;
        if (nativeApi && typeof nativeApi.getStreamUrl === 'function') {
          nativeApi.getStreamUrl(onlineTracks[0].audioUrl).catch(() => {});
        }
      }

      onlineTracks.forEach((track, idx) => {
        const isDownloaded = this._isTrackDownloaded(track);
        const isDownloading = this.downloadingTrackIds.has(track.id);
        const isPlaying = this.activeTrack && (this.activeTrack.id === track.id || (this.activeTrack.ytId && this.activeTrack.ytId === track.ytId));

        const card = document.createElement('div');
        card.className = `quick-pick-card ${isPlaying ? 'playing' : ''}`;
        card.dataset.trackId = track.id;
        if (track.ytId) card.dataset.ytId = track.ytId;
        card.title = `Play "${track.title}" - ${track.artist}`;
        card.innerHTML = `
          <div class="quick-pick-cover-wrap">
            <img class="quick-pick-img" src="${this._escapeHtml(track.coverUrl || '')}" alt="${this._escapeHtml(track.title)}" loading="lazy">
            <div class="quick-pick-play-overlay">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
          <div class="quick-pick-info">
            <span class="quick-pick-title">${this._escapeHtml(track.title)}</span>
            <span class="quick-pick-artist">${this._escapeHtml(track.artist)} • ${track.durationStr || '3:30'}</span>
          </div>
          <button class="quick-pick-dl-btn ${isDownloaded ? 'downloaded' : (isDownloading ? 'downloading' : '')}" title="${isDownloaded ? 'In Local Library' : 'Download Free MP3'}">
            ${isDownloading ? '<span class="online-spinner" style="width:12px;height:12px;"></span>' : (isDownloaded ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>')}
          </button>
        `;

        const thumbImg = card.querySelector('.quick-pick-img');
        if (thumbImg) {
          thumbImg.onerror = () => {
            thumbImg.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24' fill='%238b5cf6'%3E%3Crect width='24' height='24' fill='%231a1e28'/%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";
            thumbImg.onerror = null;
          };
        }

        // Hover pre-warm stream URL for 0ms start
        card.addEventListener('mouseenter', () => {
          if (track && track.isOnline && track.audioUrl && !this._findLocalDownloadedMatch(track)) {
            const nativeApi = window.pulsarNative || window.electronAPI;
            if (nativeApi && typeof nativeApi.getStreamUrl === 'function') {
              nativeApi.getStreamUrl(track.audioUrl).catch(() => {});
            }
          }
        }, { once: true });

        card.addEventListener('click', (e) => {
          if (e.target.closest('.quick-pick-dl-btn')) return;
          if (onlineTracks && onlineTracks.length > 1) {
            playlistManager.setQueue(onlineTracks, idx);
            this.radioQueue = playlistManager.queue;
            this._playTrack(track, false);
            this._renderNowPlayingQueue();
            this._updateNowPlayingUI(track);
            this._updateReopenControlsVisibility();
          } else {
            this._playOnlineTrack(track);
            this._startSongRadio(track);
          }
        });

        const dlBtn = card.querySelector('.quick-pick-dl-btn');
        if (dlBtn) {
          dlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this._isTrackDownloaded(track)) {
              this._switchView('all-songs');
              this._showToast(`"${track.title}" is in your local library!`, 'success');
            } else {
              this._downloadOnlineTrack(track);
            }
          });
        }

        grid.appendChild(card);
      });

      container.appendChild(onlineBlock);
    }
  }

  _renderQuickPicks(tracks) {
    if (!this.flowQuickPicksGrid) return;
    this.flowQuickPicksGrid.innerHTML = '';

    if (!tracks || tracks.length === 0) {
      tracks = DEFAULT_TRENDING_TRACKS.slice(0, 16);
    }

    if (this.flowQuickPicksSection) this.flowQuickPicksSection.style.display = 'flex';

    // Background pre-warm the stream URLs of the first 3 Quick Picks for instant playback on click
    if (tracks && tracks.length > 0) {
      const nativeApi = window.pulsarNative || window.electronAPI;
      if (nativeApi && typeof nativeApi.getStreamUrl === 'function') {
        tracks.slice(0, 3).forEach((t, i) => {
          if (t && t.isOnline && t.audioUrl && !this._findLocalDownloadedMatch(t)) {
            setTimeout(() => {
              nativeApi.getStreamUrl(t.audioUrl).catch(() => {});
            }, i * 350);
          }
        });
      }
    }

    tracks.forEach((track, idx) => {
      const isDownloaded = this._isTrackDownloaded(track);
      const isDownloading = this.downloadingTrackIds.has(track.id);
      const isCurrent = this.activeTrack && (this.activeTrack.id === track.id || (this.activeTrack.title === track.title && this.activeTrack.artist === track.artist));

      const card = document.createElement('div');
      card.className = `quick-pick-card ${isCurrent ? 'playing' : ''}`;
      card.dataset.trackId = track.id;
      card.title = `Play "${track.title}" - ${track.artist}`;
      card.innerHTML = `
        <div class="quick-pick-cover-wrap">
          <img class="quick-pick-img" src="${this._escapeHtml(track.coverUrl || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'48\' height=\'48\' viewBox=\'0 0 24 24\' fill=\'%238b5cf6\'%3E%3Crect width=\'24\' height=\'24\' fill=\'%231a1e28\'/%3E%3Cpath d=\'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z\'/%3E%3C/svg%3E')}" alt="${this._escapeHtml(track.title)}" loading="lazy">
          <div class="quick-pick-play-overlay">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="quick-pick-info">
          <span class="quick-pick-title">${this._escapeHtml(track.title)}</span>
          <span class="quick-pick-artist">${this._escapeHtml(track.artist)}</span>
        </div>
        <button class="quick-pick-dl-btn ${isDownloaded ? 'downloaded' : (isDownloading ? 'downloading' : '')}" title="${isDownloaded ? 'In Local Library' : 'Download Free MP3'}">
          ${isDownloading ? '<span class="online-spinner" style="width:12px;height:12px;"></span>' : (isDownloaded ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>')}
        </button>
      `;

      // Hover pre-warm stream URL for 0ms response when clicked
      card.addEventListener('mouseenter', () => {
        if (track && track.isOnline && track.audioUrl && !this._findLocalDownloadedMatch(track)) {
          const nativeApi = window.pulsarNative || window.electronAPI;
          if (nativeApi && typeof nativeApi.getStreamUrl === 'function') {
            nativeApi.getStreamUrl(track.audioUrl).catch(() => {});
          }
        }
      }, { once: true });

      const dlBtn = card.querySelector('.quick-pick-dl-btn');
      if (dlBtn) {
        dlBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this._isTrackDownloaded(track)) {
            this._showToast(`"${track.title}" is already in your local library!`, 'success');
          } else {
            this._downloadOnlineTrack(track);
          }
        });
      }

      card.addEventListener('click', (e) => {
        if (e.target.closest('.quick-pick-dl-btn')) return;
        if (tracks && tracks.length > 1) {
          playlistManager.setQueue(tracks, idx);
          this.radioQueue = playlistManager.queue;
          this._playTrack(track, false);
          this._renderNowPlayingQueue();
          this._updateNowPlayingUI(track);
          this._updateReopenControlsVisibility();
        } else {
          this._playOnlineTrack(track);
          this._startSongRadio(track);
        }
      });

      this.flowQuickPicksGrid.appendChild(card);
    });
  }

  async _downloadPlaylistOrQueue(customTitle = null, customCover = null, customTracks = null) {
    const queue = (customTracks && customTracks.length > 0)
      ? customTracks
      : ((playlistManager.queue && playlistManager.queue.length > 0)
        ? playlistManager.queue
        : ((this.radioQueue && this.radioQueue.length > 0)
          ? this.radioQueue
          : (this.currentViewTracks || this.tracks || [])));

    if (!queue || queue.length === 0) {
      this._showToast('No songs found to download', 'warning');
      return;
    }

    const uniqueTracks = [];
    const seen = new Set();
    for (const t of queue) {
      const key = t.id || `${t.title}-${t.artist}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueTracks.push(t);
      }
    }

    // 1. Determine Title & Cover Artwork
    let playlistTitle = customTitle;
    if (!playlistTitle) {
      if (this.radioSeedTrack) {
        playlistTitle = `Radio: ${this.radioSeedTrack.title}`;
      } else {
        playlistTitle = `Online Mix (${new Date().toLocaleDateString()})`;
      }
    }

    const playlistCover = customCover || uniqueTracks[0]?.coverUrl || null;
    const playlistDesc = `Auto-created offline playlist containing ${uniqueTracks.length} tracks.`;

    // 2. Immediately create a new local Playlist entry in IndexedDB
    let newPlaylist = await playlistManager.createPlaylist(playlistTitle, playlistDesc, playlistCover);
    this._renderPlaylistsNav();
    this._showToast(`Created offline playlist "${playlistTitle}". Downloading songs...`, 'info');

    let completed = 0;
    let alreadyLinked = 0;

    // 3. Loop sequentially through each track
    for (const track of uniqueTracks) {
      const localMatch = this._findLocalDownloadedMatch(track);
      if (localMatch) {
        // Song is ALREADY downloaded! Skip yt-dlp, but link ID into local playlist
        if (!newPlaylist.trackIds.includes(localMatch.id)) {
          await playlistManager.addTrackToPlaylist(newPlaylist.id, localMatch.id);
        }
        alreadyLinked++;
        this._updateOnlineCardDownloadState(track.id, 'downloaded');
      } else {
        // Download via yt-dlp
        try {
          this._updateOnlineCardDownloadState(track.id, 'downloading');
          await this._downloadOnlineTrack(track);
          // Now it's downloaded and registered via db.saveTrack
          if (!newPlaylist.trackIds.includes(track.id)) {
            await playlistManager.addTrackToPlaylist(newPlaylist.id, track.id);
          }
          completed++;
          this._updateOnlineCardDownloadState(track.id, 'downloaded');
          if (completed % 3 === 0 || (completed + alreadyLinked) === uniqueTracks.length) {
            this._showToast(`Downloading "${playlistTitle}": ${completed + alreadyLinked}/${uniqueTracks.length} ready...`, 'info');
          }
        } catch (err) {
          console.warn('Playlist track download notice:', track.title, err);
          this._updateOnlineCardDownloadState(track.id, 'idle');
        }
      }
      this._renderPlaylistsNav();
    }

    this._showToast(`🎉 Playlist "${playlistTitle}" is ready! ${completed} downloaded, ${alreadyLinked} linked from library.`, 'success');
  }

  async _downloadEntireQueue() {
    return this._downloadPlaylistOrQueue();
  }

  /**
   * Generates a 50-track similar radio playlist matching the seed track
   */
  async _startSongRadio(seedTrack) {
    if (!seedTrack) return;
    this.radioSeedTrack = seedTrack;

    if (this.flowRadioQueuePanel) {
      this.flowRadioQueuePanel.style.display = 'block';
    }
    if (this.radioQueueTitle) {
      this.radioQueueTitle.textContent = `Similar Songs Radio: ${seedTrack.title}`;
    }
    if (this.radioQueueDesc) {
      this.radioQueueDesc.textContent = `50 curated tracks matching ${seedTrack.artist}'s acoustic graph. Auto-plays next continuously.`;
    }

    try {
      const similar = await onlineMusic.getSimilarSongs(seedTrack, 50);
      const combined = [seedTrack, ...(similar || [])].filter((t, i, arr) => 
        arr.findIndex(x => (x.id === t.id) || (x.title === t.title && x.artist === t.artist)) === i
      );
      playlistManager.setQueue(combined, 0);
      this.radioQueue = playlistManager.queue;
      this._renderRadioScroller();
      this._renderNowPlayingQueue();
      if (this.isNowPlayingOpen) {
        this._updateNowPlayingUI(seedTrack);
      }
      this._updateReopenControlsVisibility();
    } catch (err) {
      console.warn('Radio queue fetch notice:', err);
    }
  }

  _renderRadioScroller() {
    if (!this.radioQueueScroller) return;
    this.radioQueueScroller.innerHTML = '';

    const list = (playlistManager.queue && playlistManager.queue.length > 0)
      ? playlistManager.queue
      : this.radioQueue;

    if (!list || list.length === 0) {
      this.radioQueueScroller.innerHTML = '<span style="font-size:12px; color:var(--text-muted); padding:10px;">No similar tracks queued.</span>';
      return;
    }

    list.forEach((track, idx) => {
      const isCurrent = playlistManager.queueIndex === idx;
      const card = document.createElement('div');
      card.className = `radio-mini-card ${isCurrent ? 'playing' : ''}`;
      card.title = `${track.title} - ${track.artist}`;
      card.innerHTML = `
        <div class="radio-card-cover-wrap">
          <img class="radio-card-img" src="${this._escapeHtml(track.coverUrl)}" alt="${this._escapeHtml(track.title)}" loading="lazy">
          <div class="radio-card-play-hover">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="radio-card-info">
          <span class="radio-card-title">${this._escapeHtml(track.title)}</span>
          <span class="radio-card-artist">${this._escapeHtml(track.artist)}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        playlistManager.queueIndex = idx;
        this.radioQueue = playlistManager.queue;
        this._playTrack(track, false);
        this._renderRadioScroller();
        this._renderNowPlayingQueue();
        this._updateNowPlayingUI(track);
        this._updateReopenControlsVisibility();
      });

      this.radioQueueScroller.appendChild(card);
    });
  }

  async _saveRadioAsPlaylist() {
    const list = (playlistManager.queue && playlistManager.queue.length > 0)
      ? playlistManager.queue
      : this.radioQueue;

    if (!list || list.length === 0) {
      this._showToast('Select a song first to generate a radio queue', 'warning');
      return;
    }

    const title = this.radioSeedTrack
      ? `Radio: ${this.radioSeedTrack.title}`
      : 'Similar Songs Radio';
    const desc = `Generated auto-mix of 50 similar tracks matching ${this.radioSeedTrack ? this.radioSeedTrack.artist : 'your taste'}`;

    const pl = await playlistManager.createPlaylist(title, desc);
    if (!pl) return;

    for (const track of list.slice(0, 50)) {
      await playlistManager.addTrackToPlaylist(pl.id, track.id);
    }

    this._updateBadgeCounts();
    this._renderPlaylistsNav();
    this._showToast(`🎉 Saved 50 similar songs to playlist "${title}"!`, 'success');
  }

  async _playOnlineTrack(track, restartRadio = true) {
    if (!track) return;
    await this._playTrack(track, restartRadio);
  }

  async _downloadOnlineTrack(track) {
    if (!track || this.downloadingTrackIds.has(track.id)) return;

    const isAlreadyInLibrary = this.downloadedTrackIds.has(track.id) ||
      this.tracks.some(t => t.id === track.id || (
        t.title && track.title &&
        t.title.trim().toLowerCase() === track.title.trim().toLowerCase() &&
        (t.artist || '').trim().toLowerCase() === (track.artist || '').trim().toLowerCase()
      ));

    if (isAlreadyInLibrary) {
      this._showToast('We already have that song.', 'warning');
      return;
    }

    this.downloadingTrackIds.add(track.id);
    this._updateOnlineCardDownloadState(track.id, 'downloading');
    this._showToast(`Downloading "${track.title}" to Pulsar Downloads...`, 'info');

    try {
      const nativeApi = window.electronAPI || window.pulsarNative;
      if (nativeApi && nativeApi.downloadOnlineTrack) {
        const result = await nativeApi.downloadOnlineTrack(track);
        if (result && result.success) {
          const audioBlob = new Blob([result.buffer], { type: 'audio/mpeg' });
          let trackDur = this._parseDurationToSeconds(track.duration);
          const localTrack = {
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album || track.playlistTitle || 'Pulsar Flow',
            year: track.year || '2026',
            genre: track.genre || 'Flow Stream',
            duration: trackDur || 0,
            coverUrl: result.coverDataUrl || (result.localCoverPath ? toPulsarAudioUrl(result.localCoverPath) : track.coverUrl),
            fileName: result.fileName,
            filePath: result.filePath,
            fileSize: result.size,
            dateAdded: Date.now(),
            isFavorite: false,
            playCount: 0,
            lastPlayed: null,
            isOnline: false,
            downloadedOffline: true
          };

          try {
            const meta = await parseAudioMetadata(audioBlob);
            if (meta) {
              if (meta.coverUrl && !result.coverDataUrl) {
                localTrack.coverUrl = meta.coverUrl;
              }
              if (meta.album && meta.album !== 'Unknown Album') {
                localTrack.album = meta.album;
              }
              if (meta.duration && !localTrack.duration) {
                localTrack.duration = meta.duration;
              }
            }
          } catch (_) {}

          if (!localTrack.duration || localTrack.duration <= 0) {
            await this._getTrackDuration(audioBlob, localTrack);
          }

          await db.saveAudioFile(track.id, audioBlob);
          await db.saveTrack(localTrack);

          const existingIdx = this.tracks.findIndex(t => t.id === track.id);
          if (existingIdx !== -1) {
            this.tracks[existingIdx] = localTrack;
          } else {
            this.tracks.unshift(localTrack);
          }

          this.downloadedTrackIds.add(track.id);
          this._updateBadgeCounts();
          this._updateOnlineCardDownloadState(track.id, 'downloaded');
          if (['all-songs', 'recent'].includes(this.currentView) || this.currentView.startsWith('pl_')) {
            this._renderTracks();
          }
          this._showToast(`"${track.title}" downloaded & added to library!`, 'success');
        } else {
          throw new Error(result ? result.error : 'Download failed');
        }
      } else {
        this.downloadedTrackIds.add(track.id);
        this._updateOnlineCardDownloadState(track.id, 'downloaded');
        this._showToast(`Downloaded "${track.title}"!`, 'success');
      }
    } catch (err) {
      console.error('Download track error:', err);
      this._showToast(`Download failed: ${err.message}`, 'error');
      this._updateOnlineCardDownloadState(track.id, 'idle');
    } finally {
      this.downloadingTrackIds.delete(track.id);
    }
  }

  _updateOnlineCardDownloadState(trackId, state) {
    document.querySelectorAll(`[data-track-id="${trackId}"]`).forEach(el => {
      const btn = el.querySelector('.ytm-dl-btn, .discover-download-btn, .quick-pick-dl-btn, .np-queue-dl-btn');
      if (!btn) return;
      if (state === 'downloading') {
        btn.classList.add('downloading');
        btn.classList.remove('downloaded');
        btn.innerHTML = '<span class="online-spinner" style="width:12px;height:12px;"></span>';
        btn.title = 'Downloading MP3...';
      } else if (state === 'downloaded') {
        btn.classList.remove('downloading');
        btn.classList.add('downloaded');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
        btn.title = 'Downloaded (In Library)';
      } else {
        btn.classList.remove('downloading', 'downloaded');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>';
        btn.title = 'Download Free MP3';
      }
    });
  }

  _showOnlineTrackInfo(track) {
    if (!track) return;
    this.currentOnlineInfoTrack = track;

    if (this.onlineInfoCover) this.onlineInfoCover.src = track.coverUrl;
    if (this.onlineInfoTrackTitle) this.onlineInfoTrackTitle.textContent = track.title;
    if (this.onlineInfoTrackArtist) this.onlineInfoTrackArtist.textContent = track.artist;
    if (this.onlineInfoTrackMeta) {
      this.onlineInfoTrackMeta.textContent = `${track.album || 'Single'} • ${track.year || '2026'} • ${track.durationStr || '3:30'}`;
    }
    if (this.onlineInfoTrackLicense) {
      this.onlineInfoTrackLicense.textContent = track.license || 'Pulsar Flow Cloud Stream';
    }

    this._openModal(this.onlineTrackInfoModal);
  }

  async _openDownloadFolder() {
    const nativeApi = window.electronAPI || window.pulsarNative;
    if (nativeApi && nativeApi.openDownloadFolder) {
      await nativeApi.openDownloadFolder();
    } else {
      this._showToast('Download folder: Pulsar Downloads', 'info');
    }
  }

  _updateOnlineConnectivity(isOnline) {
    if (this.onlineStatusBadge) {
      this.onlineStatusBadge.style.display = isOnline ? 'inline-block' : 'none';
    }
    if (this.currentView === 'discover') {
      if (isOnline) {
        this._loadFlowView(this.activeFlowTab, false);
      } else {
        if (this.flowOfflineState) this.flowOfflineState.style.display = 'flex';
      }
    }
  }

  // ============================================================================
  // Online Auto-Updater Engine & UI Handlers
  // ============================================================================
  _initUpdater() {
    if (this.btnUpdateAvailable) {
      this.btnUpdateAvailable.style.display = 'none';
      this.btnUpdateAvailable.addEventListener('click', () => {
        if (this.updaterState.isReadyToInstall) {
          this._applyDownloadedUpdate();
        } else if (this.updaterState.availableUpdate && this.updaterState.availableUpdate.updateAvailable) {
          this._openUpdateModal();
        }
      });
    }

    if (this.btnCheckUpdatesManual) {
      this.btnCheckUpdatesManual.addEventListener('click', () => {
        this._checkUpdateStatus(true);
      });
    }

    if (this.btnCloseUpdateModal) {
      this.btnCloseUpdateModal.addEventListener('click', () => this._closeUpdateModal());
    }

    if (this.btnUpdateDismiss) {
      this.btnUpdateDismiss.addEventListener('click', () => this._closeUpdateModal());
    }

    if (this.btnUpdateExecute) {
      this.btnUpdateExecute.addEventListener('click', () => {
        if (this.updaterState.isReadyToInstall) {
          this._applyDownloadedUpdate();
        } else {
          this._startUpdateDownloadAndInstall();
        }
      });
    }

    let lastReportedPercent = -1;
    const nativeApi = window.electronAPI || window.pulsarNative;
    if (nativeApi && nativeApi.onUpdateDownloadProgress) {
      nativeApi.onUpdateDownloadProgress((prog) => {
        if (prog.percent === lastReportedPercent) return;
        lastReportedPercent = prog.percent;
        requestAnimationFrame(() => {
          const isModalOpen = this.updateModal && (this.updateModal.classList.contains('active') || this.updateModal.style.display !== 'none');
          if (isModalOpen) {
            if (this.updateProgressBarFill) {
              this.updateProgressBarFill.style.width = `${prog.percent}%`;
            }
            if (this.updateProgressPercent) {
              this.updateProgressPercent.textContent = `${prog.percent}%`;
            }
            if (this.updateProgressLabel) {
              const mb = (prog.transferred / (1024 * 1024)).toFixed(1);
              const totalMb = (prog.total / (1024 * 1024)).toFixed(1);
              this.updateProgressLabel.textContent = `Downloading (${mb} / ${totalMb} MB)...`;
            }
          }
          if (this.updateBtnText) {
            this.updateBtnText.textContent = `Updating (${prog.percent}%)`;
          }
        });
      });
    }

    if (nativeApi && nativeApi.onUpdateAvailableDetected) {
      nativeApi.onUpdateAvailableDetected((updateInfo) => {
        if (updateInfo && updateInfo.updateAvailable) {
          this._handleUpdateAvailable(updateInfo, false);
        }
      });
    }

    // Quiet background update check 2.5s after launch, then every hour
    setTimeout(() => this._checkUpdateStatus(false), 2500);
    setInterval(() => this._checkUpdateStatus(false), 3600000);
  }

  _openUpdateModal() {
    if (!this.updateModal) return;
    this.updateModal.style.display = 'flex';
    this.updateModal.classList.add('active');
  }

  _closeUpdateModal() {
    if (!this.updateModal) return;
    this.updateModal.style.display = 'none';
    this.updateModal.classList.remove('active');
  }

  _handleUpdateAvailable(res, isManual = false) {
    this.updaterState.availableUpdate = res;
    if (this.btnUpdateAvailable) {
      this.btnUpdateAvailable.classList.add('is-visible');
      this.btnUpdateAvailable.style.display = 'inline-flex';
      this.btnUpdateAvailable.title = `New update v${String(res.latestVersion).replace(/^v/, '')} available! Click to update.`;
    }
    if (this.updateBadgeLatest) {
      this.updateBadgeLatest.textContent = 'v' + String(res.latestVersion).replace(/^v/, '');
    }
    if (this.updateBadgeCurrent) {
      this.updateBadgeCurrent.textContent = 'v' + String(res.currentVersion || '1.0.0').replace(/^v/, '');
    }
    if (this.updateModalVersionSub) {
      this.updateModalVersionSub.textContent = `Pulsar Audio v${String(res.latestVersion).replace(/^v/, '')} is available`;
    }
    if (this.updateChangelogContent) {
      this.updateChangelogContent.textContent = res.releaseNotes || 'Performance optimization, hardware acceleration, and stability improvements.';
    }
    if (isManual) {
      this._openUpdateModal();
    }
  }

  async _checkUpdateStatus(isManual = false) {
    const nativeApi = window.electronAPI || window.pulsarNative;
    if (!nativeApi || !nativeApi.checkForUpdates) return;

    try {
      if (isManual && this.btnCheckUpdatesManual) {
        this.btnCheckUpdatesManual.textContent = 'Checking...';
        this.btnCheckUpdatesManual.disabled = true;
      }
      const res = await nativeApi.checkForUpdates();
      if (res && res.updateAvailable) {
        this._handleUpdateAvailable(res, isManual);
      } else {
        this.updaterState.availableUpdate = null;
        if (this.btnUpdateAvailable && !this.updaterState.isReadyToInstall) {
          this.btnUpdateAvailable.classList.remove('is-visible');
          this.btnUpdateAvailable.style.display = 'none';
        }
        if (isManual) {
          this._showToast(`Pulsar Audio is up to date (v${res?.currentVersion || '1.0.0'})`, 'success');
        }
      }
    } catch (err) {
      console.warn('Update check failed:', err);
      if (isManual) {
        this._showToast('Could not check for online updates: ' + (err.message || 'Error'), 'warning');
      }
    } finally {
      if (isManual && this.btnCheckUpdatesManual) {
        this.btnCheckUpdatesManual.textContent = 'Update';
        this.btnCheckUpdatesManual.disabled = false;
      }
    }
  }

  async _startUpdateDownloadAndInstall() {
    if (!this.updaterState.availableUpdate || !this.updaterState.availableUpdate.downloadUrl) {
      this._showToast('Update download link not found', 'warning');
      return;
    }
    if (this.updaterState.isReadyToInstall) {
      this._applyDownloadedUpdate();
      return;
    }
    if (this.updaterState.isDownloading) return;
    this.updaterState.isDownloading = true;

    if (this.btnUpdateExecute) this.btnUpdateExecute.disabled = true;
    if (this.btnUpdateExecuteText) this.btnUpdateExecuteText.textContent = 'Downloading...';
    if (this.updateProgressBlock) this.updateProgressBlock.style.display = 'block';
    if (this.updateBgBanner) this.updateBgBanner.style.display = 'flex';
    if (this.btnUpdateDismiss) this.btnUpdateDismiss.textContent = 'Listen to Music (Background Update)';
    if (this.btnUpdateAvailable) {
      this.btnUpdateAvailable.title = 'Pulsar is updating in the background. You can safely close the window and enjoy your music.';
    }

    try {
      const nativeApi = window.electronAPI || window.pulsarNative;
      const res = await nativeApi.downloadUpdate(this.updaterState.availableUpdate.downloadUrl);
      if (res && res.success) {
        this.updaterState.isDownloading = false;
        this.updaterState.isReadyToInstall = true;
        this.updaterState.downloadedInstallerPath = res.path;

        if (this.updateProgressBarFill) this.updateProgressBarFill.style.width = '100%';
        if (this.updateProgressPercent) this.updateProgressPercent.textContent = '100%';
        if (this.updateProgressLabel) this.updateProgressLabel.textContent = 'Download Complete! Ready to install.';
        if (this.btnUpdateExecute) this.btnUpdateExecute.disabled = false;
        if (this.btnUpdateExecuteText) this.btnUpdateExecuteText.textContent = 'Restart & Apply Update';
        if (this.btnUpdateDismiss) this.btnUpdateDismiss.textContent = 'Finish Music First';
        if (this.updateBtnText) this.updateBtnText.textContent = 'Restart & Update';
        if (this.btnUpdateAvailable) {
          this.btnUpdateAvailable.title = 'Pulsar update is ready! Click to apply and restart whenever you finish your music.';
        }

        // Non-intrusive toast notification if user has closed modal to listen to music
        const isModalOpen = this.updateModal && (this.updateModal.classList.contains('active') || this.updateModal.style.display !== 'none');
        if (!isModalOpen) {
          this._showToast('🎉 Pulsar update ready! Click Restart & Update when your music finishes.', 'success');
        }
      } else {
        throw new Error(res?.error || 'Download failed');
      }
    } catch (err) {
      console.error('Update error:', err);
      this.updaterState.isDownloading = false;
      if (this.btnUpdateExecute) this.btnUpdateExecute.disabled = false;
      if (this.btnUpdateExecuteText) this.btnUpdateExecuteText.textContent = 'Retry Update';
      if (this.updateProgressLabel) this.updateProgressLabel.textContent = 'Update failed: ' + (err.message || 'Error');
      this._showToast('Update failed: ' + (err.message || 'Error'), 'error');
    }
  }

  async _applyDownloadedUpdate() {
    if (!this.updaterState.downloadedInstallerPath) return;
    this._showToast('Installing update & restarting...', 'info');
    if (this.btnUpdateExecute) this.btnUpdateExecute.disabled = true;
    if (this.btnUpdateExecuteText) this.btnUpdateExecuteText.textContent = 'Installing & Restarting...';

    try {
      const nativeApi = window.electronAPI || window.pulsarNative;
      await nativeApi.installUpdate(this.updaterState.downloadedInstallerPath);
    } catch (err) {
      this._showToast('Update installation failed: ' + (err.message || 'Error'), 'error');
      if (this.btnUpdateExecute) this.btnUpdateExecute.disabled = false;
    }
  }
}

// Bootstrap Application on DOM Ready
function bootstrapApp() {
  if (window.pulsarApp) return;
  const app = new App();
  window.pulsarApp = app;
  app.init().catch(err => {
    console.error('Pulsar App initialization error:', err);
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
