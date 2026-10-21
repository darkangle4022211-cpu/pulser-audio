/**
 * Custom Playlist and Queue Manager
 * Core Features:
 * - Full custom playlist creation, editing, deletion
 * - Drag-and-drop track reordering inside playlists
 * - Duplicate warning system ("Add duplicate or skip?")
 * - Dedicated "Up Next" Queue with "Play Next" and "Play Last"
 * - In-playlist real-time search filtering & column sorting
 * - .m3u8 export/import and full JSON backup
 */

import { db } from '../storage/db.js';

class PlaylistManager {
  constructor() {
    this.playlists = [];
    this.activePlaylistId = 'all-songs'; // 'all-songs' | 'favorites' | 'recent' | customId
    this.queue = [];
    this.queueIndex = 0;
    this.history = [];
    this.onQueueChange = null;
    this.onPlaylistsChange = null;
  }

  async loadPlaylists() {
    this.playlists = await db.getAllPlaylists();
    if (this.onPlaylistsChange) this.onPlaylistsChange(this.playlists);
    return this.playlists;
  }

  async createPlaylist(name, description = '', coverUrl = null) {
    const newPlaylist = {
      id: 'pl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      name: name.trim() || 'Untitled Playlist',
      description: description.trim(),
      coverUrl: coverUrl,
      trackIds: [],
      dateCreated: Date.now()
    };

    await db.savePlaylist(newPlaylist);
    this.playlists.push(newPlaylist);
    if (this.onPlaylistsChange) this.onPlaylistsChange(this.playlists);
    return newPlaylist;
  }

  async deletePlaylist(playlistId) {
    await db.deletePlaylist(playlistId);
    this.playlists = this.playlists.filter(p => p.id !== playlistId);
    if (this.activePlaylistId === playlistId) {
      this.activePlaylistId = 'all-songs';
    }
    if (this.onPlaylistsChange) this.onPlaylistsChange(this.playlists);
  }

  async renamePlaylist(playlistId, newName, newDescription = null) {
    const pl = this.playlists.find(p => p.id === playlistId);
    if (!pl) return null;

    pl.name = newName.trim();
    if (newDescription !== null) pl.description = newDescription.trim();

    await db.savePlaylist(pl);
    if (this.onPlaylistsChange) this.onPlaylistsChange(this.playlists);
    return pl;
  }

  /**
   * Add a track to playlist with duplicate detection.
   * If track exists, calls promptDuplicateCallback(track, playlist)
   */
  async addTrackToPlaylist(playlistId, trackId, promptDuplicateCallback = null) {
    const pl = this.playlists.find(p => p.id === playlistId);
    if (!pl) return false;

    if (!Array.isArray(pl.trackIds)) pl.trackIds = [];

    const isDuplicate = pl.trackIds.includes(trackId);
    if (isDuplicate) {
      if (promptDuplicateCallback) {
        const allow = await promptDuplicateCallback(trackId, pl);
        if (!allow) return false; // Skipped
      } else {
        return false;
      }
    }

    pl.trackIds.push(trackId);
    await db.savePlaylist(pl);
    if (this.onPlaylistsChange) this.onPlaylistsChange(this.playlists);
    return true;
  }

  async removeTrackFromPlaylist(playlistId, trackIdOrIndex) {
    const pl = this.playlists.find(p => p.id === playlistId);
    if (!pl || !Array.isArray(pl.trackIds)) return false;

    if (typeof trackIdOrIndex === 'string') {
      const idx = pl.trackIds.indexOf(trackIdOrIndex);
      if (idx !== -1) {
        pl.trackIds.splice(idx, 1);
      } else {
        return false;
      }
    } else if (typeof trackIdOrIndex === 'number' && trackIdOrIndex >= 0 && trackIdOrIndex < pl.trackIds.length) {
      pl.trackIds.splice(trackIdOrIndex, 1);
    } else {
      return false;
    }

    await db.savePlaylist(pl);
    if (this.onPlaylistsChange) this.onPlaylistsChange(this.playlists);
    return true;
  }

  async removeTrackFromAllPlaylists(trackId) {
    if (!trackId) return;
    for (const pl of this.playlists) {
      if (Array.isArray(pl.trackIds) && pl.trackIds.includes(trackId)) {
        pl.trackIds = pl.trackIds.filter(id => id !== trackId);
        await db.savePlaylist(pl);
      }
    }
    if (this.onPlaylistsChange) this.onPlaylistsChange(this.playlists);
  }

  async pruneMissingTracks(validTrackIds) {
    // Safety check: Never prune playlists if validTrackIds is empty or unpopulated (prevents wiping playlists during load or update)
    if (!validTrackIds || !Array.isArray(validTrackIds) || validTrackIds.length === 0) return;
    const validSet = new Set(validTrackIds);
    let changed = false;
    for (const pl of this.playlists) {
      if (Array.isArray(pl.trackIds)) {
        const originalLen = pl.trackIds.length;
        pl.trackIds = pl.trackIds.filter(id => validSet.has(id));
        if (pl.trackIds.length !== originalLen) {
          await db.savePlaylist(pl);
          changed = true;
        }
      }
    }
    if (changed && this.onPlaylistsChange) {
      this.onPlaylistsChange(this.playlists);
    }
  }

