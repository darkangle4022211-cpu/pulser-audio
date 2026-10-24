/**
 * Pulsar Taste Engine & In-App Music Intelligence
 * Self-learning user taste profiling, personalized recommendations, and in-app music radar
 */

import { db } from '../storage/db.js';

class TasteEngine {
  constructor() {
    this.profile = {
      artistAffinity: {},
      genreAffinity: {},
      trackPlayCounts: {},
      trackDwellStats: {},
      totalListens: 0,
      totalSecondsListened: 0,
      recentHistory: [],
      level: 'Music Explorer',
      lastLevelIndex: 1
    };

    this.notifications = [];
    this.isLoaded = false;
    this.listeners = new Set();

    // Instagram-style live engagement state
    this.currentTrackId = null;
    this.lastTickTime = 0;
    this.hasAwardedHighDwell = false;
    this.lastPlayedTrackId = null;
  }

  async init() {
    if (this.isLoaded) return;
    try {
      const savedProfile = await db.getSetting('pulsarTasteProfile', null);
      if (savedProfile) {
        this.profile = { ...this.profile, ...savedProfile };
      }

      const savedNotifs = await db.getSetting('pulsarInAppNotifs', null);
      if (Array.isArray(savedNotifs)) {
        this.notifications = savedNotifs;
      } else {
        // Initialize with curated welcome & trending drops
        this._seedInitialNotifications();
      }
    } catch (err) {
      console.warn('TasteEngine init warning:', err);
    }
    this.isLoaded = true;
    this._checkAndAddFreshDrops();
  }

  seedFromLibrary(tracks = []) {
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) return;
    let modified = false;
    for (const track of tracks) {
      if (track.artist && track.artist !== 'Unknown Artist') {
        const art = track.artist.trim();
        if (!this.profile.artistAffinity[art]) {
          this.profile.artistAffinity[art] = 8 + (track.isFavorite ? 15 : 0) + (track.playCount ? track.playCount * 4 : 0);
          modified = true;
        }
      }
      if (track.genre) {
        const gen = track.genre.trim();
        if (!this.profile.genreAffinity[gen]) {
          this.profile.genreAffinity[gen] = 5 + (track.isFavorite ? 10 : 0);
          modified = true;
        }
      }
    }
    if (modified) {
      this._updateTasteLevel();
      this._saveProfile();
    }
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify() {
    this.listeners.forEach(cb => {
      try { cb(); } catch (e) {}
    });
  }

  async _saveProfile() {
    try {
      await db.setSetting('pulsarTasteProfile', this.profile);
    } catch (e) {}
    this._notify();
  }

  async _saveNotifications() {
    try {
      await db.setSetting('pulsarInAppNotifs', this.notifications);
    } catch (e) {}
    this._notify();
  }

  // --- Listening Events & Instagram-Style Training Algorithms ---

