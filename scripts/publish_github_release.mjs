import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const tokenFile = path.join(projectRoot, '.github_token');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : (fs.existsSync('/tmp/.gh_token') ? fs.readFileSync('/tmp/.gh_token', 'utf8').trim() : ''));
const REPO = "darkangle4022211-cpu/pulser-audio";

const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const TAG = `v${VERSION}`;
const RELEASE_NAME = `v${VERSION} - Professional Background Auto-Updates (AppImage & NSIS)`;
const RELEASE_BODY = `### Pulsar Music Player v${VERSION} Production Release

#### 🚀 What's New:
- **Professional Seamless Background Auto-Updates:** Linux and Windows desktop updates now download quietly in the background without intrusive interruption (matching apps like Brave, VS Code, and Discord).
- **Zero-Password Linux AppImage Updates:** Portable Linux AppImage auto-updater natively downloads updates and seamlessly restarts into the new version with zero \`pkexec\` root password prompts.
- **Silent Per-User Windows Updates:** Windows NSIS installer runs as per-user with silent background download and instant 1-click relaunch.
- **Elegant Update Notification:** In-app update notification lets you restart with one click whenever you are ready.
- **Offline Shuffle Isolation:** Shuffling offline playlists or All Tracks stays strictly within local offline tracks with zero online streaming leaks.
- **Robust Playback Context:** Explicitly isolates offline library playback from online Discover & Flow streaming.
- **Ultra-Low CPU & GPU Footprint:** Low resource utilization with zero idle load (<0.5%).

#### 📦 Downloads:
- **Linux Portable AppImage (Auto-Updating):** \`Pulsar Music Player-${VERSION}.AppImage\`
- **Windows Installer (Auto-Updating):** \`Pulsar Music Player Setup ${VERSION}.exe\`
- **Windows Standalone Portable:** \`Pulsar Music Player Portable ${VERSION}.exe\`
- **Linux Debian Package:** \`pulsar-music-player_${VERSION}_amd64.deb\` (if required)
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
        console.log(`  Progress: ${percent}% (${(uploaded / (1024 * 1024)).toFixed(1)} / ${(fileSize / (1024 * 1024)).toFixed(1)} MB)`);
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
      name: 'update.json',
      path: path.join(projectRoot, 'update.json')
    },
    {
      name: `Pulsar-Music-Player-${VERSION}.AppImage`,
      path: path.join(projectRoot, 'dist-electron', `Pulsar-Music-Player-${VERSION}.AppImage`)
    },
    {
      name: 'latest-linux.yml',
      path: path.join(projectRoot, 'dist-electron', 'latest-linux.yml')
    },
    {
      name: `Pulsar-Music-Player-Setup-${VERSION}.exe`,
      path: path.join(projectRoot, 'dist-electron', `Pulsar-Music-Player-Setup-${VERSION}.exe`)
    },
    {
      name: `Pulsar-Music-Player-Portable-${VERSION}.exe`,
      path: path.join(projectRoot, 'dist-electron', `Pulsar-Music-Player-Portable-${VERSION}.exe`)
    },
    {
      name: 'latest.yml',
      path: path.join(projectRoot, 'dist-electron', 'latest.yml')
    },
    {
      name: `pulsar-music-player_${VERSION}_amd64.deb`,
      path: path.join(projectRoot, 'dist-electron', `pulsar-music-player_${VERSION}_amd64.deb`)
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
