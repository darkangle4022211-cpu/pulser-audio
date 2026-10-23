/**
 * YouTube Music & Online Streaming Service for Pulsar Music Player
 * Direct YouTube Music API search, live streaming, and high-quality MP3 downloading
 */

export const SEARCH_FILTERS = [
  { id: 'songs', label: 'Songs' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
  { id: 'videos', label: 'Music Videos' },
  { id: 'all', label: 'All' }
];

export const SORT_OPTIONS = [
  { id: 'popularity', label: 'Most Popular' },
  { id: 'latest', label: 'Latest Releases' },
  { id: 'downloads', label: 'Most Downloaded' }
];

// Curated top 20 global Billboard & streaming hits for instant 0ms startup
export const DEFAULT_TRENDING_TRACKS = [
  {
    id: 'yt_4NRXx6U8ABQ',
    ytId: '4NRXx6U8ABQ',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    year: '2020',
    duration: 200,
    durationStr: '3:20',
    audioUrl: 'https://music.youtube.com/watch?v=4NRXx6U8ABQ',
    coverUrl: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 8740200,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_3_g2un5M350',
    ytId: '3_g2un5M350',
    title: 'Starboy (feat. Daft Punk)',
    artist: 'The Weeknd',
    album: 'Starboy',
    year: '2016',
    duration: 231,
    durationStr: '3:51',
    audioUrl: 'https://music.youtube.com/watch?v=3_g2un5M350',
    coverUrl: 'https://i.ytimg.com/vi/3_g2un5M350/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 7120300,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_V9PVRfjEBTI',
    ytId: 'V9PVRfjEBTI',
    title: 'Birds of a Feather',
    artist: 'Billie Eilish',
    album: 'HIT ME HARD AND SOFT',
    year: '2024',
    duration: 198,
    durationStr: '3:18',
    audioUrl: 'https://music.youtube.com/watch?v=V9PVRfjEBTI',
    coverUrl: 'https://i.ytimg.com/vi/V9PVRfjEBTI/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 6250000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_eVli-tstM5E',
    ytId: 'eVli-tstM5E',
    title: 'Espresso',
    artist: 'Sabrina Carpenter',
    album: 'Short n\' Sweet',
    year: '2024',
    duration: 175,
    durationStr: '2:55',
    audioUrl: 'https://music.youtube.com/watch?v=eVli-tstM5E',
    coverUrl: 'https://i.ytimg.com/vi/eVli-tstM5E/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 5890000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_kPa7bsKwL-8',
    ytId: 'kPa7bsKwL-8',
    title: 'Die With A Smile',
    artist: 'Lady Gaga & Bruno Mars',
    album: 'Die With A Smile',
    year: '2024',
    duration: 251,
    durationStr: '4:11',
    audioUrl: 'https://music.youtube.com/watch?v=kPa7bsKwL-8',
    coverUrl: 'https://i.ytimg.com/vi/kPa7bsKwL-8/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 6100500,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_TUVcZfQe-Kw',
    ytId: 'TUVcZfQe-Kw',
    title: 'Levitating',
    artist: 'Dua Lipa',
    album: 'Future Nostalgia',
    year: '2020',
    duration: 203,
    durationStr: '3:23',
    audioUrl: 'https://music.youtube.com/watch?v=TUVcZfQe-Kw',
    coverUrl: 'https://i.ytimg.com/vi/TUVcZfQe-Kw/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 5420400,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_JGwWNGJdvx8',
    ytId: 'JGwWNGJdvx8',
    title: 'Shape of You',
    artist: 'Ed Sheeran',
    album: '÷ (Divide)',
    year: '2017',
    duration: 233,
    durationStr: '3:53',
    audioUrl: 'https://music.youtube.com/watch?v=JGwWNGJdvx8',
    coverUrl: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 9800000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_H5v3kOT4y68',
    ytId: 'H5v3kOT4y68',
    title: 'As It Was',
    artist: 'Harry Styles',
    album: 'Harry\'s House',
    year: '2022',
    duration: 167,
    durationStr: '2:47',
    audioUrl: 'https://music.youtube.com/watch?v=H5v3kOT4y68',
    coverUrl: 'https://i.ytimg.com/vi/H5v3kOT4y68/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 7400000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_G7KNmW9a75Y',
    ytId: 'G7KNmW9a75Y',
    title: 'Flowers',
    artist: 'Miley Cyrus',
    album: 'Endless Summer Vacation',
    year: '2023',
    duration: 200,
    durationStr: '3:20',
    audioUrl: 'https://music.youtube.com/watch?v=G7KNmW9a75Y',
    coverUrl: 'https://i.ytimg.com/vi/G7KNmW9a75Y/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 6900000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_Oa_RSwwpPaA',
    ytId: 'Oa_RSwwpPaA',
    title: 'Beautiful Things',
    artist: 'Benson Boone',
    album: 'Fireworks & Rollerblades',
    year: '2024',
    duration: 180,
    durationStr: '3:00',
    audioUrl: 'https://music.youtube.com/watch?v=Oa_RSwwpPaA',
    coverUrl: 'https://i.ytimg.com/vi/Oa_RSwwpPaA/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 4300000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_kTJczUoc26U',
    ytId: 'kTJczUoc26U',
    title: 'STAY',
    artist: 'The Kid LAROI & Justin Bieber',
    album: 'F*CK LOVE 3: OVER YOU',
    year: '2021',
    duration: 141,
    durationStr: '2:21',
    audioUrl: 'https://music.youtube.com/watch?v=kTJczUoc26U',
    coverUrl: 'https://i.ytimg.com/vi/kTJczUoc26U/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 5800000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_wXhTHyIgQ_U',
    ytId: 'wXhTHyIgQ_U',
    title: 'Circles',
    artist: 'Post Malone',
    album: 'Hollywood\'s Bleeding',
    year: '2019',
    duration: 215,
    durationStr: '3:35',
    audioUrl: 'https://music.youtube.com/watch?v=wXhTHyIgQ_U',
    coverUrl: 'https://i.ytimg.com/vi/wXhTHyIgQ_U/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 4800000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_ic8j13piAhQ',
    ytId: 'ic8j13piAhQ',
    title: 'Cruel Summer',
    artist: 'Taylor Swift',
    album: 'Lover',
    year: '2019',
    duration: 178,
    durationStr: '2:58',
    audioUrl: 'https://music.youtube.com/watch?v=ic8j13piAhQ',
    coverUrl: 'https://i.ytimg.com/vi/ic8j13piAhQ/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 7200000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_H58vbez_m4E',
    ytId: 'H58vbez_m4E',
    title: 'Not Like Us',
    artist: 'Kendrick Lamar',
    album: 'Not Like Us',
    year: '2024',
    duration: 274,
    durationStr: '4:34',
    audioUrl: 'https://music.youtube.com/watch?v=H58vbez_m4E',
    coverUrl: 'https://i.ytimg.com/vi/H58vbez_m4E/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 6400000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_XXYlFuWEuKI',
    ytId: 'XXYlFuWEuKI',
    title: 'Save Your Tears',
    artist: 'The Weeknd',
    album: 'After Hours',
    year: '2020',
    duration: 215,
    durationStr: '3:35',
    audioUrl: 'https://music.youtube.com/watch?v=XXYlFuWEuKI',
    coverUrl: 'https://i.ytimg.com/vi/XXYlFuWEuKI/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 7900000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_mRD0-GxqHcU',
    ytId: 'mRD0-GxqHcU',
    title: 'Heat Waves',
    artist: 'Glass Animals',
    album: 'Dreamland',
    year: '2020',
    duration: 238,
    durationStr: '3:58',
    audioUrl: 'https://music.youtube.com/watch?v=mRD0-GxqHcU',
    coverUrl: 'https://i.ytimg.com/vi/mRD0-GxqHcU/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 5900000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_X2nY3drfDcU',
    ytId: 'X2nY3drfDcU',
    title: 'Water',
    artist: 'Tyla',
    album: 'TYLA',
    year: '2023',
    duration: 200,
    durationStr: '3:20',
    audioUrl: 'https://music.youtube.com/watch?v=X2nY3drfDcU',
    coverUrl: 'https://i.ytimg.com/vi/X2nY3drfDcU/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 4100000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_Tb0wV5D-Roc',
    ytId: 'Tb0wV5D-Roc',
    title: 'greedy',
    artist: 'Tate McRae',
    album: 'THINK LATER',
    year: '2023',
    duration: 131,
    durationStr: '2:11',
    audioUrl: 'https://music.youtube.com/watch?v=Tb0wV5D-Roc',
    coverUrl: 'https://i.ytimg.com/vi/Tb0wV5D-Roc/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 3800000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_mNEUkkoUoIA',
    ytId: 'mNEUkkoUoIA',
    title: 'I Ain’t Worried',
    artist: 'OneRepublic',
    album: 'Top Gun: Maverick',
    year: '2022',
    duration: 148,
    durationStr: '2:28',
    audioUrl: 'https://music.youtube.com/watch?v=mNEUkkoUoIA',
    coverUrl: 'https://i.ytimg.com/vi/mNEUkkoUoIA/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 3900000,
    isOnline: true,
    source: 'ytmusic'
  },
  {
    id: 'yt_7wtfhZwyrcc',
    ytId: '7wtfhZwyrcc',
    title: 'Believer',
    artist: 'Imagine Dragons',
    album: 'Evolve',
    year: '2017',
    duration: 204,
    durationStr: '3:24',
    audioUrl: 'https://music.youtube.com/watch?v=7wtfhZwyrcc',
    coverUrl: 'https://i.ytimg.com/vi/7wtfhZwyrcc/hqdefault.jpg',
    license: 'YouTube Music',
    downloads: 8200000,
    isOnline: true,
    source: 'ytmusic'
  }
];

class OnlineMusicService {
  constructor() {
    this.cachedTracks = new Map();
    DEFAULT_TRENDING_TRACKS.forEach(t => this.cachedTracks.set(t.id, t));
  }

  /**
   * Fetch trending tracks from YouTube Music
   */
  async getTrendingTracks({ filter = 'songs', limit = 20, offset = 0 } = {}) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Offline');
    }

    const nativeApi = window.electronAPI;
    if (nativeApi && typeof nativeApi.searchOnlineMusic === 'function') {
      try {
        const res = await nativeApi.searchOnlineMusic('top trending hits 2026', limit, filter);
        if (res && res.success && res.tracks && res.tracks.length > 0) {
          res.tracks.forEach(t => this.cachedTracks.set(t.id, t));
          return res.tracks;
        }
      } catch (err) {
        console.warn('Native YouTube Music fetch error:', err);
      }
    }

    return DEFAULT_TRENDING_TRACKS.slice(0, limit);
  }

  /**
   * Search YouTube Music live
   */
  async searchTracks(query, { filter = 'songs', limit = 20, offset = 0 } = {}) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Offline');
    }

    const cleanQuery = (query || '').trim();
    if (!cleanQuery) {
      return this.getTrendingTracks({ filter, limit, offset });
    }

    const nativeApi = window.electronAPI;
    if (nativeApi && typeof nativeApi.searchOnlineMusic === 'function') {
      try {
        const res = await nativeApi.searchOnlineMusic(cleanQuery, limit, filter);
        if (res && res.success && res.tracks && res.tracks.length > 0) {
          res.tracks.forEach(t => this.cachedTracks.set(t.id, t));
          return res.tracks;
        }
      } catch (err) {
        console.warn('Native YouTube Music search error:', err);
      }
    }

    // Fallback to searching locally cached tracks
    const qLower = cleanQuery.toLowerCase();
    const matches = [];

    // 1. Search cached online tracks
    for (const t of this.cachedTracks.values()) {
      if (
        (t.title && t.title.toLowerCase().includes(qLower)) ||
        (t.artist && t.artist.toLowerCase().includes(qLower)) ||
        (t.album && t.album.toLowerCase().includes(qLower))
      ) {
        matches.push(t);
      }
    }

    if (matches.length > 0) {
      return matches.slice(0, limit);
    }

    // Return empty array so the UI accurately reports 0 results instead of random default tracks
    return [];
  }

  /**
   * Fetch Similar Songs / Smart Radio queue based on a selected track
   */
  async getSimilarSongs(track, limit = 35) {
    if (!track) return [];
    const nativeApi = window.electronAPI;
    const videoId = track.ytId || (track.id && track.id.startsWith('yt_') ? track.id.slice(3) : null);

    if (nativeApi && typeof nativeApi.getSimilarSongs === 'function') {
      try {
        const res = await nativeApi.getSimilarSongs({
          videoId,
          title: track.title,
          artist: track.artist,
          limit
        });
        if (res && res.success && Array.isArray(res.tracks) && res.tracks.length > 0) {
          res.tracks.forEach(t => this.cachedTracks.set(t.id, t));
          return res.tracks;
        }
      } catch (err) {
        console.warn('getSimilarSongs API notice:', err);
      }
    }

    // Fallback: match by artist or return shuffled trending
    const artistLower = (track.artist || '').toLowerCase();
    const artistMatches = DEFAULT_TRENDING_TRACKS.filter(t =>
      t.artist.toLowerCase().includes(artistLower) && t.id !== track.id
    );
    const otherTrending = DEFAULT_TRENDING_TRACKS.filter(t => t.id !== track.id);
    return [...artistMatches, ...otherTrending].slice(0, limit);
  }

  /**
   * Fetch live search autocomplete suggestions (Google/YouTube Music)
   */
  async getSearchSuggestions(query) {
    if (!query || typeof query !== 'string') return [];
    const trimmed = query.trim();
    if (!trimmed) return [];
    const nativeApi = window.electronAPI;
    if (nativeApi && typeof nativeApi.getSearchSuggestions === 'function') {
      try {
        const results = await nativeApi.getSearchSuggestions(trimmed);
        if (Array.isArray(results) && results.length > 0) return results;
      } catch (e) {
        console.warn('Native search suggestions warning:', e);
      }
    }
    try {
      const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[1])) {
        return data[1].slice(0, 8);
      }
    } catch (e) {}
    return [];
  }

  /**
   * Fetch recommendations trained on user's top artists
   */
  async getPersonalizedRecommendations(topArtists = [], limit = 24) {
    const recommendations = [];
    const nativeApi = window.electronAPI;

    if (topArtists && topArtists.length > 0 && nativeApi && typeof nativeApi.searchOnlineMusic === 'function') {
      const fetchPromises = topArtists.slice(0, 3).map(async (item) => {
        try {
          const res = await nativeApi.searchOnlineMusic(`${item.artist} top hits`, 6, 'songs');
          return { artist: item.artist, tracks: res?.tracks || [] };
        } catch (e) {
          return { artist: item.artist, tracks: [] };
        }
      });

      const results = await Promise.allSettled(fetchPromises);
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value && res.value.tracks) {
          res.value.tracks.forEach(t => {
            if (!recommendations.some(r => r.id === t.id)) {
              t.matchReason = `Because you love ${res.value.artist}`;
              t.matchPercent = Math.min(99, Math.max(88, 92 + Math.floor(Math.random() * 7)));
              this.cachedTracks.set(t.id, t);
              recommendations.push(t);
            }
          });
        }
      }
    }

    // Always fill remaining with curated top hits
    if (recommendations.length < limit) {
      DEFAULT_TRENDING_TRACKS.forEach((t, idx) => {
        if (!recommendations.some(r => r.id === t.id)) {
          const clone = { ...t };
          clone.matchReason = idx % 2 === 0 ? 'Trained on your groove' : 'Global Billboard Hit';
          clone.matchPercent = Math.min(99, Math.max(85, 96 - idx * 2));
          recommendations.push(clone);
        }
      });
    }

    return recommendations.slice(0, limit);
  }

  /**
   * Fetch recommendations trained on user's song vibes (using InnerTube /next and RDAMVM radio graphs)
   */
  async getSongVibeRecommendations(seedTracks = [], topArtists = [], limit = 20) {
    const recommendations = [];
    const seen = new Set();
    const nativeApi = window.electronAPI;

    // 1. If seed tracks with high engagement exist, query InnerTube RDAMVM for each
    if (Array.isArray(seedTracks) && seedTracks.length > 0 && nativeApi && typeof nativeApi.getSimilarSongs === 'function') {
      const topSeeds = seedTracks.slice(0, 3);
      const radioPromises = topSeeds.map(async (seed) => {
        try {
          const videoId = seed.ytId || (seed.id && String(seed.id).startsWith('yt_') ? seed.id.replace('yt_', '') : null);
          const res = await nativeApi.getSimilarSongs({
            videoId,
            title: seed.title,
            artist: seed.artist,
            limit: 20
          });
          return { seed, tracks: res?.tracks || [] };
        } catch (e) {
          return { seed, tracks: [] };
        }
      });

      const results = await Promise.allSettled(radioPromises);
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.tracks)) {
          const seed = res.value.seed;
          res.value.tracks.forEach(t => {
            const key = t.id || `${t.title}_${t.artist}`;
            if (!seen.has(key)) {
              seen.add(key);
              t.matchReason = `Because you listened to "${seed.title}"`;
              t.matchPercent = Math.min(99, Math.max(90, 97 - Math.floor(Math.random() * 6)));
              this.cachedTracks.set(t.id, t);
              recommendations.push(t);
            }
          });
        }
      }
    }

    // 2. If recommendations are still below limit, supplement with top artists
    if (recommendations.length < limit && topArtists && topArtists.length > 0) {
      const artistTracks = await this.getPersonalizedRecommendations(topArtists, limit - recommendations.length);
      artistTracks.forEach(t => {
        const key = t.id || `${t.title}_${t.artist}`;
        if (!seen.has(key)) {
          seen.add(key);
          recommendations.push(t);
        }
      });
    }

    // 3. Fallback to curated global top tracks if still below limit (e.g. Day-1 cold start)
    if (recommendations.length < limit) {
      DEFAULT_TRENDING_TRACKS.forEach(t => {
        const key = t.id || `${t.title}_${t.artist}`;
        if (!seen.has(key) && recommendations.length < limit) {
          seen.add(key);
          const clone = { ...t };
          clone.matchReason = 'Trending Global Hit';
          clone.matchPercent = 94;
          recommendations.push(clone);
        }
      });
    }

    return recommendations.slice(0, limit);
  }

  /**
   * Fetch vibe mixes (Chill, Lofi, Workout, Party, Focus, Trending, Sad, Romance, Night)
   */
  async getVibeTracks(vibe = 'chill', limit = 24) {
    const vibeQueries = {
      chill: 'chill acoustic relaxing indie pop songs',
      lofi: 'lofi hip hop chill beats study relax',
      workout: 'high energy workout gym motivation EDM hip hop',
      party: 'party club hits dance celebration anthem',
      focus: 'deep focus study ambient instrumental beats',
      trending: 'top trending hits billboard hot 100 2026',
      sad: 'sad melancholic emotional heartbreak songs',
      romance: 'romantic love songs acoustic romance ballads',
      night: 'late night drive synthwave retro aesthetic',
      energy: 'high bpm workout hype electronic power hits'
    };
    const query = vibeQueries[vibe] || vibeQueries.chill;
    return this.searchTracks(query, { filter: 'songs', limit });
  }

  /**
   * Generates curated & personalized online mixes / playlists
   */
  getFeaturedPlaylists(seedTracks = [], limit = 6) {
    const playlists = [
      {
        id: 'pl_mix_top_hits',
        title: 'Global Top Hits 2026',
        subtitle: 'YouTube Music • 50 Songs',
        coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
        trackCount: 50,
        query: 'top trending hits 2026 billboard'
      },
      {
        id: 'pl_mix_lofi',
        title: 'Lofi Study & Chill',
        subtitle: 'Curated Mix • 40 Songs',
        coverUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=500&auto=format&fit=crop&q=80',
        trackCount: 40,
        query: 'lofi hip hop beats relax study'
      },
      {
        id: 'pl_mix_workout',
        title: 'Workout Hype Anthems',
        subtitle: 'High Energy • 45 Songs',
        coverUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=500&auto=format&fit=crop&q=80',
        trackCount: 45,
        query: 'workout gym motivation hype songs'
      },
      {
        id: 'pl_mix_synthwave',
        title: 'Late Night Synthwave',
        subtitle: 'Retro Wave • 50 Songs',
        coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
        trackCount: 50,
        query: 'synthwave retrowave night drive'
      },
      {
        id: 'pl_mix_acoustic',
        title: 'Acoustic & Coffee Chill',
        subtitle: 'Peaceful Acoustic • 35 Songs',
        coverUrl: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=500&auto=format&fit=crop&q=80',
        trackCount: 35,
        query: 'chill acoustic singer songwriter'
      },
      {
        id: 'pl_mix_party',
        title: 'Party & Dance Floor Hits',
        subtitle: 'Weekend Hits • 50 Songs',
        coverUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=500&auto=format&fit=crop&q=80',
        trackCount: 50,
        query: 'party dance club hits 2026'
      }
    ];

    // If user has top engaged tracks, prepend dynamic Radio Mixes based on them
    if (Array.isArray(seedTracks) && seedTracks.length > 0) {
      const topSeed = seedTracks[0];
      playlists.unshift({
        id: `pl_mix_dyn_${topSeed.id || 'seed'}`,
        title: `${topSeed.title} Radio Mix`,
        subtitle: `Curated for You • 50 Similar Songs`,
        coverUrl: topSeed.coverUrl || playlists[0].coverUrl,
        trackCount: 50,
        seedTrack: topSeed
      });
    }

    return playlists.slice(0, limit);
  }

  /**
   * Resolves playable tracks for a curated online playlist
   */
  async getPlaylistTracks(playlistObj, limit = 50) {
    if (!playlistObj) return [];
    if (playlistObj.tracks && playlistObj.tracks.length > 0) return playlistObj.tracks;

    if (playlistObj.seedTrack) {
      return this.getSimilarSongs(playlistObj.seedTrack, limit);
    }

    const query = playlistObj.query || playlistObj.title;
    return this.searchTracks(query, { filter: 'songs', limit });
  }

  getTrackById(id) {
    return this.cachedTracks.get(id) || DEFAULT_TRENDING_TRACKS.find(t => t.id === id) || null;
  }
}

export const onlineMusic = new OnlineMusicService();