  recordTrackStart(track) {
    if (!track) return;
    this.profile.totalListens++;
    const trackKey = track.id || `${track.title}_${track.artist}`;
    this.profile.trackPlayCounts[trackKey] = (this.profile.trackPlayCounts[trackKey] || 0) + 1;

    // Replay / Loop detection (Strongest engagement indicator on Instagram)
    const isRepeat = this.lastPlayedTrackId && this.lastPlayedTrackId === track.id;
    this.lastPlayedTrackId = track.id;
    this.currentTrackId = track.id;
    this.hasAwardedHighDwell = false;
    this.lastTickTime = Date.now();

    // Track artist affinity
    if (track.artist && track.artist !== 'Unknown Artist') {
      const art = track.artist.trim();
      const bonus = isRepeat ? 30 : 3;
      this.profile.artistAffinity[art] = (this.profile.artistAffinity[art] || 0) + bonus;
    }

    if (isRepeat && track.genre) {
      const gen = track.genre.trim();
      this.profile.genreAffinity[gen] = (this.profile.genreAffinity[gen] || 0) + 15;
    }

    // Add to recent history with full streaming and offline playback properties
    const cleanYtId = track.ytId || (track.id && String(track.id).startsWith('yt_') ? String(track.id).replace(/^yt_/, '') : undefined);
    const audioUrl = track.audioUrl || (cleanYtId ? `https://www.youtube.com/watch?v=${cleanYtId}` : undefined);
    this.profile.recentHistory.unshift({
      id: track.id,
      ytId: cleanYtId,
      title: track.title,
      artist: track.artist,
      album: track.album || 'YouTube Music',
      duration: track.duration,
      durationStr: track.durationStr,
      audioUrl: audioUrl,
      coverUrl: track.coverUrl,
      isOnline: !!track.isOnline || !!audioUrl || !!cleanYtId,
      source: track.source || 'ytmusic',
      filePath: track.filePath,
      downloadedOffline: !!track.downloadedOffline,
      timestamp: Date.now()
    });
    if (this.profile.recentHistory.length > 50) {
      this.profile.recentHistory.pop();
    }

    this._updateTasteLevel();
    this._saveProfile();
  }

  /**
   * Continuous dwell-time tracking called on every audio playback tick
   */
  recordDwellTick(track, currentTime = 0, duration = 0) {
    if (!track || currentTime <= 0) return;
    const now = Date.now();
    const dt = this.lastTickTime > 0 ? Math.min(3, (now - this.lastTickTime) / 1000) : 1;
    this.lastTickTime = now;

    this.profile.totalSecondsListened += dt;

    const trackKey = track.id || `${track.title}_${track.artist}`;
    if (!this.profile.trackDwellStats) this.profile.trackDwellStats = {};
    this.profile.trackDwellStats[trackKey] = (this.profile.trackDwellStats[trackKey] || 0) + dt;

    // Instagram reel dwell algorithm: reward staying past 70% or >40 seconds
    const ratio = duration > 0 ? (currentTime / duration) : 0;
    if ((ratio > 0.70 || currentTime > 40) && !this.hasAwardedHighDwell) {
      this.hasAwardedHighDwell = true;
      if (track.artist && track.artist !== 'Unknown Artist') {
        const art = track.artist.trim();
        this.profile.artistAffinity[art] = (this.profile.artistAffinity[art] || 0) + 15;
      }
      if (track.genre) {
        const gen = track.genre.trim();
        this.profile.genreAffinity[gen] = (this.profile.genreAffinity[gen] || 0) + 10;
      }
      this._updateTasteLevel();
      this._saveProfile();
    }
  }

  recordTrackCompleted(track, durationSecs = 0) {
    if (!track) return;
    const dwellLogged = this.profile.trackDwellStats?.[track.id] || 0;
    if (durationSecs > dwellLogged) {
      this.profile.totalSecondsListened += (durationSecs - dwellLogged);
    }

    // Full completion is a premier positive signal
    if (track.artist && track.artist !== 'Unknown Artist') {
      const art = track.artist.trim();
      this.profile.artistAffinity[art] = (this.profile.artistAffinity[art] || 0) + 20;
    }

    if (track.genre) {
      const gen = track.genre.trim();
      this.profile.genreAffinity[gen] = (this.profile.genreAffinity[gen] || 0) + 12;
    }

    this._updateTasteLevel();
    this._saveProfile();
  }

