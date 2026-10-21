import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const REPO = "darkangle4022211-cpu/pulser-audio";
const TAG = "v1.1.0";
const RELEASE_NAME = "v1.1.0 - Windows & Linux Production Release";
const RELEASE_BODY = `### Pulsar Music Player v1.1.0 Production Release

#### 🚀 What's New:
- **Windows (.exe) Full Support:** Complete native Windows installer and portable standalone executables.
- **Bundled Standalone Windows Binaries:** Includes standalone \`yt-dlp.exe\` and \`ffmpeg.exe\` (0 Python or external setup needed on Windows).
- **Fast Native InnerTube Stream Resolver (~300ms):** Zero external processes required for direct audio playback.
- **Linux & Windows Cross-Platform Audio:** Robust offline playback and custom protocol handling for Windows drive letters (\`C:\\...\`) and Linux paths.
- **10-Band EQ & 60FPS Audio Visualizer:** High-fidelity hardware-accelerated audio processing.

#### 📦 Downloads:
- **Windows Installer:** \`Pulsar Music Player Setup 1.1.0.exe\`
- **Windows Standalone Portable:** \`Pulsar Music Player Portable 1.1.0.exe\`
- **Linux Debian Package:** \`pulsar-music-player_1.1.0_amd64.deb\`
`;

function githubRequest(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const headers = {
      'User-Agent': 'PulsarAudio-Uploader',
      'Authorization': `Bearer ${TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      ...(options.headers || {})
    };

    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: options.method || (data ? 'POST' : 'GET'),
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      if (Buffer.isBuffer(data) || typeof data === 'string') {
        req.write(data);
      }
    }
    req.end();
  });
}

function uploadAssetStream(uploadUrlTemplate, filePath, assetName) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const cleanUploadUrl = uploadUrlTemplate.replace(/\{(\?.*)?\}$/, '');
    const uploadUrl = `${cleanUploadUrl}?name=${encodeURIComponent(assetName)}`;
    const parsed = new URL(uploadUrl);

    console.log(`\nUploading ${assetName} (${(fileSize / (1024 * 1024)).toFixed(1)} MB)...`);

    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'User-Agent': 'PulsarAudio-Uploader',
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileSize
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ Uploaded ${assetName} successfully!`);
            resolve(json);
          } else {
            console.error(`❌ Upload failed with status ${res.statusCode}:`, json);
            reject(new Error(`Upload failed: ${res.statusCode} - ${JSON.stringify(json)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      console.error(`Network error during upload of ${assetName}:`, err.message);
      reject(err);
    });

    let uploaded = 0;
    let lastPercent = 0;
    const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });

    stream.on('data', (chunk) => {
      uploaded += chunk.length;
      const percent = Math.floor((uploaded / fileSize) * 100);
      if (percent >= lastPercent + 10 || percent === 100) {
        process.stdout.write(`  Progress: ${percent}% (${(uploaded / (1024 * 1024)).toFixed(1)} / ${(fileSize / (1024 * 1024)).toFixed(1)} MB)\r`);
        lastPercent = percent;
      }
    });

    stream.pipe(req);
  });
}

async function main() {
  console.log(`=== Creating or Retrieving Release ${TAG} on ${REPO} ===`);

  // Check if release already exists
  const releasesRes = await githubRequest(`https://api.github.com/repos/${REPO}/releases`);
  let release = null;
  if (Array.isArray(releasesRes.body)) {
    release = releasesRes.body.find(r => r.tag_name === TAG);
  }

  if (release) {
    console.log(`Found existing release ${TAG} (ID: ${release.id})`);
  } else {
    console.log(`Creating new release ${TAG}...`);
    const createRes = await githubRequest(`https://api.github.com/repos/${REPO}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      tag_name: TAG,
      target_commitish: 'main',
      name: RELEASE_NAME,
      body: RELEASE_BODY,
      draft: false,
      prerelease: false
    }));

    if (createRes.status !== 201 && createRes.status !== 200) {
      throw new Error(`Failed to create release: ${createRes.status} - ${JSON.stringify(createRes.body)}`);
    }
    release = createRes.body;
    console.log(`✅ Created release ${TAG} (ID: ${release.id})`);
  }

  const existingAssets = release.assets || [];
  console.log(`Existing assets in release: ${existingAssets.map(a => a.name).join(', ') || 'None'}`);

  // Assets to upload
  const assets = [
    {
      name: 'Pulsar Music Player Setup 1.1.0.exe',
      path: path.join(projectRoot, 'dist-electron', 'Pulsar Music Player Setup 1.1.0.exe')
    },
    {
      name: 'Pulsar Music Player Portable 1.1.0.exe',
      path: path.join(projectRoot, 'dist-electron', 'Pulsar Music Player Portable 1.1.0.exe')
    },
    {
      name: 'pulsar-music-player_1.1.0_amd64.deb',
      path: path.join(projectRoot, 'dist-electron', 'pulsar-music-player_1.1.0_amd64.deb')
    },
    {
      name: 'update.json',
      path: path.join(projectRoot, 'update.json')
    }
  ];

  const results = [];

  for (const asset of assets) {
    if (!fs.existsSync(asset.path)) {
      console.warn(`File not found: ${asset.path}, skipping...`);
      continue;
    }

    // Check if asset already uploaded
    const existing = existingAssets.find(a => a.name === asset.name);
    if (existing) {
      console.log(`Asset ${asset.name} already exists (ID: ${existing.id}). Deleting old asset first...`);
      await githubRequest(`https://api.github.com/repos/${REPO}/releases/assets/${existing.id}`, {
        method: 'DELETE'
      });
      console.log(`Deleted old asset ${existing.id}`);
    }

    try {
      const uploadRes = await uploadAssetStream(release.upload_url, asset.path, asset.name);
      results.push({
        name: asset.name,
        downloadUrl: uploadRes.browser_download_url,
        size: uploadRes.size
      });
    } catch (err) {
      console.error(`Failed to upload ${asset.name}:`, err.message);
    }
  }

  console.log('\n================================================================');
  console.log('              ALL ASSETS SUCCESSFULLY PUBLISHED TO GITHUB!       ');
  console.log('================================================================');
  for (const r of results) {
    console.log(`🔗 ${r.name} (${(r.size / (1024 * 1024)).toFixed(1)} MB):`);
    console.log(`   ${r.downloadUrl}\n`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