  async reorderPlaylistTracks(playlistId, fromIndex, toIndex) {
    const pl = this.playlists.find(p => p.id === playlistId);
    if (!pl) return false;

    const [moved] = pl.trackIds.splice(fromIndex, 1);
    pl.trackIds.splice(toIndex, 0, moved);

    await db.savePlaylist(pl);
    if (this.onPlaylistsChange) this.onPlaylistsChange(this.playlists);
    return true;
  }

  // --- Queue Management ---
  setQueue(tracks, startIndex = 0) {
    this.queue = [...tracks];
    this.queueIndex = Math.max(0, Math.min(startIndex, this.queue.length - 1));
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
  }

  addToQueueNext(track) {
    if (this.queue.length === 0) {
      this.queue.push(track);
      this.queueIndex = 0;
    } else {
      this.queue.splice(this.queueIndex + 1, 0, track);
    }
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
  }

  addToQueueLast(track) {
    this.queue.push(track);
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
  }

  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    this.queue.splice(index, 1);
    if (index < this.queueIndex) {
      this.queueIndex--;
    } else if (this.queueIndex >= this.queue.length) {
      this.queueIndex = Math.max(0, this.queue.length - 1);
    }
    if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
  }

  getCurrentTrack() {
    return this.queue[this.queueIndex] || null;
  }

  getNextTrack(isShuffle = false, isRepeatAll = false, isRepeatOne = false) {
    if (this.queue.length === 0) return null;
    if (isRepeatOne) return this.getCurrentTrack();

    if (isShuffle) {
      if (this.queue.length === 1) return this.queue[0];
      let randIdx = Math.floor(Math.random() * this.queue.length);
      while (randIdx === this.queueIndex && this.queue.length > 1) {
        randIdx = Math.floor(Math.random() * this.queue.length);
      }
      this.queueIndex = randIdx;
      if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
      return this.queue[this.queueIndex];
    }

    if (this.queueIndex < this.queue.length - 1) {
      this.queueIndex++;
      if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
      return this.queue[this.queueIndex];
    } else if (isRepeatAll) {
      this.queueIndex = 0;
      if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
      return this.queue[this.queueIndex];
    }

    return null;
  }

  getPreviousTrack() {
    if (this.queue.length === 0) return null;
    if (this.queueIndex > 0) {
      this.queueIndex--;
      if (this.onQueueChange) this.onQueueChange(this.queue, this.queueIndex);
      return this.queue[this.queueIndex];
    }
    return this.queue[0];
  }

  // --- Search & Sorting ---
  filterTracks(tracks, searchQuery) {
    if (!tracks || !Array.isArray(tracks)) return [];
    if (!searchQuery || !searchQuery.trim()) return tracks;
    const q = searchQuery.toLowerCase().trim();
    return tracks.filter(t => {
      if (!t) return false;
      const title = String(t.title || '').toLowerCase();
      const artist = String(t.artist || '').toLowerCase();
      const album = String(t.album || '').toLowerCase();
      return title.includes(q) || artist.includes(q) || album.includes(q);
    });
  }

  sortTracks(tracks, column, ascending = true) {
    if (!tracks || !Array.isArray(tracks)) return [];
    if (!column) return tracks;
    const sorted = [...tracks];
    sorted.sort((a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;

      let valA = a[column];
      let valB = b[column];

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return ascending ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();

      return ascending
        ? strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' })
        : strB.localeCompare(strA, undefined, { numeric: true, sensitivity: 'base' });
    });
    return sorted;
  }

  // --- Export & Import ---
  exportToM3U8(playlist, tracks) {
    let content = '#EXTM3U\n';
    content += `#PLAYLIST:${playlist.name}\n\n`;

    tracks.forEach(t => {
      const dur = Math.round(t.duration || 0);
      content += `#EXTINF:${dur},${t.artist || 'Unknown'} - ${t.title || 'Unknown'}\n`;
      content += `${t.fileName || t.title + '.mp3'}\n\n`;
    });

    const blob = new Blob([content], { type: 'audio/x-mpegurl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playlist.name.replace(/[/\\?%*:|"<>]/g, '_')}.m3u8`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async exportFullBackup() {
    const allTracks = await db.getAllTracks();
    const allPlaylists = await db.getAllPlaylists();

    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      playlists: allPlaylists,
      tracks: allTracks.map(t => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        year: t.year,
        duration: t.duration,
        fileName: t.fileName,
        dateAdded: t.dateAdded,
        playCount: t.playCount
      }))
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pulsar_music_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const playlistManager = new PlaylistManager();
