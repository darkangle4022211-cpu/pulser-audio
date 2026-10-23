const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  if (context.electronPlatformName !== 'linux') return;
  const outDir = context.appOutDir;
  const originalBin = path.join(outDir, 'pulsar-music-player');
  const renamedBin = path.join(outDir, 'pulsar-music-player.bin');

  if (fs.existsSync(originalBin) && !fs.existsSync(renamedBin)) {
    fs.renameSync(originalBin, renamedBin);
    const wrapperContent = `#!/usr/bin/env bash
DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
exec "$DIR/pulsar-music-player.bin" --no-sandbox "$@"
`;
    fs.writeFileSync(originalBin, wrapperContent, { mode: 0o755 });
    console.log('✅ Successfully injected --no-sandbox wrapper into Linux executable:', originalBin);
  }
};
