/**
 * Bluetooth Earbud & Hardware Media Controls Manager
 * 
 * Capabilities:
 * - Single Tap on earbud sensor: Play / Pause toggle
 * - Double Tap on earbud sensor: Forward (Skip to Next Track)
 * - Triple Tap on earbud sensor: Backward (Skip to Previous Track)
 * - Direct AVRCP Next/Previous track commands (immediate execution)
 * - Linux MPRIS & Web MediaSession API integration (metadata, artwork, playback state)
 * - Global media key IPC events from Electron main process
 */

export class BluetoothMediaManager {
  constructor(options = {}) {
    this.onPlayPause = options.onPlayPause || (() => {});
    this.onNext = options.onNext || (() => {});
    this.onPrevious = options.onPrevious || (() => {});
    this.onSeekRel = options.onSeekRel || (() => {});
    this.onSeekTo = options.onSeekTo || ((time) => this.onSeekRel(0));
    this.onStop = options.onStop || (() => {});
    this.showFeedback = options.showFeedback || (() => {});

    // Multi-tap detection state
    this.tapCount = 0;
    this.tapTimer = null;
    this.TAP_WINDOW_MS = 240; // Fast responsive window for rapid double and triple taps

    this._initMediaSession();
    this._initIPC();
  }

  /**
   * Called when a Play/Pause pulse or sensor tap arrives
   * Accurately detects single, double, or triple taps within the time window.
   */
  handlePlayPauseTap() {
    this.tapCount++;

    if (this.tapTimer) {
      clearTimeout(this.tapTimer);
      this.tapTimer = null;
    }

    // Immediate trigger on 3rd tap (triple tap = backward)
    if (this.tapCount >= 3) {
      this.tapCount = 0;
      this.showFeedback('⏮ Backward (Previous Song)');
      this.onPrevious('triple-tap');
      return;
    }

    // Wait briefly for subsequent taps (double tap or single tap)
    this.tapTimer = setTimeout(() => {
      const finalCount = this.tapCount;
      this.tapCount = 0;
      this.tapTimer = null;

      if (finalCount === 1) {
        // Single tap: Play / Pause
        this.onPlayPause('single-tap');
      } else if (finalCount === 2) {
        // Double tap: Forward (Next Track)
        this.showFeedback('⏭ Forward (Next Song)');
        this.onNext('double-tap');
      }
    }, this.TAP_WINDOW_MS);
  }

  /**
   * Direct AVRCP / Hardware Forward (Next Track)
   */
  handleDirectNext() {
    this._cancelTapTimer();
    this.showFeedback('⏭ Forward (Next Song)');
    this.onNext('direct-next');
  }

  /**
   * Direct AVRCP / Hardware Backward (Previous Track)
   */
  handleDirectPrevious() {
    this._cancelTapTimer();
    this.showFeedback('⏮ Backward (Previous Song)');
    this.onPrevious('direct-previous');
  }

  /**
   * Direct Stop
   */
  handleDirectStop() {
    this._cancelTapTimer();
    this.onStop('direct-stop');
  }

  _cancelTapTimer() {
    if (this.tapTimer) {
      clearTimeout(this.tapTimer);
      this.tapTimer = null;
    }
    this.tapCount = 0;
  }

  /**
   * Register Web MediaSession action handlers (connects to Linux MPRIS / BlueZ / PipeWire)
   */
  _initMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        this.handlePlayPauseTap();
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        this.handlePlayPauseTap();
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        this.handleDirectNext();
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        this.handleDirectPrevious();
      });

      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const skipSecs = (details && details.seekOffset) ? details.seekOffset : 10;
        this.showFeedback(`⏪ -${skipSecs}s`);
        this.onSeekRel(-skipSecs);
      });

      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const skipSecs = (details && details.seekOffset) ? details.seekOffset : 10;
        this.showFeedback(`⏩ +${skipSecs}s`);
        this.onSeekRel(skipSecs);
      });

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details && typeof details.seekTime === 'number' && isFinite(details.seekTime)) {
          this.onSeekTo(details.seekTime);
        }
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        this.handleDirectStop();
      });
    } catch (err) {
      console.warn('Failed to register MediaSession action handlers:', err);
    }
  }

  /**
   * Listen for IPC events from Electron main process global shortcuts and tray
   */
  _initIPC() {
    if (typeof window === 'undefined') return;
    const nativeApi = window.electronAPI;
    if (nativeApi && typeof nativeApi.onMediaKey === 'function') {
      try {
        nativeApi.onMediaKey((cmd) => {
          switch (cmd) {
            case 'play-pause':
              this.handlePlayPauseTap();
              break;
            case 'next':
              this.handleDirectNext();
              break;
            case 'previous':
              this.handleDirectPrevious();
              break;
            case 'stop':
              this.handleDirectStop();
              break;
          }
        });
      } catch (err) {
        console.warn('Failed to listen to native media key events:', err);
      }
    }
  }

  /**
   * Update Linux MPRIS / MediaSession metadata with active track details
   */
  updateMetadata(track) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !track) return;

    try {
      const artwork = [];
      const art = track.coverUrl || track.artworkUrl || track.thumbnail;
      if (art) {
        artwork.push({ src: art, sizes: '512x512', type: 'image/png' });
      }

      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title || 'Unknown Title',
          artist: track.artist || 'Unknown Artist',
          album: track.album || 'Pulsar Music',
          artwork: artwork
        });
      }
    } catch (err) {
      console.warn('Failed to update MediaSession metadata:', err);
    }
  }

  /**
   * Update playback state ('playing' | 'paused')
   */
  updatePlaybackState(isPlaying) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch (err) {
      console.warn('Failed to update MediaSession playback state:', err);
    }
  }

  /**
   * Update track position and duration for MPRIS position tracking
   */
  updatePositionState(duration, position, playbackRate = 1.0) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    if (!duration || !isFinite(duration) || duration <= 0) return;
    if (isNaN(position) || !isFinite(position) || position < 0) return;

    try {
      const validDur = Number(duration);
      const validPos = Math.max(0, Math.min(Number(position), validDur));
      const validRate = (playbackRate && isFinite(playbackRate) && playbackRate > 0) ? Number(playbackRate) : 1.0;

      navigator.mediaSession.setPositionState({
        duration: validDur,
        playbackRate: validRate,
        position: validPos
      });
    } catch (err) {
      // Ignore position state sync hiccups during track changes
    }
  }
}
