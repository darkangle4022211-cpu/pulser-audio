/**
 * 100% Offline IndexedDB Database Manager for Pulsar Music Player
 * Stores tracks, playlists, settings, history, and play counts locally on user PC
 */

const DB_NAME = 'PulsarMusicDB';
const DB_VERSION = 2;

class DatabaseManager {
  constructor() {
    this.db = null;
    this._initPromise = null;
  }

  async init() {
    if (this.db) return this.db;
    if (this._initPromise) return this._initPromise;

    this._initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Tracks store
        if (!db.objectStoreNames.contains('tracks')) {
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('title', 'title', { unique: false });
          trackStore.createIndex('artist', 'artist', { unique: false });
          trackStore.createIndex('album', 'album', { unique: false });
          trackStore.createIndex('dateAdded', 'dateAdded', { unique: false });
        }

        // Dedicated binary audio files store (holds actual MP3/FLAC Blobs on user disk)
        if (!db.objectStoreNames.contains('audioFiles')) {
          db.createObjectStore('audioFiles', { keyPath: 'id' });
        }

        // Playlists store
        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }

        // Settings / State store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // Playback history store
        if (!db.objectStoreNames.contains('history')) {
          const histStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          histStore.createIndex('trackId', 'trackId', { unique: false });
          histStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        this._initPromise = null;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        this._initPromise = null;
        reject(event.target.error);
      };
    });

    return this._initPromise;
  }

  // --- Track Methods ---
  async saveTrack(track) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tracks', 'readwrite');
      const store = tx.objectStore('tracks');
      const req = store.put(track);
      req.onsuccess = () => resolve(track);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllTracks() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tracks', 'readonly');
      const store = tx.objectStore('tracks');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getTrack(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tracks', 'readonly');
      const store = tx.objectStore('tracks');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteTrack(id) {
    await this.init();
    await this.deleteAudioFile(id).catch(() => {});
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('tracks', 'readwrite');
      const store = tx.objectStore('tracks');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Audio File Binary Blob Storage ---
  async saveAudioFile(id, blob) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('audioFiles', 'readwrite');
      const store = tx.objectStore('audioFiles');
      const req = store.put({ id, blob });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async getAudioFile(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db.objectStoreNames.contains('audioFiles')) {
        return resolve(null);
      }
      const tx = this.db.transaction('audioFiles', 'readonly');
      const store = tx.objectStore('audioFiles');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result ? req.result.blob : null);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteAudioFile(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db.objectStoreNames.contains('audioFiles')) {
        return resolve(true);
      }
      const tx = this.db.transaction('audioFiles', 'readwrite');
      const store = tx.objectStore('audioFiles');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Playlist Methods ---
  async savePlaylist(playlist) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('playlists', 'readwrite');
      const store = tx.objectStore('playlists');
      const req = store.put(playlist);
      req.onsuccess = () => resolve(playlist);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllPlaylists() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('playlists', 'readonly');
      const store = tx.objectStore('playlists');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getPlaylist(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('playlists', 'readonly');
      const store = tx.objectStore('playlists');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async deletePlaylist(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('playlists', 'readwrite');
      const store = tx.objectStore('playlists');
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Settings & State Methods ---
  async setSetting(key, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const req = store.put({ key, value });
      req.onsuccess = () => resolve(value);
      req.onerror = () => reject(req.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get(key);
      req.onsuccess = () => {
        resolve(req.result ? req.result.value : defaultValue);
      };
      req.onerror = () => resolve(defaultValue);
    });
  }

  // --- Play History & Counters ---
  async recordPlay(trackId) {
    await this.init();
    const tx = this.db.transaction(['tracks', 'history'], 'readwrite');
    const trackStore = tx.objectStore('tracks');
    const histStore = tx.objectStore('history');

    const getReq = trackStore.get(trackId);
    getReq.onsuccess = () => {
      if (getReq.result) {
        const track = getReq.result;
        track.playCount = (track.playCount || 0) + 1;
        track.lastPlayed = Date.now();
        trackStore.put(track);
      }
    };

    histStore.add({ trackId, timestamp: Date.now() });
  }

  async getRecentHistory(limit = 50) {
    await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const index = store.index('timestamp');
      const req = index.openCursor(null, 'prev');
      const results = [];

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => resolve([]);
    });
  }
}

export const db = new DatabaseManager();
