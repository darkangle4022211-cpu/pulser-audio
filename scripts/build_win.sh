#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

VERSION="${1:-$(node -p "require('./package.json').version" 2>/dev/null || echo "1.1.0")}"

echo "=== Building Pulsar Music Player Native Windows Package (${VERSION}) ==="

# 1. Verify Windows binaries and icons
if [ ! -f "bin/win/yt-dlp.exe" ]; then
  echo "Error: bin/win/yt-dlp.exe not found!"
  exit 1
fi

if [ ! -f "bin/win/ffmpeg.exe" ]; then
  echo "Error: bin/win/ffmpeg.exe not found!"
  exit 1
fi

if [ ! -f "build/icons/icon.ico" ]; then
  echo "Error: build/icons/icon.ico not found!"
  exit 1
fi

# 2. Build Vite frontend
echo "1. Building web frontend assets..."
./node_modules/.bin/vite build
cp -r test-tracks dist/ 2>/dev/null || true

# 3. Package with electron-builder for Windows (x64 NSIS installer and portable exe)
echo "2. Packaging Windows executables with electron-builder..."
npx electron-builder --win --x64

echo "=== Windows build complete! Check dist-electron/ ==="
ls -lh dist-electron/*.exe 2>/dev/null || true
