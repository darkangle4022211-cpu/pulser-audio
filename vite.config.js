import { defineConfig } from 'vite';
import http from 'http';
import https from 'https';
import { execFile } from 'child_process';
import path from 'path';

const ytdlpPath = path.resolve('bin/yt-dlp');
const streamCache = new Map();

function resolveStreamWithYtDlp(videoIdOrUrl) {
  return new Promise((resolve) => {
    let clean = String(videoIdOrUrl || '').trim();
    if (clean.includes('v=')) {
      const m = clean.match(/v=([a-zA-Z0-9_-]{11})/);
      if (m) clean = m[1];
    } else if (clean.includes('youtu.be/')) {
      const m = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (m) clean = m[1];
    } else if (clean.startsWith('yt_')) {
      clean = clean.slice(3);
    }

    const rawUrl = clean.startsWith('http') ? clean : `https://www.youtube.com/watch?v=${clean}`;
    const targetUrl = rawUrl.replace('music.youtube.com', 'www.youtube.com');

    if (streamCache.has(targetUrl)) {
      return resolve({ success: true, streamUrl: streamCache.get(targetUrl) });
    }
    if (streamCache.has(clean)) {
      return resolve({ success: true, streamUrl: streamCache.get(clean) });
    }

    const args = [
      '-g',
      '-f', '140/251/ba/18/b',
      '--extractor-args', 'youtube:player_client=android',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--socket-timeout', '10',
      targetUrl
    ];

    execFile(ytdlpPath, args, { timeout: 25000 }, (err, stdout, stderr) => {
      if (err || !stdout || !stdout.trim()) {
        console.warn('[ViteDevBridge] yt-dlp error:', err ? err.message : stderr);
        return resolve({ success: false, error: err ? err.message : 'No stream found' });
      }
      const lines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
      if (lines.length > 0) {
        streamCache.set(targetUrl, lines[0]);
        streamCache.set(clean, lines[0]);
        streamCache.set(`yt_${clean}`, lines[0]);
        streamCache.set(videoIdOrUrl, lines[0]);
        resolve({ success: true, streamUrl: lines[0] });
      } else {
        resolve({ success: false, error: 'No streaming URL found in stdout' });
      }
    });
  });
}

function streamRemoteUrl(targetUrl, headers, res, onResponseHeaders) {
  const clientModule = targetUrl.startsWith('https') ? https : http;
  const remoteReq = clientModule.request(targetUrl, { method: 'GET', headers }, (remoteRes) => {
    // Handle redirect
    if ((remoteRes.statusCode === 301 || remoteRes.statusCode === 302 || remoteRes.statusCode === 307) && remoteRes.headers.location) {
      return streamRemoteUrl(remoteRes.headers.location, headers, res, onResponseHeaders);
    }

    const respHeaders = onResponseHeaders ? onResponseHeaders(remoteRes) : {};
    if (!res.headersSent) {
      res.writeHead(remoteRes.statusCode || 200, respHeaders);
    }
    remoteRes.pipe(res);
  });

  remoteReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Access-Control-Allow-Origin': '*' });
      res.end(err.message);
    }
  });

  return remoteReq;
}