  recordEarlySkip(track, listenedSecs = 0) {
    if (!track) return;
    if (!this.profile.trackSkips) this.profile.trackSkips = {};
    const trackKey = track.id || `${track.title}_${track.artist}`;
    this.profile.trackSkips[trackKey] = (this.profile.trackSkips[trackKey] || 0) + 1;

    // Instagram algorithm: Fast skip (<12s) is a heavy negative preference penalty
    if (listenedSecs < 12) {
      if (track.artist && track.artist !== 'Unknown Artist') {
        const art = track.artist.trim();
        const current = this.profile.artistAffinity[art] || 0;
        this.profile.artistAffinity[art] = Math.max(0, current - 10);
      }
      if (track.genre) {
        const gen = track.genre.trim();
        const current = this.profile.genreAffinity[gen] || 0;
        this.profile.genreAffinity[gen] = Math.max(0, current - 8);
      }
    } else if (listenedSecs < 28) {
      if (track.artist && track.artist !== 'Unknown Artist') {
        const art = track.artist.trim();
        const current = this.profile.artistAffinity[art] || 0;
        this.profile.artistAffinity[art] = Math.max(0, current - 3);
      }
    }
    this._saveProfile();
  }

  recordFavorite(track, isFavorite) {
    if (!track) return;
    if (track.artist && track.artist !== 'Unknown Artist') {
      const art = track.artist.trim();
      const boost = isFavorite ? 15 : -5;
      this.profile.artistAffinity[art] = Math.max(0, (this.profile.artistAffinity[art] || 0) + boost);
    }
    if (isFavorite) {
      this._addNotification({
        id: `fav_${Date.now()}`,
        type: 'taste_match',
        title: 'Taste Profile Refined',
        message: `Added "${track.title}" to Favorites. Pulsar will now recommend more songs like this.`,
        track: track,
        timestamp: Date.now()
      });
    }
    this._saveProfile();
  }

  recordPlaylistAdd(track, playlistName = 'Playlist') {
    if (!track) return;
    if (track.artist && track.artist !== 'Unknown Artist') {
      const art = track.artist.trim();
      this.profile.artistAffinity[art] = (this.profile.artistAffinity[art] || 0) + 10;
    }
    this._saveProfile();
  }

  getTopArtists(limit = 5) {
    return Object.entries(this.profile.artistAffinity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([artist, score]) => ({ artist, score }));
  }

