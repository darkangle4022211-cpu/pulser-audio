const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const tmpPath = `${destPath}.tmp.${Date.now()}`;
    const file = fs.createWriteStream(tmpPath);

    function getWithRedirect(targetUrl, maxRedirects = 5) {
      if (maxRedirects <= 0) {
        file.close();
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        return reject(new Error('Too many redirects while downloading ' + url));
      }
      const client = targetUrl.startsWith('https') ? https : http;
      client.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0 PulsarBuild/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return getWithRedirect(res.headers.location, maxRedirects - 1);
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(tmpPath); } catch (_) {}
          return reject(new Error(`HTTP ${res.statusCode} downloading ${targetUrl}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(async () => {
            try {
              if (fs.existsSync(destPath)) {
                try { fs.unlinkSync(destPath); } catch (_) {}
              }
              fs.renameSync(tmpPath, destPath);
              resolve(destPath);
            } catch (e) {
              reject(e);
            }
          });
        });
      }).on('error', (err) => {
        file.close();
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        reject(err);
      });
    }

    getWithRedirect(url);
  });
}

async function prepareWindowsBinaries(rootDir) {
  const binWinDir = path.join(rootDir, 'bin', 'win');
  const binDir = path.join(rootDir, 'bin');
  fs.mkdirSync(binWinDir, { recursive: true });

  const ytdlpWinPath = path.join(binWinDir, 'yt-dlp.exe');
  const ffmpegWinPath = path.join(binWinDir, 'ffmpeg.exe');

  if (!fs.existsSync(ytdlpWinPath)) {
    console.log('[prepare_binaries] Downloading yt-dlp.exe for Windows...');
    await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', ytdlpWinPath);
    console.log('[prepare_binaries] Downloaded yt-dlp.exe successfully.');
  } else {
    console.log('[prepare_binaries] yt-dlp.exe already present.');
  }

  // Also ensure copy in bin/yt-dlp.exe
  const ytdlpRootBin = path.join(binDir, 'yt-dlp.exe');
  if (!fs.existsSync(ytdlpRootBin)) {
    try { fs.copyFileSync(ytdlpWinPath, ytdlpRootBin); } catch (_) {}
  }

  if (!fs.existsSync(ffmpegWinPath)) {
    console.log('[prepare_binaries] Downloading ffmpeg for Windows...');
    const zipPath = path.join(rootDir, 'ffmpeg-win.zip');
    const extractDir = path.join(rootDir, 'ffmpeg_win_extracted');
    await downloadFile('https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip', zipPath);

    console.log('[prepare_binaries] Extracting ffmpeg.exe...');
    fs.mkdirSync(extractDir, { recursive: true });
    try {
      execSync(`tar -xf "${zipPath}" -C "${extractDir}"`);
    } catch (_) {
      try {
        execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`);
      } catch (e) {
        console.warn('[prepare_binaries] Failed to extract ffmpeg zip via tar or powershell:', e.message);
      }
    }

    // Locate extracted ffmpeg.exe
    function findFileRecursive(dir, targetName) {
      if (!fs.existsSync(dir)) return null;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const res = findFileRecursive(full, targetName);
          if (res) return res;
        } else if (entry.name.toLowerCase() === targetName.toLowerCase()) {
          return full;
        }
      }
      return null;
    }

    const found = findFileRecursive(extractDir, 'ffmpeg.exe');
    if (found) {
      fs.copyFileSync(found, ffmpegWinPath);
      console.log('[prepare_binaries] Placed ffmpeg.exe into bin/win/ffmpeg.exe');
      const ffmpegRootBin = path.join(binDir, 'ffmpeg.exe');
      try { fs.copyFileSync(found, ffmpegRootBin); } catch (_) {}
    } else {
      console.warn('[prepare_binaries] Could not locate ffmpeg.exe in extracted archive');
    }

    try { fs.unlinkSync(zipPath); } catch (_) {}
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch (_) {}
  } else {
    console.log('[prepare_binaries] ffmpeg.exe already present.');
  }
}

async function prepareLinuxBinaries(rootDir) {
  const binDir = path.join(rootDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const ytdlpPath = path.join(binDir, 'yt-dlp');
  const ffmpegPath = path.join(binDir, 'ffmpeg');

  if (!fs.existsSync(ytdlpPath)) {
    console.log('[prepare_binaries] Downloading yt-dlp for Linux...');
    await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', ytdlpPath);
    try { fs.chmodSync(ytdlpPath, 0o755); } catch (_) {}
    console.log('[prepare_binaries] Downloaded yt-dlp for Linux successfully.');
  } else {
    console.log('[prepare_binaries] Linux yt-dlp already present.');
  }

  if (!fs.existsSync(ffmpegPath)) {
    if (fs.existsSync('/usr/bin/ffmpeg')) {
      console.log('[prepare_binaries] Copying /usr/bin/ffmpeg into bin/ffmpeg...');
      fs.copyFileSync('/usr/bin/ffmpeg', ffmpegPath);
      try { fs.chmodSync(ffmpegPath, 0o755); } catch (_) {}
    } else {
      console.log('[prepare_binaries] /usr/bin/ffmpeg not found locally. Skipping binary copy.');
    }
  } else {
    console.log('[prepare_binaries] Linux ffmpeg already present.');
  }
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  console.log('[prepare_binaries] Checking environment and pre-packaging binaries on platform:', process.platform);

  if (process.platform === 'win32') {
    await prepareWindowsBinaries(rootDir);
  } else if (process.platform === 'linux') {
    await prepareLinuxBinaries(rootDir);
  }

  console.log('[prepare_binaries] Binary preparation step completed.');
}

main().catch(err => {
  console.warn('[prepare_binaries] Non-fatal notice:', err.message);
  process.exit(0);
});