function pulsarDevBridgePlugin() {
  return {
    name: 'pulsar-dev-bridge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const parsed = new URL(req.url, `http://${req.headers.host || '127.0.0.1:5173'}`);

        // 1. Stream resolution
        if (parsed.pathname === '/__pulsar/stream') {
          const id = parsed.searchParams.get('id') || parsed.searchParams.get('url') || '';
          if (!id) {
            res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ success: false, error: 'Missing id or url parameter' }));
          }

          const resolved = await resolveStreamWithYtDlp(id);
          if (resolved.success && resolved.streamUrl) {
            const proxiedUrl = `/__pulsar/proxy?url=${encodeURIComponent(resolved.streamUrl)}`;
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ success: true, streamUrl: proxiedUrl, directUrl: resolved.streamUrl }));
          }

          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify(resolved));
        }

        // 2. Audio Stream Range-enabled Proxy (supports Seeking & Audio Web API without CORS taint)
        if (parsed.pathname === '/__pulsar/proxy') {
          const remoteUrl = parsed.searchParams.get('url');
          if (!remoteUrl) {
            res.writeHead(400, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            return res.end('Missing remote url');
          }

          const forwardHeaders = {
            'User-Agent': 'com.google.android.youtube/19.45.38 (Linux; U; Android 14; Pixel 8 Pro) gzip'
          };
          if (req.headers.range) {
            forwardHeaders.range = req.headers.range;
          }

          const remoteReq = streamRemoteUrl(remoteUrl, forwardHeaders, res, (remoteRes) => {
            const h = {
              'Content-Type': remoteRes.headers['content-type'] || 'audio/mp4',
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Range, Content-Type',
              'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
            };
            if (remoteRes.headers['content-length']) h['Content-Length'] = remoteRes.headers['content-length'];
            if (remoteRes.headers['content-range']) h['Content-Range'] = remoteRes.headers['content-range'];
            return h;
          });

          req.on('close', () => remoteReq.destroy());
          return remoteReq.end();
        }

        // 3. Audio Download Attachment endpoint
        if (parsed.pathname === '/__pulsar/download') {
          const id = parsed.searchParams.get('id') || parsed.searchParams.get('url') || '';
          const title = parsed.searchParams.get('title') || 'Song';
          const artist = parsed.searchParams.get('artist') || 'Unknown';
          const safeFilename = `${artist} - ${title}.m4a`.replace(/[\\/:*?"<>|]/g, '_');

          const resolved = await resolveStreamWithYtDlp(id);
          if (!resolved.success || !resolved.streamUrl) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ success: false, error: 'Could not resolve audio stream' }));
          }

          const forwardHeaders = {
            'User-Agent': 'com.google.android.youtube/19.45.38 (Linux; U; Android 14; Pixel 8 Pro) gzip'
          };
          const remoteReq = streamRemoteUrl(resolved.streamUrl, forwardHeaders, res, (remoteRes) => {
            const h = {
              'Content-Type': remoteRes.headers['content-type'] || 'audio/mp4',
              'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFilename)}"`,
              'Access-Control-Allow-Origin': '*'
            };
            if (remoteRes.headers['content-length']) h['Content-Length'] = remoteRes.headers['content-length'];
            return h;
          });

          req.on('close', () => remoteReq.destroy());
          return remoteReq.end();
        }

        // 4. Live Autocomplete Suggestions endpoint
        if (parsed.pathname === '/__pulsar/suggest') {
          const q = parsed.searchParams.get('q') || '';
          if (!q.trim()) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify([]));
          }

          try {
            const gUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q.trim())}`;
            const gRes = await fetch(gUrl);
            const gData = await gRes.json();
            const suggestions = Array.isArray(gData) && Array.isArray(gData[1]) ? gData[1].slice(0, 10) : [];
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify(suggestions));
          } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify([]));
          }
        }

        // 5. YouTube Music Search Proxy endpoint
        if (parsed.pathname === '/__pulsar/search') {
          const q = parsed.searchParams.get('q') || '';
          const limit = Math.min(Math.max(Number(parsed.searchParams.get('limit')) || 24, 5), 40);
          const filter = parsed.searchParams.get('filter') || 'songs';

          const paramsMap = {
            songs: 'EgWKAQIIAWoSEAQQAxAJEAoQBRAVEBEQDhAQ',
            albums: 'EgWKAQIYAWoSEAQQAxAJEAoQBRAVEBEQDhAQ',
            artists: 'EgWKAQIgAWoSEAQQAxAJEAoQBRAVEBEQDhAQ'
          };
          const postBody = {
            context: {
              client: {
                clientName: 'WEB_REMIX',
                clientVersion: '1.20240101.01.00',
                hl: 'en',
                gl: 'US'
              }
            },
            query: q.trim() || 'trending top hits 2026',
            params: paramsMap[filter] || paramsMap.songs
          };

          try {
            const searchRes = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(postBody)
            });
            const searchData = await searchRes.json();
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify(searchData));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ error: e.message }));
          }
        }

        next();
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [
    pulsarDevBridgePlugin()
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: false,
    host: '127.0.0.1'
  }
});