  /**
   * Retrieves top-engaged songs (high dwell time, repeat plays, favorites, downloads)
   * used as seed songs for vibe-based recommendation models.
   */
  getTopEngagedTracks(libraryTracks = [], limit = 5) {
    const candidates = new Map();

    // 1. Process recent history and recorded dwell stats
    const history = this.profile.recentHistory || [];
    for (const h of history) {
      if (!h || !h.title) continue;
      const key = h.id || `${h.title}_${h.artist}`;
      const dwell = (this.profile.trackDwellStats && this.profile.trackDwellStats[key]) || 0;
      const plays = (this.profile.trackPlayCounts && this.profile.trackPlayCounts[key]) || 1;
      const skips = (this.profile.trackSkips && this.profile.trackSkips[key]) || 0;
      const score = (dwell * 1.5) + (plays * 25) - (skips * 30);
      candidates.set(key, { ...h, score });
    }

    // 2. Factor in library tracks (downloads, favorites)
    if (Array.isArray(libraryTracks)) {
      for (const t of libraryTracks) {
        if (!t || !t.title) continue;
        const key = t.id || `${t.title}_${t.artist}`;
        const existing = candidates.get(key) || { ...t, score: 0 };
        let boost = 0;
        if (t.downloadedOffline) boost += 60;
        if (t.isFavorite) boost += 45;
        if (t.playCount) boost += t.playCount * 20;
        existing.score = (existing.score || 0) + boost;
        if (!existing.coverUrl && t.coverUrl) existing.coverUrl = t.coverUrl;
        if (!existing.ytId && t.ytId) existing.ytId = t.ytId;
        candidates.set(key, existing);
      }
    }

    return Array.from(candidates.values())
      .filter(t => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Returns tracks with high dwell time and zero early skips for the "Listen Again" section.
   */
  getHighDwellListenAgainTracks(libraryTracks = [], limit = 12) {
    const history = this.profile.recentHistory || [];
    const valid = [];
    const seen = new Set();

    for (const h of history) {
      if (!h || !h.title) continue;
      const key = h.id || `${h.title}_${h.artist}`;
      if (seen.has(key)) continue;

      const skips = (this.profile.trackSkips && this.profile.trackSkips[key]) || 0;
      if (skips > 0) continue; // Zero skip requirement

      const dwell = (this.profile.trackDwellStats && this.profile.trackDwellStats[key]) || 0;
      const plays = (this.profile.trackPlayCounts && this.profile.trackPlayCounts[key]) || 0;

      // High dwell time (>= 30s) or played more than once
      if (dwell >= 30 || plays >= 2) {
        seen.add(key);

        // Check if track was downloaded or exists in local library
        const libMatch = Array.isArray(libraryTracks) ? libraryTracks.find(t => {
          if (!t) return false;
          if (t.id === h.id || (h.ytId && t.ytId === h.ytId)) return true;
          if (t.title && h.title && t.title.trim().toLowerCase() === h.title.trim().toLowerCase() && (t.artist || '').trim().toLowerCase() === (h.artist || '').trim().toLowerCase()) return true;
          return false;
        }) : null;

        const enriched = libMatch ? { ...libMatch, ...h, filePath: libMatch.filePath, downloadedOffline: libMatch.downloadedOffline } : { ...h };
        if (!enriched.filePath && !enriched.downloadedOffline) {
          const ytId = enriched.ytId || (enriched.id && String(enriched.id).startsWith('yt_') ? String(enriched.id).replace(/^yt_/, '') : null);
          if (ytId) {
            enriched.ytId = ytId;
            enriched.audioUrl = enriched.audioUrl || `https://www.youtube.com/watch?v=${ytId}`;
            enriched.isOnline = true;
            enriched.source = enriched.source || 'ytmusic';
          }
        }
        valid.push(enriched);
      }
    }

    // If history is small, supplement with favorite or downloaded library tracks
    if (valid.length < limit && Array.isArray(libraryTracks)) {
      for (const t of libraryTracks) {
        if (!t || !t.title) continue;
        const key = t.id || `${t.title}_${t.artist}`;
        if (seen.has(key)) continue;
        if (t.isFavorite || t.downloadedOffline || (t.playCount && t.playCount > 1)) {
          seen.add(key);
          valid.push(t);
          if (valid.length >= limit) break;
        }
      }
    }

    return valid.slice(0, limit);
  }

  getTasteSummary() {
    const top = this.getTopArtists(3);
    const topNames = top.map(t => t.artist);
    return {
      level: this.profile.level,
      totalListens: this.profile.totalListens,
      totalHours: (this.profile.totalSecondsListened / 3600).toFixed(1),
      topArtists: topNames,
      primaryVibe: topNames.length > 0 ? `Hooked on ${topNames.join(', ')}` : 'Discovering your sound'
    };
  }

  getAddictionStats() {
    const top = this.getTopArtists(5);
    const topGenres = Object.entries(this.profile.genreAffinity || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([g, s]) => g);

    const totalListens = this.profile.totalListens || 0;
    const totalHours = (this.profile.totalSecondsListened / 3600).toFixed(1);
    const addictionScore = Math.min(99, Math.max(68, 70 + Math.floor(Math.min(29, totalListens * 0.75))));

    return {
      addictionScore,
      matchPercentage: Math.min(99, Math.max(88, 86 + Math.floor(Math.min(13, totalListens * 0.4)))),
      totalListens,
      totalHours,
      level: this.profile.level,
      topArtists: top.map(t => t.artist),
      topGenres,
      vibeStreak: `${Math.max(1, Math.min(30, Math.floor(totalListens / 2) + 1))} Day Groove`,
      primaryVibe: top.length > 0 ? `Hooked on ${top.map(t => t.artist).slice(0, 2).join(' & ')}` : 'Training taste model...'
    };
  }

  getTrackAffinityScore(track) {
    if (!track) return 92;
    let score = 86;
    if (track.artist && this.profile.artistAffinity[track.artist]) {
      score += Math.min(10, Math.floor(this.profile.artistAffinity[track.artist] * 0.8));
    }
    if (track.genre && this.profile.genreAffinity[track.genre]) {
      score += Math.min(5, Math.floor(this.profile.genreAffinity[track.genre] * 0.5));
    }
    const trackKey = track.id || `${track.title}_${track.artist}`;
    if (this.profile.trackPlayCounts[trackKey]) {
      score += Math.min(4, this.profile.trackPlayCounts[trackKey] * 2);
    }
    return Math.min(99, Math.max(85, score));
  }

  _updateTasteLevel() {
    const listens = this.profile.totalListens || 0;
    const levels = [
      { min: 0, title: 'Music Explorer', index: 1 },
      { min: 5, title: 'Groove Hunter', index: 2 },
      { min: 15, title: 'Sonic Connoisseur', index: 3 },
      { min: 35, title: 'Master Audiophile', index: 4 },
      { min: 70, title: 'Pulsar Virtuoso', index: 5 }
    ];

    let current = levels[0];
    for (const lvl of levels) {
      if (listens >= lvl.min) current = lvl;
    }

    if (current.index > (this.profile.lastLevelIndex || 1)) {
      this.profile.lastLevelIndex = current.index;
      this.profile.level = current.title;
      this._addNotification({
        id: `lvl_${Date.now()}`,
        type: 'milestone',
        title: '🏆 Taste Engine Level Up!',
        message: `You unlocked "${current.title}"! Pulsar's recommendation algorithm is now deeply trained on your listening habits.`,
        timestamp: Date.now()
      });
    } else {
      this.profile.level = current.title;
    }
  }

  // --- In-App Notifications Engine ---

  _seedInitialNotifications() {
    this.notifications = [
      {
        id: 'drop_1',
        type: 'latest_hit',
        title: '🔥 New Global #1 Release',
        message: '"Die With A Smile" by Lady Gaga & Bruno Mars is breaking records worldwide.',
        track: {
          id: 'yt_kPa7bsKwL-8',
          ytId: 'kPa7bsKwL-8',
          title: 'Die With A Smile',
          artist: 'Lady Gaga & Bruno Mars',
          album: 'Die With A Smile',
          durationStr: '4:11',
          coverUrl: 'https://i.ytimg.com/vi/kPa7bsKwL-8/hqdefault.jpg',
          audioUrl: 'https://music.youtube.com/watch?v=kPa7bsKwL-8',
          isOnline: true,
          source: 'ytmusic'
        },
        read: false,
        timestamp: Date.now() - 3600000
      },
      {
        id: 'drop_2',
        type: 'recommendation',
        title: '🎧 Curated For You',
        message: 'Experience the synthwave bliss of "Starboy" and "Blinding Lights".',
        track: {
          id: 'yt_4NRXx6U8ABQ',
          ytId: '4NRXx6U8ABQ',
          title: 'Blinding Lights',
          artist: 'The Weeknd',
          album: 'After Hours',
          durationStr: '3:20',
          coverUrl: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg',
          audioUrl: 'https://music.youtube.com/watch?v=4NRXx6U8ABQ',
          isOnline: true,
          source: 'ytmusic'
        },
        read: false,
        timestamp: Date.now() - 7200000
      },
      {
        id: 'drop_3',
        type: 'latest_hit',
        title: '✨ Trending Billboard Smash',
        message: '"Espresso" by Sabrina Carpenter is streaming everywhere.',
        track: {
          id: 'yt_eVli-tstM5E',
          ytId: 'eVli-tstM5E',
          title: 'Espresso',
          artist: 'Sabrina Carpenter',
          album: 'Short n\' Sweet',
          durationStr: '2:55',
          coverUrl: 'https://i.ytimg.com/vi/eVli-tstM5E/hqdefault.jpg',
          audioUrl: 'https://music.youtube.com/watch?v=eVli-tstM5E',
          isOnline: true,
          source: 'ytmusic'
        },
        read: false,
        timestamp: Date.now() - 14400000
      }
    ];
    this._saveNotifications();
  }

  _checkAndAddFreshDrops() {
    const top = this.getTopArtists(1);
    if (top.length > 0) {
      const topArtist = top[0].artist;
      const existing = this.notifications.some(n => n.title && n.title.includes(topArtist));
      if (!existing && top[0].score >= 8) {
        this._addNotification({
          id: `rec_${Date.now()}`,
          type: 'recommendation',
          title: `🌟 Specially Trained For You: ${topArtist}`,
          message: `Your taste analysis shows high affinity for ${topArtist}. We have generated an infinite smart radio mix for you!`,
          read: false,
          timestamp: Date.now()
        });
      }
    }
  }

  _addNotification(notif) {
    notif.read = false;
    notif.timestamp = notif.timestamp || Date.now();
    this.notifications.unshift(notif);
    if (this.notifications.length > 40) {
      this.notifications.pop();
    }
    this._saveNotifications();
  }

  getNotifications() {
    return this.notifications;
  }

  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  markAllAsRead() {
    this.notifications.forEach(n => { n.read = true; });
    this._saveNotifications();
  }

  markAsRead(id) {
    const notif = this.notifications.find(n => n.id === id);
    if (notif) {
      notif.read = true;
      this._saveNotifications();
    }
  }

  dismissNotification(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this._saveNotifications();
  }

  // --- Instagram-Style User Algorithm Tuning Controls ---

  getAlgorithmWeights() {
    const defaultVibes = {
      'Action & Workout': 85,
      'Chill & Lofi': 80,
      'Night Drive & Synth': 75,
      'Deep Focus': 70,
      'Hip Hop & Beats': 65,
      'Pop Hits': 60,
      'Romance & Acoustic': 55,
      'Rock & Alternative': 50
    };

    const currentVibes = {};
    for (const [vibe, defVal] of Object.entries(defaultVibes)) {
      currentVibes[vibe] = (this.profile.genreAffinity && this.profile.genreAffinity[vibe] !== undefined)
        ? this.profile.genreAffinity[vibe]
        : defVal;
    }

    return {
      vibes: currentVibes,
      topArtists: this.getTopArtists(10),
      dwellSensitivity: this.profile.dwellSensitivity || 'balanced',
      level: this.profile.level,
      totalListens: this.profile.totalListens
    };
  }

  setCustomVibeWeight(vibeOrGenre, weightScore) {
    if (!this.profile.genreAffinity) this.profile.genreAffinity = {};
    this.profile.genreAffinity[vibeOrGenre] = Math.max(0, Math.min(100, weightScore));
    this._saveProfile();
  }

  addCustomArtistAffinity(artist, boost = 25) {
    if (!artist) return;
    const art = artist.trim();
    if (!this.profile.artistAffinity) this.profile.artistAffinity = {};
    this.profile.artistAffinity[art] = (this.profile.artistAffinity[art] || 0) + boost;
    this._saveProfile();
  }

  removeArtistAffinity(artist) {
    if (this.profile.artistAffinity && this.profile.artistAffinity[artist] !== undefined) {
      delete this.profile.artistAffinity[artist];
      this._saveProfile();
    }
  }

  resetAlgorithm() {
    this.profile = {
      artistAffinity: {},
      genreAffinity: {},
      trackPlayCounts: {},
      trackDwellStats: {},
      totalListens: 0,
      totalSecondsListened: 0,
      recentHistory: [],
      level: 'Music Explorer',
      lastLevelIndex: 1,
      dwellSensitivity: 'balanced'
    };
    this._saveProfile();
  }
}

export const tasteEngine = new TasteEngine();
