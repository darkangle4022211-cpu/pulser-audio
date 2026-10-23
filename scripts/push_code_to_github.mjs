import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const tokenFile = path.join(projectRoot, '.github_token');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');
const OWNER = "darkangle4022211-cpu";
const REPO = "pulser-audio";
const BRANCH = "main";

if (!TOKEN) {
  console.error("❌ GitHub token not found in env or .github_token file");
  process.exit(1);
}

function apiRequest(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const postBody = data ? JSON.stringify(data) : null;
    const req = https.request({
      hostname: 'api.github.com',
      port: 443,
      path: endpoint,
      method: method,
      headers: {
        'User-Agent': 'PulsarAudio-Pusher',
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        ...(postBody ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postBody)
        } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`API Error ${res.statusCode}: ${JSON.stringify(json)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (postBody) req.write(postBody);
    req.end();
  });
}

export async function pushFilesToGitHub(commitMessage = 'feat: Full source code commit for Desktop Electron application') {
  console.log(`=== Pushing complete source tree to ${OWNER}/${REPO}:${BRANCH} ===`);

  // 1. Get latest commit SHA on main
  const ref = await apiRequest(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
  const latestCommitSha = ref.object.sha;
  console.log(`Latest commit SHA: ${latestCommitSha}`);

  // 2. Get base tree SHA
  const commit = await apiRequest(`/repos/${OWNER}/${REPO}/git/commits/${latestCommitSha}`);
  const baseTreeSha = commit.tree.sha;
  console.log(`Base tree SHA: ${baseTreeSha}`);

  // 3. Complete list of all source files
  const filePaths = [
    'package.json',
    'vite.config.js',
    'index.html',
    'update.json',
    'electron/main.cjs',
    'electron/preload.cjs',
    'src/audio/engine.js',
    'src/audio/visualizer.js',
    'src/playlists/manager.js',
    'src/services/onlineMusic.js',
    'src/services/tasteEngine.js',
    'src/storage/db.js',
    'src/styles/components.css',
    'src/styles/main.css',
    'src/styles/variables.css',
    'src/ui/app.js',
    'src/ui/hotkeys.js',
    'src/utils/bluetoothMedia.js',
    'src/utils/id3Parser.js',
    'src/utils/id3Writer.js',
    'src/utils/lrcParser.js',
    'scripts/build_deb.sh',
    'scripts/build_win.sh',
    'scripts/publish_github_release.mjs',
    'scripts/push_code_to_github.mjs',
    'scripts/verify_desktop_qa.mjs',
    'scripts/verify_offline_shuffle.mjs',
    'scripts/qa_verify_windows.mjs'
  ];

  const tree = [];
  for (const relPath of filePaths) {
    const fullPath = path.join(projectRoot, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      tree.push({
        path: relPath,
        mode: '100644',
        type: 'blob',
        content: content
      });
      console.log(`Included ${relPath} (${(content.length / 1024).toFixed(1)} KB)`);
    } else {
      console.warn(`File not found: ${relPath}`);
    }
  }

  // 4. Create new tree
  const newTree = await apiRequest(`/repos/${OWNER}/${REPO}/git/trees`, 'POST', {
    base_tree: baseTreeSha,
    tree: tree
  });
  console.log(`New tree created: ${newTree.sha}`);

  // 5. Create commit
  const newCommit = await apiRequest(`/repos/${OWNER}/${REPO}/git/commits`, 'POST', {
    message: commitMessage,
    tree: newTree.sha,
    parents: [latestCommitSha]
  });
  console.log(`New commit created: ${newCommit.sha}`);

  // 6. Update reference
  const updatedRef = await apiRequest(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, 'PATCH', {
    sha: newCommit.sha,
    force: false
  });
  console.log(`✅ Successfully updated ${BRANCH} to ${updatedRef.object.sha}!`);
  return updatedRef.object.sha;
}

if (process.argv[1] && process.argv[1].endsWith('push_code_to_github.mjs')) {
  pushFilesToGitHub().catch(err => {
    console.error('Error pushing commit:', err.message);
    process.exit(1);
  });
}
