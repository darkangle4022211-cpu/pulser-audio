import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const tokenFile = path.join(projectRoot, '.github_token');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');
const OWNER = "darkangle4022211-cpu";
const REPO = "pulser-audio";
const WORKFLOW_FILE = "build-android-apk.yml";

if (!TOKEN) {
  console.error("❌ GitHub token not found");
  process.exit(1);
}

function githubRequest(url, options = {}, data = null) {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('http') ? url : `https://api.github.com${url}`;
    const parsed = new URL(fullUrl);

    const isGitHubApi = parsed.hostname === 'api.github.com';
    const headers = {
      'User-Agent': 'PulsarAudio-APK-Builder',
      ...(isGitHubApi && !options.noAuth ? {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      } : {}),
      ...(options.headers || {})
    };

    const postBody = data ? JSON.stringify(data) : null;
    if (postBody) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postBody);
    }

    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: options.method || (data ? 'POST' : 'GET'),
      headers
    }, (res) => {
      // Follow redirects (for artifact zip downloads)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = res.headers.location;
        const nextOptions = { ...options };
        if (!nextUrl.includes('api.github.com')) {
          nextOptions.noAuth = true;
          nextOptions.headers = { ...(options.headers || {}) };
          delete nextOptions.headers['Authorization'];
        }
        return resolve(githubRequest(nextUrl, nextOptions, data));
      }

      if (options.downloadTo) {
        if (res.statusCode >= 400) {
          let errBody = '';
          res.on('data', chunk => errBody += chunk);
          res.on('end', () => reject(new Error(`Download failed with status ${res.statusCode}: ${errBody}`)));
          return;
        }
        const fileStream = fs.createWriteStream(options.downloadTo);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => resolve({ status: res.statusCode, savedTo: options.downloadTo }));
        });
        fileStream.on('error', reject);
        return;
      }

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
    if (postBody) req.write(postBody);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log("=================================================================");
  console.log("   PULSAR MUSIC PLAYER: ANDROID APK CLOUD BUILD & PROVISIONING   ");
  console.log("=================================================================\n");

  // Step 1: Run local build & capacitor sync
  console.log("📦 1. Running local Vite build and Capacitor sync...");
  execSync("npm run build", { cwd: projectRoot, stdio: "inherit" });
  execSync("node ./node_modules/@capacitor/cli/bin/capacitor sync android", { cwd: projectRoot, stdio: "inherit" });

  // Step 2: Push commit to GitHub
  console.log("\n🚀 2. Pushing changes to GitHub repository...");
  const { pushFilesToGitHub } = await import('./push_code_to_github.mjs');
  const commitSha = await pushFilesToGitHub('feat: Flagship YouTube Music Android UI, Bridge & Cloud APK Build');
  console.log(`Commit pushed: ${commitSha}`);

  // Step 3: Trigger GitHub Actions workflow
  console.log("\n⚡ 3. Triggering GitHub Actions workflow: " + WORKFLOW_FILE);
  const dispatchRes = await githubRequest(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: 'POST'
  }, { ref: 'main' });

  if (dispatchRes.status !== 204 && dispatchRes.status !== 200) {
    console.warn(`Dispatch returned status: ${dispatchRes.status}`, dispatchRes.body);
  } else {
    console.log("Workflow dispatch successfully triggered!");
  }

  // Step 4: Poll for the workflow run
  console.log("\n⏳ 4. Waiting for workflow run to start on GitHub Actions...");
  let runId = null;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= 20; attempt++) {
    await sleep(4000);
    const runsRes = await githubRequest(`/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=5`);
    const runs = runsRes.body?.workflow_runs || [];
    const recentRun = runs.find(r => r.head_sha === commitSha || (new Date(r.created_at).getTime() >= (startTime - 15000)));

    if (recentRun) {
      runId = recentRun.id;
      console.log(`Found active workflow run #${runId} (Status: ${recentRun.status}, Conclusion: ${recentRun.conclusion || 'pending'}, Head SHA: ${recentRun.head_sha})`);
      break;
    }
    console.log(`[Attempt ${attempt}/20] Waiting for run to register...`);
  }

  if (!runId) {
    throw new Error("Timed out waiting for GitHub Actions workflow run to register.");
  }

  // Step 5: Wait for workflow completion
  console.log(`\n⚙️ 5. Monitoring build progress for run #${runId}...`);
  let conclusion = null;
  while (true) {
    const runCheck = await githubRequest(`/repos/${OWNER}/${REPO}/actions/runs/${runId}`);
    const runData = runCheck.body;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`[${elapsed}s elapsed] Workflow status: ${runData.status} | conclusion: ${runData.conclusion || 'in_progress'}`);

    if (runData.status === 'completed') {
      conclusion = runData.conclusion;
      break;
    }

    if (elapsed > 900) { // 15 mins timeout
      throw new Error("Build timed out after 15 minutes");
    }

    await sleep(8000);
  }

  if (conclusion !== 'success') {
    throw new Error(`GitHub Actions build failed with conclusion: ${conclusion}. Check run at https://github.com/${OWNER}/${REPO}/actions/runs/${runId}`);
  }

  console.log(`\n🎉 6. Build completed successfully! Fetching APK artifact...`);

  // Step 6: Find artifact
  const artifactsRes = await githubRequest(`/repos/${OWNER}/${REPO}/actions/runs/${runId}/artifacts`);
  const artifacts = artifactsRes.body?.artifacts || [];
  const apkArtifact = artifacts.find(a => a.name === 'Pulsar-Audio-Android-APK' || a.name.includes('APK'));

  if (!apkArtifact) {
    throw new Error(`No APK artifact found in completed run #${runId}. Artifacts: ${JSON.stringify(artifacts)}`);
  }

  console.log(`Artifact ID: ${apkArtifact.id}, Name: ${apkArtifact.name}, Size: ${(apkArtifact.size_in_bytes / 1024 / 1024).toFixed(2)} MB`);

  // Step 7: Download and extract artifact
  const tmpZipPath = `/tmp/pulsar-android-apk-${Date.now()}.zip`;
  const tmpExtractDir = `/tmp/pulsar-android-extract-${Date.now()}`;
  fs.mkdirSync(tmpExtractDir, { recursive: true });

  console.log(`Downloading artifact to ${tmpZipPath}...`);
  await githubRequest(`/repos/${OWNER}/${REPO}/actions/artifacts/${apkArtifact.id}/zip`, {
    downloadTo: tmpZipPath
  });

  console.log(`Extracting ${tmpZipPath}...`);
  execSync(`unzip -o "${tmpZipPath}" -d "${tmpExtractDir}"`, { stdio: 'inherit' });

  // Locate the extracted apk file
  const extractedFiles = fs.readdirSync(tmpExtractDir);
  console.log("Extracted files:", extractedFiles);
  const foundApk = extractedFiles.find(f => f.endsWith('.apk'));

  if (!foundApk) {
    throw new Error(`No .apk file found in extracted artifact: ${extractedFiles.join(', ')}`);
  }

  const distElectron = path.join(projectRoot, 'dist-electron');
  fs.mkdirSync(distElectron, { recursive: true });
  const finalApkDest = path.join(distElectron, 'Pulsar-Audio-Android.apk');

  fs.copyFileSync(path.join(tmpExtractDir, foundApk), finalApkDest);

  // Clean up tmp files
  try {
    fs.unlinkSync(tmpZipPath);
    fs.rmSync(tmpExtractDir, { recursive: true, force: true });
  } catch (_) {}

  const finalStat = fs.statSync(finalApkDest);
  console.log("\n=================================================================");
  console.log(`✅ ANDROID APK SUCCESSFULLY PROVISIONED & VERIFIED!`);
  console.log(`File: ${finalApkDest}`);
  console.log(`Size: ${(finalStat.size / (1024 * 1024)).toFixed(2)} MB (${finalStat.size} bytes)`);
  console.log("=================================================================\n");
}

main().catch(err => {
  console.error("❌ APK Build error:", err);
  process.exit(1);
});
